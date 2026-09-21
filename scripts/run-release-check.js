const { spawn } = require('node:child_process');
const path = require('node:path');

const focusedTests = [
  'community-question-admin.test.js', 'rules-question-log.test.js',
  'community-question-log-boundary.test.js', 'community-question-page.test.js',
  'http-security.test.js', 'automated-test-labeling.test.js',
];

function releaseCommands(scope, npmCli) {
  if (!['full', 'docs', 'openings', 'owner-ui'].includes(scope)) throw new Error(`Unknown release scope: ${scope}`);
  if (scope === 'full') {
    if (!npmCli) throw new Error('Run through npm run release:check so the installed npm CLI is known.');
    return [{ label: 'Complete existing quality gate (precheck, check, postcheck)', args: [npmCli, 'run', 'check'] }];
  }
  const commands = [{ label: 'Release scope and deployment contracts', args: ['-e', "require('./test/release-scope.test');require('./test/deployment-health-check.test')"] }];
  if (scope === 'openings') commands.push(
    { label: 'Openings catalog', args: ['scripts/check-openings.js'] },
    ...['server.js', 'lib/openings.js', 'public/openings.js'].map(file => ({ label: `Syntax: ${file}`, args: ['--check', file] })),
    { label: 'Openings and environment boundaries', args: ['-e', "require('./test/openings-release-scope.test');require('./test/environment-pages.test')"] },
  );
  if (scope === 'owner-ui') commands.push(
    { label: 'Owner page syntax', args: ['--check', 'public/community-questions.js'] },
    { label: 'Owner sessions, privacy, review storage, page and test labels', args: ['-e', focusedTests.map(file => `require(${JSON.stringify('./test/' + file)})`).join(';')] },
  );
  return commands;
}

async function runCommands(commands, run = runCommand) {
  for (const command of commands) {
    const exitCode = await run(command);
    if (exitCode !== 0) return exitCode || 1;
  }
  return 0;
}

function runCommand({ label, args }) {
  return new Promise(resolve => {
    const started = Date.now();
    console.log(`\n[release] START ${label}`);
    const heartbeat = setInterval(() => console.log(`[release] Still running: ${label} (${Math.round((Date.now() - started) / 1000)}s)`), 30000);
    const child = spawn(process.execPath, args, {
      cwd: path.join(__dirname, '..'), stdio: 'inherit',
      env: { ...process.env, RULES_LLM_MODE: 'off', RULES_ENABLE_LLM_REWRITE: 'false' },
    });
    child.once('error', error => { console.error(error.message); });
    child.once('close', code => {
      clearInterval(heartbeat);
      console.log(`[release] ${code === 0 ? 'PASS' : 'FAIL'} ${label} (${Math.round((Date.now() - started) / 1000)}s)`);
      resolve(code === null ? 1 : code);
    });
  });
}

if (require.main === module) {
  const index = process.argv.indexOf('--scope');
  const scope = index < 0 ? 'full' : process.argv[index + 1];
  Promise.resolve().then(() => releaseCommands(scope, process.env.npm_execpath)).then(runCommands)
    .then(code => { process.exitCode = code; }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { releaseCommands, runCommands };

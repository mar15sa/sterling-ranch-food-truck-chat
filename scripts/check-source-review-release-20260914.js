const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const runtimePaths = ['lib', 'public', 'scripts', 'server.js', 'test', 'config', 'data/communities',
  'data/community-index.json', 'data/rules-index.json', 'data/canonical-source-ledger.json',
  'data/community-source-approvals*.json'];
function candidateState() {
  return { revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, windowsHide: true, encoding: 'utf8' }).trim(),
    runtimeInputsClean: spawnSync('git', ['diff', '--quiet', 'HEAD', '--', ...runtimePaths],
      { cwd: root, windowsHide: true }).status === 0 };
}
const before = candidateState();
if (!before.runtimeInputsClean) throw new Error('Commit the runtime candidate before the exact-revision release check.');

const output = path.resolve(__dirname, '../artifacts/source-review-2026-09-14/local-release-check.log');
const log = fs.createWriteStream(output);
const command = process.platform === 'win32' ? 'cmd.exe' : 'npm';
const args = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm run check'] : ['run', 'check'];
const startedAt = new Date().toISOString();
const resultFile = output.replace(/\.log$/, '.json');
// Replace an older result immediately. A desktop/process interruption must
// leave an unfinished record, never a previous candidate's apparent result.
fs.writeFileSync(resultFile, `${JSON.stringify({ startedAt, revision: before.revision, status: 'running' }, null, 2)}\n`);
const child = spawn(command, args, { cwd: path.resolve(__dirname, '..'), windowsHide: true,
  env: { ...process.env, RULES_LLM_MODE: 'off', RULES_ENABLE_LLM_REWRITE: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
let captured = '';
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { log.write(chunk); captured += chunk.toString(); });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('close', exitCode => {
  log.end();
  const after = candidateState();
  const candidateUnchanged = before.revision === after.revision && after.runtimeInputsClean;
  const result = { startedAt, completedAt: new Date().toISOString(), revision: before.revision,
    status: candidateUnchanged && exitCode === 0 ? 'passed' : 'failed',
    candidateUnchanged, exitCode: candidateUnchanged ? exitCode : 1,
    failures: captured.split(/\r?\n/).filter(line => /^✖|^not ok/.test(line)),
    summary: captured.split(/\r?\n/).filter(line => /^ℹ (tests|pass|fail|duration)|^# (tests|pass|fail)/.test(line)) };
  fs.writeFileSync(resultFile, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
  process.exitCode = result.exitCode || 0;
});

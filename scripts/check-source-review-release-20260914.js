const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const output = path.resolve(__dirname, '../artifacts/source-review-2026-09-14/local-release-check.log');
const log = fs.createWriteStream(output);
const command = process.platform === 'win32' ? 'cmd.exe' : 'npm';
const args = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm run check'] : ['run', 'check'];
const startedAt = new Date().toISOString();
const child = spawn(command, args, { cwd: path.resolve(__dirname, '..'), windowsHide: true,
  env: { ...process.env, RULES_LLM_MODE: 'off', RULES_ENABLE_LLM_REWRITE: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
let captured = '';
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { log.write(chunk); captured += chunk.toString(); });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('close', exitCode => {
  log.end();
  const result = { startedAt, completedAt: new Date().toISOString(), exitCode,
    failures: captured.split(/\r?\n/).filter(line => /^✖|^not ok/.test(line)),
    summary: captured.split(/\r?\n/).filter(line => /^ℹ (tests|pass|fail|duration)|^# (tests|pass|fail)/.test(line)) };
  fs.writeFileSync(output.replace(/\.log$/, '.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
  process.exitCode = exitCode || 0;
});

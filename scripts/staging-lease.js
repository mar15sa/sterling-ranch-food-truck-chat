const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function readLease(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function acquireLease(file, owner, worktree, now = Date.now()) {
  if (!owner || !worktree) throw new Error('A task owner and worktree are required.');
  const lease = { owner, worktree, acquiredAt: new Date(now).toISOString() };
  try { fs.writeFileSync(file, JSON.stringify(lease, null, 2) + '\n', { flag: 'wx' }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existing = readLease(file);
    if (existing?.owner === owner && existing?.worktree === worktree) return existing;
    throw new Error(`Staging reserved by ${existing?.owner || 'an unfinished reservation'}. Coordinate with that task; do not push or steal its reservation.`);
  }
  return lease;
}

function assertLease(file, owner, worktree) {
  const lease = readLease(file);
  if (!lease || lease.owner !== owner || lease.worktree !== worktree) throw new Error('This task/worktree does not own the staging reservation.');
  return lease;
}

function releaseLease(file, owner, worktree) {
  assertLease(file, owner, worktree);
  fs.unlinkSync(file);
}

if (require.main === module) {
  try {
    const [command, owner] = process.argv.slice(2);
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
    const worktree = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
    const file = path.join(common, 'codex-staging-reservation.json');
    if (command === 'status') console.log(JSON.stringify(readLease(file)));
    else if (command === 'acquire') console.log(JSON.stringify(acquireLease(file, owner, worktree)));
    else if (command === 'assert') console.log(JSON.stringify(assertLease(file, owner, worktree)));
    else if (command === 'release') { releaseLease(file, owner, worktree); console.log('Staging reservation released.'); }
    else throw new Error('Use staging-lease.js status|acquire|assert|release [task-id].');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { readLease, acquireLease, assertLease, releaseLease };

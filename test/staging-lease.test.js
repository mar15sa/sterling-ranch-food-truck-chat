const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { acquireLease, assertLease, releaseLease, readLease } = require('../scripts/staging-lease');

test('two worktrees cannot reserve staging together, and only the owner may release', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-reservation-'));
  const file = path.join(directory, 'lease.json');
  try {
    acquireLease(file, 'assistant-fix', '/worktree/one');
    assert.throws(() => acquireLease(file, 'atlas-preview', '/worktree/two'), /reserved by assistant-fix/);
    assert.throws(() => assertLease(file, 'assistant-fix', '/worktree/two'), /does not own/);
    assert.throws(() => releaseLease(file, 'atlas-preview', '/worktree/two'), /does not own/);
    assert.equal(acquireLease(file, 'assistant-fix', '/worktree/one').owner, 'assistant-fix');
    releaseLease(file, 'assistant-fix', '/worktree/one');
    assert.equal(readLease(file), null);
    acquireLease(file, 'atlas-preview', '/worktree/two');
    releaseLease(file, 'atlas-preview', '/worktree/two');
  } finally { fs.rmdirSync(directory); }
});

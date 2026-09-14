const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadCommunityEvidenceFixture } = require('./helpers/community-evidence');

test('unit evidence fixtures select the same explicit snapshot as the release bridge', () => {
  const selectedPath = path.join(__dirname, '..', 'data', 'community-source-approvals-v8.json');
  const result = loadCommunityEvidenceFixture({ COMMUNITY_EVIDENCE_INDEX: selectedPath });
  assert.deepEqual(result, require(selectedPath));
});

test('checked-in fixture fallback preserves source versions, approvals, and expiry exactly', () => {
  const result = loadCommunityEvidenceFixture({});
  assert.deepEqual(result, require('../data/community-index.json'));
  const firstExpiry = result.sources[0].staleAfter;
  result.sources[0].staleAfter = 'changed-only-in-this-test';
  assert.equal(loadCommunityEvidenceFixture({}).sources[0].staleAfter, firstExpiry);
});

test('an unavailable explicitly selected snapshot cannot silently fall back to old evidence', () => {
  assert.throws(() => loadCommunityEvidenceFixture({ COMMUNITY_EVIDENCE_INDEX: path.join(__dirname, 'missing-evidence-snapshot.json') }),
    { code: 'ENOENT' });
});

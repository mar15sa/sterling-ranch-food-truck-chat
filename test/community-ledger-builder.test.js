const test = require('node:test');
const assert = require('node:assert/strict');
const { buildLedgerIndex } = require('../scripts/build-community-truth-ledger');
const { buildFactLedger } = require('../lib/community-truth');
const profile = require('../data/communities/sterling-ranch.json');
const source = { id: 'fees', communityId: 'sterling-ranch', sourceUrl: 'https://example.gov/fees',
  contentHash: 'v1', reviewStatus: 'approved', reviewedAt: '2026-09-01',
  facts: [{ type: 'money', value: '$20', scopeKey: 'monthly-fee' }] };
test('ledger builder retains exact decisions without granting inherited or new approvals', () => {
  const index = { communityId: 'sterling-ranch', sources: [source], generatedAt: '2026-09-01' };
  const first = buildLedgerIndex(index, profile);
  assert.equal(first.factLedger[0].reviewStatus, 'candidate');
  assert.equal(first.truthStatus.pendingSensitiveReviewCount, 1);
  assert.equal(first.truthStatus.approvedFactCount, 0);
  assert.equal(first.truthStatus.migrationMode, 'reviewed');
  const approved = buildFactLedger(index, { trusted: true });
  assert.equal(buildLedgerIndex({ ...index, factLedger: approved }, profile).factLedger[0].reviewStatus, 'approved');
  const changed = buildLedgerIndex({ ...index, factLedger: approved, sources: [{ ...source, contentHash: 'v2' }] }, profile);
  assert.equal(changed.factLedger[0].reviewStatus, 'candidate');
});
test('ledger builder leaves live feeds outside static facts while retaining static event documents', () => {
  const staticEvent = { ...source, id: 'event-pdf', sourceType: 'events', connectorType: 'civicplus-pages', sourceUrl: 'https://example.gov/meeting.pdf' };
  const live = { ...source, id: 'live', connectorType: 'civicplus-calendar' };
  const index = { communityId: 'sterling-ranch', sources: [staticEvent, live] };
  const result = buildLedgerIndex(index, profile);
  assert.deepEqual(result.sources, index.sources);
  assert.deepEqual(result.factLedger.map(entry => entry.sourceId), ['event-pdf']);
});

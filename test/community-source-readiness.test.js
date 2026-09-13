const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCommunitySourceReadiness } = require('../lib/community-source-readiness');

test('readiness reports the reconciled full-site audit and keeps unapproved sources withheld', () => {
  const result = buildCommunitySourceReadiness({
    approvedEvidenceCurrent: true,
    sourceCount: 100,
    approvedFactCount: 40,
    liveConnectorCount: 8,
    approvedEvidenceLastCheckedAt: '2026-09-13T14:31:07.000Z',
    conflictedFactCount: 0,
  });
  assert.deepEqual(result.totals, {
    audited: 1631,
    inScopeUrls: 463,
    primarySources: 197,
    outOfScope: 1168,
    answerEvidence: 16,
    safeLink: 31,
    liveFeed: 1,
    reviewRequired: 101,
    unavailableRecheck: 4,
    excluded: 44,
    duplicates: 155,
    technicalExclusions: 624,
  });
  assert.equal(result.inventory.reconciled, true);
  assert.equal(result.inventory.pending, 0);
  assert.equal(result.state, 'needs-attention');
  assert.match(result.headline, /Full inventory complete/);
  assert.equal(result.sourceRemainingWork.length, 105);
  assert.deepEqual(result.remainingWork.map(item => item.documentId), ['1964', '2398', '770']);
  assert.equal(result.categories.length, 4);
  assert.equal(result.categories[0].total, 50);
  assert.equal(result.categories[0].documents.length, 14);
  assert.equal(result.categories[0].pages.length, 36);
  assert.equal(result.categories[3].liveFeed, 1);
  assert.equal(result.categories[3].pages.find(item => item.sourceUrl.endsWith('/418/Pickleball-Courts')).status, 'held');
});

test('readiness distinguishes evidence freshness from completed inventory triage', () => {
  const result = buildCommunitySourceReadiness({
    approvedEvidenceCurrent: false,
    expiredApprovedSourceCount: 5,
    expiredApprovedFactCount: 11,
    conflictedFactCount: 17,
  });
  assert.equal(result.evidence.current, false);
  assert.equal(result.safeguards.withheldConflictCount, 17);
  assert.equal(result.inventory.reconciled, true);
  assert.match(result.inventory.note, /every discovered CAB URL/i);
  assert.match(result.reasons[0], /5 approved sources and 11 approved facts/);
  assert.match(result.reasons[1], /101 useful sources/);
  assert.match(result.reasons[3], /out-of-scope CAB route/);
});

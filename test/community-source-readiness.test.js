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
    answerEvidence: 43,
    safeLink: 67,
    liveFeed: 1,
    reviewRequired: 0,
    unavailableRecheck: 0,
    excluded: 86,
    duplicates: 155,
    technicalExclusions: 624,
  });
  assert.equal(result.inventory.reconciled, true);
  assert.equal(result.inventory.pending, 0);
  assert.equal(result.state, 'ready');
  assert.match(result.headline, /Reviewed content is ready/);
  assert.equal(result.sourceRemainingWork.length, 0);
  assert.deepEqual(result.remainingWork, []);
  assert.equal(result.categories.length, 4);
  assert.equal(result.categories[0].total, 50);
  assert.equal(result.categories[0].documents.length, 14);
  assert.equal(result.categories[0].pages.length, 36);
  assert.equal(result.categories[3].liveFeed, 1);
  assert.equal(result.categories[3].pages.find(item => item.sourceUrl.endsWith('/418/Pickleball-Courts')).status, 'active');
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
  assert.match(result.headline, /freshness checks need attention/);
  assert.match(result.reasons[1], /out-of-scope CAB route/);
});

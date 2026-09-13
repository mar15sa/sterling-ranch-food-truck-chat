const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCommunitySourceReadiness } = require('../lib/community-source-readiness');

test('readiness reports the approved four-category scope without treating excluded documents as missing', () => {
  const result = buildCommunitySourceReadiness({
    approvedEvidenceCurrent: true,
    sourceCount: 100,
    approvedFactCount: 40,
    liveConnectorCount: 8,
    approvedEvidenceLastCheckedAt: '2026-09-13T14:31:07.000Z',
    conflictedFactCount: 0,
    failureCount: 0,
  });
  assert.deepEqual(result.totals, {
    total: 27, classified: 27, handled: 24, activeEvidence: 7, actionOnly: 2, heldForReview: 3, excluded: 15,
  });
  assert.equal(result.state, 'needs-attention');
  assert.equal(result.evidence.lastApprovedEvidenceCheckAt, '2026-09-13T14:31:07.000Z');
  assert.equal(result.categories[0].complete, true);
  assert.equal(result.categories[1].heldForReview, 1);
  assert.equal(result.categories[2].heldForReview, 2);
  assert.equal(result.categories[3].complete, true);
  assert.equal(result.categories[0].documents.length, 5);
  assert.equal(result.categories[1].documents.find(item => item.documentId === '1964').status, 'held');
  assert.equal(result.categories[2].documents.find(item => item.documentId === '2398').sourceUrl, 'https://sterlingranchcab.com/DocumentCenter/View/2398/2026-Water-Quality-Report');
  assert.equal(result.categories.flatMap(category => category.documents).length, 27);
  assert.deepEqual(result.remainingWork.map(item => item.documentId), ['1964', '2398', '770']);
  assert.ok(result.remainingWork.every(item => item.sourceUrl?.startsWith('https://sterlingranchcab.com/DocumentCenter/View/')));
});

test('readiness distinguishes stale evidence, withheld conflicts, and site-wide inventory', () => {
  const result = buildCommunitySourceReadiness({
    approvedEvidenceCurrent: false,
    expiredApprovedSourceCount: 5,
    expiredApprovedFactCount: 11,
    conflictedFactCount: 17,
    failureCount: 0,
    discoveredPageCount: 1140,
    eligiblePageCount: 757,
    pageCount: 408,
    excludedPageCount: 383,
    inventoryBacklog: 222,
  });
  assert.equal(result.evidence.current, false);
  assert.equal(result.safeguards.withheldConflictCount, 17);
  assert.equal(result.inventory.backlog, 222);
  assert.match(result.inventory.note, /separate/i);
  assert.match(result.reasons[0], /5 approved sources and 11 approved facts/);
});

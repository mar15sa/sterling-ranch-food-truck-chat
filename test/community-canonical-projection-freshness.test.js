const test = require('node:test');
const assert = require('node:assert/strict');
const { sourceReviewState } = require('../lib/community-source-answerability');
const { searchCommunityIndex } = require('../lib/community-search');
const { answerCommunityQuestion } = require('../lib/community-assistant');

const now = new Date('2026-09-14T18:00:00Z');
const sourceUrl = 'https://alpha.example.gov/community-center-rental';
const contentHash = 'a'.repeat(64);
function fixture(staleAfter) {
  const source = {
    id: 'alpha-rental', communityId: 'alpha', sourceUrl, contentHash,
    title: 'Community center rental fees', sourceType: 'facilities',
    connectorType: 'civicplus-pages', authorityClass: 'official-page',
    lifecycle: 'current', authorityScore: 1, staleAfter,
    text: 'Community center rental costs $137 per hour.',
    facts: [{ type: 'money', value: '$137 per hour', context: 'Community center rental costs $137 per hour.',
      facet: 'fee', scopeKey: 'rental-fee', approvalClaim: 'rental-fee',
      reviewDecisionId: 'alpha-rental-review', reviewedBy: 'owner', reviewedAt: '2026-09-14T12:00:00Z' }],
    actions: [{ label: 'Book the community center', url: 'https://alpha.example.gov/book-center',
      actionType: 'booking', approvalClaim: 'rental-action' }],
  };
  const index = { communityId: 'alpha', sources: [source], factLedger: [], canonicalSourceLedger: {
    records: [{ canonicalUrl: sourceUrl, contentHash, key: `${sourceUrl}#sha256:${contentHash}`,
      approvals: [{ status: 'approved', communityId: 'alpha', decisionId: 'alpha-rental-review',
        scopeKind: 'scoped-claims', approvedClaims: ['rental-fee', 'rental-action'] }] }],
  } };
  return { source, index };
}

for (const [label, expiry] of [['missing', undefined], ['empty', ''], ['invalid', 'not-a-date'],
  ['expired', '2026-09-14T17:59:59Z'], ['exact-expiry-boundary', now.toISOString()]]) {
  test(`canonical facts and actions with ${label} freshness cannot enter search evidence`, () => {
    const { source, index } = fixture(expiry);
    const state = sourceReviewState(index, now.getTime());
    assert.deepEqual(state.entriesFor(source), []);
    assert.equal(state.canUseProjection(source), false);
    assert.equal(state.canUseActionProjection(source), false);
    const search = searchCommunityIndex('community center rental price', { index, now, includeActionOnlyProjections: true });
    assert.equal(search.sources.length, 0);
    assert.equal(search.withheldSources.length, 1);
    assert.equal(search.withheldSources[0].text, '');
    assert.deepEqual(search.withheldSources[0].actions, []);
  });
}

test('exact-source revalidation restores the same reviewed version after extending expiry', () => {
  const { source, index } = fixture('2026-09-14T19:00:00Z');
  const state = sourceReviewState(index, now.getTime());
  assert.equal(state.entriesFor(source).length, 2);
  const search = searchCommunityIndex('community center rental price', { index, now });
  assert.equal(search.sources.length, 1);
  assert.match(search.sources[0].text, /\$137/);
});

test('a still-fresh fact-ledger copy cannot bypass the expired canonical source', () => {
  const { source, index } = fixture('2026-09-13T18:00:00Z');
  index.factLedger = [{ id: 'rental-fact', sourceId: source.id, sourceVersion: contentHash,
    sourceUrl, factType: 'money', normalizedValue: 137, facet: 'fee', scopeKey: 'rental-fee',
    claimKey: 'alpha:rental-fee', supportingText: source.text, reviewStatus: 'approved',
    reviewDecisionId: 'alpha-rental-review', reviewedBy: 'owner', reviewedAt: '2026-09-14T12:00:00Z',
    lifecycle: 'current', staleAfter: '2099-01-01T00:00:00Z', approvalClaim: 'rental-fee' }];
  assert.deepEqual(sourceReviewState(index, now.getTime()).entriesFor(source), []);
});

test('dynamic connector eligibility remains governed by its existing separate contract', () => {
  const { index } = fixture(undefined);
  const source = { id: 'alpha-calendar', communityId: 'alpha', sourceType: 'events', connectorType: 'civicplus-calendar' };
  const state = sourceReviewState(index, now.getTime());
  assert.equal(state.canUseSource(source), true);
  assert.equal(state.canUseProjection(source), true);
});

test('expired exact-version rental approval cannot produce a verified resident price', async () => {
  const { index } = fixture('2026-09-13T18:00:00Z');
  const answer = await answerCommunityQuestion('What is the community center rental price?', {
    index, communityId: 'alpha', now, isTest: true, planCommunitySearch: false,
    synthesizeCommunityAnswer: false,
    answerRulesQuestion: () => ({ answer: '', sources: [], actions: [], confidence: { canAnswer: false } }),
  });
  assert.notEqual(answer.answerStatus, 'verified');
  assert.doesNotMatch(answer.answer, /\$137/);
  assert.equal(answer.actions.some(action => action.url === 'https://alpha.example.gov/book-center'), false);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { searchCommunityIndex } = require('../lib/community-search');
const { sourceReviewGate } = require('../lib/community-source-answerability');
const { answerCommunityQuestion } = require('../lib/community-assistant');
const now = new Date('2026-09-06T22:00:00Z');
const source = { id: 'water', communityId: 'alpha', sourceUrl: 'https://alpha.gov/water-billing', title: 'Water billing prices',
  sourceType: 'services', connectorType: 'civicplus-pages', contentHash: 'v1', reviewStatus: 'approved',
  text: 'Water billing price is $20 per month. Contact new-office@example.com for billing.', authorityScore: 1,
  lifecycle: 'current', staleAfter: '2099-01-01', facts: [{ type: 'money', value: '$20 per month', normalizedValue: 20 }] };
const fee = { sourceId: 'water', sourceVersion: 'v1', factType: 'money', facet: 'fee', claimKey: 'water:fee',
  normalizedValue: 20, reviewStatus: 'approved', lifecycle: 'current', staleAfter: '2099-01-01' };
const contact = { ...fee, factType: 'email', facet: 'contact', claimKey: 'water:contact', normalizedValue: 'new-office@example.com' };
const makeIndex = facts => ({ communityId: 'alpha', sources: [source], factLedger: facts, truthStatus: { migrationMode: 'reviewed' } });
test('retrieval withholds whole source prose when another facet is pending', () => {
  const approved = searchCommunityIndex('water billing price', { index: makeIndex([fee, contact]), now });
  assert.equal(approved.sources.length, 1);
  const pending = searchCommunityIndex('water billing price', { index: makeIndex([fee, { ...contact, reviewStatus: 'candidate' }]), now });
  assert.equal(pending.sources.length, 0);
  assert.equal(pending.withheldSources.length, 1);
});
test('mixed fee approvals and stale source versions cannot leak through a matching approved fact', () => {
  for (const facts of [[fee, { ...fee, normalizedValue: 25, reviewStatus: 'candidate' }], [{ ...fee, sourceVersion: 'old' }]]) {
    assert.equal(searchCommunityIndex('water billing price', { index: makeIndex(facts), now }).sources.length, 0);
  }
});
test('static review rules leave live calendar identity separate', () => {
  assert.equal(sourceReviewGate(makeIndex([]), now.getTime())({ id: 'live-calendar', sourceType: 'events', connectorType: 'civicplus-calendar', lifecycle: 'current' }), true);
});

test('trusted baseline still withholds every source participating in a sensitive conflict', () => {
  const competing = { ...source, id: 'water-copy', contentHash: 'v2' };
  const conflictingFee = { ...fee, sourceId: competing.id, sourceVersion: competing.contentHash, normalizedValue: 25 };
  const index = {
    ...makeIndex([fee, conflictingFee]),
    sources: [source, competing],
    truthStatus: { migrationMode: 'trusted-baseline' },
  };
  const canUse = sourceReviewGate(index, now.getTime());
  assert.equal(canUse(source), false);
  assert.equal(canUse(competing), false);
});

test('a pending controlling source produces an explicitly unverified answer without consulting fallback rules', async () => {
  const answer = await answerCommunityQuestion('What is the water billing price?', {
    index: makeIndex([{ ...fee, reviewStatus: 'candidate' }, contact]),
    communityId: 'alpha', isTest: true,
    planCommunitySearch: false, synthesizeCommunityAnswer: false,
    answerRulesQuestion: () => { throw new Error('Pending controlling evidence must not be bypassed.'); },
  });
  assert.equal(answer.answerMode, 'community-freshness-withheld');
  assert.equal(answer.confidence.canAnswer, false);
  assert.equal(answer.confidence.reason, 'source-review-required');
  assert.equal(answer.confidence.score, 0);
  assert.equal(answer.answerStatus, 'source-unavailable');
  assert.doesNotMatch(answer.answer, /\$20|new-office@example\.com/);
  assert.equal(answer.actions[0].url, source.sourceUrl);
});

test('AI-first test traffic still withholds a controlling trusted-baseline sensitive conflict', async () => {
  const competing = { ...source, id: 'water-copy', contentHash: 'v2', sourceUrl: 'https://alpha.gov/water-rates' };
  const conflictingFee = { ...fee, sourceId: competing.id, sourceVersion: competing.contentHash, sourceUrl: competing.sourceUrl, normalizedValue: 25 };
  let plannerCalls = 0;
  const answer = await answerCommunityQuestion('What is the water billing price?', {
    index: { ...makeIndex([fee, conflictingFee]), sources: [source, competing], truthStatus: { migrationMode: 'trusted-baseline' } },
    communityId: 'alpha', isTest: true, interpretationMode: 'structured',
    planCommunitySearch: async () => {
      plannerCalls += 1;
      return { intent: 'services', goal: 'cost', goals: ['cost'], subject: 'water billing', requestedDetails: ['price'], searchQueries: ['water billing price'], scope: 'community' };
    },
    synthesizeCommunityAnswer: false,
    answerRulesQuestion: () => { throw new Error('Withheld controlling evidence must not reach rules fallback.'); },
  });
  assert.equal(plannerCalls, 1);
  assert.equal(answer.routingDecision, 'ai-planned');
  assert.equal(answer.answerMode, 'community-freshness-withheld');
  assert.equal(answer.answerStatus, 'source-unavailable');
  assert.doesNotMatch(answer.answer, /\$20|\$25/);
});

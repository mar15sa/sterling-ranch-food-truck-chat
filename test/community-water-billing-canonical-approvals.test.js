const test = require('node:test');
const assert = require('node:assert/strict');
const index = require('../data/community-index.json');
const artifact = require('../data/community-water-billing-approved-sources.json');
const { buildWaterBillingSources } = require('../scripts/apply-water-billing-canonical-approvals');
const { searchCommunityIndex } = require('../lib/community-search');
const { answerCommunityQuestion } = require('../lib/community-assistant');
const { sourceReviewState } = require('../lib/community-source-answerability');

const NOW = Date.parse('2026-09-09T12:00:00Z');
const waterIds = new Set(artifact.pages.map((page) => page.id));

test('rebuild imports only exact reviewed water-billing excerpts with complete provenance', () => {
  const rebuilt = buildWaterBillingSources();
  assert.deepEqual(rebuilt.map((source) => source.id), artifact.pages.map((page) => page.id));
  for (const source of rebuilt) {
    assert.equal(source.reviewStatus, 'candidate');
    for (const item of [...source.facts, ...source.actions]) {
      assert.equal(item.contentHash, source.contentHash);
      assert.equal(item.sourceVersion, source.contentHash);
      assert.equal(item.reviewedBy, 'owner');
      assert.equal(item.reviewedAt, '2026-09-08');
      assert.ok(item.reviewDecisionId);
      assert.ok(item.approvalClaim);
      assert.ok(source.text.includes(item.context));
    }
  }
});

test('real community index exposes approved payment/contact claims while raw and adjacent claims stay withheld', async () => {
  const state = sourceReviewState(index, NOW);
  const pages = index.sources.filter((source) => waterIds.has(source.id));
  assert.equal(pages.length, 4);
  for (const page of pages) assert.equal(state.canUseSource(page), false, `${page.id} raw page body must remain withheld`);

  const payment = searchCommunityIndex('AmCoBi water billing email', { index, communityId: 'sterling-ranch', now: NOW });
  assert.deepEqual(payment.sources.map((source) => source.id), ['sterling-ranch-water-billing-payment-options-334']);
  assert.match(payment.sources[0].text, /ClientCare@AmCoBi\.com/);
  assert.doesNotMatch(payment.sources[0].text, /Venmo|Resident Resource Center|720-661-9694/);
  const answer = await answerCommunityQuestion('AmCoBi water billing email', {
    index, communityId: 'sterling-ranch', now: NOW, planCommunitySearch: false, synthesizeCommunityAnswer: false,
  });
  assert.match(answer.answer, /ClientCare@AmCoBi\.com/);

  const deferred = searchCommunityIndex('DocumentCenter 2419 tiered water rates', { index, communityId: 'sterling-ranch', now: NOW });
  assert.equal(deferred.sources.some((source) => waterIds.has(source.id)), false);
});

test('a changed captured hash withdraws every approved water-billing projection', () => {
  const changed = JSON.parse(JSON.stringify(index));
  const page = changed.sources.find((source) => source.id === 'sterling-ranch-view-and-pay-water-bill-332');
  page.contentHash = 'f'.repeat(64);
  const result = searchCommunityIndex('Utility Hawk water bill payment', { index: changed, communityId: 'sterling-ranch', now: NOW });
  assert.equal(result.sources.some((source) => source.id === page.id), false);
});

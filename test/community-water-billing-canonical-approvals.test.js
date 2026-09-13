const test = require('node:test');
const assert = require('node:assert/strict');
const index = require('../data/community-index.json');
const artifact = require('../data/community-water-billing-approved-sources.json');
const { buildWaterBillingSources } = require('../scripts/apply-water-billing-canonical-approvals');
const { searchCommunityIndex } = require('../lib/community-search');
const { answerCommunityQuestion } = require('../lib/community-assistant');
const { sourceReviewState } = require('../lib/community-source-answerability');
const { projectedActionProof, revalidateApprovedEvidence, selectRevalidationTargetUrls } = require('../lib/community-approved-revalidation');

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
  const payment = rebuilt.find((source) => source.id === 'sterling-ranch-water-billing-payment-options-334');
  assert.deepEqual(payment.actions.map((action) => action.id), ['water-payment-334-utility-hawk']);
  assert.equal(payment.actions[0].url, 'https://srcab.utilityhawk.us');
  assert.equal(payment.actions[0].evidence.proofKind, 'source-text-url-v1');
  assert.equal(payment.facts.some((fact) => fact.id === 'water-payment-334-help-email'), true);
  assert.equal(payment.actions.some((action) => /amcobi/i.test(action.url)), false);
});

test('reviewed plain-text payment destinations retain exact action proof without weakening link proof', () => {
  const rebuilt = buildWaterBillingSources();
  const paymentSources = rebuilt.filter((source) => source.actions.some((action) => action.evidence?.proofKind === 'source-text-url-v1'));
  assert.deepEqual(paymentSources.map((source) => source.id).sort(), [
    'sterling-ranch-monthly-fee-billing-390',
    'sterling-ranch-view-and-pay-water-bill-332',
    'sterling-ranch-water-billing-payment-options-334',
  ]);
  for (const source of paymentSources) {
    const proof = projectedActionProof([source], [], source.text, source.sourceUrl);
    assert.equal(proof.matches, true, `${source.id} should accept its reviewed plain-text destination`);

    const missingUrl = source.text.replace('https://srcab.utilityhawk.us', 'https://changed.example/pay');
    assert.equal(projectedActionProof([source], [], missingUrl, source.sourceUrl).matches, false, `${source.id} must reject a changed destination`);

    const changedContext = source.text.replace(source.actions[0].evidence.context, 'Payment instructions changed.');
    assert.equal(projectedActionProof([source], [], changedContext, source.sourceUrl).matches, false, `${source.id} must reject changed evidence context`);

    const changedAction = structuredClone(source);
    changedAction.actions[0].url = 'https://changed.example/pay';
    assert.equal(projectedActionProof([changedAction], [], source.text, source.sourceUrl).matches, false, `${source.id} must reject a substituted resident destination`);

    const unknownProof = structuredClone(source);
    unknownProof.actions[0].evidence.proofKind = 'unknown-proof-v1';
    assert.equal(projectedActionProof([unknownProof], [], source.text, source.sourceUrl).matches, false, `${source.id} must fail closed on an unknown proof kind`);
  }

  const linkOnly = structuredClone(paymentSources[0]);
  delete linkOnly.actions[0].evidence;
  assert.equal(projectedActionProof([linkOnly], [], linkOnly.text, linkOnly.sourceUrl).matches, false,
    'plain page text must not satisfy the default source-link proof');
});

test('real community index exposes approved payment/contact claims while raw and adjacent claims stay withheld', async () => {
  const state = sourceReviewState(index, NOW);
  const pages = index.sources.filter((source) => waterIds.has(source.id));
  assert.equal(pages.length, 4);
  for (const page of pages) assert.equal(state.canUseSource(page), false, `${page.id} raw page body must remain withheld`);
  const paymentPage = pages.find((page) => page.id === 'sterling-ranch-water-billing-payment-options-334');
  assert.deepEqual(paymentPage.actions.map((action) => action.url), ['https://srcab.utilityhawk.us']);
  assert.equal(paymentPage.actions.some((action) => /amcobi/i.test(action.url)), false);

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

test('water-payment routing uses only the exact-version approved process, methods, contacts, action, and requested card fee', async () => {
  const baseOptions = {
    index, communityId: 'sterling-ranch', now: NOW, isTest: true,
    planCommunitySearch: false, synthesizeCommunityAnswer: false,
    answerRulesQuestion: () => ({ answer: 'No rule answer.', sources: [], actions: [], confidence: { canAnswer: false } }),
  };
  const methods = await answerCommunityQuestion('What payment methods can I use for my water bill?', baseOptions);
  assert.equal(methods.answerStatus, 'verified');
  assert.equal(methods.answerMode, 'community-approved-operational');
  assert.match(methods.answer, /UtilityHawk.*Pay Online/i);
  assert.match(methods.answer, /ACH[\s\S]*debit or credit card[\s\S]*check or money order[\s\S]*bank bill pay[\s\S]*phone[\s\S]*email or text/i);
  assert.deepEqual(methods.actions.map((action) => action.url), ['https://srcab.utilityhawk.us']);
  assert.doesNotMatch(methods.answer, /2\.95%|threshold|alerts?|monitor|tier|water rate|Venmo|PayPal/i);

  const help = await answerCommunityQuestion('Who can help me pay my water bill?', baseOptions);
  assert.equal(help.answerStatus, 'verified');
  assert.match(help.answer, /\(833\) 772-2240/);
  assert.match(help.answer, /ClientCare@AmCoBi\.com/i);
  assert.doesNotMatch(help.answer, /720-661-9694|threshold|alerts?|monitor|water rate/i);

  const fee = await answerCommunityQuestion('What is the credit card fee for paying my water bill?', baseOptions);
  assert.equal(fee.answerStatus, 'verified');
  assert.match(fee.answer, /2\.95%.*Paymentus/i);
  assert.doesNotMatch(fee.answer, /threshold|alerts?|monitor|tier|water rate/i);

  const changed = JSON.parse(JSON.stringify(index));
  changed.sources.find((source) => source.id === 'sterling-ranch-water-billing-payment-options-334').contentHash = 'e'.repeat(64);
  const withdrawn = await answerCommunityQuestion('What payment methods can I use for my water bill?', { ...baseOptions, index: changed });
  assert.equal(withdrawn.answerStatus, 'source-unavailable');
  assert.doesNotMatch(withdrawn.answer, /ACH|debit or credit card|bank bill pay|payment-portal email or text/i);
});

test('a changed captured hash withdraws every approved water-billing projection', () => {
  const changed = JSON.parse(JSON.stringify(index));
  const page = changed.sources.find((source) => source.id === 'sterling-ranch-view-and-pay-water-bill-332');
  page.contentHash = 'f'.repeat(64);
  const result = searchCommunityIndex('Utility Hawk water bill payment', { index: changed, communityId: 'sterling-ranch', now: NOW });
  assert.equal(result.sources.some((source) => source.id === page.id), false);
});

test('real imported exact-version water-billing projections renew after their initial freshness deadline', async () => {
  const expiredNow = Date.parse('2026-09-11T12:00:00Z');
  const imported = JSON.parse(JSON.stringify(index));
  const expired = {
    ...imported,
    sources: imported.sources.filter((source) => waterIds.has(source.id)),
    factLedger: imported.factLedger.filter((fact) => waterIds.has(fact.sourceId)),
  };
  for (const source of expired.sources) source.staleAfter = '2026-09-10T12:00:00Z';
  for (const fact of expired.factLedger) fact.staleAfter = '2026-09-10T12:00:00Z';
  const pages = expired.sources;
  assert.deepEqual(selectRevalidationTargetUrls(expired, expiredNow), pages.map((source) => source.sourceUrl).sort());

  const result = await revalidateApprovedEvidence(expired, {
    now: expiredNow,
    fetchObservedHashes: async (_url, sources) => ({
      observedHashes: sources.map((source) => source.contentHash), actionMismatch: false,
    }),
  });
  assert.equal(result.checks.every((check) => check.outcome === 'renewed'), true);
  for (const page of result.temporaryIndex.sources.filter((source) => waterIds.has(source.id))) {
    assert.ok(Date.parse(page.staleAfter) > expiredNow, `${page.id} source freshness must renew`);
    assert.equal(page.reviewStatus, 'candidate', `${page.id} raw body must stay withheld`);
  }
  for (const fact of result.temporaryIndex.factLedger.filter((fact) => waterIds.has(fact.sourceId))) {
    assert.ok(Date.parse(fact.staleAfter) > expiredNow, `${fact.sourceId} projection freshness must renew`);
  }
});

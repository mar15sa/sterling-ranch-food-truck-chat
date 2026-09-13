const test = require('node:test');
const assert = require('node:assert/strict');
const baseIndex = require('../data/community-index.json');
const ledger = require('../data/canonical-source-ledger.json');
const { approvals, buildApprovedV7Sources } = require('../data/community-source-approvals-v7');
const { applyCommunitySourceApprovalsV7 } = require('../scripts/apply-community-source-approvals-v7');
const { canonicalProjectionEntries, sourceReviewState } = require('../lib/community-source-answerability');
const { selectRevalidationTargetUrls } = require('../lib/community-approved-revalidation');
const { searchCommunityIndex } = require('../lib/community-search');
const { answerCommunityQuestion } = require('../lib/community-assistant');

test('pickleball approval is exact-version and limited to fifteen current operating claims', () => {
  assert.equal(approvals.decisions.length, 1);
  const decision = approvals.decisions[0];
  assert.equal(decision.decisionId, 'pickleball-current-operating-claims');
  assert.equal(decision.approvedClaims.length, 15);
  assert.deepEqual(new Set(decision.withheldClaims), new Set([
    'live-court-availability', 'booking-outcomes', 'opening-date',
    'nonresident-program-launch-date', 'courtreserve-account-setup-instructions',
    'private-court-construction-rules',
  ]));
  const record = ledger.records.find((item) => item.canonicalUrl === decision.versions[0].canonicalUrl
    && item.contentHash === decision.versions[0].contentHash);
  assert.ok(record?.approvals.some((approval) => approval.decisionId === decision.decisionId));
  assert.equal(decision.approvedActions[0].display.label, 'Open CourtReserve');
});

test('pickleball projection exposes every approved claim and none of the withheld history or availability', () => {
  const index = applyCommunitySourceApprovalsV7(structuredClone(baseIndex));
  const source = index.sources.find((item) => item.id === 'approved-pickleball-current-operations');
  const projected = canonicalProjectionEntries(source, index);
  assert.deepEqual(new Set(projected.map((entry) => entry.approvalClaim)), new Set(approvals.decisions[0].approvedClaims));
  const text = projected.map((entry) => entry.supportingText).join(' ');
  assert.match(text, /7 a\.m\. to dusk/);
  assert.match(text, /\$40 per court/);
  assert.match(text, /720-728-7257/);
  assert.doesNotMatch(text, /August 1, 2025|September 1, 2025|available right now|account setup/i);
});

test('pickleball resident searches reach approved facts but cannot infer live availability', () => {
  const index = applyCommunitySourceApprovalsV7(structuredClone(baseIndex));
  const now = Date.parse(approvals.decidedAt);
  const cases = [
    ['What are the pickleball court hours?', /7 a\.m\. to dusk/],
    ['How much does pickleball cost for nonresidents?', /\$40 per court/],
    ['Do I need to bring pickleball paddles?', /bring their own paddles/],
    ['How far ahead can residents reserve a pickleball court?', /seven days in advance/],
    ['Can children use the pickleball courts?', /Children under 13/],
  ];
  for (const [question, expected] of cases) {
    const result = searchCommunityIndex(question, {
      index, communityId: approvals.communityId, now, limit: 5,
      includeActionOnlyProjections: true, allowPartialRequestedDetails: true,
    });
    const source = result.sources.find((item) => item.id === 'approved-pickleball-current-operations');
    assert.ok(source, question);
    assert.match(source.text, expected, question);
  }
  const availability = searchCommunityIndex('Is a pickleball court available right now?', {
    index, communityId: approvals.communityId, now, limit: 5,
    includeActionOnlyProjections: true, allowPartialRequestedDetails: true,
  });
  assert.ok(availability.sources.every((source) => !/available right now/i.test(source.text || '')));
});

test('pickleball projection is due for exact revalidation and a changed hash cannot inherit approval', () => {
  const index = applyCommunitySourceApprovalsV7(structuredClone(baseIndex));
  const source = buildApprovedV7Sources()[0];
  const due = selectRevalidationTargetUrls(index, Date.parse(approvals.decidedAt) + 1);
  assert.ok(due.includes(source.sourceUrl));
  const changed = { ...source, contentHash: 'f'.repeat(64) };
  assert.deepEqual(canonicalProjectionEntries(changed, index), []);
  assert.equal(sourceReviewState(index, Date.parse(approvals.decidedAt)).canUseProjection(source), true);
});

test('rebuilding the index removes misleading approval labels without proof', () => {
  const malformed = structuredClone(baseIndex);
  malformed.factLedger[0] = {
    ...malformed.factLedger[0], reviewStatus: 'approved', reviewedAt: '', reviewedBy: '', reviewDecisionId: '',
  };
  const next = applyCommunitySourceApprovalsV7(malformed);
  assert.equal(next.factLedger.some((entry) => entry.reviewStatus === 'approved'
    && !(entry.reviewDecisionId && entry.reviewedAt && entry.reviewedBy && entry.sourceVersion)), false);
});

test('resident pickleball answers lead with the fact, offer CourtReserve, and keep private construction separate', async () => {
  const index = applyCommunitySourceApprovalsV7(structuredClone(baseIndex));
  const options = {
    index,
    communityId: approvals.communityId,
    now: new Date(approvals.decidedAt),
    planCommunitySearch: false,
    synthesizeCommunityAnswer: false,
    answerRulesQuestion: async (question) => /backyard/i.test(question) ? ({
      answer: 'Private backyard sport courts require the governing design-review process.',
      answerMode: 'source-derived-extractive',
      confidence: { canAnswer: true },
      sources: [{ id: 'private-rule', title: 'Private sport courts', sourceType: 'rules', sourceUrl: 'https://library.municode.com/example', text: 'Private backyard sport courts require the governing design-review process.' }],
    }) : ({ answer: 'No governing rule resolves this request.', answerMode: 'source-evidence-boundary', confidence: { canAnswer: false }, sources: [] }),
  };

  const hours = await answerCommunityQuestion('What are the pickleball court hours?', options);
  assert.equal(hours.answerStatus, 'verified');
  assert.ok(hours.answer.indexOf('7 a.m. to dusk') < hours.answer.indexOf('Open CourtReserve'));

  const booking = await answerCommunityQuestion('How do I reserve a pickleball court?', options);
  assert.equal(booking.answerStatus, 'verified');
  assert.equal(booking.actions[0].url, 'https://sterlingranchcab.com/420/Court-Reserve');
  assert.match(booking.answer, /two hours per day/);

  const equipment = await answerCommunityQuestion('Do I need to bring pickleball paddles?', options);
  assert.equal(equipment.answerStatus, 'verified');
  assert.match(equipment.answer, /bring their own paddles and balls/);
  assert.doesNotMatch(equipment.answer, /still unclear|couldn.t confirm/i);

  const live = await answerCommunityQuestion('Is a pickleball court available right now?', options);
  assert.equal(live.answerStatus, 'source-unavailable');
  assert.doesNotMatch(live.answer, /is available right now/i);

  const privateCourt = await answerCommunityQuestion('Can I build a pickleball court in my backyard?', options);
  assert.match(privateCourt.answer, /governing design-review process/);
  assert.equal(privateCourt.sources[0].id, 'private-rule');
  assert.doesNotMatch(privateCourt.answer, /7 a\.m\.|\$40|paddles/i);
});

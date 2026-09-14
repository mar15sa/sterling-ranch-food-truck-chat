const test = require('node:test');
const assert = require('node:assert/strict');
const { deterministicRequestedDetails, normalizeInterpretation } = require('../lib/community-interpretation');
const { buildAnswerContract, reviewedFactCoversDetail } = require('../lib/community-contracts');
const { planCommunitySearch } = require('../lib/community-llm');
const { answerCommunityQuestion } = require('../lib/community-assistant');
const { answerRulesQuestion } = require('../lib/rules-assistant');

const eligibility = { type: 'information', facet: 'reservation-policy', approvalClaim: 'qualified',
  context: 'Residents aged 18 or older are eligible to apply.' };
const quantity = { type: 'information', facet: 'quantity', approvalClaim: 'count',
  context: 'Each household receives four passes per year.' };
const price = { type: 'money', facet: 'fee', approvalClaim: 'price', context: 'The annual price is $30.' };
const source = { id: 'official', authorityScore: 1, facts: [eligibility, quantity, price] };
const claims = source.facts.map(fact => ({ text: fact.context, evidenceSourceIds: ['official'], approvalClaimIds: [fact.approvalClaim], verified: true }));
const base = { sources: [source], claims, status: 'verified' };

test('eligibility and quantity grammar preserves every part without inferring unrelated facets', () => {
  for (const question of ['Who is eligible for a pass?', 'Who qualifies for membership?', 'Who can use the service?',
    'What are the eligibility requirements?', 'Can I qualify for the program?']) {
    assert.ok(deterministicRequestedDetails(question).includes('eligibility'), question);
  }
  for (const question of ['How many passes are included?', 'What is the number of tickets per household?',
    'What quantity of permits is available?', 'How many visits do we get?', 'How many guests can I bring?']) {
    assert.ok(deterministicRequestedDetails(question).includes('quantity'), question);
  }
  for (const question of ['What is the phone number?', 'Who can help me pay?', 'What does it cost?', 'When does membership expire?']) {
    assert.ok(!deterministicRequestedDetails(question).includes('quantity'), question);
    assert.ok(!deterministicRequestedDetails(question).includes('eligibility'), question);
  }
  const question = 'What does membership cost, who is eligible, and how many passes are included?';
  const normalized = normalizeInterpretation({ intent: 'services', goal: 'cost', goals: ['cost'], subject: 'membership',
    searchQueries: ['membership price'], requestedDetails: ['price'], scope: 'community' }, question);
  assert.deepEqual(normalized.requestedDetails, ['price', 'eligibility', 'quantity']);
});

test('usage conditions, dates, and prices cannot stand in for eligibility or quantity', () => {
  assert.equal(reviewedFactCoversDetail({ ...eligibility, context: 'Users must be with the person receiving care. Payment is due at pickup.' }, 'eligibility'), false);
  for (const fact of [{ type: 'date', facet: 'event-date', context: 'June 20, 2026' },
    { type: 'money', facet: 'fee', context: 'Each pass costs $4.' },
    { type: 'phone', facet: 'contact', context: '303-555-0100' },
    { type: 'information', facet: 'information', context: 'There are four passes.' }]) {
    assert.equal(reviewedFactCoversDetail(fact, 'quantity'), false);
  }
  assert.equal(reviewedFactCoversDetail(quantity, 'quantity'), true);
  assert.equal(reviewedFactCoversDetail(eligibility, 'eligibility'), true);
  assert.equal(reviewedFactCoversDetail({ ...quantity, context: 'No number of passes is specified.' }, 'quantity'), false);
  assert.equal(reviewedFactCoversDetail({ ...eligibility, facet: 'eligibility', context: 'Eligibility is not specified.' }, 'eligibility'), false);
});

test('compound answers resolve only approved details that are actually displayed', () => {
  const partial = buildAnswerContract({ ...base, directAnswer: price.context,
    requestedDetails: ['price', 'eligibility', 'quantity'], coveredDetails: ['price', 'eligibility', 'quantity'] });
  assert.equal(partial.answerStatus, 'verified-incomplete');
  assert.deepEqual(partial.completion.resolvedDetails, ['price']);
  assert.deepEqual(partial.completion.missingDetails.map(item => item.key), ['eligibility', 'quantity']);
  const complete = buildAnswerContract({ ...base, directAnswer: price.context, keyDetails: [eligibility.context, quantity.context],
    requestedDetails: ['price', 'eligibility', 'quantity'], coveredDetails: ['price', 'eligibility', 'quantity'] });
  assert.equal(complete.completion.outcome, 'complete');
  assert.equal(complete.answerStatus, 'verified');
});

test('unapproved, unrelated, or fourth hidden claims cannot supply new-facet completion', () => {
  for (const patch of [{ claims: [] }, { claims: claims.map(claim => ({ ...claim, verified: false })) },
    { claims: claims.map(claim => ({ ...claim, approvalClaimIds: ['another-claim'] })) },
    { sources: [{ ...source, facts: [{ ...quantity, facet: 'information' }] }] }]) {
    const result = buildAnswerContract({ ...base, ...patch, directAnswer: quantity.context,
      requestedDetails: ['quantity'], coveredDetails: ['quantity'] });
    assert.notEqual(result.completion.outcome, 'complete');
  }
  for (const fact of [eligibility, quantity]) {
    const detail = fact === eligibility ? 'eligibility' : 'quantity';
    const hidden = buildAnswerContract({ ...base, directAnswer: price.context,
      keyDetails: ['First visible note.', 'Second visible note.', 'Third visible note.', fact.context],
      requestedDetails: ['price', detail], coveredDetails: ['price', detail] });
    assert.equal(hidden.answerStatus, 'verified-incomplete');
    assert.deepEqual(hidden.completion.resolvedDetails, ['price']);
    assert.ok(!hidden.answer.includes(fact.context));
  }
});

test('the model route schema shares the complete requested-detail contract', async () => {
  let enumValues;
  await planCommunitySearch('Who is eligible and how many passes are included?', {
    apiKey: 'test-only', fetchImpl: async (_url, options) => {
      enumValues = JSON.parse(options.body).tools[0].input_schema.properties.requestedDetails.items.enum;
      return new Response(JSON.stringify({ content: [] }), { status: 200 });
    },
  });
  for (const detail of ['methods', 'eligibility', 'quantity']) assert.ok(enumValues.includes(detail), detail);
});

test('an explicitly reviewed no-additional-cost statement does not need an invented numeric zero', () => {
  const fact = { type: 'information', facet: 'fee', approvalClaim: 'included-price', context: 'There is no additional cost for membership.' };
  const result = buildAnswerContract({ directAnswer: fact.context, status: 'verified',
    requestedDetails: ['price'], coveredDetails: ['price'], sources: [{ ...source, facts: [fact] }],
    claims: [{ text: fact.context, evidenceSourceIds: ['official'], approvalClaimIds: [fact.approvalClaim] }] });
  assert.equal(result.completion.outcome, 'complete');
  assert.doesNotMatch(result.answer, /\$0|zero dollars/);
});

test('governing rule counts and permission/count compounds retain their separate authority contract', async () => {
  for (const [question, count] of [
    ['How many rain barrels am I allowed to have?', /two 55-gallon rain barrels/i],
    ['Can I install rain barrels, and how many are allowed?', /two 55-gallon rain barrels/i],
    ['How many dogs may I keep?', /not more than four domestic animals/i],
  ]) {
    const answer = await answerCommunityQuestion(question, { isTest: true,
      now: new Date('2026-09-14T18:00:00Z'), planCommunitySearch: false, synthesizeCommunityAnswer: false,
      answerRulesQuestion, rulesOptions: { searchMode: 'legacy', llmMode: 'off' } });
    assert.equal(answer.answerStatus, 'verified', question);
    assert.match(answer.answer, count, question);
    assert.ok(answer.completion.resolvedDetails.includes('permission'), question);
    assert.ok(answer.completion.resolvedDetails.includes('quantity'), question);
    assert.ok(answer.sources.some(item => /library\.municode\.com/.test(item.sourceUrl || '')), question);
    assert.ok(answer.sources.every(item => !(item.facts || []).some(fact => fact.approvalClaim)), question);
  }
});

test('a quantity-free governing conclusion cannot implicitly complete a count request', async () => {
  const text = 'Domestic animals are permitted subject to the adopted restrictions.';
  const answer = await answerCommunityQuestion('How many dogs may I keep?', { isTest: true,
    now: new Date('2026-09-14T18:00:00Z'), planCommunitySearch: false, synthesizeCommunityAnswer: false,
    answerRulesQuestion: async () => ({ answer: text, answerStatus: 'verified', answerVerdict: 'conditional',
      controllingSourceOnly: true, confidence: { canAnswer: true }, actions: [],
      sources: [{ id: 'governing-test', sourceType: 'rules', title: 'Adopted animal restrictions',
        sourceUrl: 'https://library.municode.com/test/rules', excerpt: text }] }),
  });
  assert.notEqual(answer.answerStatus, 'verified');
  assert.ok(answer.completion.missingDetails.some(detail => detail.key === 'quantity'));
  assert.ok(!answer.completion.resolvedDetails.includes('quantity'));
});

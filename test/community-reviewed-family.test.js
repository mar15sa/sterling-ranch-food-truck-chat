const test = require('node:test');
const assert = require('node:assert/strict');
const packageData = require('../data/community-source-approvals-v8.json');
const profile = require('../data/communities/sterling-ranch.json');
const { buildReviewedSources } = require('../lib/community-reviewed-package');
const { emptyLedger, upsertObservation, applyExplicitDecision } = require('../lib/canonical-source-ledger');
const { buildFactLedger } = require('../lib/community-truth');
const { searchCommunityIndex } = require('../lib/community-search');
const { answerCommunityQuestion } = require('../lib/community-assistant');

const now = new Date('2026-09-15T12:00:00.000Z');
const future = '2026-09-16T12:00:00.000Z';
const sourceMatches = (source, fragment) => source.sourceUrl.includes(fragment);
test.beforeEach(context => context.mock.timers.enable({ apis: ['Date'], now }));

// Exercise the saved approval package, not a second hand-authored copy of its
// facts. Freshness is synthetic only inside this isolated, deterministic test.
function fixture(fragments, state = 'fresh') {
  const decisions = packageData.decisions.filter(decision => fragments.some(fragment => decision.versions[0].canonicalUrl.includes(fragment)));
  assert.equal(decisions.length, fragments.length, 'every requested reviewed source must exist exactly once');
  const canonicalSourceLedger = emptyLedger();
  for (const decision of decisions) {
    const version = decision.versions[0];
    upsertObservation(canonicalSourceLedger, { ...version, communityId: packageData.communityId, checkedAt: packageData.decidedAt });
    applyExplicitDecision(canonicalSourceLedger, { ...decision, ...version, communityId: packageData.communityId,
      decision: 'approve-proposed', decidedAt: packageData.decidedAt });
  }
  const sources = buildReviewedSources({ ...packageData, decisions }).map(source => ({ ...source,
    staleAfter: state === 'stale' ? '2026-09-14T12:00:00.000Z' : future,
    ...(state === 'changed' ? { contentHash: '0'.repeat(64) } : {}),
  }));
  const index = { communityId: packageData.communityId, communityName: profile.name, website: profile.website,
    factAuthority: profile.factAuthority, sources, canonicalSourceLedger, pages: [] };
  index.factLedger = buildFactLedger(index);
  return index;
}

const search = (index, question, details = [], intent = 'services') => searchCommunityIndex(question, {
  index, now, intent, interpretation: { requestedDetails: details },
});
const ask = (index, question) => answerCommunityQuestion(question, {
  index, now, communityId: packageData.communityId, isTest: true,
  planCommunitySearch: false, synthesizeCommunityAnswer: false,
  answerRulesQuestion: async () => ({ answer: 'No governing evidence in this isolated fixture.',
    answerStatus: 'could-not-verify', sources: [], actions: [], confidence: { canAnswer: false } }),
});

test('reviewed outdoor-water method answers wording variants without importing old rates or contacts', () => {
  const index = fixture(['/DocumentCenter/View/770/']);
  for (const question of ['How do I calculate outdoor water usage?', 'How is irrigated plant square footage calculated?',
    'What plant size should I use to calculate outdoor water usage?', 'Explain the outdoor water calculation method']) {
    const result = search(index, question, ['methods']);
    assert.ok(result.sources.some(source => sourceMatches(source, '/770/')), question);
    assert.match(result.sources.map(source => source.text).join(' '), /full growth/i);
    assert.ok(result.sources.flatMap(source => source.facts).every(fact => fact.facet === 'method'));
    assert.doesNotMatch(result.sources.map(source => source.text).join(' '), /submit@sterlingranchdrc|20 gallons|10 gallons|6 gallons|30%|70%/i);
  }
  assert.equal(search(index, 'What are the current outdoor water rates?', ['price']).sources.length, 0);
});

test('reviewed utility contact survives search and answer routes with the actual billing number', async () => {
  const index = fixture(['/248/Water-Sewer']);
  for (const question of ['Who can help with my water bill?', 'What is the water billing phone number?',
    'How do I contact AmCoBi?', 'Who handles questions about water and sewer bills?']) {
    const result = search(index, question, ['contact']);
    assert.ok(result.sources.length, question);
    assert.ok(result.sources.flatMap(source => source.facts).some(fact => fact.type === 'phone' && /833/.test(fact.value)), question);
    assert.ok(result.sources.flatMap(source => source.facts).some(fact => fact.type === 'email' && /amcobi/i.test(fact.value)), question);
  }
  const answer = await ask(index, 'What is the water billing phone number?');
  assert.equal(answer.confidence.canAnswer, true);
  assert.match(answer.answer, /833[)\s-]*772[\s-]*2240/);
  assert.ok(answer.sources.some(source => sourceMatches(source, '/248/Water-Sewer')));
  assert.equal(search(index, 'What is the current water price?', ['price']).sources.length, 0);
});

test('landscape packet provides actual application components and inspection steps, not a blanket policy approval', async () => {
  const index = fixture(['/DocumentCenter/View/1964/']);
  for (const question of ['What is included in the landscape application packet?', 'Which attachments go with a landscape submittal?',
    'How do I schedule a landscape inspection?', 'What must I include with my landscape and irrigation submittal?']) {
    const result = search(index, question, [], 'forms');
    assert.ok(result.sources.some(source => sourceMatches(source, '/1964/')), question);
    const text = result.sources.map(source => source.text).join(' ');
    assert.match(text, /LANDSCAPE VERIFICATION CHECKLIST|SCHEDULE AN INSPECTION/i);
    assert.doesNotMatch(text, /\$[\d,]+|8155|8220|20 gallons|10 gallons|6 gallons/);
  }
  const answer = await ask(index, 'How do I schedule a landscape inspection?');
  assert.equal(answer.confidence.canAnswer, true, JSON.stringify({ answer: answer.answer, status: answer.answerStatus, completion: answer.completion }));
  assert.match(answer.answer, /residentialinspections@sterlingranchcab\.com/i);
  assert.equal(search(index, 'What is the landscape application fee?', ['price'], 'forms').sources.length, 0);
});

test('annual report retrieval includes dated findings and supplier scope without proving current drinking-water safety', async () => {
  const index = fixture(['/DocumentCenter/View/2398/']);
  for (const question of ['What did the 2026 water quality report find?', 'What happened with CAB coliform testing in 2025?',
    'What backflow violation did the CAB report?', 'What monitoring violations did Dominion report?']) {
    const result = search(index, question);
    assert.ok(result.sources.some(source => sourceMatches(source, '/2398/')), question);
    const text = result.sources.map(source => source.text).join(' ');
    assert.match(text, /2025/);
    assert.match(text, /coliform|BACKFLOW|Monitoring and Reporting/i);
    assert.doesNotMatch(text, /no violations|water is safe today|currently safe to drink/i);
  }
  const historical = await ask(index, 'What did the 2026 water quality report find?');
  assert.equal(historical.confidence.canAnswer, true, JSON.stringify({ answer: historical.answer, status: historical.answerStatus }));
  assert.match(historical.answer, /2025|2026/);
  assert.match(historical.answer, /coliform|backflow|violation/i);
  const answer = await ask(index, 'Is my drinking water safe right now?');
  assert.notEqual(answer.answerStatus, 'verified');
  assert.doesNotMatch(answer.answer, /(?:water is|it is|it's) safe (?:today|right now|to drink)/i);
});

test('directory contacts answer the named office, not an unrelated internet-service question', async () => {
  const index = fixture(['/m/directory']);
  for (const question of ['What is the Resident Resource Center phone number?', 'How do I contact the Overlook Clubhouse?',
    'What is the design review email?', 'How do I reach the Sterling Center Information Desk?']) {
    const result = search(index, question, ['contact']);
    assert.ok(result.sources.some(source => sourceMatches(source, '/m/directory')), question);
    assert.ok(result.sources.flatMap(source => source.facts).some(fact => ['phone', 'email'].includes(fact.type)));
  }
  const answer = await ask(index, 'Who should I call about my internet service?');
  assert.notEqual(answer.answerStatus, 'verified');
  assert.equal(answer.confidence.canAnswer, false);
});

test('all newly reviewed families fail closed when their approved version expires or changes', async () => {
  const cases = [
    ['/DocumentCenter/View/770/', 'How do I calculate outdoor water usage?', ['methods'], 'services'],
    ['/248/Water-Sewer', 'What is the water billing phone number?', ['contact'], 'services'],
    ['/DocumentCenter/View/1964/', 'How do I schedule a landscape inspection?', [], 'forms'],
    ['/DocumentCenter/View/2398/', 'What did the 2026 water quality report find?', [], 'services'],
    ['/m/directory', 'What is the Resident Resource Center phone number?', ['contact'], 'services'],
  ];
  for (const state of ['stale', 'changed']) {
    for (const [fragment, question, details, intent] of cases) {
      assert.equal(search(fixture([fragment], state), question, details, intent).sources.length, 0, `${state}: ${question}`);
      const answer = await ask(fixture([fragment], state), question);
      assert.notEqual(answer.answerStatus, 'verified', `${state} answer: ${question}`);
      assert.equal(answer.confidence.canAnswer, false, `${state} answer: ${question}`);
    }
  }
  const answer = await ask(fixture(['/248/Water-Sewer'], 'stale'), 'What is the water billing phone number?');
  assert.notEqual(answer.answerStatus, 'verified');
  assert.doesNotMatch(answer.answer, /833[)\s-]*772[\s-]*2240/);
});

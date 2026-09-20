const test = require('node:test');
const assert = require('node:assert/strict');
const packageData = require('../data/community-source-approvals-v8.json');
const profile = require('../data/communities/sterling-ranch.json');
const { buildReviewedSources } = require('../lib/community-reviewed-package');
const { emptyLedger, upsertObservation, applyExplicitDecision } = require('../lib/canonical-source-ledger');
const { buildFactLedger } = require('../lib/community-truth');
const { answerCommunityQuestion } = require('../lib/community-assistant');

test.describe('reviewed subject selection across related claims', () => {
  const now = new Date('2026-09-15T12:00:00Z');
  test.beforeEach(context => context.mock.timers.enable({ apis: ['Date'], now }));
  function fixture() {
    const canonicalSourceLedger = emptyLedger();
    for (const decision of packageData.decisions) {
      const version = decision.versions[0];
      upsertObservation(canonicalSourceLedger, { ...version, communityId: packageData.communityId, checkedAt: packageData.decidedAt });
      applyExplicitDecision(canonicalSourceLedger, { ...decision, ...version, communityId: packageData.communityId,
        decision: 'approve-proposed', decidedAt: packageData.decidedAt });
    }
    const index = { communityId: packageData.communityId, communityName: profile.name, website: profile.website,
      factAuthority: profile.factAuthority, canonicalSourceLedger, pages: [],
      sources: buildReviewedSources(packageData).map(source => ({ ...source, staleAfter: '2026-09-16T12:00:00Z' })) };
    index.factLedger = buildFactLedger(index);
    return index;
  }
  const ask = (question, index = fixture()) => answerCommunityQuestion(question, { index, now, isTest: true,
    communityId: packageData.communityId, planCommunitySearch: false, synthesizeCommunityAnswer: false,
    answerRulesQuestion: async () => ({ answer: 'No separate governing evidence in this fixture.',
      answerStatus: 'could-not-verify', sources: [], actions: [], confidence: { canAnswer: false } }) });

  test('individual rental prices remain attached to the named facility', async () => {
    for (const question of ['What does it cost to rent the Great Hall?', 'What is the Great Hall rental price?']) {
      const result = await ask(question);
      assert.equal(result.answerStatus, 'verified', question);
      assert.match(result.answer, /\$100/);
      assert.doesNotMatch(result.answer, /\$25(?:\D|$)|Pavilion/);
    }
    for (const question of ['What does it cost to rent the North Pavilion?', 'What is the pavilion rental price?']) {
      const result = await ask(question);
      assert.equal(result.answerStatus, 'verified', question);
      assert.match(result.answer, /\$25/);
      assert.doesNotMatch(result.answer, /\$100|\$250|Great Hall/);
    }
  });

  test('compound facility requests retain each separately named subject', async () => {
    const result = await ask('What does it cost to rent the Great Hall and pavilion?');
    assert.equal(result.answerStatus, 'verified');
    assert.match(result.answer, /Great Hall/);
    assert.match(result.answer, /Pavilion/i);
    assert.match(result.answer, /\$100/);
    assert.match(result.answer, /\$25/);
  });

  test('resident and non-resident membership prices cannot be exchanged', async () => {
    const resident = await ask('What does resident membership cost?');
    assert.equal(resident.answerStatus, 'verified', resident.answer);
    assert.match(resident.answer, /no additional cost/i);
    assert.doesNotMatch(resident.answer, /\$850|\$300/);
    for (const question of ['What does nonresident membership cost?', 'What does non-resident membership cost?']) {
      const result = await ask(question);
      assert.equal(result.answerStatus, 'verified', question);
      assert.match(result.answer, /\$850/);
      assert.doesNotMatch(result.answer, /no additional cost|\$300/);
    }
  });

  test('unapproved raw rental prose cannot restore a filtered-out price', async () => {
    const index = fixture();
    const rental = index.sources.find(source => /\/269\//.test(source.sourceUrl));
    rental.facts = rental.facts.filter(fact => !/pavilion/.test(fact.scopeKey));
    index.factLedger = buildFactLedger(index);
    const result = await ask('What does it cost to rent the pavilion?', index);
    assert.notEqual(result.answerStatus, 'verified');
    assert.doesNotMatch(result.answer, /\$25|\$100|\$250/);
  });

  test('booking prefers the verified direct reservation action over an information page', async () => {
    for (const question of ['How do I book the Great Hall?', 'Where can I reserve the Great Hall?']) {
      const result = await ask(question, { ...require('../data/community-index.json'), sources: require('../data/community-index.json').sources.map(source => ({ ...source, staleAfter: '2026-09-16T12:00:00Z' })) });
      assert.equal(result.answerStatus, 'verified', question);
      assert.ok(result.actions.some(action => /secure\.rec1\.com/.test(action.url)), JSON.stringify(result.actions));
      assert.ok(result.actions.every(action => !/\/269\//.test(action.url)), question);
    }
  });

  test('foreign-community and incompatible-source scopes do not compete with eligible reviewed subjects', () => {
    const { searchCommunityIndex } = require('../lib/community-search');
    const index = fixture();
    const original = index.sources.find(source => /\/269\//.test(source.sourceUrl));
    for (const [communityId, sourceType] of [['another-community', 'facilities'], [index.communityId, 'events']]) {
      const id = `ineligible-${communityId}-${sourceType}`;
      const extra = { ...original, id, communityId, sourceType, facts: original.facts.map(fact =>
        ({ ...fact, scopeKey: `resident-great-hall-${fact.scopeKey}` })) };
      index.sources.push(extra);
      // Exact canonical approval metadata is intentionally inherited: tenant
      // and source-role isolation must occur before scope competition anyway.
    }
    index.factLedger = buildFactLedger(index);
    const result = searchCommunityIndex('What does the resident Great Hall rental cost?', { index, now, intent: 'facilities' });
    assert.ok(result.sources.some(source => source.id === original.id && source.facts.some(fact => /\$100/.test(fact.context))));
    assert.ok(result.sources.every(source => !source.id.startsWith('ineligible-')));
  });

  test('equipment check and landscape calculation instructions use their approved process claims', async () => {
    const controller = await ask('How can I check whether my Rachio watering schedule is running?');
    assert.equal(controller.answerStatus, 'verified', controller.answer);
    assert.match(controller.answer, /Schedule tab in the Rachio app/);
    const method = await ask('How do I calculate the watering area for mature plants?');
    assert.equal(method.answerStatus, 'verified', method.answer);
    assert.match(method.answer, /each plant at full growth/);
    assert.doesNotMatch(method.answer, /\$|currently running|is running right now/);
  });

  test('existential service questions cannot match an unrelated source through conversational filler', async () => {
    const sourceIndex = require('../data/community-index.json');
    const index = {
      ...sourceIndex,
      sources: sourceIndex.sources.map(source => ({ ...source, staleAfter: '2026-09-21T12:00:00Z' })),
    };
    index.factLedger = buildFactLedger(index);
    const result = await ask('Is there a massage therapist?', index);
    assert.notEqual(result.answerStatus, 'verified');
    assert.match(result.answer, /couldn['’]t find a current official answer/i);
    assert.doesNotMatch(result.answer, /coliform|drinking water|hydrant|water quality report/i);
    assert.ok((result.sources || []).every(source => !/water quality report/i.test(source.title || '')));
  });

  test('inferred ledger subjects never become hard reviewed entity boundaries', () => {
    const index = fixture();
    const { sourceReviewState } = require('../lib/community-source-answerability');
    const unkeyed = index.sources.find(source => /\/243\//.test(source.sourceUrl));
    const entries = sourceReviewState(index, now).entriesFor(unkeyed).filter(entry => entry.factType !== 'link');
    assert.ok(entries.some(entry => entry.subjectKey));
    assert.ok(entries.every(entry => entry.reviewedSubjectKey === ''));
  });

  test('both canonical and ledger copies retain the same explicit reviewed entity boundary', () => {
    const index = fixture();
    const { sourceReviewState } = require('../lib/community-source-answerability');
    const membership = index.sources.find(source => /\/183\//.test(source.sourceUrl));
    const claim = membership.facts.find(fact => fact.subjectKey === 'resident-membership').approvalClaim;
    const copies = sourceReviewState(index, now).entriesFor(membership).filter(entry => entry.approvalClaim === claim);
    assert.ok(copies.length >= 2);
    assert.ok(copies.every(entry => entry.reviewedSubjectKey === 'resident-membership'));
  });
});

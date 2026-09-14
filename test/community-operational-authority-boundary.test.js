const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCommunityEvidenceFixture } = require('./helpers/community-evidence');
const { answerCommunityQuestion } = require('../lib/community-assistant');
const { answerRulesQuestion } = require('../lib/rules-assistant');
const profile = require('../data/communities/sterling-ranch.json');

test.describe('original operational subject and authority with the full approved inventory', () => {
  const now = new Date('2026-09-14T16:30:00Z');
  test.beforeEach(context => context.mock.timers.enable({ apis: ['Date'], now }));
  function fixture() {
    // Only the clock is synthetic. Keep competing sources and original
    // approvals, versions, subjects, and expiries exactly as loaded.
    return loadCommunityEvidenceFixture();
  }
  const plan = (subject, details, overrides = {}) => ({ intent: 'services', goal: 'information', goals: ['information'],
    subject, requestedDetails: details, searchQueries: [subject], scope: 'community', needsClarification: false,
    filters: {}, dateRange: null, ...overrides });
  function ask(question, routingPlan, extra = {}) {
    return answerCommunityQuestion(question, { index: fixture(), communityId: 'sterling-ranch', communityProfile: profile,
      now, isTest: true, interpretationMode: 'structured', planCommunitySearch: async () => routingPlan,
      synthesizeCommunityAnswer: false, answerRulesQuestion: async () => ({ answer: 'Unrelated utility fees are $999.',
        directAnswer: 'Unrelated utility fees are $999.', answerStatus: 'verified', answerMode: 'source-derived-extractive',
        confidence: { canAnswer: true, reason: 'unrelated-confident-rule' },
        sources: [{ title: 'Utility fees and watering restrictions', sourceUrl: 'https://library.municode.com/unrelated',
          excerpt: 'Unrelated utility fees are $999.', nodeId: 'unrelated-rules' }], actions: [] }), ...extra });
  }

  test('saved fee plans select the actual rental or membership claim instead of broad fee rules', async () => {
    const cases = [
      ['How much does the Great Hall cost?', plan('Great Hall rental cost', ['price'], { intent: 'facilities', goal: 'cost',
        goals: ['cost'], filters: { facility: 'Great Hall' }, searchQueries: ['Great Hall cost', 'Great Hall rental price', 'Great Hall fee'] }), /\$100\.00 per hour/, /\/269\//],
      ['How much is non-resident membership?', plan('non-resident membership', ['price'], { goal: 'cost', goals: ['cost'],
        searchQueries: ['non-resident membership cost', 'non-resident membership fee', 'non-resident membership price'] }), /\$850/, /\/309\//],
      ['What does the annual caregiver pass cost and who is eligible?', plan('annual caregiver pass', ['price', 'eligibility'],
        { goal: 'cost', goals: ['cost'], searchQueries: ['annual caregiver pass cost price', 'caregiver pass eligibility requirements', 'caregiver pass'] }), /\$300/, /\/182\//],
    ];
    for (const [question, routingPlan, expected, sourceUrl] of cases) {
      const result = await ask(question, routingPlan);
      assert.equal(result.confidence.canAnswer, true, result.answer);
      assert.match(result.answer, expected);
      assert.ok(result.sources.some(source => sourceUrl.test(source.sourceUrl)), question);
      assert.doesNotMatch(result.answer, /\$999|138\.02|tap fees|water, sanitary sewer/i);
      assert.ok(result.sources.every(source => !/municode/.test(source.sourceUrl)), question);
      if (question.includes('eligible')) {
        assert.equal(result.answerStatus, 'verified-incomplete');
        assert.ok(result.completion.missingDetails.some(detail => detail.key === 'eligibility'));
      }
    }
  });

  test('current private equipment state cannot be answered with a watering rule', async () => {
    for (const question of ['Is my sprinkler running right now?', 'Is my irrigation system currently running?']) {
      const result = await ask(question, plan('sprinkler system', ['status'], { intent: 'status', goal: 'status', goals: ['status'],
        scope: 'ambiguous', needsClarification: true, clarificationQuestion: 'Which sprinkler system?' }));
      assert.equal(result.confidence.canAnswer, false, result.answer);
      assert.notEqual(result.answerStatus, 'verified');
      assert.doesNotMatch(result.answer, /\$999|watering restrictions|6:00|10:00/);
    }
  });

  test('an unrelated plan can be corrected only by a matching approved instruction', async () => {
    const result = await ask('How can I check whether my Rachio watering schedule is running?',
      plan('Rachio watering schedule', ['action'], { scope: 'unrelated',
        searchQueries: ['Rachio watering schedule status', 'check Rachio irrigation running'] }));
    assert.equal(result.confidence.canAnswer, true, result.answer);
    assert.match(result.answer, /Rachio/i);
    assert.doesNotMatch(result.answer, /\$999|is currently running|is running right now/);
    const unrelated = await ask('How can I check whether my spacecraft reactor is running?',
      plan('spacecraft reactor', ['action'], { scope: 'unrelated' }));
    assert.equal(unrelated.answerStatus, 'out-of-scope');
    for (const question of ['How much does spacecraft club membership cost?',
      'What is the price of spacecraft clubhouse support?', 'How much is a lunar caregiver pass?']) {
      const unknownPrice = await ask(question, plan(question, ['price'], {
        scope: 'unrelated', goal: 'cost', goals: ['cost'],
      }));
      assert.equal(unknownPrice.answerStatus, 'out-of-scope', question);
      assert.equal(unknownPrice.confidence.canAnswer, false, question);
      assert.doesNotMatch(unknownPrice.answer, /\$\d|138\.02/);
    }
    const stale = fixture();
    for (const source of stale.sources) source.staleAfter = '2020-01-01T00:00:00Z';
    for (const fact of stale.factLedger) fact.staleAfter = '2020-01-01T00:00:00Z';
    const unavailable = await ask('How can I check whether my Rachio watering schedule is running?',
      plan('Rachio watering schedule', ['action'], { scope: 'unrelated' }), { index: stale });
    assert.equal(unavailable.answerStatus, 'out-of-scope', 'Expired facts cannot repair the planner scope.');
  });

  test('genuine permission plus application still invokes controlling rules', async () => {
    let rulesCalls = 0;
    const result = await ask('Do I need approval for a shed and how do I apply?',
      plan('shed approval and application', ['permission', 'action'], { intent: 'rules', goal: 'application', goals: ['permission', 'application'] }), {
        answerRulesQuestion: async (...args) => { rulesCalls++; return answerRulesQuestion(...args); },
        rulesOptions: { searchMode: 'legacy', llmMode: 'off' },
      });
    assert.ok(rulesCalls > 0);
    assert.ok(result.sources.some(source => /shed/i.test(source.title)), result.answer);
    assert.doesNotMatch(result.answer, /\$999/);
  });
});

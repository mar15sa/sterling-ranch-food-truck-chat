const test = require('node:test');
const assert = require('node:assert/strict');
const { answerCommunityQuestion } = require('../lib/community-assistant');
const storedIndex = require('../data/community-index.json');

const now = new Date('2026-09-08T18:00:00Z');
const index = { ...storedIndex,
  sources: storedIndex.sources.map((source) => ({ ...source, staleAfter: '2099-01-01T00:00:00Z' })),
  factLedger: (storedIndex.factLedger || []).map((fact) => ({ ...fact, staleAfter: '2099-01-01T00:00:00Z' })),
  truthStatus: { migrationMode: 'trusted-baseline' },
};
const unavailableRules = async () => ({ confidence: { canAnswer: false, reason: 'no-rule-answer' } });
function plan(goal, facility) {
  return { intent: 'facilities', goal, goals: [goal], subject: facility, requestedDetails: ['action'],
    dateRange: null, filters: { audience: '', category: '', facility, location: '' }, searchQueries: [facility],
    scope: 'community', needsClarification: false };
}

const liveStagingAccessPlan = {
  intent: 'facilities',
  goal: 'permission',
  goals: ['permission', 'account-access'],
  subject: 'Overlook Clubhouse',
  requestedDetails: ['action', 'permission'],
  dateRange: null,
  filters: { audience: '', category: '', facility: 'Overlook Clubhouse', location: '' },
  searchQueries: ['Overlook Clubhouse access'],
  scope: 'community',
  needsClarification: false,
};

test('live permission and account-access plans withhold unapproved clubhouse setup instructions', async () => {
  const realTimestampIndex = { ...storedIndex };
  const cases = [
    ['How do I get access to the Overlook Clubhouse?', liveStagingAccessPlan],
    ['Where can I request access to the Overlook Clubhouse?', { ...liveStagingAccessPlan, goal: 'permission', goals: ['permission'] }],
    ['I need an Overlook Clubhouse access card.', { ...liveStagingAccessPlan, goal: 'account-access', goals: ['account-access'], requestedDetails: ['action'] }],
  ];
  for (const [question, routingPlan] of cases) {
    const result = await answerCommunityQuestion(question, {
      now: new Date('2026-09-08T20:00:00Z'), index: realTimestampIndex, communityId: 'sterling-ranch',
      planCommunitySearch: async () => routingPlan, synthesizeCommunityAnswer: false,
      answerRulesQuestion: unavailableRules,
    });
    assert.equal(result.answerStatus, 'source-unavailable', question);
    assert.equal(result.answerMode, 'community-access-withheld', question);
    assert.match(result.directAnswer, /can’t currently confirm the access requirements.*owner-approved claims/i, question);
    assert.ok(result.sources.some((source) => /sterlingranchcab\.com/i.test(source.sourceUrl || '')), question);
    assert.ok(result.actions.some((action) => action.actionType === 'information' && /sterlingranchcab\.com/i.test(action.url)), question);
    assert.doesNotMatch(JSON.stringify(result.actions), /Resident-Amenity-Form-56/i, question);
    assert.doesNotMatch(JSON.stringify(result), /secure\.rec1\.com|rental catalog|\$100|\$250/i, question);
    assert.notEqual(result.answerStatus, 'verified', question);
  }
});

test('clubhouse access wording never falls into rental, pricing, or an unapproved form', async () => {
  for (const question of ['How do I get access to the Overlook Clubhouse?', 'Where do I sign up for clubhouse access?', 'I need an access card for the clubhouse.']) {
    const result = await answerCommunityQuestion(question, { now, index, communityId: 'sterling-ranch',
      planCommunitySearch: async () => plan('booking', 'Overlook Clubhouse'), synthesizeCommunityAnswer: false,
      answerRulesQuestion: unavailableRules });
    assert.equal(result.answerStatus, 'source-unavailable', question);
    assert.match(result.directAnswer, /can’t currently confirm the access requirements.*owner-approved claims/i, question);
    assert.equal(result.answerMode, 'community-access-withheld', question);
    assert.ok(result.actions.some((action) => action.actionType === 'information' && /sterlingranchcab\.com/i.test(action.url)), question);
    assert.doesNotMatch(JSON.stringify(result.actions), /Resident-Amenity-Form-56|secure\.rec1\.com|rental catalog/i, question);
  }
});

test('pool-party wording withholds an unapproved no-rental claim without clubhouse routing', async () => {
  for (const question of ['Can I reserve the pool for a birthday party?', 'Is pool rental available for our party?', 'Can we rent the pool?']) {
    const result = await answerCommunityQuestion(question, { now, index, communityId: 'sterling-ranch',
      planCommunitySearch: async () => plan('booking', 'Overlook Clubhouse'), synthesizeCommunityAnswer: false,
      answerRulesQuestion: unavailableRules });
    assert.equal(result.answerStatus, 'source-unavailable', question);
    assert.equal(result.answerMode, 'community-freshness-withheld', question);
    assert.doesNotMatch(result.directAnswer, /^(?:Yes|No)\b|not available for rental/i, question);
    assert.ok(result.sources.some((source) => /\/187\/Pool/.test(source.sourceUrl || '')), question);
    assert.ok(result.actions.every((action) => action.actionType === 'information'), question);
    assert.doesNotMatch(JSON.stringify(result.actions), /secure\.rec1\.com|rental catalog|Resident-Amenity-Form-56/i, question);
  }
});

test('pool rental cost questions withhold unapproved availability and price conclusions', async () => {
  for (const question of ['What is the pool rental fee?', 'How much does it cost to rent the pool?']) {
    const result = await answerCommunityQuestion(question, { now, index, communityId: 'sterling-ranch',
      planCommunitySearch: async () => ({ ...plan('cost', 'pool'), requestedDetails: ['price'], subject: 'pool rental', searchQueries: ['pool rental fee'] }),
      synthesizeCommunityAnswer: false, answerRulesQuestion: unavailableRules });
    assert.equal(result.answerStatus, 'source-unavailable', question);
    assert.equal(result.answerMode, 'community-freshness-withheld', question);
    assert.match(result.directAnswer, /could not safely confirm.*fee or price/i, question);
    assert.doesNotMatch(result.directAnswer, /no pool rental fee|not available for rental/i, question);
    assert.ok(result.sources.some((source) => /\/187\/Pool/.test(source.sourceUrl || '')), question);
    assert.doesNotMatch(JSON.stringify(result), /\$5(?:\.00)?(?: per guest)?|guest passes?|direct debit|secure\.rec1\.com|rental catalog/i, question);
  }
});

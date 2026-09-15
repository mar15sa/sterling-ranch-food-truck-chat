const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeInterpretation, deterministicRequestedDetails } = require('../lib/community-interpretation');
const { normalizedRoutingPlan } = require('../lib/community-search');

const plan = { intent: 'services', goal: 'account-access', goals: ['account-access'],
  subject: 'membership', requestedDetails: ['action', 'price'], searchQueries: ['membership cost'], scope: 'community' };

test('plain price questions do not acquire an unrequested transaction or account task', () => {
  for (const question of ['How much is nonresident clubhouse membership?', 'How much does a permit cost?',
    'What is the price of a membership?', 'What are the fees?', 'How much is a caregiver pass?']) {
    const result = normalizedRoutingPlan(plan, question);
    assert.equal(result.goal, 'cost', question);
    assert.deepEqual(result.requestedDetails, ['price'], question);
    assert.equal(result.subject, plan.subject);
  }
});

test('explicit actions, permission and compound price requests keep their obligations', () => {
  for (const question of ['How much is membership and how do I register?', 'How much do I pay online?',
    'How much is a permit and do I need approval?', 'How much is membership and where can I apply?']) {
    const result = normalizeInterpretation(plan, question);
    assert.equal(result.goal, 'account-access', question);
    assert.ok(result.requestedDetails.includes('action'), question);
  }
});

test('measurement inputs to a calculation ask for the method, not a required physical specification', () => {
  for (const question of ['What plant size should I use to calculate outdoor water usage?',
    'What area should I enter in the formula?', 'Which dimensions should I use to compute the volume?',
    'What height should we use to calculate the volume?', 'What distance do I enter for this calculation?']) {
    const result = normalizeInterpretation({ ...plan, goal: 'information', goals: ['information'],
      requestedDetails: ['specification', 'methods'] }, question);
    assert.ok(result.requestedDetails.includes('methods'), question);
    assert.ok(!result.requestedDetails.includes('specification'), question);
  }
});

test('calculation wording cannot erase an explicitly required or permitted specification', () => {
  for (const question of ['What maximum plant size should I use to calculate outdoor water usage?',
    'What fence height is allowed and how do I calculate its area?',
    'What size should I use to calculate the required minimum setback?', 'What material should I use to calculate the cost?']) {
    assert.ok(deterministicRequestedDetails(question).includes('specification'), question);
  }
});

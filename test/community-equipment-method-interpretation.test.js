const test = require('node:test');
const assert = require('node:assert/strict');
const { deterministicRequestedDetails, normalizeInterpretation } = require('../lib/community-interpretation');

const checkQuestions = [
  'How can I check whether my Rachio watering schedule is running?',
  'How do I check my Rachio irrigation schedule?',
  'Where can we see the thermostat schedule?',
  'How to verify whether the controller schedule is running?',
  'How should I check my device status right now?',
];
const methodQuestions = [
  'How do I calculate the watering area for mature plants?',
  'What square footage should I use for full-grown plants in my outdoor water calculation?',
  'How can I calculate the irrigated area?',
  'Which measurements go into the area formula?',
  'Explain the calculation for a mature planting area.',
];
const plan = { intent: 'status', goal: 'status', goals: ['schedule', 'status'],
  subject: 'controller schedule', searchQueries: ['controller schedule'], requestedDetails: ['date', 'status'],
  dateRange: { kind: 'today', start: '2026-09-14', end: '2026-09-14' }, scope: 'community' };

test('equipment inspection instructions do not demand a live schedule or status observation', () => {
  for (const question of checkQuestions) {
    const details = deterministicRequestedDetails(question);
    assert.ok(details.includes('action'), question);
    assert.ok(!details.includes('date') && !details.includes('status'), question);
    const normalized = normalizeInterpretation(plan, question);
    assert.equal(normalized.intent, 'services', question);
    assert.equal(normalized.goal, 'information', question);
    assert.deepEqual(normalized.requestedDetails, ['action'], question);
    assert.equal(normalized.dateRange, null, question);
    assert.equal(normalized.subject, plan.subject);
    assert.deepEqual(normalized.searchQueries, plan.searchQueries);
  }
});

test('calculation wording requests approved method evidence across subjects', () => {
  for (const question of [...methodQuestions, 'How do I calculate a permit fee?', 'What formula computes a room area?']) {
    assert.ok(deterministicRequestedDetails(question).includes('methods'), question);
    const normalized = normalizeInterpretation({ ...plan, intent: 'services', goal: 'information', goals: ['information'], requestedDetails: [], dateRange: null }, question);
    assert.ok(normalized.requestedDetails.includes('methods'), question);
    const misrouted = normalizeInterpretation({ ...plan, intent: 'rules', goal: 'permission', goals: ['permission'] }, question);
    assert.equal(misrouted.intent, 'services', question);
    assert.equal(misrouted.goal, 'information', question);
    assert.equal(misrouted.dateRange, null, question);
  }
  assert.ok(deterministicRequestedDetails('How do I calculate a permit fee?').includes('price'));
});

test('actual observations and explicit timing remain unresolved live obligations', () => {
  for (const question of ['Is my sprinkler running right now?', 'Is my controller working?',
    'What is my thermostat status?', 'How do I check my controller, and is it running right now?']) {
    assert.ok(deterministicRequestedDetails(question).includes('status'), question);
    assert.equal(normalizeInterpretation(plan, question).intent, 'status', question);
  }
  for (const question of ['What is the watering schedule?', 'When is the controller scheduled to run?',
    'How do I check tomorrow’s irrigation schedule?', 'How do I check the device and what day will it run?']) {
    assert.ok(deterministicRequestedDetails(question).includes('date'), question);
  }
  for (const question of ['How do I pay my water bill?', 'Can I install an irrigation controller?',
    'What is the permitted plant height?', 'Is the scheduled class cancelled?']) {
    assert.ok(!deterministicRequestedDetails(question).includes('methods'), question);
  }
  assert.ok(deterministicRequestedDetails('Can I install an irrigation controller?').includes('permission'));
  const binding = normalizeInterpretation({ ...plan, intent: 'rules', goal: 'permission', goals: ['permission'] },
    'How do I calculate the required setback?');
  assert.equal(binding.intent, 'rules');
  assert.equal(binding.goal, 'permission');
});

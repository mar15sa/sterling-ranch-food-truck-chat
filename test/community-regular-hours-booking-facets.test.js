const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeInterpretation } = require('../lib/community-interpretation');
const { normalizedRoutingPlan } = require('../lib/community-search');
const now = new Date('2026-09-14T16:30:00Z');
const plan = (goal, details, extra = {}) => ({ intent: 'facilities', goal, goals: [goal],
  subject: 'official community facility', requestedDetails: details, dateRange: null,
  filters: {}, searchQueries: ['official community facility'], scope: 'community', ...extra });

test('undated recurring-hours questions do not acquire a calendar-date obligation', () => {
  for (const question of ['What are the pickleball court hours?', 'What are the library operating hours?',
    'What are the regular office hours?', 'What time does the recreation center open?',
    'What are the normal opening and closing hours?', 'What are the weekday court hours?']) {
    const input = plan('schedule', ['date', 'hours']);
    const interpreted = normalizeInterpretation(input, question, { now });
    assert.deepEqual(interpreted.requestedDetails, ['hours'], question);
    const routed = normalizedRoutingPlan(input, question, { now });
    assert.deepEqual(routed.requestedDetails, ['hours'], question);
    assert.equal(routed.goal, 'schedule');
    assert.equal(routed.dateRange, null);
    assert.equal(routed.subject, input.subject);
  }
});

test('dated, holiday, season, start-date and current-state requests retain their obligations', () => {
  for (const question of ['What are the court hours today?', 'What are the office hours tomorrow?',
    'What are the library hours next Monday?', 'What are the pool hours for Labor Day?',
    'What are the pool hours for Christmas?', 'What are the pool hours next summer?',
    'What are the hours and the opening date?', 'What date do summer hours start?',
    'What are the hours for the next day?', 'What are the hours on 2026-09-15?']) {
    const routed = normalizedRoutingPlan(plan('schedule', ['date', 'hours']), question, { now });
    assert.ok(routed.requestedDetails.includes('date'), question);
  }
  const specific = normalizedRoutingPlan(plan('schedule', ['hours'], { dateRange: {
    kind: 'explicit-date', start: '2026-09-15', end: '2026-09-15', label: 'requested date' },
  }), 'What are the opening hours?', { now });
  assert.ok(specific.requestedDetails.includes('date'));
  const live = normalizedRoutingPlan(plan('status', ['status', 'hours']), 'Is the library open right now and what are its hours?', { now });
  assert.ok(live.requestedDetails.includes('status'));
  assert.ok(live.requestedDetails.includes('hours'));
});

test('a direct action procedure does not invent a request for alternative methods', () => {
  for (const [question, goal] of [['How do I reserve a pickleball court?', 'booking'],
    ['Where can I book a study room?', 'booking'], ['How do I apply for a permit?', 'application'],
    ['How can I register for the class?', 'registration'], ['How do I pay my bill?', 'payment'],
    ['How do I renew my membership?', 'account-access']]) {
    const input = plan(goal, ['action', 'methods']);
    const interpreted = normalizeInterpretation(input, question, { now });
    assert.deepEqual(interpreted.requestedDetails, ['action'], question);
    const routed = normalizedRoutingPlan(input, question, { now });
    assert.deepEqual(routed.requestedDetails, ['action'], question);
    assert.equal(routed.goal, goal);
  }
});

test('methods, options, alternatives, calculations and compound details stay explicit', () => {
  for (const question of ['How do I reserve a court and what other options are there?',
    'How do I pay using alternative methods?', 'How do I pay without a credit card?',
    'How do I reserve by phone versus online?', 'How do I book, comparing online vs in person?',
    'How do I register online or in person?', 'How do I reserve and what are the ways to pay?',
    'How do I apply and calculate the required area?', 'What payment methods can I use?']) {
    const interpreted = normalizeInterpretation(plan('booking', ['action', 'methods']), question, { now });
    assert.ok(interpreted.requestedDetails.includes('methods'), question);
  }
  const compound = normalizeInterpretation(plan('booking', ['action', 'methods', 'price', 'date', 'permission']),
    'How do I reserve a court tomorrow, what does it cost, and do I need approval?', { now });
  assert.deepEqual(compound.requestedDetails, ['price', 'action', 'date', 'permission']);
});

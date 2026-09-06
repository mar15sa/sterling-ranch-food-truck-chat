const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyCommunityIntent, normalizedRoutingPlan } = require('../lib/community-search');
const { proactiveCommunityAnswer } = require('../lib/community-proactive');
const { answerCommunityQuestion } = require('../lib/community-assistant');
const now = new Date('2026-09-06T21:00:00Z');
const poolQuestion = 'Are there any events or giveaways happening at the pool today?';

test('owner pool-event discovery reaches the calendar even when a planner proposes opening status', async () => {
  assert.equal(classifyCommunityIntent(poolQuestion), 'events');
  const plan = normalizedRoutingPlan({ intent: 'status', goal: 'status', scope: 'community', subject: 'pool', searchQueries: ['pool events'] }, poolQuestion, { now });
  assert.equal(plan.intent, 'events');
  assert.equal(plan.goal, 'schedule');
  assert.equal(plan.filters.location, 'pool');
  let calendars = 0;
  let poolChecks = 0;
  const answer = await answerCommunityQuestion(poolQuestion, { now, index: { sources: [] }, interpretationMode: 'structured',
    planCommunitySearch: async () => ({ intent: 'status', goal: 'status', scope: 'community', subject: 'pool', searchQueries: ['pool events'] }),
    getPoolStatus: async () => { poolChecks++; return { status: 'open' }; },
    getCommunityEvents: async () => { calendars++; return { events: [], range: { label: 'today' },
      diagnostics: { parserHealthy: true }, sourceUrl: 'https://sterlingranchcab.com/Calendar.aspx', checkedAt: now.toISOString() }; } });
  assert.equal(answer.answerMode, 'community-live-events');
  assert.equal(calendars, 1);
  assert.equal(poolChecks, 0);
  for (const question of ['Is the pool open during the event today?', 'What is the pool capacity today?']) assert.equal(classifyCommunityIntent(question), 'status');
  const permission = normalizedRoutingPlan({ intent: 'rules', goal: 'permission', scope: 'community', subject: 'pool events', searchQueries: ['pool event permission'] }, 'Am I allowed to hold events at the pool?', { now });
  assert.equal(permission.intent, 'rules');
});

test('both owner holiday phrasings use the explicit approved holiday schedule', () => {
  const source = { id: 'trash', sourceUrl: 'https://sterlingranchcab.com/247/Trash-Recycling', title: 'Trash & Recycling',
    text: 'Pick Up Schedule Providence Village Monday. Holiday Schedule Trash pickup will be delayed by one day for the following holidays: New Year\'s Day Memorial Day Independence Day Labor Day Thanksgiving Christmas Opt-In for Service Notifications',
    staleAfter: '2026-09-07T00:00:00Z', checkedAt: '2026-09-06T00:00:00Z' };
  for (const question of ["It's Labor Day a holiday for trash pickup", 'Is Labor Day a holiday for trash pickup?']) {
    const answer = proactiveCommunityAnswer(question, { index: { sources: [source] }, now });
    assert.equal(answer.answerMode, 'community-proactive-trash-holiday');
    assert.match(answer.answer, /Labor Day.*delayed by one day/);
    assert.equal(answer.sources[0].id, 'trash');
  }
  const ask = index => proactiveCommunityAnswer('Is Labor Day a holiday for trash pickup?', { index, now });
  assert.equal(ask({ sources: [{ ...source, staleAfter: '2020-01-01' }] }), null);
  assert.equal(ask({ sources: [{ ...source, text: source.text.replace('Labor Day', '') }] }), null);
  assert.equal(proactiveCommunityAnswer('Can I leave trash outside overnight on Labor Day?', { index: { sources: [source] }, now }), null);
});

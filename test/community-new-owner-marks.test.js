const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyCommunityIntent, normalizedRoutingPlan } = require('../lib/community-search');
const { proactiveCommunityAnswer } = require('../lib/community-proactive');
const { answerCommunityQuestion, poolHoursAnswer } = require('../lib/community-assistant');
const { scoreCommunityAnswer } = require('../lib/community-answer-quality');
const now = new Date('2026-09-06T21:00:00Z');
const poolQuestion = 'Are there any events or giveaways happening at the pool today?';

test('owner pool-event discovery reaches the calendar even when a planner proposes opening status', async () => {
  assert.equal(classifyCommunityIntent(poolQuestion), 'events');
  const plan = normalizedRoutingPlan({ intent: 'status', goal: 'status', scope: 'community', subject: 'pool', searchQueries: ['pool events'] }, poolQuestion, { now });
  assert.equal(plan.intent, 'events');
  assert.equal(plan.goal, 'schedule');
  assert.equal(plan.filters.location, 'pool');
  for (const goals of [['schedule', 'status', 'information'], ['schedule', 'information'], ['status']]) {
    const repeated = normalizedRoutingPlan({ intent: 'events', goal: goals[0], goals, scope: 'community',
      subject: 'pool events and giveaways', searchQueries: ['pool events today'] }, poolQuestion, { now });
    assert.deepEqual(repeated.goals, ['schedule']);
  }
  let calendars = 0;
  let poolChecks = 0;
  const answer = await answerCommunityQuestion(poolQuestion, { now, index: { sources: [] }, interpretationMode: 'structured',
    planCommunitySearch: async () => ({ intent: 'status', goal: 'status', scope: 'community', subject: 'pool', searchQueries: ['pool events'] }),
    getPoolStatus: async () => { poolChecks++; return { status: 'open' }; },
    getCommunityEvents: async () => { calendars++; return { events: [], range: { kind: 'today', start: '2026-09-06', end: '2026-09-06', label: 'today' },
      diagnostics: { parserHealthy: true, appliedFilters: [{ field: 'location', value: 'pool' }] }, sourceUrl: 'https://sterlingranchcab.com/Calendar.aspx', checkedAt: now.toISOString() }; } });
  assert.equal(answer.answerMode, 'community-live-events');
  assert.equal(calendars, 1);
  assert.equal(poolChecks, 0);
  for (const question of ['Is the pool open during the event today?', 'What is the pool capacity today?']) assert.equal(classifyCommunityIntent(question), 'status');
  const permission = normalizedRoutingPlan({ intent: 'rules', goal: 'permission', scope: 'community', subject: 'pool events', searchQueries: ['pool event permission'] }, 'Am I allowed to hold events at the pool?', { now });
  assert.equal(permission.intent, 'rules');
});

test('owner holiday phrasings use the explicit approved holiday schedule', () => {
  const source = { id: 'trash', sourceUrl: 'https://sterlingranchcab.com/247/Trash-Recycling', title: 'Trash & Recycling',
    text: 'Pick Up Schedule Providence Village Monday. Holiday Schedule Trash pickup will be delayed by one day for the following holidays: New Year\'s Day Memorial Day Independence Day Labor Day Thanksgiving Christmas Opt-In for Service Notifications',
    staleAfter: '2026-09-07T00:00:00Z', checkedAt: '2026-09-06T00:00:00Z' };
  for (const question of ["It's Labor Day a holiday for trash pickup", 'Is Labor Day a holiday for trash pickup?', 'Will trash be picked up on Labor day?', 'Labor day trash pickup']) {
    const answer = proactiveCommunityAnswer(question, { index: { sources: [source] }, now });
    assert.equal(answer.answerMode, 'community-proactive-trash-holiday');
    assert.match(answer.answer, /Labor Day.*delayed by one day/i);
    assert.doesNotMatch(answer.directAnswer, /^Yes\./);
    assert.equal(answer.sources[0].id, 'trash');
  }
  const ask = index => proactiveCommunityAnswer('Is Labor Day a holiday for trash pickup?', { index, now });
  assert.equal(ask({ sources: [{ ...source, staleAfter: '2020-01-01' }] }), null);
  assert.equal(ask({ sources: [{ ...source, text: source.text.replace('Labor Day', '') }] }), null);
  assert.equal(proactiveCommunityAnswer('Can I leave trash outside overnight on Labor Day?', { index: { sources: [source] }, now }), null);
});

test('owner pool-hours phrasings use the official schedule instead of live open status', async () => {
  const source = {
    id: 'sterling-ranch-overlook-outdoor-pool-1',
    communityId: 'sterling-ranch',
    title: 'Overlook Outdoor Pool',
    sourceUrl: 'https://sterlingranchcab.com/187/Pool',
    sourceType: 'services',
    authorityScore: 1,
    checkedAt: '2026-09-07T17:22:34.676Z',
    staleAfter: '2026-09-08T17:22:34.676Z',
    text: 'Overlook Outdoor Pool Pool Hours The pool is open Memorial Day weekend through Labor Day. Monday-Friday: 5:00 am - 9:00 am: Lap Swim Tuesday & Thursday - 7:00 am - 8:45 am: Pool cleaning and maintenance. 9:00 am - 8:45 pm: Open Swim (Lifeguards on duty 9:00 am - 8:45 pm) Saturday: 7:00 am - 8:45 pm (Lifeguards on duty 9:00 am - 8:45 pm) Sunday: 7:00 am - 8:45 pm (Lifeguards on duty 9:00 am - 8:45 pm)',
  };
  const questions = ['When does the pool close today?', 'When is the pool open on Labor Day?', 'What are the pool hours for Labor Day?'];
  for (const question of questions) {
    assert.equal(classifyCommunityIntent(question), 'facilities');
    const plan = normalizedRoutingPlan({ intent: 'status', goal: 'status', subject: 'pool', searchQueries: ['pool status'] }, question, { now: new Date('2026-09-07T15:00:00Z') });
    assert.equal(plan.intent, 'facilities');
    assert.equal(plan.goal, 'schedule');
    assert.ok(plan.requestedDetails.includes('hours'));
    let poolChecks = 0;
    const answer = await answerCommunityQuestion(question, {
      now: new Date('2026-09-07T15:00:00Z'),
      index: { communityId: 'sterling-ranch', sources: [source] },
      communityId: 'sterling-ranch',
      interpretationMode: 'structured',
      planCommunitySearch: async () => ({ intent: 'status', goal: 'status', subject: 'pool', searchQueries: ['pool status'] }),
      getPoolStatus: async () => { poolChecks++; return { headline: 'Open', summary: 'The pool is currently open.' }; },
      synthesizeCommunityAnswer: false,
    });
    assert.equal(poolChecks, 0);
    assert.equal(answer.answerMode, 'community-facility-operations');
    assert.match(answer.answer, /8:45 p\.?m\.?/i);
    assert.equal(answer.sources.length, 1);
    assert.equal(answer.sources[0].id, source.id);
  }
  for (const question of ['What time does the pool shut tonight?', 'What are the pool houres on Labor Day?']) {
    assert.equal(classifyCommunityIntent(question), 'facilities');
  }
  for (const question of ['Is the pool open today?', 'What is the pool capacity today?']) {
    assert.equal(classifyCommunityIntent(question), 'status');
  }
});

test('pool-hours answers stop at the published season boundary and the grader catches non-answers', async () => {
  const afterSeason = poolHoursAnswer({
    id: 'pool', title: 'Overlook Outdoor Pool', sourceUrl: 'https://sterlingranchcab.com/187/Pool',
    sourceType: 'services', checkedAt: '2026-09-07T17:22:34.676Z',
    text: 'The pool is open Memorial Day weekend through Labor Day. Monday-Friday: 5:00 am - 9:00 am: Lap Swim. 9:00 am - 8:45 pm: Open Swim. Saturday: 7:00 am - 8:45 pm. Sunday: 7:00 am - 8:45 pm.',
  }, 'When does the pool close today?', new Date('2026-09-08T15:00:00Z'));
  assert.match(afterSeason.answer, /season ended on Labor Day/i);
  assert.doesNotMatch(afterSeason.directAnswer, /today.*8:45 p\.m\./i);
  assert.ok(!scoreCommunityAnswer('When does the pool close today?', afterSeason).issues.includes('requested-time-missing'));

  const generic = {
    answer: 'Short answer: Open. The pool is currently open for homeowners and guests.',
    directAnswer: 'Open. The pool is currently open for homeowners and guests.',
    answerMode: 'community-live-status',
    answerVerdict: 'informational',
    sources: [{ title: 'Official pool status', sourceUrl: 'https://sterlingranchcab.com/187/Pool', text: 'Open' }],
  };
  for (const question of ['When does the pool close today?', 'When is the pool open on Labor Day?', 'What are the pool hours for Labor Day?']) {
    const quality = scoreCommunityAnswer(question, generic);
    assert.equal(quality.rating, 'Weak');
    assert.ok(quality.issues.includes('requested-time-missing'));
  }
});

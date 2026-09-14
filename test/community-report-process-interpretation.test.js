const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeInterpretation, isReportedFindingsRequest } = require('../lib/community-interpretation');
const { normalizedRoutingPlan } = require('../lib/community-search');

const inspectionPlan = { intent: 'facilities', goal: 'booking', goals: ['booking', 'schedule'],
  subject: 'landscape inspection', requestedDetails: ['action', 'date'], dateRange: null,
  searchQueries: ['schedule landscape inspection', 'landscape inspection booking', 'how to request landscape inspection'] };
const reportPlan = { intent: 'alerts', goal: 'information', goals: ['information'],
  subject: 'water quality report inspection violations', requestedDetails: ['status'],
  dateRange: { kind: 'year', start: '2025-01-01', end: '2025-12-31', label: '2025' },
  searchQueries: ['Dominion water quality report 2025', 'water inspection violations 2025', 'Dominion water quality inspection'],
  filters: { facility: 'Dominion', category: 'water quality' } };

test('arranging an inspection or appointment requests the process rather than a live slot', () => {
  for (const question of ['How do I schedule a landscape inspection?', 'Where can we arrange an inspection?',
    'How can I schedule an appointment?', 'What are the steps for scheduling an inspection?',
    'Explain the process for arranging a service visit.']) {
    const result = normalizeInterpretation(inspectionPlan, question);
    assert.equal(result.intent, 'services', question);
    assert.equal(result.goal, 'information', question);
    assert.deepEqual(result.requestedDetails, ['action'], question);
    assert.equal(result.dateRange, null);
    assert.equal(result.subject, inspectionPlan.subject);
    assert.deepEqual(result.searchQueries, inspectionPlan.searchQueries);
  }
});

test('process normalization preserves requested dates, availability, live observations, and binding obligations', () => {
  for (const question of ['How do I schedule an inspection tomorrow?', 'How do I schedule an inspection on October 1?',
    'How do I schedule an inspection if no slots are available?', 'How do I arrange a visit and when is the next slot?',
    'How do I schedule an inspection, and is the service working right now?', 'How do I schedule the required inspection?',
    'How do I schedule an inspection and do I need approval?']) {
    const result = normalizeInterpretation(inspectionPlan, question);
    assert.equal(result.intent, 'facilities', question);
    assert.ok(result.requestedDetails.includes('date'), question);
    assert.ok(result.goals.includes('booking'), question);
  }
});

test('reported findings do not become live status or calendar requests', () => {
  for (const question of ['What did the 2026 water quality report find?',
    'What did the CAB, Dominion and Castle Rock water quality report say about violations?',
    'What did the Dominion water quality report say about inspection violations in 2025?',
    'What monitoring violations did Castle Rock report for 2025?',
    'What did the CAB water quality report find in 2025 and Dominion find in 2026?',
    'Explain the findings in the 2024 building inspection report.',
    'What does the latest inspection report say about failures?']) {
    assert.equal(isReportedFindingsRequest(question), true, question);
    for (const intent of ['alerts', 'status', 'rules']) {
      const result = normalizeInterpretation({ ...reportPlan, intent, goal: 'status', goals: ['status', 'information'] }, question);
      assert.equal(result.intent, 'services', question);
      assert.equal(result.goal, 'information', question);
      assert.deepEqual(result.requestedDetails, [], question);
      assert.equal(result.dateRange, null, question);
      assert.equal(result.subject, reportPlan.subject);
      assert.deepEqual(result.searchQueries, reportPlan.searchQueries);
      assert.deepEqual(result.filters.facility, 'Dominion');
    }
  }
});

test('a historical source cannot normalize away separate safety, live, or binding questions', () => {
  for (const question of ['What did the report find, and is the water safe to drink?',
    'What did the report find and is the system working right now?',
    'What did the report find about current violations?', 'What did the report find, and what must I do?',
    'What does the report say is required?', 'What did the report find, and is service available tomorrow?',
    'When was the report published?']) {
    assert.equal(isReportedFindingsRequest(question), false, question);
    const result = normalizeInterpretation(reportPlan, question);
    assert.equal(result.intent, 'alerts', question);
    assert.ok(result.requestedDetails.includes('status'), question);
  }
});

test('normalization alone cannot declare an outside or ambiguous request inside the community', () => {
  for (const scope of ['unrelated', 'ambiguous']) {
    const result = normalizeInterpretation({ ...reportPlan, scope,
      needsClarification: scope === 'ambiguous', clarificationQuestion: scope === 'ambiguous' ? 'Which reporting organization do you mean?' : '' },
    'What monitoring violations did Castle Rock report for 2025?');
    assert.equal(result.scope, scope);
    assert.equal(result.needsClarification, scope === 'ambiguous');
  }
});

test('routing defaults follow the validated goal instead of restoring the rejected model facet', () => {
  for (const question of ['What monitoring violations did Castle Rock report for 2025?',
    'What violations did the district report for 2024?', 'What did the annual inspection report find?']) {
    const plan = normalizedRoutingPlan({ ...reportPlan, intent: 'status', goal: 'status', goals: ['status', 'information'] }, question);
    assert.equal(plan.goal, 'information');
    assert.deepEqual(plan.requestedDetails, [], question);
  }
  const process = normalizedRoutingPlan({ ...inspectionPlan, intent: 'status', goal: 'status', goals: ['status'], requestedDetails: ['status', 'date'] },
    'How do I schedule an inspection?');
  assert.equal(process.goal, 'information');
  assert.deepEqual(process.requestedDetails, ['action']);
  const current = normalizedRoutingPlan({ ...reportPlan, intent: 'status', goal: 'status', goals: ['status'] }, 'What is the system status right now?');
  assert.equal(current.goal, 'status');
  assert.ok(current.requestedDetails.includes('status'));
});

test.describe('saved structured plans against all reviewed package neighbors', () => {
  const packageData = require('../data/community-source-approvals-v8.json');
  const profile = require('../data/communities/sterling-ranch.json');
  const { buildReviewedSources } = require('../lib/community-reviewed-package');
  const { emptyLedger, upsertObservation, applyExplicitDecision } = require('../lib/canonical-source-ledger');
  const { buildFactLedger } = require('../lib/community-truth');
  const { answerCommunityQuestion } = require('../lib/community-assistant');
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
  const ask = (question, plan) => answerCommunityQuestion(question, { index: fixture(), now, isTest: true,
    communityId: packageData.communityId, interpretationMode: 'structured', planCommunitySearch: async () => plan,
    synthesizeCommunityAnswer: false, answerRulesQuestion: async () => ({
      answer: 'No separate governing evidence supplied in this fixture.', answerStatus: 'could-not-verify',
      sources: [], actions: [], confidence: { canAnswer: false } }) });

  test('saved booking/date plan returns the actual inspection process without unrelated schedules', async () => {
    const result = await ask('How do I schedule a landscape inspection?', inspectionPlan);
    assert.equal(result.answerStatus, 'verified', result.answer);
    assert.match(result.answer, /residentialinspections@sterlingranchcab\.com/i);
    assert.doesNotMatch(result.answer, /Rachio|Dominion|tank inspection|schedule tab/i);
    assert.deepEqual(result.routingPlan.requestedDetails, ['action']);
  });

  test('saved alert plan returns only the requested report system and approved reporting period', async () => {
    const result = await ask('What did the Dominion water quality report say about inspection violations in 2026?', reportPlan);
    assert.equal(result.answerStatus, 'verified', result.answer);
    assert.match(result.answer, /2\/13\/2026/);
    assert.match(result.answer, /4\/24\/2026/);
    assert.doesNotMatch(result.answer, /January 15th, 2025|\$|fine/i);
    assert.equal(result.routingPlan.intent, 'services');
    const unsupported = await ask('What did the Dominion water quality report say about inspection violations in 2025?', reportPlan);
    assert.notEqual(unsupported.answerStatus, 'verified', unsupported.answer);
    assert.notEqual(unsupported.completion.outcome, 'complete');
    assert.doesNotMatch(unsupported.answer, /resolved the violation on 4\/24\/2026/);
  });

  test('past-tense reporting with a model status goal still answers the approved historical finding', async () => {
    const saved = require('./fixtures/reviewed-source-staging-plans-20260914.json').rows.find(row => row.id === 'castle-rock-report-identity');
    const result = await ask(saved.question, saved.routingPlan);
    assert.equal(result.answerStatus, 'verified', result.answer);
    assert.match(result.answer, /faulty instrument was not replaced/);
    assert.match(result.answer, /2025/);
    assert.deepEqual(result.routingPlan.requestedDetails, []);
    assert.equal(result.routingPlan.goal, 'information');
  });
});

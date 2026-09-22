const test = require('node:test');
const assert = require('node:assert/strict');
const { answerCommunityQuestion } = require('../lib/community-assistant');
const { rewriteNeedFirstCandidate } = require('../lib/community-need-llm');
const { synthesizeCommunityAnswer } = require('../lib/community-llm');
const { answerCapabilityIssues, VERSION } = require('../lib/community-critical-capabilities');
const { monitorFreshnessIssues } = require('../scripts/check-capability-monitor-freshness');

test('the actual final answer path proves writing and detects a missing writer or discarded result', async () => {
  const text = 'Turn off courtyard lamps by 9:30 p.m.';
  const base = { answerStatus: 'verified', answer: text, directAnswer: text, keyDetails: [], nextStep: '',
    sources: [{ id: 'rule', title: 'Courtyard lamp rules', sourceUrl: 'https://example.org/rules', text }],
    claims: [{ text, verified: true, evidenceSourceIds: ['rule'] }], actions: [], conflicts: [] };
  const options = { isTest: true, requestContractMode: 'need-first-candidate',
    planCommunitySearch: false, synthesizeCommunityAnswer: false, answerResidentNeed: async () => structuredClone(base) };
  const omitted = await answerCommunityQuestion('Can I leave courtyard lamps on all night?', options);
  assert.ok(answerCapabilityIssues(omitted).includes('eligible-answer-skipped-writer'));
  let calls = 0;
  const written = await answerCommunityQuestion('Can I leave courtyard lamps on all night?', {
    ...options, rewriteNeedFirstAnswer: payload => {
      calls++;
      return rewriteNeedFirstCandidate(payload, { onDiagnostic: payload.onDiagnostic,
        synthesize: async () => ({ directAnswer: 'No, you need to turn off courtyard lamps by 9:30 p.m.', keyDetails: [], nextStep: '' }) });
    },
  });
  assert.equal(calls, 1);
  assert.equal(written.residentWriting.accepted, true, JSON.stringify(written._requestContract.candidate.writerDiagnostics));
  assert.equal(written.aiComposition.validation.version, VERSION);
  assert.deepEqual(answerCapabilityIssues(written), []);
  written.directAnswer = base.directAnswer;
  assert.ok(answerCapabilityIssues(written).includes('accepted-writing-not-delivered'));
});
test('composition caches expire and a later provider outage cannot hide behind a prior success', async () => {
  let now = 1000, calls = 0, available = true;
  const diagnostics = [];
  const source = { id: 'rule', title: 'Courtyard lamps', text: 'Turn off courtyard lamps by 9:30 p.m.' };
  const options = { apiKey: 'fixture', model: 'critical-capability-cache-fixture', nowMs: () => now,
    writingContract: { version: 'cache-age-test' }, routingPlan: { goal: 'permission', requestedDetails: ['permission'] },
    onDiagnostic: event => diagnostics.push(event), fetchImpl: async () => {
      calls++;
      return available ? { ok: true, json: async () => ({ content: [{ type: 'text', text: JSON.stringify({
        directAnswer: 'Turn off courtyard lamps by 9:30 p.m.', keyDetails: [], nextStep: '',
      }) }] }) } : { ok: false, status: 503 };
    } };
  assert.ok(await synthesizeCommunityAnswer('Can courtyard lamps stay on all night?', [source], options));
  now += 500; assert.ok(await synthesizeCommunityAnswer('Can courtyard lamps stay on all night?', [source], options));
  assert.equal(calls, 1); assert.equal(diagnostics.at(-1).cacheHit, true);
  available = false; now += 15 * 60000;
  assert.equal(await synthesizeCommunityAnswer('Can courtyard lamps stay on all night?', [source], options), null);
  assert.equal(calls, 2); assert.equal(diagnostics.at(-1).providerStatus, 503);
});

test('a legacy verified calendar label cannot override the final audit or silently skip writing', async () => {
  const checkedAt = '2026-09-21T18:00:00.000Z', evidenceId = 'sterling-ranch:official-calendar:calendar';
  const options = { isTest: true, requestContractMode: 'need-audited-candidate', needRouterBackend: 'current-local',
    planCommunitySearch: false, synthesizeCommunityAnswer: false,
    index: require('../data/community-index.json'), communityId: 'sterling-ranch',
    communityProfile: require('../data/communities/sterling-ranch.json'), now: new Date(checkedAt),
    getCommunityEvents: async request => ({
      events: [{ id: 'fixture', title: 'Courtyard Class', date: '2026-09-22', time: '09:00',
        location: 'Great Hall', url: 'https://sterlingranchcab.com/event/fixture', startDate: '2026-09-22T09:00:00' }],
      range: request.dateRange, sourceUrl: 'https://sterlingranchcab.com/calendar', checkedAt,
      diagnostics: { sourceOutcome: 'ok', parserHealthy: true, appliedFilters: [] },
      evidenceEnvelope: { communityId: 'sterling-ranch', connectorFamily: 'civicplus-calendar', degradation: { state: 'healthy' },
        coverage: { requested: ['event-date', 'date'], covered: ['event-date', 'date'] },
        evidence: [{ evidenceId, communityId: 'sterling-ranch', checkedAt, staleAfter: '2099-01-01T00:00:00Z', controllingSourceRole: 'operational' }],
        claims: [{ id: 'event-fixture', facet: 'event-date', text: 'Courtyard Class: 2026-09-22T09:00:00', controllingEvidenceId: evidenceId, controllingSourceRole: 'operational' }],
      },
    }),
  };
  let attempts = 0;
  const result = await answerCommunityQuestion('What events are going on tomorrow?', { ...options,
    rewriteNeedFirstAnswer: async () => { attempts++; return null; } });
  assert.equal(result._requestContract.candidate.baselineAssessment.outcome, 'missing-evidence');
  assert.equal(result._requestContract.assessment.outcome, 'complete');
  assert.equal(result._requestContract.candidate.baselinePreserved, false);
  assert.equal(attempts, 1); assert.equal(result.confidence.canAnswer, true);
  assert.deepEqual(answerCapabilityIssues(result), []);
  for (const healthy of [true, false]) {
    const empty = await answerCommunityQuestion('What events are going on tomorrow?', { ...options,
      getCommunityEvents: async request => {
        const response = await options.getCommunityEvents(request);
        response.events = []; response.evidenceEnvelope.claims = [];
        response.diagnostics.parserHealthy = healthy;
        if (!healthy) {
          response.evidenceEnvelope.degradation = { state: 'unavailable' };
          response.evidenceEnvelope.coverage.covered = [];
        }
        return response;
      }, rewriteNeedFirstAnswer: async () => null,
    });
    assert.equal(empty._requestContract.assessment.outcome === 'complete', healthy);
    assert.equal(empty.confidence.canAnswer, healthy);
  }
});
test('independent watchdog treats disabled, overdue, stuck, failed and evidence-free monitoring as unhealthy', () => {
  const now = Date.parse('2026-09-21T12:00:00Z');
  const valid = { workflow: { state: 'active' }, runs: [{ status: 'completed', conclusion: 'success', created_at: '2026-09-21T11:45:00Z' }],
    artifacts: [{ name: 'production-critical-capabilities', expired: false }], now };
  assert.deepEqual(monitorFreshnessIssues(valid), []);
  const oldSuccess = structuredClone(valid);
  oldSuccess.runs[0].created_at = '2026-09-20T07:00:00Z';
  oldSuccess.runs.unshift({ status: 'in_progress', created_at: '2026-09-21T11:59:00Z' });
  assert.ok(monitorFreshnessIssues(oldSuccess).includes('completed-capability-monitor-overdue'));
  for (const change of [v => { v.workflow.state = 'disabled_manually'; }, v => { v.runs = []; },
    v => { v.runs[0].created_at = '2026-09-20T07:00:00Z'; }, v => { v.runs[0].status = 'in_progress'; v.runs[0].created_at = '2026-09-21T11:00:00Z'; },
    v => { v.runs[0].conclusion = 'failure'; }, v => { v.artifacts = []; }, v => { v.artifacts[0].expired = true; }]) {
    const sample = structuredClone(valid); change(sample); assert.ok(monitorFreshnessIssues(sample).length);
  }
});

test('daily watchdog allows the daily interval and scheduling grace without hiding a missed or stuck check', () => {
  const now = Date.parse('2026-09-22T15:00:00Z');
  const sample = age => ({ workflow: { state: 'active' }, now,
    runs: [{ status: 'completed', conclusion: 'success', created_at: new Date(now - age).toISOString() }],
    artifacts: [{ name: 'production-critical-capabilities', expired: false }] });
  for (const hours of [4, 24, 25, 26]) {
    assert.deepEqual(monitorFreshnessIssues(sample(hours * 3600000)), [], `${hours} hours is within the daily grace period`);
  }
  const missed = sample(26 * 3600000 + 1);
  assert.deepEqual(monitorFreshnessIssues(missed), ['capability-monitor-overdue', 'completed-capability-monitor-overdue']);
  missed.runs.unshift({ status: 'in_progress', created_at: new Date(now - 60000).toISOString() });
  assert.deepEqual(monitorFreshnessIssues(missed), ['completed-capability-monitor-overdue']);
  const stuck = sample(24 * 3600000);
  stuck.runs.unshift({ status: 'in_progress', created_at: new Date(now - 21 * 60000).toISOString() });
  assert.deepEqual(monitorFreshnessIssues(stuck), ['capability-monitor-stuck']);
});

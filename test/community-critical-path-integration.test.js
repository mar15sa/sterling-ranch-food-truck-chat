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
test('independent watchdog treats disabled, overdue, stuck, failed and evidence-free monitoring as unhealthy', () => {
  const now = Date.parse('2026-09-21T12:00:00Z');
  const valid = { workflow: { state: 'active' }, runs: [{ status: 'completed', conclusion: 'success', created_at: '2026-09-21T11:45:00Z' }],
    artifacts: [{ name: 'production-critical-capabilities', expired: false }], now };
  assert.deepEqual(monitorFreshnessIssues(valid), []);
  const oldSuccess = structuredClone(valid);
  oldSuccess.runs[0].created_at = '2026-09-21T07:00:00Z';
  oldSuccess.runs.unshift({ status: 'in_progress', created_at: '2026-09-21T11:59:00Z' });
  assert.ok(monitorFreshnessIssues(oldSuccess).includes('completed-capability-monitor-overdue'));
  for (const change of [v => { v.workflow.state = 'disabled_manually'; }, v => { v.runs = []; },
    v => { v.runs[0].created_at = '2026-09-21T07:00:00Z'; }, v => { v.runs[0].status = 'in_progress'; v.runs[0].created_at = '2026-09-21T11:00:00Z'; },
    v => { v.runs[0].conclusion = 'failure'; }, v => { v.artifacts = []; }]) {
    const sample = structuredClone(valid); change(sample); assert.ok(monitorFreshnessIssues(sample).length);
  }
});

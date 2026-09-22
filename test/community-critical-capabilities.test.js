const test = require('node:test');
const assert = require('node:assert/strict');
const { VERSION, operatingContract, configurationIssues, temporaryDisableIssues,
  answerCapabilityIssues, displayedAnswerDigest, createCapabilityTelemetry } = require('../lib/community-critical-capabilities');
const { residentWriterConfiguration } = require('../lib/community-answer-flow');
const { displayedVoiceIssues } = require('../lib/resident-writing-contract');
const { createLiveMonitor } = require('../lib/community-live-monitor');
const { healthIssues } = require('../scripts/check-deployment-health');
const { checkCapabilities } = require('../scripts/check-community-capabilities');
const { publishIncident } = require('../scripts/community-capability-alert');

function configuration() {
  return { contract: operatingContract('sterling-ranch'), flow: 'audited-legacy-candidate',
    writer: residentWriterConfiguration('audited-legacy-candidate', { RULES_LLM_MODE: 'auto', ANTHROPIC_API_KEY: 'fixture' }),
    refresh: { rules: true, community: true }, liveMonitoring: {
      facility: { status: 'passed', stale: false, scheduled: true }, events: { status: 'passed', stale: false, scheduled: true },
    } };
}
function answer() {
  const text = 'Turn off courtyard lamps by 9:30 p.m.';
  return { answerId: 'fixture', answer: text, directAnswer: text, keyDetails: [], nextStep: '', answerStatus: 'verified',
    confidence: { canAnswer: true }, sources: [{ id: 'rule', sourceUrl: 'https://example.org/rules', actions: [] }],
    claims: [{ text, verified: true, evidenceSourceIds: ['rule'] }], actions: [],
    _requestContract: { needs: [{ id: 'need-1' }], assessment: { outcome: 'complete', needs: [{ status: 'supported', missingDetails: [] }] } },
    residentWriting: { attempted: true, accepted: false, voiceChecked: true, voiceIssues: [], providerCalled: true,
      providerObservedAt: new Date().toISOString(), fallbackReason: 'meaning-or-voice' },
    testTraffic: { isTest: true, boundary: 'explicit-test-request' } };
}
test('required operating behavior cannot silently follow disabled runtime flags', () => {
  const expected = operatingContract('sterling-ranch');
  assert.equal(expected.writerRequired, true);
  assert.equal(expected.sourceRefreshRequired, true);
  assert.deepEqual(expected.approvedAnswerFlows, ['audited-legacy-candidate']);
  assert.deepEqual(configurationIssues(configuration()), []);
  for (const mode of ['off', 'disabled']) {
    const input = configuration();
    input.writer = residentWriterConfiguration(input.flow, { RULES_LLM_MODE: mode, ANTHROPIC_API_KEY: 'fixture' });
    if (mode === 'off') assert.ok(configurationIssues(input).includes('resident-writer-disabled'));
  }
  for (const change of [c => { c.flow = 'legacy'; }, c => { c.writer.stage = 'before-audit'; },
    c => { c.refresh.community = false; }, c => { c.liveMonitoring.facility.scheduled = false; },
    c => { c.liveMonitoring.events.status = 'stale'; }]) {
    const input = configuration(); change(input); assert.ok(configurationIssues(input).length);
  }
});
test('temporary shutdowns need bounded review records and never become healthy exceptions', () => {
  const now = Date.parse('2026-09-21T12:00:00Z');
  const record = { capability: 'resident-writer', reason: 'Provider incident', owner: 'on-call', reviewUrl: 'https://example.org/review',
    createdAt: '2026-09-21T11:00:00Z', expiresAt: '2026-09-21T13:00:00Z' };
  assert.deepEqual(temporaryDisableIssues([record], now), ['temporarily-disabled:resident-writer']);
  assert.ok(temporaryDisableIssues([{ ...record, expiresAt: record.createdAt }], now).includes('temporary-disable-expired'));
  assert.ok(temporaryDisableIssues([{ ...record, capability: 'source-approval' }], now).includes('temporary-disable-record-invalid'));
});
test('a disabled writer, missing audit, unbound proof and incorrect confirmation are detected', () => {
  assert.deepEqual(answerCapabilityIssues(answer()), []);
  const mutations = [
    a => { a.residentWriting.attempted = false; }, a => { delete a._requestContract; },
    a => { a.claims[0].evidenceSourceIds = ['missing']; }, a => { a.claims[0].verified = false; },
    a => { a._requestContract.assessment.outcome = 'verified-partial'; },
    a => { a._requestContract.assessment.needs[0].missingDetails = ['hours']; },
    a => { a.residentWriting.voiceChecked = false; }, a => { a.residentWriting.voiceIssues = ['fragment']; },
    a => { a.sources[0].withheldByFreshness = true; },
    a => { a.actions = [{ url: 'javascript:alert(1)' }]; }, a => { a.actions = [{ url: 'https://example.org/invented' }]; },
  ];
  for (const mutate of mutations) { const sample = answer(); mutate(sample); assert.ok(answerCapabilityIssues(sample).length); }
});
test('accepted writing must carry validation and match the actual delivered fields', () => {
  const sample = answer(); sample.residentWriting.accepted = true;
  sample.residentWriting.usedTextDigest = displayedAnswerDigest(sample);
  sample.aiComposition = { validation: { version: VERSION, meaning: true, coverage: true, sources: true, voice: true, textDigest: displayedAnswerDigest(sample) } };
  assert.deepEqual(answerCapabilityIssues(sample), []);
  const changed = structuredClone(sample); changed.directAnswer = 'An older answer was restored.';
  assert.ok(answerCapabilityIssues(changed).includes('accepted-writing-not-delivered'));
  delete sample.aiComposition.validation.meaning;
  assert.ok(answerCapabilityIssues(sample).includes('accepted-writing-validation-missing'));
});

test('configured service actions require evidence from their own connector and exact approved destinations', () => {
  const profile = require('../data/communities/sterling-ranch.json');
  const sample = answer();
  sample.sources[0].id = `${profile.communityId}:food-truck-schedule:schedule`;
  sample.claims[0].evidenceSourceIds = [sample.sources[0].id];
  sample.actions = [{ url: '/food-truck?date=2026-09-21' }];
  assert.deepEqual(answerCapabilityIssues(sample, { profile }), []);
  for (const url of ['//evil.example/food-truck', '/food-truck?redirect=https://evil.example', '/owner', '/food-truck?date=tomorrow']) {
    sample.actions[0].url = url; assert.ok(answerCapabilityIssues(sample, { profile }).length, url);
  }
  const waste = profile.connectors.find(connector => connector.adapter?.wasteSchedule);
  sample.actions = waste.adapter.wasteSchedule.actionLinks;
  assert.ok(answerCapabilityIssues(sample, { profile }).includes('action-source-binding-missing'));
  sample.sources[0].id = `${profile.communityId}:${waste.id}:live-calendar`;
  sample.claims[0].evidenceSourceIds = [sample.sources[0].id];
  assert.deepEqual(answerCapabilityIssues(sample, { profile }), []);
});

test('a falsely clean voice flag cannot conceal bad delivered wording', () => {
  const sample = answer(); sample.directAnswer = 'Permitted 30 days prior to a holiday.';
  assert.ok(answerCapabilityIssues(sample).includes('delivered-answer-voice-failed'));
});
test('voice checks reject known bad openings, details and handoffs independently of writing', () => {
  assert.deepEqual(displayedVoiceIssues({ directAnswer: 'You can put up your display before the holiday.', keyDetails: [], nextStep: '' }), []);
  for (const field of ['directAnswer', 'nextStep', 'keyDetails']) {
    const sample = { directAnswer: 'You can put up your display before the holiday.', keyDetails: [], nextStep: '' };
    sample[field] = field === 'keyDetails' ? ['Permitted 30 days prior to a holiday.'] : 'Permitted 30 days prior to a holiday.';
    assert.ok(displayedVoiceIssues(sample).length, field);
  }
});
test('injection and partial boundaries cannot acquire writer calls or positive confirmation', () => {
  const safety = { answerStatus: 'safety-rejected', sources: [], claims: [], actions: [] };
  assert.deepEqual(answerCapabilityIssues(safety, { safety: true }), []);
  assert.ok(answerCapabilityIssues({ ...safety, residentWriting: { attempted: true } }, { safety: true }).length);
  const partial = answer(); partial._requestContract.assessment.outcome = 'missing-evidence';
  partial.confidence.canAnswer = false; partial.residentWriting.attempted = false;
  assert.deepEqual(answerCapabilityIssues(partial), []);
});
test('telemetry distinguishes no traffic, safe rejection, repeated rejection and recovery without resident content', () => {
  let now = 1000; const monitor = createCapabilityTelemetry({ now: () => now });
  assert.equal(monitor.snapshot().observation, 'no-recent-traffic');
  const sample = answer(); sample.answer = 'private resident text';
  monitor.record(sample, { isTest: true });
  assert.deepEqual(monitor.snapshot().issueCounts, {});
  for (let n = 0; n < 9; n++) monitor.record(sample);
  assert.equal(monitor.snapshot().issueCounts['writer-no-accepted-output-in-ten-eligible-answers'], 10);
  assert.ok(!JSON.stringify(monitor.snapshot()).includes('private resident text'));
  now += 3600001; assert.equal(monitor.snapshot().observation, 'no-recent-traffic');
});
test('live monitors age out, report stops, and recover from hung jobs without stale overwrites', async () => {
  let now = 0, hang = true, release;
  const monitor = createLiveMonitor({ now: () => now, timeoutMs: 5, log: () => {},
    getPoolStatus: () => hang ? new Promise(resolve => { release = resolve; }) : Promise.resolve({ stale: false }),
    getCommunityEvents: async () => ({ diagnostics: { parserHealthy: true }, events: [] }) });
  assert.equal(monitor.status().facility.status, 'not-run');
  assert.equal((await monitor.run('facility')).status, 'failed');
  hang = false; assert.equal((await monitor.run('facility')).status, 'passed');
  release({ stale: true }); await Promise.resolve(); assert.equal(monitor.status().facility.status, 'passed');
  now += 300001; assert.equal(monitor.status().facility.status, 'stale');
  const stop = monitor.start(); stop(); assert.equal(monitor.status().facility.status, 'stopped');
});
test('deployment health cannot pass with a missing or degraded capability report', () => {
  const healthy = { status: 'ok', deploymentReady: true, criticalCapabilities: { version: VERSION, status: 'configured', issues: [] } };
  assert.deepEqual(healthIssues(healthy), []);
  assert.ok(healthIssues({ ...healthy, criticalCapabilities: undefined }).length);
  assert.ok(healthIssues({ ...healthy, criticalCapabilities: { version: VERSION, status: 'degraded', issues: ['writer-disabled'] } }).length);
});
test('hosted checks use explicit test labels, inspect actual answers, and enforce private access', async () => {
  const calls = []; const healthy = { status: 'ok', deploymentReady: true, deploymentRevision: 'exact',
    communityAnswerFlow: 'audited-legacy-candidate', residentWriter: configuration().writer,
    criticalCapabilities: { version: VERSION, status: 'configured', issues: [] } };
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/api/health')) return { ok: true, json: async () => healthy };
    if (url.endsWith('/api/community-questions')) return { status: 401 };
    const body = JSON.parse(options.body); assert.equal(body.isTest, true);
    const result = answer();
    if (/Ignore all/.test(body.question)) Object.assign(result, { answerStatus: 'safety-rejected', sources: [], claims: [], actions: [], residentWriting: { attempted: false } });
    const probe = operatingContract('sterling-ranch').probes.find(probe => probe.question === body.question);
    if (probe.kind === 'live') result._requestContract.candidate = { connectorReuse: { [probe.connector]: { actualCalls: 1 } } };
    if (probe.kind !== 'safety') {
      result.residentWriting.accepted = true; result.residentWriting.usedTextDigest = displayedAnswerDigest(result);
      result.aiComposition = { validation: { version: VERSION, meaning: true, coverage: true, sources: true, voice: true, textDigest: displayedAnswerDigest(result) } };
    }
    return { ok: true, json: async () => result };
  };
  const report = await checkCapabilities({ baseUrl: 'https://example.org', expectedRevision: 'exact' }, { fetchImpl });
  assert.equal(report.result, 'passed', JSON.stringify(report)); assert.equal(report.probes.length, 7);
  assert.ok(!JSON.stringify(report).includes('Turn off courtyard'));
  for (const mutation of ['writer', 'live', 'labels', 'privacy']) {
    const failed = await checkCapabilities({ baseUrl: 'https://example.org', expectedRevision: 'exact' }, { fetchImpl: async (url, options) => {
      const response = await fetchImpl(url, options);
      if (url.endsWith('/api/community-questions') && mutation === 'privacy') return { status: 200 };
      if (!url.endsWith('/api/community/ask')) return response;
      const result = await response.json();
      if (mutation === 'writer') result.residentWriting.accepted = false;
      if (mutation === 'live') delete result._requestContract.candidate;
      if (mutation === 'labels') result.testTraffic.isTest = false;
      return { ok: true, json: async () => result };
    } });
    assert.equal(failed.result, 'failed', mutation);
    if (mutation === 'live') assert.equal(failed.probes.filter(probe => probe.issues.includes('live-connector-path-not-observed')).length, 4);
    if (mutation === 'writer') assert.ok(failed.issues.includes('writer-probes-no-accepted-output'));
  }
  healthy.deploymentRevision = 'old';
  const wrong = await checkCapabilities({ baseUrl: 'https://example.org', expectedRevision: 'exact' }, { fetchImpl });
  assert.equal(wrong.result, 'failed'); assert.equal(wrong.probes.length, 0);
});
test('incident alerts deduplicate unchanged failures and close only their own recovered incident', async () => {
  const items = [], comments = [];
  const github = { paginate: async () => items.filter(i => i.state === 'open'), rest: { issues: {
    listForRepo() {}, create: async data => { const item = { ...data, number: items.length + 1, state: 'open', user: { login: 'github-actions[bot]' } }; items.push(item); return { data: item }; },
    update: async data => Object.assign(items.find(i => i.number === data.issue_number), data),
    createComment: async data => comments.push(data),
  } } };
  const context = { repo: { owner: 'fixture', repo: 'fixture' }, serverUrl: 'https://github.com', runId: 1 };
  const failure = { result: 'failed', issues: ['resident-writer-disabled'] };
  assert.equal((await publishIncident({ github, context, report: failure, assignees: ['fixture-owner'] })).action, 'opened');
  assert.deepEqual(items[0].assignees, ['fixture-owner']);
  assert.equal((await publishIncident({ github, context, report: failure })).action, 'unchanged');
  assert.equal(comments.length, 0);
  assert.equal((await publishIncident({ github, context, report: { result: 'passed' } })).action, 'recovered');
  assert.equal(comments.length, 1); assert.equal(items[0].state, 'closed');
});

test('an obsolete revision cannot clear a newer production incident', async () => {
  const github = { rest: { repos: { getBranch: async () => ({ data: { commit: { sha: 'new' } } }) } },
    paginate: async () => { throw new Error('Obsolete checks must not touch incidents.'); } };
  const context = { repo: { owner: 'fixture', repo: 'fixture' }, sha: 'old' };
  assert.equal((await publishIncident({ github, context, report: { result: 'passed' } })).action, 'superseded-run-ignored');
});

const test = require('node:test'), assert = require('node:assert/strict');
const { briefRequest, validateBrief, attachBrief } = require('../scripts/quality-eval/evidence-brief');
const { runCandidate, modelEvidence, modelActions } = require('../scripts/quality-eval/full-flow-candidate');
const { stageFor } = require('../scripts/quality-eval/observe-fetch');
const now = Date.parse('2026-09-15T00:00:00Z');
function fixture(communityId = 'alpha', timezone = 'America/Denver') {
  const rule = { id: 'rule', communityId, version: 'v1', role: 'governing-rule', title: 'Adopted policy',
    sourceUrl: 'https://' + communityId + '.example/policy', text: 'Approval required. At a slope of 3:9 a taller design may be reviewed. No exception on restricted lots.', actions: [] };
  const action = { label: 'Open forms directory', url: 'https://' + communityId + '.example/forms', actionType: 'information' };
  const forms = { id: 'forms', communityId, version: 'f1', role: 'official-action', title: 'Forms', sourceUrl: action.url, text: 'Forms directory.', actions: [action] };
  const liveScope = { kind: 'current-status', status: 'closed', timezone, observedAt: new Date(now - 1000).toISOString(), scopeLimit: 'This adapter does not establish the closure cause.' };
  const live = { id: 'live', communityId, version: 'l1', role: 'live-operation', title: 'Facility', sourceUrl: 'https://' + communityId + '.example/status',
    text: JSON.stringify(liveScope), liveScope, checkedAt: new Date(now - 1000).toISOString(), staleAfter: new Date(now + 60000).toISOString(), actions: [] };
  const packet = { communityId, sources: [rule, forms, live], actions: [{ id: 'forms-a', sourceId: 'forms', communityId, version: 'f1', ...action }], diagnostics: [{ needId: 'need-2', reason: 'exact-form-not-established' }] };
  const row = { question: 'What are the height conditions and which exact form do I use?', context: [{ question: 'I am planning a small structure.' }] };
  const plan = { scope: 'community', needs: [{ id: 'need-1', subject: 'structure', task: 'specification', request: 'height conditions', evidenceKind: 'governing-rule' },
    { id: 'need-2', subject: 'structure', task: 'form', request: 'exact form', evidenceKind: 'official-action' }], constraints: [] };
  const raw = { needs: [{ needId: 'need-1', proposedOutcome: 'complete', missingDetail: '', actionIds: [],
    quotes: [{ sourceId: 'rule', text: 'At a slope of 3:9 a taller design may be reviewed.', purpose: 'direct-answer' }, { sourceId: 'rule', text: 'No exception on restricted lots.', purpose: 'qualification' }] },
  { needId: 'need-2', proposedOutcome: 'missing-evidence', missingDetail: 'The exact applicable form is not confirmed.', quotes: [], actionIds: ['forms-a'] }] };
  const options = { communityId, timezone, now };
  const request = { system: 'Original instructions', messages: [{ role: 'user', content: JSON.stringify({ question: row.question, priorResidentQuestions: row.context.map(c => c.question),
    evidence: modelEvidence(packet.sources), actions: modelActions(packet.actions), requiredNeeds: plan.needs, evidenceGaps: packet.diagnostics }) }] };
  return { row, plan, packet, raw, options, request };
}
test('two-community preparation retains complete sources, qualifications, diagnostics and exact actions', () => {
  for (const [community, timezone] of [['alpha', 'America/Denver'], ['beta', 'Asia/Tokyo']]) {
    const f = fixture(community, timezone), before = structuredClone(f.packet);
    const request = briefRequest(f.row, f.plan, f.packet, 'claude-haiku-4-5', f.options);
    const p = JSON.parse(request.messages[0].content);
    assert.equal(request.tools[0].strict, true); assert.equal(stageFor(request), 'evidence-preparation');
    assert.equal(p.evidence.length, 3); assert.equal(p.evidence[0].text, f.packet.sources[0].text);
    assert.equal(JSON.parse(p.evidence[2].text).scopeLimit, undefined); assert.ok(p.assistantEvidenceContext[0].scopeLimit);
    assert.deepEqual(p.evidenceGaps, f.packet.diagnostics);
    const result = validateBrief(f.raw, f.row, f.plan, f.packet, f.options);
    assert.deepEqual(result.issues, []); assert.equal(result.brief.kind, 'unverified-model-reading-aid');
    const attached = attachBrief(f.request, result.brief, f.row, f.plan, f.packet, f.options);
    const actual = JSON.parse(attached.messages[0].content), original = JSON.parse(f.request.messages[0].content);
    assert.deepEqual(actual.evidence, original.evidence); assert.deepEqual(actual.actions, original.actions);
    assert.deepEqual(actual.evidenceGaps, original.evidenceGaps); assert.deepEqual(f.packet, before);
    assert.equal(actual.evidenceBrief.needs[0].quotes[1].text, 'No exception on restricted lots.');
    assert.equal(actual.evidenceBrief.needs[1].proposedOutcome, 'missing-evidence');
  }
});
test('changed qualifiers, invented quotes, missing or duplicate needs and actions are rejected', () => {
  for (const mutate of [
    f => f.raw.needs[0].quotes[0].text = 'At a slope of at least 3:9 a taller design may be reviewed.',
    f => f.raw.needs[0].quotes[0].sourceId = 'unknown',
    f => f.raw.needs[0].quotes[0].version = 'forged',
    f => f.raw.needs.pop(), f => f.raw.needs[1].needId = 'need-1',
    f => f.raw.needs[1].actionIds = ['invented'], f => f.raw.needs[1].actionIds = ['forms-a', 'forms-a'],
    f => f.raw.needs[1].missingDetail = '', f => f.raw.needs[0].missingDetail = 'Unresolved',
    f => f.raw.needs[0].quotes = [], f => f.raw.needs[0].proposedOutcome = 'verified'
  ]) { const f = fixture(); mutate(f); const result = validateBrief(f.raw, f.row, f.plan, f.packet, f.options); assert.ok(result.issues.length); assert.equal(result.brief, null); }
});
test('a navigation source cannot prove a rule and adapter metadata cannot become a source quote', () => {
  const f = fixture();
  f.raw.needs[0].quotes = [{ sourceId: 'forms', text: 'Forms directory.', purpose: 'direct-answer' }];
  assert.ok(validateBrief(f.raw, f.row, f.plan, f.packet, f.options).issues.includes('action-cannot-prove-brief-fact'));
  f.raw.needs[0].quotes = [{ sourceId: 'live', text: 'This adapter does not establish the closure cause.', purpose: 'direct-answer' }];
  assert.ok(validateBrief(f.raw, f.row, f.plan, f.packet, f.options).issues.includes('invalid-brief-quote'));
  f.raw.needs[0].quotes = [{ sourceId: 'live', text: 'closed', purpose: 'direct-answer' }];
  assert.ok(validateBrief(f.raw, f.row, f.plan, f.packet, f.options).issues.includes('brief-wrong-authority'));
});
test('conflict proposals retain two sources and cannot claim complete coverage with a gap', () => {
  const f = fixture(); f.packet.sources.push({ ...f.packet.sources[0], id: 'amendment', version: 'v2', text: 'No taller design may be approved.' });
  f.raw.needs[0] = { needId: 'need-1', proposedOutcome: 'conflict', missingDetail: 'Applicable sources conflict.', actionIds: [], quotes: [
    { sourceId: 'rule', text: 'At a slope of 3:9 a taller design may be reviewed.', purpose: 'conflict' },
    { sourceId: 'amendment', text: 'No taller design may be approved.', purpose: 'conflict' }] };
  assert.deepEqual(validateBrief(f.raw, f.row, f.plan, f.packet, f.options).issues, []);
  f.raw.needs[0].quotes.pop(); assert.ok(validateBrief(f.raw, f.row, f.plan, f.packet, f.options).issues.includes('brief-missing-conflict-support'));
});
test('brief reuse rejects changed source, action, community, question, context, interpretation and expiry', () => {
  for (const mutate of [f => f.packet.sources[0].version = 'v2', f => f.packet.sources[0].text += 'Changed.',
    f => f.packet.actions[0].url += '/changed', f => f.options.communityId = 'beta', f => f.row.question += ' New question.',
    f => f.row.context[0].question = 'A different project', f => f.plan.needs[0].request = 'different detail', f => f.options.now += 60000]) {
    const f = fixture(), checked = validateBrief(f.raw, f.row, f.plan, f.packet, f.options); mutate(f);
    assert.throws(() => attachBrief(f.request, checked.brief, f.row, f.plan, f.packet, f.options));
  }
});
test('caller-supplied hydrated facts are ignored in favor of validated source text', () => {
  const f = fixture(), checked = validateBrief(f.raw, f.row, f.plan, f.packet, f.options);
  checked.brief.needs[0].quotes[0].text = 'Invented new permission.';
  const p = JSON.parse(attachBrief(f.request, checked.brief, f.row, f.plan, f.packet, f.options).messages[0].content);
  assert.equal(p.evidenceBrief.needs[0].quotes[0].text, f.raw.needs[0].quotes[0].text);
});
test('a valid brief cannot be attached to a different question or truncated evidence payload', () => {
  for (const mutate of [p => p.question = 'Different question', p => p.priorResidentQuestions = [], p => p.evidence.pop()]) {
    const f = fixture(), checked = validateBrief(f.raw, f.row, f.plan, f.packet, f.options);
    const payload = JSON.parse(f.request.messages[0].content); mutate(payload); f.request.messages[0].content = JSON.stringify(payload);
    assert.throws(() => attachBrief(f.request, checked.brief, f.row, f.plan, f.packet, f.options), /destination mismatch/);
  }
});
function simplePlan() { return { standaloneQuestion: 'What are the height conditions?', usedPriorContext: false, scope: 'community', clarificationQuestion: '',
  needs: [{ subject: 'structure', task: 'specification', request: 'height conditions', evidenceKind: 'governing-rule' }], constraints: [], searchQueries: ['structure height'] }; }
test('candidate passes one brief and full evidence to writer, checker and repair without another preparation call', async () => {
  const f = fixture(), requests = [], raw = { needs: [f.raw.needs[0]] };
  const bad = { outcome: 'complete', hardFailures: ['unsupported-material-claim'], needs: [{ needId: 'need-1', request: 'height conditions', status: 'addressed', supportSourceIds: ['rule'] }], actionReviews: [],
    failureDetails: [{ failure: 'unsupported-material-claim', reason: 'Do not broaden the condition.', statement: 'At least 3:9.', actionId: '' }] };
  const good = { ...bad, hardFailures: [], failureDetails: [] };
  const outputs = [simplePlan(), raw, { answer: 'At least 3:9.', actionIds: [] }, bad, { answer: f.packet.sources[0].text, actionIds: [] }, good];
  const result = await runCandidate({ question: 'What are the height conditions?' }, { communityId: 'alpha', apiKey: 'test-only', clock: () => now,
    retrieve: async () => f.packet, evidenceBriefModel: 'claude-haiku-4-5', writerPresentation: { separateContext: true, stableActionSchema: true, timezone: 'America/Denver' },
    fetchImpl: async (_url, init) => { const body = JSON.parse(init.body); requests.push(body); return new Response(JSON.stringify({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: body.tools[0].name, input: outputs[requests.length - 1] }] })); } });
  assert.equal(result.status, 'checked-candidate'); assert.equal(result.completion.outcome, 'complete'); assert.equal(requests.length, 6);
  assert.equal(requests.filter(r => r.tools[0].name === 'prepare_evidence_brief').length, 1);
  const payloads = requests.slice(2).map(r => JSON.parse(r.messages[0].content));
  for (const p of payloads) { assert.equal(p.evidence.length, 3); assert.deepEqual(p.evidenceBrief, payloads[0].evidenceBrief); }
  assert.match(requests[3].system, /unverified model proposal/);
});
test('bad or expired preparation stops before writer; excluded models never reach provider preparation', async () => {
  for (const failure of ['bad-quote', 'expiry', 'excluded-model']) {
    const f = fixture(); let calls = 0, clock = now;
    const raw = { needs: [f.raw.needs[0]] }; if (failure === 'bad-quote') raw.needs[0].quotes[0].text = 'Made up';
    const result = await runCandidate({ question: 'What are the height conditions?' }, { communityId: 'alpha', apiKey: 'test-only', clock: () => clock,
      retrieve: async () => f.packet, evidenceBriefModel: failure === 'excluded-model' ? 'claude-fable' : 'claude-haiku-4-5', writerPresentation: { timezone: 'America/Denver' },
      fetchImpl: async (_url, init) => { const body = JSON.parse(init.body); calls++; if (calls === 2 && failure === 'expiry') clock += 60000;
        return new Response(JSON.stringify({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: body.tools[0].name, input: calls === 1 ? simplePlan() : raw }] })); } });
    assert.equal(result.answer, null); assert.equal(result.status, 'unresolved-experiment'); assert.equal(calls, failure === 'excluded-model' ? 1 : 2);
  }
});
test('comparison freezes all eight cases and rejects a changed historical input before calls', t => {
  const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
  const { prepare, cases } = require('../scripts/quality-eval/compare-evidence-brief');
  const { hash } = require('../scripts/quality-eval/flow-evidence');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'brief-design-'));
  t.after(() => fs.rmSync(directory, { recursive: true }));
  const inputs = cases.map(caseId => { const f = fixture(); return { caseId, ...f, communityId: f.options.communityId, timezone: f.options.timezone, now }; });
  const manifest = { status: 'captured', mode: 'controlled-writer-presentation', runs: Array(96).fill({}), cases,
    inputHashes: Object.fromEntries(inputs.map(i => [i.caseId, hash(i)])) };
  fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
  for (const input of inputs) fs.writeFileSync(path.join(directory, input.caseId + '-input.json'), JSON.stringify(input));
  const design = prepare(directory); assert.equal(design.jobs.length, 32); assert.ok(design.plannedUpperUsd <= 5);
  for (const caseId of cases) for (const model of ['claude-haiku-4-5', 'claude-sonnet-5']) assert.equal(design.jobs.filter(j => j.caseId === caseId && j.model === model).length, 2);
  inputs[0].packet.sources[0].text += 'Changed'; fs.writeFileSync(path.join(directory, inputs[0].caseId + '-input.json'), JSON.stringify(inputs[0]));
  assert.throws(() => prepare(directory), /identity mismatch/);
});

"use strict";
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const { briefRequest, validateBrief } = require('./evidence-brief');
const { hash } = require('./flow-evidence');
const { upperCost } = require('./compare-planners');
const { summarize } = require('./usage');
const { createObservedFetch } = require('./observe-fetch');
const models = ['claude-haiku-4-5', 'claude-sonnet-5'];
const cases = ['food-menu', 'pool-hours', 'recycling-storage', 'shed-form', 'lighting-process', 'application', 'forms-multi', 'compound'];
function prepare(directory) {
  const read = name => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
  const original = read('manifest.json');
  if (original.status !== 'captured' || original.mode !== 'controlled-writer-presentation' || original.runs.length !== 96 || hash(original.cases) !== hash(cases)) throw Error('Require completed eight-family writer comparison');
  const inputs = cases.map(caseId => {
    const input = read(caseId + '-input.json');
    if (input.caseId !== caseId || hash(input) !== original.inputHashes[caseId]) throw Error('Historical input identity mismatch');
    return input;
  });
  const jobs = inputs.flatMap(input => models.flatMap(model => [1, 2].map(repetition => ({ input, model, repetition, caseId: input.caseId,
    body: briefRequest(input.row, input.plan, input.packet, model, { communityId: input.communityId, timezone: input.timezone, now: input.now }) }))));
  const plannedUpperUsd = jobs.reduce((sum, j) => sum + upperCost(j.body), 0);
  if (plannedUpperUsd > 5) throw Error('Whole brief comparison exceeds five-dollar cap');
  return { inputs, jobs, plannedUpperUsd };
}
async function main() {
  const [priorArg, outArg, flag] = process.argv.slice(2);
  if (!priorArg || !outArg || flag && flag !== '--prepare-only') throw Error('Require prior capture, new output and optional --prepare-only');
  const prior = path.resolve(priorArg), out = path.resolve(outArg), prepared = prepare(prior);
  if (flag) { console.log(JSON.stringify({ calls: prepared.jobs.length, plannedUpperUsd: prepared.plannedUpperUsd, capUsd: 5 })); return; }
  if (!process.env.ANTHROPIC_API_KEY || fs.existsSync(out)) throw Error('Require existing credential and fresh output directory');
  fs.mkdirSync(out, { recursive: true }); fs.mkdirSync(path.join(out, 'code'));
  for (const file of ['evidence-brief.js', 'compare-evidence-brief.js', 'writer-presentation.js', 'full-flow-candidate.js', 'observe-fetch.js', 'usage.js']) fs.copyFileSync(path.join(__dirname, file), path.join(out, 'code', file));
  const jobs = prepared.jobs.map(j => ({ ...j, order: crypto.randomBytes(8).toString('hex') })).sort((a, b) => a.order.localeCompare(b.order));
  const runs = [], calls = []; let active = {};
  const manifest = { status: 'running', isTest: true, mode: 'evidence-brief-model-comparison', startedAt: new Date().toISOString(),
    codeRevision: cp.execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), priorCapture: prior,
    capUsd: 5, plannedUpperUsd: prepared.plannedUpperUsd, models, cases, repetitions: 2, runs,
    inputHashes: Object.fromEntries(prepared.inputs.map(i => [i.caseId, hash(i)])),
    design: jobs.map(j => ({ caseId: j.caseId, model: j.model, repetition: j.repetition, requestHash: hash(j.body) })),
    limitations: ['Historical evidence and clocks, never current-live answers.', 'Known development cases; not blind human calibration or unseen acceptance.',
      'Preparation only; no answer-quality or full-flow latency/cost result.', 'Exact quotation and structure do not prove completeness, relevance or correctness.'],
    priorPhase: { name: 'writer-presentation-comparison', closed: true, costUsd: 1.898477, reservedUsd: 4.926744 } };
  for (const input of prepared.inputs) fs.writeFileSync(path.join(out, input.caseId + '-input.json'), JSON.stringify(input, null, 2) + '\n');
  const observed = createObservedFetch(fetch, { calls, capUsd: 5, captureRequests: true, onCall: c => {
    Object.assign(c, active); fs.appendFileSync(path.join(out, 'calls.jsonl'), JSON.stringify(c) + '\n');
  } });
  const save = () => { manifest.costs = summarize(calls); manifest.reservedUpperUsd = observed.reservedUsd();
    fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n'); }; save();
  for (const [i, j] of jobs.entries()) {
    active = { caseId: j.caseId, model: j.model, repetition: j.repetition };
    const start = Date.now(); let response = null, raw = null, validation = null, error = null;
    try {
      const r = await observed('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': process.env.ANTHROPIC_API_KEY }, body: JSON.stringify(j.body), signal: AbortSignal.timeout(45000) });
      response = await r.json(); if (!r.ok || response.stop_reason !== 'tool_use') throw Error('Provider response rejected or incomplete');
      raw = response.content?.find(c => c.type === 'tool_use' && c.name === 'prepare_evidence_brief')?.input;
      validation = validateBrief(raw, j.input.row, j.input.plan, j.input.packet, { communityId: j.input.communityId, timezone: j.input.timezone, now: j.input.now });
    } catch (e) { error = e.message; }
    const id = 'brief-' + String(i + 1).padStart(3, '0');
    const record = { id, isTest: true, ...active, requestHash: hash(j.body), response, raw, validation, error, durationMs: Date.now() - start };
    fs.writeFileSync(path.join(out, id + '.json'), JSON.stringify(record, null, 2) + '\n');
    runs.push({ id, ...active, durationMs: record.durationMs, issues: validation?.issues, error }); save();
    console.log(JSON.stringify({ completed: runs.length, total: jobs.length, ...runs.at(-1) }));
    if (error || calls.at(-1)?.usage == null) { manifest.status = 'stopped-error-or-unknown-usage'; break; }
  }
  if (manifest.status === 'running') manifest.status = runs.length === jobs.length ? 'captured' : 'incomplete';
  manifest.finishedAt = new Date().toISOString(); manifest.costsByModel = Object.fromEntries(models.map(m => [m, summarize(calls.filter(c => c.model === m))])); save();
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { prepare, cases, models };

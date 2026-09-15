"use strict";
const fs = require('node:fs'), path = require('node:path');
const { hash } = require('./flow-evidence');
const { summarize } = require('./usage');
const { times } = require('./summarize-presentation');
const { presentPayload } = require('./writer-presentation');
const { modelEvidence } = require('./full-flow-candidate');
const normalizeWhitespace = text => text.replace(/\s+/gu, ' ').trim();
function analyze(directory) {
  const read = name => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')), m = read('manifest.json');
  if (!['captured', 'stopped-error-or-unknown-usage'].includes(m.status) || m.design.length !== 32 || !m.runs.length || m.runs.length > 32 || m.status === 'captured' && m.runs.length !== 32) throw Error('Require terminal preparation capture');
  const calls = fs.readFileSync(path.join(directory, 'calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  if (calls.length !== m.runs.length) throw Error('Incomplete usage ledger');
  const rows = m.runs.map(r => read(r.id + '.json'));
  for (const [i, row] of rows.entries()) {
    const d = m.design[i], c = calls[i];
    if (hash(c.request) !== d.requestHash || row.requestHash !== d.requestHash || ['caseId', 'model', 'repetition'].some(k => row[k] !== d[k] || c[k] !== d[k])) throw Error('Capture identity mismatch');
  }
  const report = { status: m.status === 'captured' ? 'complete-development-preparation-comparison' : 'partial-stopped-development-comparison', isTest: true,
    plannedCalls: 32, completedCalls: rows.length, codeRevision: m.codeRevision, costs: summarize(calls),
    priorAttempt: m.priorAttempt, phaseReservedUpperUsd: m.reservedUpperUsd + (m.priorAttempt?.reservedUpperUsd || 0),
    phaseExactCostKnown: !m.priorAttempt?.costs.unknownCostCalls && !m.costs.unknownCostCalls, groups: {}, quoteDiagnostics: [], limitations: m.limitations };
  for (const model of m.models) {
    const group = rows.filter(r => r.model === model), ledger = calls.filter(c => c.model === model);
    if (m.cases.some(id => [1, 2].some(rep => group.filter(r => r.caseId === id && r.repetition === rep).length > 1))) throw Error('Duplicate model comparison');
    if (m.status === 'captured' && (group.length !== 16 || m.cases.some(id => [1, 2].some(rep => group.filter(r => r.caseId === id && r.repetition === rep).length !== 1)))) throw Error('Unbalanced completed comparison');
    const costs = summarize(ledger);
    report.groups[model] = { calls: group.length, caseCounts: Object.fromEntries(m.cases.map(id => [id, group.filter(r => r.caseId === id).length])), costs,
      per1000PreparationCallsUsd: costs.estimatedTotalUsd === null || !group.length ? null : costs.estimatedTotalUsd / group.length * 1000,
      timing: times(group.map(r => r.durationMs)), structurallyAccepted: group.filter(r => !r.error && !r.validation?.issues.length).length,
      issues: Object.fromEntries([...new Set(group.flatMap(r => r.validation?.issues || []))].map(issue => [issue, group.filter(r => r.validation?.issues.includes(issue)).length])) };
  }
  if (m.status !== 'captured') report.limitations = [...report.limitations, 'Stopped early; model groups have unequal case mixes. Costs and timing describe observed attempts only and cannot rank the models.'];
  for (const row of rows) {
    const input = read(row.caseId + '-input.json');
    if (hash(input) !== m.inputHashes[row.caseId]) throw Error('Changed source input');
    const p = presentPayload({ evidence: modelEvidence(input.packet.sources) }, input.packet, { timezone: input.timezone, now: input.now });
    for (const need of row.raw?.needs || []) for (const q of need.quotes || []) {
      const source = p.evidence.find(s => s.id === q.sourceId);
      if (source && typeof q.text === 'string' && source.text.includes(q.text)) continue;
      report.quoteDiagnostics.push({ trial: row.id, caseId: row.caseId, model: row.model, needId: need.needId, sourceId: q.sourceId,
        text: q.text, difference: !source ? 'unknown-source' : typeof q.text === 'string' && normalizeWhitespace(source.text).includes(normalizeWhitespace(q.text)) ? 'whitespace-only' : 'other-text-difference' });
    }
  }
  // Diagnostic classification does not retroactively accept a rejected brief.
  fs.writeFileSync(path.join(directory, 'comparison.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}
function revalidate(directory) {
  const { validateBrief } = require('./evidence-brief');
  const read = name => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')), m = read('manifest.json');
  const rows = m.runs.map(r => {
    const x = read(r.id + '.json'), input = read(r.caseId + '-input.json');
    if (hash(input) !== m.inputHashes[r.caseId]) throw Error('Changed source input');
    const result = validateBrief(x.raw, input.row, input.plan, input.packet, { communityId: input.communityId, timezone: input.timezone, now: input.now });
    return { id: r.id, caseId: r.caseId, model: r.model, error: x.error, originalIssues: x.validation?.issues || [], revalidatedIssues: result.issues, brief: result.brief };
  });
  const report = { isTest: true, status: 'offline-validator-correction-not-new-model-test', modelCalls: 0, captureRevision: m.codeRevision,
    validatorHash: hash(fs.readFileSync(path.join(__dirname, 'evidence-brief.js'), 'utf8')), rows };
  fs.writeFileSync(path.join(directory, 'offline-revalidation.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}
if (require.main === module) { try { const directory = path.resolve(process.argv[2]); console.log(JSON.stringify(analyze(directory))); revalidate(directory); } catch (e) { console.error(e.message); process.exitCode = 1; } }
module.exports = { analyze, revalidate, normalizeWhitespace };

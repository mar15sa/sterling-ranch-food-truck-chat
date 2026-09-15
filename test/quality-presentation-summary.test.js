const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { analyze, times } = require('../scripts/quality-eval/summarize-presentation');
const { hash } = require('../scripts/quality-eval/flow-evidence');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'writer-ledger-'));
  t.after(() => fs.rmSync(directory, { recursive: true }));
  const write = (name, data) => fs.writeFileSync(path.join(directory, name), JSON.stringify(data));
  const manifest = { status: 'captured', codeRevision: 'test-only', models: ['claude-haiku-4-5', 'claude-sonnet-5'],
    variants: { control: {}, stable: {}, combined: {} }, cases: Array.from({ length: 8 }, (_, i) => 'case-' + i),
    design: [], runs: [], limitations: [], capUsd: 5, reservedUpperUsd: 1 };
  const calls = [];
  for (const caseId of manifest.cases) {
    write(caseId + '-input.json', { row: { question: caseId, context: [] }, packet: { actions: [] } });
    for (const model of manifest.models) for (const variant of Object.keys(manifest.variants)) for (const repetition of [1, 2]) {
      const id = 'trial-' + calls.length, request = { model, caseId, variant, repetition };
      const identity = { caseId, model, variant, repetition, requestHash: hash(request) };
      manifest.design.push(identity); manifest.runs.push({ id });
      write(id + '.json', { id, ...identity, durationMs: 100, firstSchemaUseInRun: false,
        draft: { answer: 'Answer', actionIds: [] }, error: null, issues: calls.length ? [] : ['tool-markup-in-answer'] });
      calls.push({ ...identity, stage: 'composition', request, usage: { input_tokens: 100, output_tokens: 10 } });
    }
  }
  const save = () => {
    write('manifest.json', manifest);
    fs.writeFileSync(path.join(directory, 'calls.jsonl'), calls.map(c => JSON.stringify(c)).join('\n'));
  };
  save(); return { directory, manifest, calls, save };
}

test('report retains rejected outputs in costs and denominators and preserves unknown charges', t => {
  const f = fixture(t);
  const result = analyze(f.directory);
  assert.equal(result.costs.calls, 96);
  assert.equal(result.groups['claude-haiku-4-5:control'].calls, 16);
  assert.equal(result.groups['claude-haiku-4-5:control'].structuralAccepted, 15);
  assert.equal(result.costs.unknownCostCalls, 0);
  f.calls[0].usage = null; f.save();
  const unknown = analyze(f.directory);
  assert.equal(unknown.costs.estimatedTotalUsd, null);
  assert.equal(unknown.costs.unknownCostCalls, 1);
  assert.equal(unknown.groups['claude-haiku-4-5:control'].per1000WriterCallsUsd, null);
});

test('report rejects a replaced request and an incomplete design instead of reporting partial success', t => {
  const f = fixture(t);
  f.calls[0].request.caseId = 'different-case'; f.save();
  assert.throws(() => analyze(f.directory), /identity mismatch/);
  f.manifest.runs.pop(); f.save();
  assert.throws(() => analyze(f.directory), /completed 96-call/);
});

test('small-sample p95 is reported without dropping the slowest call', () => {
  assert.deepEqual(times([...Array(15).fill(100), 23000]), { samples: 16, medianMs: 100, p95Ms: 23000 });
  assert.deepEqual(times([]), { samples: 0, medianMs: null, p95Ms: null });
});

const test = require('node:test'), assert = require('node:assert/strict');
const { createRetrievalSession } = require('../scripts/quality-eval/flow-retrieval-session');

function context(communityId = 'alpha') {
  const base = 'https://rules.example/' + communityId;
  return { communityId, profile: { communityId, website: 'https://' + communityId + '.example', allowedHosts: ['rules.example'], connectors: [{ type: 'municode', baseUrl: base }] },
    communityIndex: { communityId, sources: [], factLedger: [] }, rulesIndex: { source: { sourceUrl: base }, documents: [
      { id: 'rule', nodeId: 'rule', communityId, sourceUrl: base + '?nodeId=rule', productId: 1, jobId: 1, title: 'Sheds', text: 'Sheds require approval.' }
    ] } };
}
const plan = { needs: [{ id: 'need-1', subject: 'shed', request: 'Permission', task: 'permission', evidenceKind: 'governing-rule' }] };

test('semantic full-flow session actually searches with the current clock and exact tenant corpus', async () => {
  for (const communityId of ['alpha', 'beta']) {
    const ctx = context(communityId); let now = 100, searches = 0, disposals = 0;
    const session = await createRetrievalSession(ctx, { semanticDirectory: 'fixture', clock: () => now, loadRanker: async options => {
      assert.equal(options.communityId, communityId); assert.deepEqual(options.documents, ctx.rulesIndex.documents);
      return { communityId, model: 'fixture', modelRevision: 'v1', corpusHash: 'fixture',
        search: async (index, query, limit, options) => { searches++; assert.equal(options.now, 200); assert.equal(options.eligibilityQuestion, query); return index.documents; },
        dispose: async () => { disposals++; } };
    } });
    now = 200; const packet = await session.retrieve(plan);
    assert.equal(searches, 1); assert.equal(packet.sources[0].communityId, communityId);
    assert.equal(session.metadata.method, 'local-semantic-plus-keyword'); assert.equal(session.metadata.hostingCostUsd, null);
    await session.dispose(); await session.dispose(); assert.equal(disposals, 1);
    assert.throws(() => session.retrieve(plan), /closed/);
  }
});

test('failed setup disposes a loaded model and never downgrades a semantic arm to keyword', async () => {
  let disposals = 0;
  await assert.rejects(createRetrievalSession(context(), { semanticDirectory: 'fixture', loadRanker: async () => ({ communityId: 'other', search: async () => [], dispose: async () => { disposals++; } }) }), /binding/);
  assert.equal(disposals, 1);
  await assert.rejects(createRetrievalSession(context(), { semanticDirectory: 'fixture', loadRanker: async () => { throw new Error('cache mismatch'); } }), /cache mismatch/);
});

test('keyword control never loads the semantic runtime', async () => {
  const ctx = context(); let searches = 0;
  const session = await createRetrievalSession({ ...ctx, ruleSearch: index => { searches++; return index.documents; } }, { loadRanker: async () => { throw new Error('unexpected embedding'); } });
  assert.equal(session.metadata.method, 'keyword'); assert.equal((await session.retrieve(plan)).sources.length, 1);
  assert.equal(searches, 1);
  await session.dispose();
});

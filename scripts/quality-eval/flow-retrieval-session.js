"use strict";
const { makeRetriever } = require('./flow-evidence');
const { eligibleCorpus } = require('./semantic-corpus');

async function createRetrievalSession(context, { semanticDirectory = null, clock = Date.now,
  loadRanker = async options => (await import('./semantic-ranker.mjs')).createSemanticRanker(options) } = {}) {
  if (!semanticDirectory) return { retrieve: makeRetriever(context), metadata: { method: 'keyword', initializationMs: 0 }, dispose: async () => {} };
  const started = clock();
  const ranker = await loadRanker({ directory: semanticDirectory, documents: eligibleCorpus(context.rulesIndex, context.communityId, started), communityId: context.communityId });
  try {
    if (ranker.communityId !== context.communityId || typeof ranker.search !== 'function' || typeof ranker.dispose !== 'function') throw new Error('Invalid semantic session binding');
    let closed = false;
    const retrieve = makeRetriever({ ...context, ruleSearch: (index, query, limit) => {
      if (closed) throw new Error('Semantic retrieval session is closed');
      return ranker.search(index, query, limit, { now: clock(), eligibilityQuestion: query });
    } });
    return {
      retrieve: plan => { if (closed) throw new Error('Semantic retrieval session is closed'); return retrieve(plan); },
      metadata: { method: 'local-semantic-plus-keyword', directory: semanticDirectory, initializationMs: clock() - started,
        model: ranker.model, modelRevision: ranker.modelRevision, corpusHash: ranker.corpusHash,
        embeddingApiCostUsd: 0, hostingCostUsd: null },
      dispose: async () => { if (!closed) { closed = true; await ranker.dispose(); } }
    };
  } catch (error) {
    if (typeof ranker?.dispose === 'function') await ranker.dispose();
    throw error;
  }
}

module.exports = { createRetrievalSession };

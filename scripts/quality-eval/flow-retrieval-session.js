"use strict";
const { makeRetriever } = require('./flow-evidence');
const { eligibleCorpus } = require('./semantic-corpus');

async function createRetrievalSession(context, { semanticDirectory = null, communitySemanticDirectory = null, reuseKeywordPreparation = false, clock = Date.now,
  loadCommunityRanker = async options => (await import('./community-semantic-ranker.mjs')).createCommunitySemanticRanker(options),
  loadRanker = async options => (await import('./semantic-ranker.mjs')).createSemanticRanker(options) } = {}) {
  if(communitySemanticDirectory&&!semanticDirectory)throw Error('Combined semantic session requires rules cache');
  if (!semanticDirectory) return { retrieve: makeRetriever(context), metadata: { method: 'keyword', initializationMs: 0 }, dispose: async () => {} };
  const started = clock();
  const ranker = await loadRanker({ directory: semanticDirectory, documents: eligibleCorpus(context.rulesIndex, context.communityId, started), communityId: context.communityId, reuseKeywordPreparation });
  let communityRanker;
  try {
    if (ranker.communityId !== context.communityId || typeof ranker.search !== 'function' || typeof ranker.dispose !== 'function') throw new Error('Invalid semantic session binding');
    let closed = false;
    if(communitySemanticDirectory)communityRanker=await loadCommunityRanker({directory:communitySemanticDirectory,index:context.communityIndex,communityId:context.communityId,now:clock()});
    if(communityRanker&&(communityRanker.communityId!==context.communityId||typeof communityRanker.search!=='function'||typeof communityRanker.dispose!=='function'))throw Error('Invalid community semantic session binding');
    const retrieve = makeRetriever({ ...context,...(communityRanker?{communityMode:'semantic',communitySearch:(...args)=>{if(closed)throw Error('Semantic retrieval session is closed');return communityRanker.search(...args);}}:{}), ruleSearch: (index, query, limit) => {
      if (closed) throw new Error('Semantic retrieval session is closed');
      return ranker.search(index, query, limit, { now: clock(), eligibilityQuestion: query });
    } });
    return {
      retrieve: plan => { if (closed) throw new Error('Semantic retrieval session is closed'); return retrieve(plan); },
      metadata: { method: 'local-semantic-plus-keyword', directory: semanticDirectory, initializationMs: clock() - started,
        model: ranker.model, modelRevision: ranker.modelRevision, corpusHash: ranker.corpusHash,
        embeddingApiCostUsd: 0, hostingCostUsd: null, ...(communityRanker?{community:{directory:communitySemanticDirectory,...communityRanker.metadata},reuseKeywordPreparation}: {}) },
      dispose: async () => { if (!closed) { closed = true; try{await ranker.dispose();}finally{if(communityRanker)await communityRanker.dispose();} } }
    };
  } catch (error) {
    try{if (typeof ranker?.dispose === 'function') await ranker.dispose();}finally{if(typeof communityRanker?.dispose==='function')await communityRanker.dispose();}
    throw error;
  }
}

module.exports = { createRetrievalSession };

const { factIsAnswerable, resolveFactLedger } = require('./community-truth');
const { isDynamicSource } = require('./community-source-identity');

function sourceReviewState(index = {}, now = Date.now()) {
  const ledger = Array.isArray(index.factLedger) ? index.factLedger : [];
  const blockedFactIds = new Set();
  for (const group of resolveFactLedger(ledger, { factAuthority: index.factAuthority }).unresolvedSensitive) {
    for (const entry of group.entries) blockedFactIds.add(entry.id);
  }

  const answerableByVersion = new Map();
  for (const entry of ledger) {
    if (blockedFactIds.has(entry.id) || !factIsAnswerable(entry, now)) continue;
    const key = `${entry.sourceId}:${entry.sourceVersion}`;
    const entries = answerableByVersion.get(key) || [];
    entries.push(entry);
    answerableByVersion.set(key, entries);
  }

  const entriesFor = source => {
    if (isDynamicSource(source)) return [];
    return answerableByVersion.get(`${source.id}:${source.contentHash}`) || [];
  };
  // Callers that pass through the original page body need a separate,
  // version-bound approval for that body. Claim approval alone authorizes only
  // a projection built from the approved ledger entries.
  const canUseSource = source => isDynamicSource(source) || Boolean(
    source.reviewStatus === 'approved'
    && source.reviewDecisionId
    && source.reviewedSourceVersion === source.contentHash
    && source.reviewedAt
    && source.reviewedBy
  );
  const canUseProjection = source => isDynamicSource(source) || entriesFor(source).length > 0;
  return { canUseProjection, canUseSource, entriesFor };
}

function sourceReviewGate(index = {}, now = Date.now()) {
  return sourceReviewState(index, now).canUseSource;
}

module.exports = { sourceReviewGate, sourceReviewState };

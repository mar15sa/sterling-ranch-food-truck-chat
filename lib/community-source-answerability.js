const { factIsAnswerable, resolveFactLedger } = require('./community-truth');
const { isDynamicSource } = require('./community-source-identity');
const { inferFacet, inferScopeKey, normalizeFactValue, normalizeUrl } = require('./community-truth');
const { scopedApprovalsForVersion } = require('./canonical-source-ledger');
const { isRuntimeEvidenceWithheld } = require('./community-evidence-quarantine');
const canonicalSourceLedger = require('../data/canonical-source-ledger.json');

function canonicalProjectionEntries(source = {}, index = {}) {
  const ledger = index.canonicalSourceLedger || canonicalSourceLedger;
  const communityId = index.communityId || source.communityId || '';
  const approvedClaimDecisions = new Map();
  for (const approval of scopedApprovalsForVersion(ledger, source, communityId)) {
    for (const claim of approval.approvedClaims || []) approvedClaimDecisions.set(claim, approval.decisionId);
  }
  const decisionFor = value => approvedClaimDecisions.get(String(value || '').trim()) || '';
  const approved = value => Boolean(decisionFor(value));
  const factEntries = (source.facts || []).filter((fact) => approved(fact.approvalClaim)).map((fact) => ({
    factType: fact.type,
    normalizedValue: normalizeFactValue(fact),
    facet: inferFacet(fact, source),
    scopeKey: inferScopeKey(fact, source),
    supportingText: fact.context || '',
    sourceUrl: source.sourceUrl,
    sourceVersion: source.contentHash,
    reviewDecisionId: decisionFor(fact.approvalClaim),
    reviewedBy: fact.reviewedBy,
    reviewedAt: fact.reviewedAt,
    approvalClaim: fact.approvalClaim,
  }));
  const actionEntries = (source.actions || []).filter((action) => approved(action.approvalClaim)).map((action) => ({
    factType: 'link',
    normalizedValue: normalizeUrl(action.url),
    facet: 'information',
    scopeKey: `action-${String(action.approvalClaim).trim()}`,
    supportingText: action.label || '',
    sourceUrl: source.sourceUrl,
    sourceVersion: source.contentHash,
    reviewDecisionId: decisionFor(action.approvalClaim),
    reviewedBy: action.reviewedBy,
    reviewedAt: action.reviewedAt,
    approvalClaim: action.approvalClaim,
  }));
  return [...factEntries, ...actionEntries];
}

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
    if (isRuntimeEvidenceWithheld(source, index)) return [];
    if (isDynamicSource(source)) return [];
    const canonicalEntries = canonicalProjectionEntries(source, index);
    const scopedClaims = new Set(canonicalEntries.map((entry) => entry.approvalClaim).filter(Boolean));
    const explicitEntries = answerableByVersion.get(`${source.id}:${source.contentHash}`) || [];
    return [
      // A page that has a canonical scoped decision must satisfy that decision
      // even when its fact ledger item also has explicit review metadata.
      ...(scopedClaims.size
        ? explicitEntries.filter((entry) => scopedClaims.has(entry.approvalClaim))
        : explicitEntries),
      ...canonicalEntries,
    ];
  };
  // Raw static page bodies are never resident answer evidence. Even a review
  // decision for the whole page is too broad: only an exact URL + hash claim
  // projection may cross the answer boundary. Dynamic connectors retain their
  // narrow normalization contracts and cannot lend authority to static prose.
  const canUseSource = source => !isRuntimeEvidenceWithheld(source, index) && isDynamicSource(source);
  // A reviewed destination proves only that the navigation action is safe to
  // show. It does not approve the surrounding page text, nor can it establish
  // availability, access, pricing, or another factual answer. General search
  // therefore requires a fact projection. Dedicated action selection may use
  // canUseActionProjection and still has to match the requested action goal.
  const canUseProjection = source => !isRuntimeEvidenceWithheld(source, index)
    && (isDynamicSource(source) || entriesFor(source).some((entry) => entry.factType !== 'link'));
  const canUseActionProjection = source => !isRuntimeEvidenceWithheld(source, index)
    && entriesFor(source).some((entry) => entry.factType === 'link');
  return { canUseActionProjection, canUseProjection, canUseSource, entriesFor };
}

function sourceReviewGate(index = {}, now = Date.now()) {
  return sourceReviewState(index, now).canUseSource;
}

module.exports = { canonicalProjectionEntries, sourceReviewGate, sourceReviewState };

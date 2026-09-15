const { sourceUrlIdentity } = require('./community-reviewed-package');
const { latestReviewDecision } = require('./community-review-queue');

const RESOLVED = new Set(['approve-proposed', 'keep-current', 'mark-current-superseded', 'exclude-page']);
const DECISION_STATUS = { 'approve-proposed': 'approved', 'keep-current': 'kept-current',
  'mark-current-superseded': 'superseded', 'exclude-page': 'excluded', escalate: 'escalated' };
const COMPLETE = new Set(['answer-evidence', 'safe-link', 'live-feed', 'excluded']);
const DAY = 24 * 60 * 60 * 1000;

function identity(value) {
  try { return sourceUrlIdentity(value || ''); } catch { return ''; }
}
function urlOf(item) { return identity(item.proposedSourceUrl || item.sourceUrl || item.currentSourceUrl || item.canonicalUrl || item.url); }
function time(value) { const result = Date.parse(value || ''); return Number.isFinite(result) ? result : null; }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
function payload(item) {
  const { notionPageId, ...rest } = item;
  return JSON.stringify(stable(rest));
}
function belongs(item, communityId) {
  if (!communityId) return true;
  return (!item.communityId || item.communityId === communityId)
    && (!item.communityIds?.length || item.communityIds.includes(communityId));
}
function observationTime(item) { return time(item.lastObservedAt || item.checkedAt || item.lastCheckedAt || item.firstObservedAt); }
function versionOf(source) { return source.contentHash || source.sourceVersion || ''; }
function compatible(item, source) {
  // Review items made by the crawler omit hashScheme. Only the same source ID
  // can supply that missing scheme; a matching URL or digest is insufficient.
  return !item.hashScheme || item.hashScheme === source.hashScheme;
}
function exactSource(item, source) {
  return Boolean(item.sourceId && item.sourceVersion && item.sourceVersion !== 'missing-version'
    && item.sourceId === (source.sourceId || source.id) && urlOf(item) === urlOf(source)
    && compatible(item, source) && item.sourceVersion === versionOf(source));
}
function proposalPayload(item, communityId) {
  // Observation dates and storage IDs may change without changing a proposal.
  // The source, claim, and actual before/after evidence may not.
  return JSON.stringify(stable([item.communityId || communityId, urlOf(item), item.sourceId || '',
    item.sourceVersion || '', item.hashScheme || '', item.kind || '', item.factId || '', item.claimKey || '',
    item.facet || '', item.scopeKey || '', item.currentValue || '', item.proposedValue || '', item.supportingText || '']));
}
function successful(source) {
  const status = source.httpStatus ?? source.lastStatus ?? source.statusCode;
  return !source.error && !source.lastError && !['retired', 'retirement-pending', 'unavailable'].includes(source.lifecycle)
    && (status == null || (Number(status) >= 200 && Number(status) < 300));
}
function indexBy(items, key) {
  const result = new Map();
  for (const item of items) {
    const id = key(item);
    const values = result.get(id) || [];
    values.push(item);
    result.set(id, values);
  }
  return result;
}

// This projection never grants approval, writes a decision, deletes history,
// or interprets a source omitted from an incremental crawl as retired.
function classifyReviewRecords(records = [], options = {}) {
  const { audit = {}, bundledIndex = {}, canonicalLedger = {}, snapshot = {} } = options;
  const now = options.now instanceof Date ? options.now.getTime()
    : typeof options.now === 'number' ? options.now : time(options.now) ?? Date.now();
  const maxAgeMs = Number.isFinite(options.maxAgeMs) ? options.maxAgeMs : DAY;
  const communityId = audit.communityId || bundledIndex.communityId || '';
  const checkedAt = time(snapshot.checkedAt);
  const snapshotFresh = snapshot.initialized === true && !snapshot.error && checkedAt !== null
    && checkedAt <= now && now - checkedAt <= maxAgeMs;
  const auditMatchesTenant = belongs(audit, communityId) && belongs(bundledIndex, communityId);
  const audits = indexBy(auditMatchesTenant ? (audit.records || []).filter(row => belongs(row, communityId)) : [], urlOf);
  const decisions = indexBy(records.filter(row => row.recordType === 'decision'), row => JSON.stringify([row.reviewId, row.sourceVersion]));
  const sourceKey = source => JSON.stringify([source.sourceId || source.id, urlOf(source)]);
  const candidateSources = (snapshot.candidateSources || []).filter(source => belongs(source, communityId) && successful(source));
  const candidates = indexBy(candidateSources, sourceKey);
  const proposals = indexBy((snapshot.items || []).filter(row => belongs(row, communityId)),
    row => JSON.stringify([row.id, row.sourceVersion]));
  const bundled = indexBy((bundledIndex.sources || []).filter(source => belongs(source, communityId)), sourceKey);
  const pages = indexBy([...(bundledIndex.pages || []), ...(snapshot.candidatePages || [])].filter(page => belongs(page, communityId)), urlOf);
  const canonical = indexBy((canonicalLedger.records || []).filter(row => belongs(row, communityId)), urlOf);
  const facts = indexBy((bundledIndex.factLedger || []).filter(row => belongs(row, communityId)), row => row.id);
  const saved = records.filter(row => row.recordType === 'review-item');
  const groups = indexBy(saved, row => JSON.stringify([row.id || '', row.sourceVersion || '', row.communityId || '']));
  const items = [];

  function exactAuditVersion(item, row) {
    // The audit's reviewedContentHash is a full reviewed extraction, not the
    // crawler chunk hash. Bridge only through the recorded page fingerprint
    // and its explicit chunk map (or a proven single, indexed source).
    return (pages.get(urlOf(item)) || []).some(page => {
      // A later content review may not refer to the inventory version. Its
      // text-only hash cannot be equated to an older text-and-actions digest.
      const reviewedFingerprint = row.reviewedContentHash ? row.reviewedVersionFingerprint : row.versionFingerprint;
      if (!reviewedFingerprint || page.contentFingerprint !== reviewedFingerprint) return false;
      if (page.chunkContentHashes?.includes(item.sourceVersion)) {
        return page.indexedSourceIds?.includes(item.sourceId)
          || [...(bundled.get(sourceKey(item)) || []), ...(candidates.get(sourceKey(item)) || [])].some(source => exactSource(item, source));
      }
      return page.indexedSourceIds?.length === 1 && page.indexedSourceIds[0] === item.sourceId
        && page.contentHash === item.sourceVersion;
    });
  }

  function completedScope(item, row) {
    if (!COMPLETE.has(row.disposition) || time(row.reviewedAt || audit.contentReviewedAt || audit.auditedAt) === null) return false;
    if (!exactAuditVersion(item, row)) return false;
    // An explicit exclusion/link-only review answers what to do with this
    // version; it is history, never an approval of its extracted claims.
    if (['excluded', 'safe-link', 'live-feed'].includes(row.disposition)) return true;
    if (item.factId) {
      return (facts.get(item.factId) || []).some(fact => exactSource(item, fact)
        && fact.reviewStatus === 'approved' && fact.claimKey === item.claimKey
        && (fact.displayValue === item.proposedValue || fact.supportingText === item.supportingText));
    }
    return false;
  }

  function canonicalScope(item) {
    const sources = bundled.get(sourceKey(item)) || [];
    const knownScheme = item.hashScheme || sources.find(source => exactSource(item, source))?.hashScheme;
    if (!knownScheme) return false;
    return (canonical.get(urlOf(item)) || []).some(version => version.contentHash === item.sourceVersion
      && version.hashScheme === knownScheme && (version.approvals || []).some(approval =>
        approval.status === 'approved' && (!communityId || approval.communityId === communityId)
        && (item.factId
          ? (approval.approvedClaims || []).includes(item.factId)
          : approval.scopeKind === 'entire-source')));
  }

  function classify(item, ambiguous) {
    let effectiveDecision = null;
    const effectiveStatus = () => DECISION_STATUS[effectiveDecision?.decision] || item.status || 'pending';
    const set = (queueBucket, queueReason, canDecide = false) => ({ ...item,
      savedStatus: item.status || 'pending', status: effectiveStatus(),
      ...(effectiveDecision ? { latestDecision: { ...effectiveDecision } } : {}),
      queueBucket, queueReason, canDecide });
    if (ambiguous) return set('comparison', 'Saved copies disagree. Compare their exact contents before making a decision.');
    if (!belongs(item, communityId)) return set('discovery', 'This entry belongs to a different community and cannot be decided here.');
    if (!urlOf(item)) return set('discovery', 'The source identity is missing or invalid. Identify the source before reviewing it.');
    const matchingDecisions = (decisions.get(JSON.stringify([item.id, item.sourceVersion])) || []).filter(decision =>
      belongs(decision, communityId) && urlOf(decision) === urlOf(item)
      && (!item.factId || decision.factId === item.factId));
    const decision = latestReviewDecision(matchingDecisions);
    effectiveDecision = decision;
    if (decision && RESOLVED.has(decision.decision)) {
      return set('history', 'An owner decision already resolved this exact saved version.');
    }
    const scopeRows = audits.get(urlOf(item)) || [];
    const inScope = scopeRows.some(row => row.scopeStatus === 'in-scope');
    if (!inScope && scopeRows.length && scopeRows.every(row => row.scopeStatus === 'out-of-scope'
      || ['out-of-scope', 'technical-exclusion'].includes(row.disposition))) {
      return set('outside', 'The completed scope review placed this URL outside the selected categories.');
    }
    const observations = candidates.get(sourceKey(item)) || [];
    const dates = observations.map(observationTime);
    const hasUndated = dates.some(date => date === null);
    const latestTime = dates.length && !hasUndated ? Math.max(...dates) : null;
    const newest = observations.filter(source => observationTime(source) === latestTime);
    const versions = new Set(newest.map(source => `${source.hashScheme || ''}:${versionOf(source)}`));
    const certain = snapshotFresh && latestTime !== null && latestTime <= checkedAt
      && now - latestTime <= maxAgeMs && versions.size === 1;
    const exactCurrent = certain && newest.some(source => exactSource(item, source));
    const regenerated = proposals.get(JSON.stringify([item.id, item.sourceVersion])) || [];
    const proposalVariants = new Set(regenerated.map(proposal => proposalPayload(proposal, communityId)));
    const exactProposal = proposalVariants.size === 1 && proposalVariants.has(proposalPayload(item, communityId));
    const actionable = exactCurrent && exactProposal && ['pending', 'escalated'].includes(effectiveStatus())
      && Boolean(item.id && item.kind && item.sourceId && item.sourceVersion)
      && !['source-removal', 'source-retirement'].includes(item.kind);
    if (!inScope) return set('discovery', 'This URL has not been assigned to one of the selected categories. Review its usefulness first.', actionable);
    if (matchingDecisions.length && !decision) return set('comparison', 'Saved decisions have missing dates or conflict. Resolve the decision history first.');
    if (!decision && (canonicalScope(item) || scopeRows.some(row => completedScope(item, row)))) {
      return set('history', 'This exact content version and its permitted scope were already handled by the completed review; this does not approve other claims.');
    }
    const priorTime = observationTime(item);
    if (!decision && certain && priorTime !== null && latestTime > priorTime && newest.every(source => compatible(item, source))
      && (newest.every(source => !exactSource(item, source)) || item.kind === 'source-removal')) {
      return set('history', 'A later successful observation of this same source supersedes this saved version or absence report.');
    }
    if (exactCurrent && !['source-removal', 'source-retirement'].includes(item.kind)) {
      if (!exactProposal) return set('comparison', regenerated.length
        ? 'The current proposal differs from this saved entry or has conflicting copies. Compare its exact evidence before deciding.'
        : 'This saved proposal is absent from the current review snapshot. Compare it before making a decision; absence is not resolution.');
      return set('current', 'This is the latest successfully observed version of an in-scope source. Its proposed content still needs its own review.', actionable);
    }
    return set('comparison', !snapshotFresh
      ? 'A fresh successful source check is unavailable. Keep this entry visible until its version can be compared.'
      : versions.size > 1 || hasUndated
        ? 'Source observations disagree or lack dates. Currentness needs comparison.'
        : 'This saved version cannot yet be matched to a current source. A missing crawl entry does not prove retirement.');
  }

  for (const group of groups.values()) {
    const variants = indexBy(group, payload);
    for (const duplicates of variants.values()) {
      const item = classify(duplicates[0], variants.size > 1);
      items.push({ ...item, duplicateCount: duplicates.length, savedRecordIds: duplicates.map(row => row.notionPageId).filter(Boolean) });
    }
  }
  const summary = { current: 0, comparison: 0, discovery: 0, history: 0, outside: 0,
    pending: 0, savedItemCount: saved.length, displayedItemCount: items.length,
    duplicateCount: saved.length - items.length, decisionCount: records.filter(row => row.recordType === 'decision').length,
    snapshotFresh, snapshotCheckedAt: snapshot.checkedAt || null };
  for (const item of items) summary[item.queueBucket] += 1;
  summary.pending = summary.current + summary.comparison + summary.discovery;
  return { items, summary };
}

module.exports = { classifyReviewRecords };

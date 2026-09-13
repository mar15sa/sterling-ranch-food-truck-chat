const scope = require('../data/community-document-dispositions.json');

function idSet(values = []) {
  return new Set(values.map(String));
}

function categorySummary(category, readiness) {
  const ids = idSet(category.documentIds);
  const count = (values = []) => values.filter(id => ids.has(String(id))).length;
  const activeEvidence = count(readiness.activeEvidenceDocumentIds);
  const actionOnly = count(readiness.actionOnlyDocumentIds);
  const heldForReview = count(readiness.heldForReviewDocumentIds);
  const excluded = count(readiness.excludedDocumentIds);
  return {
    id: category.id,
    title: category.title,
    total: ids.size,
    handled: activeEvidence + actionOnly + excluded,
    activeEvidence,
    actionOnly,
    heldForReview,
    excluded,
    complete: heldForReview === 0,
  };
}

function buildCommunitySourceReadiness(status = {}, reviewSummary = {}) {
  const readiness = scope.answerReadiness || {};
  const categories = (scope.categories || []).map(category => categorySummary(category, readiness));
  const total = (scope.records || []).length;
  const activeEvidence = (readiness.activeEvidenceDocumentIds || []).length;
  const actionOnly = (readiness.actionOnlyDocumentIds || []).length;
  const heldForReview = (readiness.heldForReviewDocumentIds || []).length;
  const excluded = (readiness.excludedDocumentIds || []).length;
  const classified = new Set((scope.records || []).map(record => String(record.documentId))).size;
  const handled = activeEvidence + actionOnly + excluded;
  const expiredSources = Number(status.expiredApprovedSourceCount || 0);
  const expiredFacts = Number(status.expiredApprovedFactCount || 0);
  const conflicts = Number(status.conflictedFactCount || 0);
  const crawlFailures = Number(status.failureCount || 0);
  const current = status.approvedEvidenceCurrent === true;
  const complete = classified === total && heldForReview === 0;
  const ready = current && complete && crawlFailures === 0;
  const reasons = [];
  if (!current) reasons.push(`${expiredSources} approved sources and ${expiredFacts} approved facts need a current-source check.`);
  if (heldForReview) reasons.push(`${heldForReview} necessary documents are safely withheld until their specialist or claim review is complete.`);
  if (crawlFailures) reasons.push(`${crawlFailures} source checks failed.`);
  return {
    scopeId: scope.decisionId,
    scopeTitle: 'The four answer categories you approved',
    decidedAt: scope.decidedAt,
    checkedAt: new Date().toISOString(),
    state: ready ? 'ready' : 'needs-attention',
    headline: ready ? 'Ready for complete answers' : 'Not fully ready yet',
    explanation: ready
      ? 'The approved evidence is current and every necessary document in this scope is available to answers.'
      : 'The safety controls are working, but currentness or coverage gaps can still make some answers less complete or specific.',
    reasons,
    totals: { total, classified, handled, activeEvidence, actionOnly, heldForReview, excluded },
    categories,
    remainingWork: readiness.heldDetails || [],
    evidence: {
      current,
      expiredSources,
      expiredFacts,
      crawlFailures,
      lastSnapshotAt: status.generatedAt || null,
      lastApprovedEvidenceCheckAt: status.approvedEvidenceLastCheckedAt || null,
      sourceCount: Number(status.sourceCount || 0),
      approvedFactCount: Number(status.approvedFactCount || 0),
      liveConnectorCount: Number(status.liveConnectorCount || 0),
    },
    safeguards: {
      withheldConflictCount: conflicts,
      pendingReviewCount: Number(reviewSummary.pending ?? status.sourceReview?.pendingItemCount ?? 0),
      pendingSensitiveReviewCount: Number(reviewSummary.sensitive ?? status.sourceReview?.pendingSensitiveReviewCount ?? 0),
    },
    inventory: {
      discovered: Number(status.discoveredPageCount || 0),
      eligible: Number(status.eligiblePageCount || 0),
      indexed: Number(status.pageCount || 0),
      excluded: Number(status.excludedPageCount || 0),
      backlog: Number(status.inventoryBacklog || 0),
      complete: status.inventoryComplete === true,
      note: 'This is site-wide discovery bookkeeping. It is separate from the confirmed 27-document scope above.',
    },
  };
}

module.exports = { buildCommunitySourceReadiness, categorySummary };

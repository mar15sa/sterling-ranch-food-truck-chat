const scope = require('../data/community-document-dispositions.json');
const pageScope = require('../data/community-page-dispositions.json');

function idSet(values = []) {
  return new Set(values.map(String));
}

function categorySummary(category, readiness) {
  const ids = idSet(category.documentIds);
  const metadata = new Map((scope.documents || []).map(document => [String(document.documentId), document]));
  const records = new Map((scope.records || []).map(record => [String(record.documentId), record]));
  const heldDetails = new Map((readiness.heldDetails || []).map(item => [String(item.documentId), item]));
  const activeIds = idSet(readiness.activeEvidenceDocumentIds);
  const actionIds = idSet(readiness.actionOnlyDocumentIds);
  const heldIds = idSet(readiness.heldForReviewDocumentIds);
  const excludedIds = idSet(readiness.excludedDocumentIds);
  const count = (values = []) => values.filter(id => ids.has(String(id))).length;
  const activeEvidence = count(readiness.activeEvidenceDocumentIds);
  const actionOnly = count(readiness.actionOnlyDocumentIds);
  const heldForReview = count(readiness.heldForReviewDocumentIds);
  const excluded = count(readiness.excludedDocumentIds);
  const pages = (pageScope.records || []).filter(page => page.categoryId === category.id).map(page => ({
    ...page,
    status: page.disposition === 'answer-evidence' ? 'active'
      : page.disposition === 'safe-link' ? 'action'
        : page.disposition === 'live-feed' ? 'live'
          : page.disposition === 'review-required' ? 'held' : 'excluded',
  }));
  const pageCounts = {
    total: pages.length,
    answerEvidence: pages.filter(page => page.disposition === 'answer-evidence').length,
    safeLink: pages.filter(page => page.disposition === 'safe-link').length,
    liveFeed: pages.filter(page => page.disposition === 'live-feed').length,
    reviewRequired: pages.filter(page => page.disposition === 'review-required').length,
    excluded: pages.filter(page => page.disposition === 'excluded').length,
  };
  return {
    id: category.id,
    title: category.title,
    total: ids.size,
    handled: activeEvidence + actionOnly + excluded,
    activeEvidence,
    actionOnly,
    heldForReview,
    excluded,
    complete: heldForReview === 0 && pageCounts.reviewRequired === 0,
    pages,
    pageCounts,
    documents: [...ids].map(documentId => {
      const detail = metadata.get(documentId) || {};
      const record = records.get(documentId) || {};
      const held = heldDetails.get(documentId);
      const status = activeIds.has(documentId) ? 'active'
        : actionIds.has(documentId) ? 'action'
          : heldIds.has(documentId) ? 'held'
            : excludedIds.has(documentId) ? 'excluded' : 'unclassified';
      return {
        documentId,
        title: detail.title || held?.title || `Document ${documentId}`,
        sourceUrl: detail.sourceUrl || null,
        status,
        reason: record.reason || '',
        nextStep: held?.nextStep || '',
      };
    }),
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
  const pageTotals = {
    total: (pageScope.records || []).length,
    answerEvidence: (pageScope.records || []).filter(page => page.disposition === 'answer-evidence').length,
    safeLink: (pageScope.records || []).filter(page => page.disposition === 'safe-link').length,
    liveFeed: (pageScope.records || []).filter(page => page.disposition === 'live-feed').length,
    reviewRequired: (pageScope.records || []).filter(page => page.disposition === 'review-required').length,
    excluded: (pageScope.records || []).filter(page => page.disposition === 'excluded').length,
  };
  const expiredSources = Number(status.expiredApprovedSourceCount || 0);
  const expiredFacts = Number(status.expiredApprovedFactCount || 0);
  const conflicts = Number(status.conflictedFactCount || 0);
  const crawlFailures = Number(status.failureCount || 0);
  const current = status.approvedEvidenceCurrent === true;
  const complete = classified === total && heldForReview === 0 && pageTotals.reviewRequired === 0;
  const ready = current && complete && crawlFailures === 0;
  const reasons = [];
  if (!current) reasons.push(`${expiredSources} approved sources and ${expiredFacts} approved facts need a current-source check.`);
  if (heldForReview) reasons.push(`${heldForReview} necessary documents are safely withheld until their specialist or claim review is complete.`);
  if (pageTotals.reviewRequired) reasons.push(`${pageTotals.reviewRequired} useful CAB pages still need claim-by-claim review; their unapproved content is withheld.`);
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
    totals: { total, classified, handled, activeEvidence, actionOnly, heldForReview, excluded, pages: pageTotals },
    categories,
    remainingWork: (readiness.heldDetails || []).map(item => {
      const document = (scope.documents || []).find(entry => String(entry.documentId) === String(item.documentId)) || {};
      return { ...item, title: document.title || item.title, sourceUrl: document.sourceUrl || null };
    }),
    pageRemainingWork: (pageScope.records || []).filter(page => page.disposition === 'review-required'),
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
    pageAudit: {
      scopeId: pageScope.decisionId,
      decidedAt: pageScope.decidedAt,
      total: pageTotals.total,
      ...pageTotals,
      note: pageScope.scope,
    },
  };
}

module.exports = { buildCommunitySourceReadiness, categorySummary };

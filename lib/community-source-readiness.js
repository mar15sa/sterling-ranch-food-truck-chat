const documentScope = require('../data/community-document-dispositions.json');
const fullAudit = require('../data/community-full-url-audit.json');

const PRIMARY_DISPOSITIONS = new Set([
  'answer-evidence', 'safe-link', 'live-feed', 'review-required', 'unavailable-recheck', 'excluded',
]);

function statusFor(disposition) {
  return disposition === 'answer-evidence' ? 'active'
    : disposition === 'safe-link' ? 'action'
      : disposition === 'live-feed' ? 'live'
        : disposition === 'review-required' || disposition === 'unavailable-recheck' ? 'held'
          : 'excluded';
}

function sourceView(record) {
  return {
    ...record,
    status: statusFor(record.disposition),
    nextStep: record.disposition === 'review-required'
      ? 'Review the exact claims before allowing this source to support resident answers.'
      : record.disposition === 'unavailable-recheck'
        ? 'Retry this source, then review any useful claims before approval.'
        : '',
  };
}

function categorySummary(category) {
  const all = fullAudit.records.filter(record => record.categoryIds.includes(category.id));
  const primary = all.filter(record => PRIMARY_DISPOSITIONS.has(record.disposition));
  const documents = primary.filter(record => record.kind === 'document').map(sourceView);
  const pages = primary.filter(record => record.kind === 'page').map(sourceView);
  const count = disposition => primary.filter(record => record.disposition === disposition).length;
  const pageCounts = {
    total: pages.length,
    answerEvidence: pages.filter(page => page.disposition === 'answer-evidence').length,
    safeLink: pages.filter(page => page.disposition === 'safe-link').length,
    liveFeed: pages.filter(page => page.disposition === 'live-feed').length,
    reviewRequired: pages.filter(page => page.disposition === 'review-required').length,
    unavailableRecheck: pages.filter(page => page.disposition === 'unavailable-recheck').length,
    excluded: pages.filter(page => page.disposition === 'excluded').length,
  };
  const heldForReview = count('review-required') + count('unavailable-recheck');
  return {
    id: category.id,
    title: category.title,
    auditedUrls: all.length,
    total: primary.length,
    handled: count('answer-evidence') + count('safe-link') + count('live-feed') + count('excluded'),
    activeEvidence: count('answer-evidence'),
    actionOnly: count('safe-link'),
    liveFeed: count('live-feed'),
    heldForReview,
    reviewRequired: count('review-required'),
    unavailableRecheck: count('unavailable-recheck'),
    excluded: count('excluded'),
    duplicateUrls: all.filter(record => record.disposition === 'duplicate').length,
    technicalRoutes: all.filter(record => record.disposition === 'technical-exclusion').length,
    complete: heldForReview === 0,
    documents,
    pages,
    pageCounts,
  };
}

function buildCommunitySourceReadiness(status = {}, reviewSummary = {}) {
  const categories = fullAudit.categories.map(categorySummary);
  const byDisposition = fullAudit.totals.byDisposition;
  const reviewRequired = byDisposition['review-required'] || 0;
  const unavailableRecheck = byDisposition['unavailable-recheck'] || 0;
  const expiredSources = Number(status.expiredApprovedSourceCount || 0);
  const expiredFacts = Number(status.expiredApprovedFactCount || 0);
  const conflicts = Number(status.conflictedFactCount || 0);
  const current = status.approvedEvidenceCurrent === true;
  const inventoryReconciled = fullAudit.inventory.pending === 0
    && fullAudit.totals.audited === fullAudit.inventory.discovered;
  const ready = current && inventoryReconciled && reviewRequired === 0 && unavailableRecheck === 0;
  const reasons = [];
  if (!current) reasons.push(`${expiredSources} approved sources and ${expiredFacts} approved facts need a current-source check.`);
  if (reviewRequired) reasons.push(`${reviewRequired} useful sources are identified but safely withheld until their exact claims are reviewed.`);
  if (unavailableRecheck) reasons.push(`${unavailableRecheck} useful sources need another retrieval attempt before they can be reviewed.`);
  if (fullAudit.inventory.failureCount) reasons.push(`${fullAudit.inventory.failureCount} out-of-scope CAB route returned an access error; it is recorded and does not create a gap in the four selected categories.`);

  const heldDetails = documentScope.answerReadiness?.heldDetails || [];
  const documentById = new Map((documentScope.documents || []).map(item => [String(item.documentId), item]));
  const remainingWork = heldDetails.map(item => {
    const document = documentById.get(String(item.documentId)) || {};
    return { ...item, title: document.title || item.title, sourceUrl: document.sourceUrl || null };
  });
  const sourceRemainingWork = fullAudit.records
    .filter(record => record.scopeStatus === 'in-scope'
      && (record.disposition === 'review-required' || record.disposition === 'unavailable-recheck'))
    .map(sourceView);

  return {
    scopeId: fullAudit.decisionId,
    scopeTitle: 'The four answer categories you approved',
    decidedAt: fullAudit.auditedAt,
    checkedAt: new Date().toISOString(),
    state: ready ? 'ready' : 'needs-attention',
    headline: ready ? 'Fully inventoried and answer-ready' : 'Full inventory complete; answer review remains',
    explanation: ready
      ? 'Every discovered CAB URL was assessed, and all useful primary sources are ready for their approved role.'
      : 'Every discovered CAB URL has been assessed. Useful content is only used after the appropriate claim-level approval, so identified review gaps remain visible below.',
    reasons,
    totals: {
      audited: fullAudit.totals.audited,
      inScopeUrls: fullAudit.totals.inScope,
      primarySources: fullAudit.totals.primaryInScope,
      outOfScope: fullAudit.totals.outOfScope,
      answerEvidence: byDisposition['answer-evidence'] || 0,
      safeLink: byDisposition['safe-link'] || 0,
      liveFeed: byDisposition['live-feed'] || 0,
      reviewRequired,
      unavailableRecheck,
      excluded: byDisposition.excluded || 0,
      duplicates: byDisposition.duplicate || 0,
      technicalExclusions: byDisposition['technical-exclusion'] || 0,
    },
    categories,
    remainingWork,
    sourceRemainingWork,
    pageRemainingWork: sourceRemainingWork,
    evidence: {
      current,
      expiredSources,
      expiredFacts,
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
      ...fullAudit.inventory,
      audited: fullAudit.totals.audited,
      reconciled: inventoryReconciled,
      outOfScope: fullAudit.totals.outOfScope,
      note: 'This full audit classifies every discovered CAB URL. One source may support more than one category, so category counts can overlap.',
    },
    pageAudit: {
      scopeId: fullAudit.decisionId,
      decidedAt: fullAudit.auditedAt,
      total: fullAudit.totals.audited,
      note: fullAudit.scope,
    },
  };
}

module.exports = { buildCommunitySourceReadiness, categorySummary };

const RESOLVED_DECISIONS = new Set(['approve-proposed', 'keep-current', 'mark-current-superseded', 'exclude-page']);

function latestReviewDecision(matching = []) {
  if (!matching.length) return null;
  const dated = matching.map(decision => ({ decision, time: Date.parse(decision.decidedAt || decision.createdAt || '') }));
  if (dated.some(item => !Number.isFinite(item.time))) return null;
  const latestTime = Math.max(...dated.map(item => item.time));
  const latest = dated.filter(item => item.time === latestTime);
  if (new Set(latest.map(item => item.decision.decision)).size !== 1) return null;
  const selected = latest.sort((a, b) => String(a.decision.id || '').localeCompare(String(b.decision.id || '')))[0].decision;
  return RESOLVED_DECISIONS.has(selected.decision) || selected.decision === 'escalate' ? selected : null;
}

// An escalation records activity, not resolution. Only the latest decision for
// the exact reviewed version can remove an item from the outstanding queue.
function pendingReviewItems(records = []) {
  const decisions = new Map();
  for (const record of records.filter(record => record.recordType === 'decision')) {
    const key = JSON.stringify([record.reviewId, record.sourceVersion]);
    const group = decisions.get(key) || [];
    group.push(record);
    decisions.set(key, group);
  }
  return records.filter(record => {
    if (record.recordType !== 'review-item') return false;
    const matching = decisions.get(JSON.stringify([record.id, record.sourceVersion])) || [];
    if (!matching.length) return true;
    // Unknown ordering or contradictory decisions at the same time require
    // attention rather than silently treating the review as complete.
    return !RESOLVED_DECISIONS.has(latestReviewDecision(matching)?.decision);
  });
}

module.exports = { pendingReviewItems, latestReviewDecision };

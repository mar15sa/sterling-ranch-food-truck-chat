const { pendingReviewItems } = require("./community-review-queue");
const { factApprovalIsExplicit } = require("./community-truth");
const { isRevalidatableApprovedSource } = require("./community-approved-revalidation");

const DAY_MS = 24 * 60 * 60 * 1000;

function dateMs(value) {
  const result = Date.parse(value || "");
  return Number.isFinite(result) ? result : null;
}

function ageDays(value, now) {
  const created = dateMs(value);
  return created === null ? null : Math.max(0, Math.floor((now - created) / DAY_MS));
}

function expiryCounts(records, now, soonMs) {
  const result = { expired: 0, dueSoon: 0, missingExpiry: 0 };
  for (const record of records) {
    const expires = dateMs(record.staleAfter);
    if (expires === null) result.missingExpiry += 1;
    else if (expires < now) result.expired += 1;
    else if (expires <= now + soonMs) result.dueSoon += 1;
  }
  return result;
}

function inventoryScope(index = {}) {
  return String(index.inventory?.accountingScope || index.inventory?.snapshotId || index.inventorySnapshotId || "").trim();
}

function inventorySummary(index = {}) {
  const inventory = index.inventory || {};
  return {
    discoveredCount: Number(inventory.discoveredCount || 0),
    eligibleCount: Number(inventory.eligibleCount || 0),
    indexedPageCount: Number(inventory.indexedPageCount || index.pageCount || 0),
    excludedCount: Number(inventory.excludedCount || 0),
    pendingCount: Number(inventory.pendingCount || 0),
    complete: inventory.complete === true,
    scope: inventoryScope(index),
  };
}

function inventoryTrend(current, previous = {}) {
  const prior = previous.inventory;
  if (!current.scope) return { status: "unavailable", reason: "The inventory snapshot has no stable accounting scope, so totals are not compared across crawl boundaries." };
  if (!prior || (prior.scope || prior.accountingScope) !== current.scope) return { status: "baseline", reason: "No prior report exists for this inventory accounting scope." };
  return {
    status: "comparable",
    pendingCountDelta: current.pendingCount - Number(prior.pendingCount || 0),
    indexedPageCountDelta: current.indexedPageCount - Number(prior.indexedPageCount || 0),
    eligibleCountDelta: current.eligibleCount - Number(prior.eligibleCount || 0),
    discoveredCountDelta: current.discoveredCount - Number(prior.discoveredCount || 0),
  };
}

function queueSummary(records = [], now) {
  const pending = pendingReviewItems(records);
  const ages = pending.map((item) => ageDays(item.createdAt, now)).filter((age) => age !== null);
  return {
    pendingCount: pending.length,
    pendingSensitiveCount: pending.filter((item) => item.sensitive || item.risk === "high").length,
    unknownCreatedAtCount: pending.length - ages.length,
    oldestAgeDays: ages.length ? Math.max(...ages) : 0,
    olderThan7DaysCount: ages.filter((age) => age >= 7).length,
    olderThan30DaysCount: ages.filter((age) => age >= 30).length,
  };
}

// This report deliberately exposes counts and age buckets only. Review item
// titles, source URLs, excerpts, decisions, and owner notes stay in Notion.
function buildSourceOperationsReport({ index = {}, reviewRecords = [], previousReport = {}, now = Date.now(), expirySoonDays = 7, revalidation = {} } = {}) {
  const soonMs = Number(expirySoonDays) * DAY_MS;
  const sources = (index.sources || []).filter((source) => isRevalidatableApprovedSource(source, index));
  const facts = (index.factLedger || []).filter(factApprovalIsExplicit);
  const inventory = inventorySummary(index);
  const unresolvedSensitiveConflictCount = Number(index.truthStatus?.unresolvedSensitiveConflictCount || 0);
  const unresolvedConflictCount = Number(index.truthStatus?.unresolvedConflictCount || unresolvedSensitiveConflictCount);
  return {
    schemaVersion: 1,
    generatedAt: new Date(now).toISOString(),
    approvedBundle: {
      revalidationStatus: revalidation.status || "not-run",
      revalidationCheckedUrlCount: Number(revalidation.checkedUrlCount || 0),
      expiredSources: expiryCounts(sources, now, soonMs).expired,
      expirySoonSources: expiryCounts(sources, now, soonMs).dueSoon,
      expiredFacts: expiryCounts(facts, now, soonMs).expired,
      expirySoonFacts: expiryCounts(facts, now, soonMs).dueSoon,
      sourcesMissingExpiry: expiryCounts(sources, now, soonMs).missingExpiry,
      factsMissingExpiry: expiryCounts(facts, now, soonMs).missingExpiry,
    },
    reviewQueue: queueSummary(reviewRecords, now),
    conflicts: { unresolvedConflictCount, unresolvedSensitiveConflictCount },
    inventory,
    inventoryTrend: inventoryTrend(inventory, previousReport),
    // Inventory incompleteness is accounting work. It is intentionally not a
    // resident-answer safety failure or a source approval decision.
    residentSafety: {
      inventoryBlocksResidentSafety: false,
      approvedEvidenceNeedsAttention: Boolean(revalidation.status && revalidation.status !== "passed")
        || expiryCounts(sources, now, soonMs).expired > 0
        || expiryCounts(facts, now, soonMs).expired > 0,
    },
  };
}

function reportMarkdown(report = {}, { monthly = false } = {}) {
  const bundle = report.approvedBundle || {};
  const queue = report.reviewQueue || {};
  const conflicts = report.conflicts || {};
  const inventory = report.inventory || {};
  const trend = report.inventoryTrend || {};
  const title = monthly ? "# Community source monthly accuracy report" : "# Community source operations report";
  const trendLine = trend.status === "comparable"
    ? `Backlog change: ${trend.pendingCountDelta >= 0 ? "+" : ""}${trend.pendingCountDelta}; indexed-page change: ${trend.indexedPageCountDelta >= 0 ? "+" : ""}${trend.indexedPageCountDelta}.`
    : trend.reason || "No comparable inventory trend is available.";
  return `${title}\n\nGenerated: ${report.generatedAt}\n\n## Approved-bundle safety\n\n- Exact revalidation: ${bundle.revalidationStatus || "not-run"} (${bundle.revalidationCheckedUrlCount || 0} due URLs checked)\n- Expired approved sources/facts: ${bundle.expiredSources || 0}/${bundle.expiredFacts || 0}\n- Expiring within 7 days: ${bundle.expirySoonSources || 0} sources, ${bundle.expirySoonFacts || 0} facts\n\n## Private review queue\n\n- Pending items: ${queue.pendingCount || 0}; sensitive: ${queue.pendingSensitiveCount || 0}\n- Oldest pending age: ${queue.oldestAgeDays || 0} days; 7+ days: ${queue.olderThan7DaysCount || 0}; 30+ days: ${queue.olderThan30DaysCount || 0}\n\n## Withheld conflicts\n\n- Unresolved conflicts: ${conflicts.unresolvedConflictCount || 0}; sensitive: ${conflicts.unresolvedSensitiveConflictCount || 0}\n\n## Coverage accounting\n\n- Discovered/eligible/indexed/excluded/backlog: ${inventory.discoveredCount || 0}/${inventory.eligibleCount || 0}/${inventory.indexedPageCount || 0}/${inventory.excludedCount || 0}/${inventory.pendingCount || 0}\n- Complete: ${inventory.complete === true ? "yes" : "no"}\n- ${trendLine}\n\nInventory incompleteness is reported separately and does not block resident safety. This report contains aggregate counts only; private review records remain in Notion.\n`;
}

module.exports = { DAY_MS, buildSourceOperationsReport, inventoryScope, inventorySummary, inventoryTrend, queueSummary, reportMarkdown };

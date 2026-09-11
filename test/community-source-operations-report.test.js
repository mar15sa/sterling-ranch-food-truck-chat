const test = require("node:test");
const assert = require("node:assert/strict");
const { buildSourceOperationsReport, reportMarkdown } = require("../lib/community-source-operations-report");
const { requireReviewConfiguration, revalidationSummary } = require("../scripts/report-community-source-operations");

const now = Date.parse("2026-09-10T12:00:00.000Z");

test("operations report keeps private review details out while reporting queue age, expiry, conflicts, and comparable inventory trend", () => {
  const index = {
    inventory: { accountingScope: "2026-september-crawl", discoveredCount: 100, eligibleCount: 80, indexedPageCount: 50, excludedCount: 20, pendingCount: 30, complete: false },
    sources: [
      { id: "fresh", sourceUrl: "https://example.test/fresh", contentHash: "a", staleAfter: "2026-09-11T11:59:59.000Z" },
      { id: "expired", sourceUrl: "https://example.test/expired", contentHash: "b", staleAfter: "2026-09-09T12:00:00.000Z" },
      { id: "candidate", sourceUrl: "https://example.test/candidate", contentHash: "c", reviewStatus: "candidate", staleAfter: "2026-09-09T12:00:00.000Z" },
    ],
    factLedger: [
      { id: "expired-fact", reviewStatus: "approved", sourceVersion: "b", reviewDecisionId: "owner", reviewedAt: "2026-09-01", reviewedBy: "owner", staleAfter: "2026-09-09T12:00:00.000Z" },
      { id: "baseline-fact", reviewStatus: "approved", sourceVersion: "a", staleAfter: "2026-09-09T12:00:00.000Z" },
    ],
    truthStatus: { unresolvedConflictCount: 4, unresolvedSensitiveConflictCount: 2 },
  };
  const reviewRecords = [{ id: "private-review-id", recordType: "review-item", sensitive: true, topic: "Private fee", sourceUrl: "https://example.test/private", createdAt: "2026-08-01T12:00:00.000Z" }];
  const report = buildSourceOperationsReport({ index, reviewRecords, now, previousReport: { inventory: { accountingScope: "2026-september-crawl", pendingCount: 35, indexedPageCount: 45, eligibleCount: 80, discoveredCount: 100 } }, revalidation: { status: "passed", checkedUrlCount: 2 } });

  assert.equal(report.approvedBundle.expiredSources, 1);
  assert.equal(report.approvedBundle.expirySoonSources, 1);
  assert.equal(report.approvedBundle.expiredFacts, 1, "baseline labels without an exact decision are not treated as approved facts");
  assert.deepEqual(report.reviewQueue, { pendingCount: 1, pendingSensitiveCount: 1, unknownCreatedAtCount: 0, oldestAgeDays: 40, olderThan7DaysCount: 1, olderThan30DaysCount: 1 });
  assert.deepEqual(report.conflicts, { unresolvedConflictCount: 4, unresolvedSensitiveConflictCount: 2 });
  assert.equal(report.inventoryTrend.pendingCountDelta, -5);
  assert.equal(report.residentSafety.inventoryBlocksResidentSafety, false);
  const markdown = reportMarkdown(report, { monthly: true });
  assert.doesNotMatch(markdown, /Private fee|private-review-id|example\.test\/private/);
});

test("inventory totals are not compared when accounting scope changes or is missing", () => {
  const report = buildSourceOperationsReport({ index: { inventory: { pendingCount: 99 } }, previousReport: { inventory: { accountingScope: "older", pendingCount: 1 } }, now });
  assert.equal(report.inventoryTrend.status, "unavailable");
  assert.match(report.inventoryTrend.reason, /not compared across crawl boundaries/i);
});

test("operations reporting only requires the existing read-only Notion credentials", () => {
  assert.doesNotThrow(() => requireReviewConfiguration({ token: "token", dataSourceId: "source", databaseId: "", titleProperty: "" }));
  assert.throws(() => requireReviewConfiguration({ token: "", dataSourceId: "", databaseId: "", titleProperty: "" }), /requires configured private review secrets.*COMMUNITY_SOURCE_REVIEW_NOTION_TOKEN/i);
});

test("revalidation attestation parsing preserves the bridge status and only exposes a count", () => {
  assert.deepEqual(revalidationSummary({ status: "failed", checks: [{ sourceUrl: "https://private.test/a" }, { sourceUrl: "https://private.test/b" }] }), {
    status: "failed", checkedUrlCount: 2,
  });
  assert.deepEqual(revalidationSummary({}), { status: "not-run", checkedUrlCount: 0 });
});

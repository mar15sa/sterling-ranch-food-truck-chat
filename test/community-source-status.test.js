const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { communitySourceStatus } = require("../lib/community-source-manager");
const { freshnessSummary } = require("../scripts/check-community-sources");

const approvedFact = (staleAfter) => ({
  sourceVersion: 'v1', reviewStatus: 'approved', reviewDecisionId: 'owner-decision',
  reviewedAt: '2026-08-31T00:00:00Z', reviewedBy: 'owner', staleAfter,
});

test("community answers preserve the complete rulebook source status", () => {
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.match(
    server,
    /answer\.sourceStatus\s*=\s*\{\s*\.\.\.status,\s*\.\.\.answer\.sourceStatus,\s*refreshing:/,
    "Community answers must include the complete status loaded before answering."
  );
});

test("community source status reports page coverage separately from searchable chunks", () => {
  const status = communitySourceStatus({
    communityId: "alpha",
    generatedAt: "2026-09-01T00:00:00.000Z",
    failureCount: 0,
    sources: [],
    inventory: { indexedPageCount: 88, discoveredCount: 120, eligibleCount: 100, pendingCount: 12, excludedCount: 20, complete: false },
  });
  assert.equal(status.sourceCount, 0);
  assert.equal(status.pageCount, 88);
  assert.equal(status.eligiblePageCount, 100);
  assert.equal(status.pendingPageCount, 12);
  assert.equal(status.inventoryAvailable, true);
  assert.equal(status.inventoryComplete, false);
  assert.equal(status.inventoryBacklog, 12);
  assert.equal(status.approvedEvidenceCurrent, false, "an empty index cannot be current evidence");
});

test("inventory backlog and expired approved evidence are separate release signals", () => {
  const expired = "2026-09-01T00:00:00.000Z";
  const index = {
    communityId: "alpha", sources: [{ id: "approved-page", sourceUrl: "https://alpha.gov/hours", staleAfter: expired }],
    inventory: { pendingCount: 875 },
    factLedger: [approvedFact(expired)],
  };
  const now = Date.parse("2026-09-02T00:00:00.000Z");
  const status = communitySourceStatus(index, now);
  assert.equal(status.inventoryBacklog, 875);
  assert.equal(status.expiredApprovedSourceCount, 1);
  assert.equal(status.staleOfficialPageCount, 1);
  assert.equal(status.expiredApprovedFactCount, 1);
  assert.equal(status.approvedEvidenceCurrent, false);
  assert.deepEqual(freshnessSummary(index, now), {
    inventoryBacklog: 875,
    expiredApprovedSourceCount: 1,
    expiredApprovedFactCount: 1,
  });
});

test("stale diagnostics count official pages separately from approved records", () => {
  const staleAfter = "2026-09-01T00:00:00.000Z";
  const status = communitySourceStatus({
    communityId: "alpha", failureCount: 0,
    sources: [
      { id: "page-chunk", sourceUrl: "https://alpha.gov/trash", staleAfter },
      { id: "approved-schedule", sourceUrl: "https://alpha.gov/trash", staleAfter },
      { id: "approved-link", sourceUrl: "https://alpha.gov/trash", staleAfter },
    ],
    factLedger: [],
  }, Date.parse("2026-09-02T00:00:00.000Z"), { includeStaleSources: true });
  assert.equal(status.staleSourceCount, 3);
  assert.equal(status.staleOfficialPageCount, 1);
  assert.equal(status.staleSourceGroups[0].recordCount, 3);
  assert.deepEqual(status.staleSourceGroups[0].records.map((record) => record.id), ["page-chunk", "approved-schedule", "approved-link"]);
});

test("approved evidence is current only when evidence exists without crawl failures or expiry", () => {
  const now = Date.parse("2026-09-02T00:00:00.000Z");
  const fresh = { communityId: "alpha", failureCount: 0, sources: [{ id: "approved-page", sourceUrl: "https://alpha.gov/hours", checkedAt: "2026-09-01T12:00:00.000Z", staleAfter: "2026-09-03T00:00:00.000Z" }], factLedger: [] };
  const publicStatus = communitySourceStatus(fresh, now);
  assert.equal(publicStatus.approvedEvidenceCurrent, true);
  assert.equal(Object.hasOwn(publicStatus, "approvedEvidenceLastCheckedAt"), false);
  assert.equal(
    communitySourceStatus(fresh, now, { includeApprovedEvidenceCheckTime: true }).approvedEvidenceLastCheckedAt,
    "2026-09-01T12:00:00.000Z",
  );
  assert.equal(communitySourceStatus({ ...fresh, failureCount: 1 }, now).approvedEvidenceCurrent, false);
  assert.equal(communitySourceStatus(fresh, now, { refreshError: "refresh timed out" }).approvedEvidenceCurrent, false);
});

test("fact-only expiry marks community source health stale", () => {
  const now = Date.parse("2026-09-02T00:00:00.000Z");
  const status = communitySourceStatus({
    communityId: "alpha", failureCount: 0,
    sources: [{ id: "fresh-page", sourceUrl: "https://alpha.gov/hours", staleAfter: "2026-09-03T00:00:00.000Z" }],
    factLedger: [approvedFact("2026-09-01T00:00:00.000Z")],
  }, now);
  assert.equal(status.expiredApprovedSourceCount, 0);
  assert.equal(status.expiredApprovedFactCount, 1);
  assert.equal(status.stale, true);
  assert.equal(status.approvedEvidenceCurrent, false);
});

test("source audit never returns a current-evidence pass when the crawl has failures", () => {
  const bundled = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "community-index.json"), "utf8"));
  bundled.failureCount = 1;
  bundled.failures = [{ url: "https://sterlingranchcab.com/unavailable", error: "HTTP 503" }];
  assert.throws(() => require("../scripts/check-community-sources").audit(bundled), /crawl reported 1 failure/i);
});

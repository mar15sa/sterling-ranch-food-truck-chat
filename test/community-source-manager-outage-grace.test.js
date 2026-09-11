const test = require("node:test");
const assert = require("node:assert/strict");
const { getCommunityIndex, revalidateDueApprovedEvidence } = require("../lib/community-source-manager");

const NOW = Date.parse("2026-09-11T07:00:56.000Z");
const EXPIRED = new Date(NOW - (6 * 60 * 60 * 1000)).toISOString();
const CHECKED = new Date(NOW - (30 * 60 * 60 * 1000)).toISOString();

function timeout() {
  const error = new Error("request timed out");
  error.name = "TimeoutError";
  return error;
}

function runtimeIndex(count = 3) {
  const sources = [];
  const factLedger = [];
  for (let position = 1; position <= count; position += 1) {
    const id = `static-${position}`;
    const contentHash = `hash-${position}`;
    sources.push({ id, communityId: "alpha", title: `Page ${position}`, sourceUrl: `https://alpha.gov/page-${position}`,
      contentHash, text: `Approved guidance ${position}.`, connectorType: "civicplus-pages", sourceType: "services",
      reviewStatus: "approved", checkedAt: CHECKED, staleAfter: EXPIRED, actions: [] });
    factLedger.push({ id: `fact-${position}`, sourceId: id, sourceVersion: contentHash, reviewStatus: "approved",
      reviewDecisionId: `owner-${position}`, reviewedBy: "owner", reviewedAt: CHECKED,
      lastObservedAt: CHECKED, staleAfter: EXPIRED });
  }
  sources.push({ id: "live-status", communityId: "alpha", title: "Live status", sourceUrl: "https://alpha.gov/page-1",
    contentHash: "live-value", text: "Open", connectorType: "live-status", sourceType: "status",
    reviewStatus: "approved", checkedAt: CHECKED, staleAfter: EXPIRED, actions: [] });
  return { communityId: "alpha", sources, factLedger };
}

test("production revalidation keeps recent exact static evidence through a broad transient outage", async () => {
  const index = runtimeIndex();
  const result = await revalidateDueApprovedEvidence({
    index,
    replaceCurrent: true,
    now: NOW,
    fetchObservedHashes: async () => { throw timeout(); },
  });
  const active = getCommunityIndex({ refreshIfStale: false });
  assert.equal(active, result.temporaryIndex, "production replaces its active index with the protected snapshot");
  assert.equal(result.graced.length, 3);
  assert.ok(active.sources.filter((source) => source.connectorType === "civicplus-pages")
    .every((source) => Date.parse(source.staleAfter) > NOW));
  assert.equal(active.sources.find((source) => source.id === "live-status").staleAfter, EXPIRED,
    "live connector evidence keeps its short freshness policy");
  assert.ok(active.sources.every((source) => source.checkedAt === CHECKED),
    "an outage must never look like a successful verification");
});

test("production revalidation withholds single-page and non-transient failures", async () => {
  const single = await revalidateDueApprovedEvidence({
    index: runtimeIndex(1), replaceCurrent: true, now: NOW,
    fetchObservedHashes: async () => { throw timeout(); },
  });
  assert.deepEqual(single.graced, []);
  assert.equal(getCommunityIndex({ refreshIfStale: false }).sources.find((source) => source.id === "static-1").staleAfter, EXPIRED);

  const verificationFailure = await revalidateDueApprovedEvidence({
    index: runtimeIndex(4), replaceCurrent: true, now: NOW,
    fetchObservedHashes: async () => { throw new Error("Extraction returned no usable text."); },
  });
  assert.deepEqual(verificationFailure.graced, []);
  assert.ok(getCommunityIndex({ refreshIfStale: false }).sources.filter((source) => source.connectorType === "civicplus-pages")
    .every((source) => source.staleAfter === EXPIRED));
});

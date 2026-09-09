const test = require("node:test");
const assert = require("node:assert/strict");
const { communitySourceStatus } = require("../lib/community-source-manager");
const { revalidateApprovedEvidence } = require("../lib/community-approved-revalidation");

const NOW = Date.parse("2026-09-08T23:00:00.000Z");
const EXPIRED = "2026-09-01T00:00:00.000Z";

function dueIndex(count = 51) {
  const sources = Array.from({ length: count }, (_, number) => ({
    id: `page-${number}`, sourceUrl: `https://alpha.gov/page-${number}`,
    contentHash: `hash-${number}`, actions: [], checkedAt: EXPIRED, staleAfter: EXPIRED,
    connectorType: "civicplus-pages", sourceType: "services", reviewStatus: "approved",
  }));
  return {
    communityId: "alpha", failureCount: 0, sources,
    factLedger: sources.map((source) => ({ id: `fact-${source.id}`, sourceId: source.id,
      sourceVersion: source.contentHash, reviewStatus: "approved", reviewDecisionId: `decision-${source.id}`,
      reviewedAt: EXPIRED, reviewedBy: 'owner', staleAfter: EXPIRED, lastObservedAt: EXPIRED })),
  };
}

test("a bounded startup pass renews every due exact approved version instead of stopping at an incremental crawl page cap", async () => {
  const index = dueIndex();
  let active = 0;
  let maxActive = 0;
  const result = await revalidateApprovedEvidence(index, {
    now: NOW, concurrency: 3,
    fetchObservedHashes: async (url) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      const number = Number(url.match(/(\d+)$/)[1]);
      return { observedHashes: [`hash-${number}`], actionMismatch: false };
    },
  });
  assert.equal(result.checks.length, 51);
  assert.equal(result.checks.every((check) => check.outcome === "renewed"), true);
  assert.ok(maxActive > 1 && maxActive <= 3, `expected bounded parallelism, received ${maxActive}`);
  assert.equal(communitySourceStatus(result.temporaryIndex, NOW).approvedEvidenceCurrent, true);
  assert.equal(communitySourceStatus(index, NOW).approvedEvidenceCurrent, false, "the approved input remains unchanged");
});

test("a changed page, changed action, or fetch failure remains stale while exact peers renew", async () => {
  const index = dueIndex(6);
  const result = await revalidateApprovedEvidence(index, {
    now: NOW, concurrency: 2,
    fetchObservedHashes: async (url) => {
      const number = Number(url.match(/(\d+)$/)[1]);
      if (number === 1) return { observedHashes: ["hash-1", "new-version"], actionMismatch: false };
      if (number === 2) return { observedHashes: ["hash-2"], actionMismatch: true };
      if (number === 3) throw new Error("network unavailable");
      return { observedHashes: [`hash-${number}`], actionMismatch: false };
    },
  });
  for (const number of [1, 2, 3]) {
    assert.equal(result.temporaryIndex.sources[number].staleAfter, EXPIRED, `page-${number} must remain withheld`);
    assert.equal(result.temporaryIndex.factLedger[number].staleAfter, EXPIRED, `fact-${number} must remain withheld`);
  }
  for (const number of [0, 4, 5]) assert.ok(Date.parse(result.temporaryIndex.sources[number].staleAfter) > NOW);
  assert.deepEqual(result.checks.filter((check) => check.outcome === "review-required").map((check) => check.sourceUrl), [
    "https://alpha.gov/page-1", "https://alpha.gov/page-2", "https://alpha.gov/page-3",
  ]);
  const status = communitySourceStatus(result.temporaryIndex, NOW);
  assert.equal(status.stale, true);
  assert.equal(status.approvedEvidenceCurrent, false);
});

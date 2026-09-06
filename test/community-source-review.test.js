const test = require("node:test");
const assert = require("node:assert/strict");
const { buildReviewItems, compileReviewedCandidate, reviewCoverage } = require("../lib/community-source-review");

const profile = {
  factAuthority: {
    fee: ["civicplus-pages"], contact: ["civicplus-pages"], restriction: ["municode", "civicplus-pages"],
    "live-status": ["live-status"], "facility-hours": ["civicplus-pages"], "reservation-policy": ["civicplus-pages"],
    submission: ["civicplus-pages"], "event-date": ["civicplus-calendar"],
  },
};
function source(hash, value = "$10") {
  return { id: "fees", communityId: "alpha", title: "Facility fees", sourceUrl: "https://alpha.gov/fees", sourceType: "facilities", connectorType: "civicplus-pages", authorityScore: 1, text: `The fee is ${value}.`, excerpt: `The fee is ${value}.`, actions: [], facts: [{ id: "fee", factKey: "fee", type: "money", value, context: `The fee is ${value}.` }], contentHash: hash, checkedAt: "2026-09-01T00:00:00Z", staleAfter: "2099-01-01T00:00:00Z" };
}

test("every material source change requires a hash-bound decision", () => {
  const trusted = { communityId: "alpha", sources: [source("old")], factLedger: [] };
  const candidate = { communityId: "alpha", generatedAt: "2026-09-01T00:00:00Z", sources: [source("new", "$12")] };
  const items = buildReviewItems(trusted, candidate, profile);
  assert.ok(items.some((item) => item.kind === "source-change"));
  assert.ok(reviewCoverage(items, []).pending.length > 0);
  const item = items.find((record) => record.kind === "source-change");
  const valid = { reviewId: item.id, sourceId: item.sourceId, sourceVersion: item.sourceVersion, sourceUrl: item.proposedSourceUrl, decision: "approve-proposed", note: "Confirmed", decidedAt: "2026-09-01T01:00:00Z" };
  assert.equal(reviewCoverage(items, [valid]).matched >= 1, true);
  assert.equal(reviewCoverage(items, [{ ...valid, sourceVersion: "changed-again" }]).matched, 0);
});

test("old decisions become stale only when that same source changes again", () => {
  const trusted = { communityId: "alpha", sources: [source("old")], factLedger: [] };
  const candidate = { communityId: "alpha", generatedAt: "2026-09-01T00:00:00Z", sources: [source("new", "$12")] };
  const items = buildReviewItems(trusted, candidate, profile);
  const result = compileReviewedCandidate(trusted, candidate, profile, [{ reviewId: "old-review", sourceId: "fees", sourceVersion: "older", sourceUrl: "https://alpha.gov/fees", decision: "approve-proposed" }]);
  assert.equal(result.staleDecisions.length, 1);
  const unrelated = compileReviewedCandidate(trusted, candidate, profile, [{ reviewId: "unrelated", sourceId: "other", sourceVersion: "older", sourceUrl: "https://alpha.gov/other", decision: "approve-proposed" }]);
  assert.equal(unrelated.staleDecisions.length, 0);
  assert.ok(items.length > 0);
});

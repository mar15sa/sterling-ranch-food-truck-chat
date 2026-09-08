const test = require("node:test");
const assert = require("node:assert/strict");
const { renewExactApprovedEvidence, selectRevalidationTargetUrls } = require("../scripts/revalidate-approved-community");

const url = "https://alpha.gov/pool";
const old = "2026-09-01T00:00:00.000Z";
const checkedAt = "2026-09-08T12:00:00.000Z";
const staleAfter = "2026-09-09T12:00:00.000Z";

function index() {
  return {
    sources: [
      { id: "approved", sourceUrl: url, contentHash: "same", staleAfter: old, checkedAt: old },
      { id: "changed", sourceUrl: url, contentHash: "changed", staleAfter: old, checkedAt: old },
      { id: "candidate", sourceUrl: url, contentHash: "candidate", reviewStatus: "candidate", staleAfter: old, checkedAt: old },
    ],
    factLedger: [
      { id: "approved-fact", sourceId: "approved", sourceVersion: "same", reviewStatus: "approved", staleAfter: old, lastObservedAt: old },
      { id: "candidate-fact", sourceId: "approved", sourceVersion: "same", reviewStatus: "candidate", staleAfter: old, lastObservedAt: old },
      { id: "changed-fact", sourceId: "changed", sourceVersion: "changed", reviewStatus: "approved", staleAfter: old, lastObservedAt: old },
    ],
  };
}

test("exact URL and hash renewal updates only matching approved source and fact versions", () => {
  const value = index();
  const result = renewExactApprovedEvidence(value, { sourceUrl: url, observedHashes: ["same"], checkedAt, staleAfter });
  assert.deepEqual(result.renewedSources.map((source) => source.id), ["approved"]);
  assert.deepEqual(result.renewedFacts.map((fact) => fact.id), ["approved-fact"]);
  assert.deepEqual(result.requiresReview.map((source) => source.id), ["changed"]);
  assert.deepEqual(value.sources[0], { id: "approved", sourceUrl: url, contentHash: "same", staleAfter, checkedAt });
  assert.equal(value.sources[1].staleAfter, old);
  assert.equal(value.sources[2].staleAfter, old);
  assert.equal(value.factLedger[0].lastObservedAt, checkedAt);
  assert.equal(value.factLedger[0].staleAfter, staleAfter);
  assert.equal(value.factLedger[1].lastObservedAt, old);
  assert.equal(value.factLedger[2].lastObservedAt, old);
});

test("an expired approved fact targets its active exact source version even when the source is fresh", () => {
  const value = index();
  value.sources[0].staleAfter = "2026-09-10T00:00:00.000Z";
  value.sources[1].staleAfter = "2026-09-10T00:00:00.000Z";
  value.factLedger[0].staleAfter = old;
  assert.deepEqual(selectRevalidationTargetUrls(value, Date.parse("2026-09-08T12:00:00.000Z")), [url]);

  const missingVersion = { ...value, factLedger: [{ ...value.factLedger[0], sourceVersion: "different" }] };
  assert.deepEqual(selectRevalidationTargetUrls(missingVersion, Date.parse("2026-09-08T12:00:00.000Z")), []);
});

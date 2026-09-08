const test = require("node:test");
const assert = require("node:assert/strict");
const { fingerprint } = require("../lib/community-release");
const { sourceReviewGate } = require("../lib/community-source-answerability");
const { runBridge } = require("../scripts/check-approved-community-revalidation");

const NOW = Date.parse("2026-09-08T12:00:00.000Z");
const URL = "https://alpha.gov/rules";
function index() {
  const source = { id: "rules", title: "Rules", sourceUrl: URL, sourceType: "rules", connectorType: "civicplus-pages", contentHash: "same", actions: [{ label: "Apply", url: "https://alpha.gov/apply", actionType: "submit" }], staleAfter: "2026-09-01T00:00:00.000Z", checkedAt: "2026-09-01T00:00:00.000Z" };
  return { communityId: "alpha", sources: [source], factLedger: [{ id: "rule-fact", sourceId: "rules", sourceVersion: "same", reviewStatus: "approved", staleAfter: source.staleAfter, lastObservedAt: source.checkedAt }] };
}
const observer = async () => ({ observedHashes: ["same"], actionMismatch: false });
const normalGate = (value) => {
  const source = value.sources[0];
  if (Date.parse(source.staleAfter) <= NOW || value.factLedger.some((fact) => fact.sourceVersion !== source.contentHash || Date.parse(fact.staleAfter) <= NOW)) throw new Error("stale fact/version");
  if (!sourceReviewGate(value, NOW)(source)) throw new Error("answer gate withheld temporary evidence");
};

test("unchanged proof renews only a temporary index and preserves the approved fingerprint", async () => {
  const approved = index();
  const before = structuredClone(approved);
  const result = await runBridge({ index: approved, now: NOW, fetchObservedHashes: observer, auditFn: normalGate });
  assert.equal(result.valid, true);
  assert.deepEqual(approved, before, "the checked-in input is never mutated");
  assert.equal(result.attestation.beforeApprovedFingerprint, fingerprint(approved));
  assert.equal(result.attestation.beforeApprovedFingerprint, result.attestation.afterApprovedFingerprint);
  assert.equal(result.temporaryIndex.sources[0].checkedAt, new Date(NOW).toISOString());
});

test("changed, missing, and fetch failures fail closed with review records", async () => {
  for (const observerResult of [
    async () => ({ observedHashes: ["changed"], actionMismatch: false }),
    async () => ({ observedHashes: ["same", "unapproved-extra"], actionMismatch: false }),
    async () => ({ observedHashes: [], actionMismatch: false }),
    async () => { throw new Error("network unavailable"); },
  ]) {
    const result = await runBridge({ index: index(), now: NOW, fetchObservedHashes: observerResult, auditFn: normalGate });
    assert.equal(result.valid, false);
    assert.equal(result.attestation.status, "failed");
    assert.equal(result.checks[0].outcome, "review-required");
  }
});

test("action changes, stale versions, and replayed expiry cannot make temporary evidence answerable", async () => {
  const actionChanged = await runBridge({ index: index(), now: NOW, fetchObservedHashes: async () => ({ observedHashes: ["same"], actionMismatch: true }), auditFn: normalGate });
  assert.equal(actionChanged.valid, false);
  const staleVersion = index();
  staleVersion.factLedger[0].sourceVersion = "missing-version";
  const missingProof = await runBridge({ index: staleVersion, now: NOW, fetchObservedHashes: observer, auditFn: normalGate });
  assert.equal(missingProof.valid, false);
  const replay = await runBridge({ index: index(), now: NOW, staleAfterMs: -1, fetchObservedHashes: observer, auditFn: normalGate });
  assert.equal(replay.valid, false);
});

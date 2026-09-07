const assert = require("node:assert/strict");
const test = require("node:test");
const { approvedSourceFingerprint, stripVolatile, validateEvidence } = require("../scripts/check-community-evidence-reuse");

const identity = {
  runtimeFingerprint: "a".repeat(64),
  sourceFingerprint: "b".repeat(64),
  configurationFingerprint: "c".repeat(64),
};

const observations = Array.from({ length: 150 }, (_, index) => ({
  id: `case-${index % 50}`,
  repeat: Math.floor(index / 50) + 1,
}));

function passingEvidence(overrides = {}) {
  return {
    result: "passed",
    candidateValid: true,
    generatedAt: "2026-09-07T00:00:00.000Z",
    identity,
    summary: {
      caseCount: 50,
      repeats: 3,
      runCount: 150,
      goalAndSubjectAccuracy: 1,
      intentAccuracy: 1,
      structuredAccuracy: 1,
      consistency: 1,
      injectionRejection: 1,
    },
    observations,
    failures: [],
    ...overrides,
  };
}

test("approved-source fingerprint ignores freshness fields and live connectors", () => {
  const stable = { id: "rules", sourceUrl: "https://example.test/rules", title: "Rules", sourceType: "rules", contentHash: "one", text: "approved", facts: [], actions: [], status: "approved", authorityVersion: "v1", checkedAt: "old", staleAfter: "old" };
  const changedFreshness = { ...stable, checkedAt: "new", staleAfter: "new" };
  const withLive = { ...changedFreshness, sources: undefined };
  const index = { migrationMode: "baseline", facts: [{ id: "fact", value: "approved" }], sources: [stable, { id: "live", connectorType: "live-status", sourceType: "status", text: "now" }] };
  const refreshedIndex = { ...index, sources: [changedFreshness, { id: "live", connectorType: "live-status", sourceType: "status", text: "changed" }] };
  assert.equal(approvedSourceFingerprint(index), approvedSourceFingerprint(refreshedIndex));
  assert.notEqual(approvedSourceFingerprint(index), approvedSourceFingerprint({ ...index, migrationMode: "reviewed" }));
  assert.notEqual(approvedSourceFingerprint(index), approvedSourceFingerprint({ ...index, sources: [{ ...stable, status: "pending" }] }));
  assert.deepEqual(stripVolatile(withLive), { id: "rules", sourceUrl: "https://example.test/rules", title: "Rules", sourceType: "rules", contentHash: "one", text: "approved", facts: [], actions: [], status: "approved", authorityVersion: "v1", sources: undefined });
});

test("only complete matching recent evidence is reusable", () => {
  const now = Date.parse("2026-09-08T00:00:00.000Z");
  assert.equal(validateEvidence(passingEvidence(), identity, { now }).decision, "reusable");
  const changedConfig = validateEvidence(passingEvidence({ identity: { ...identity, configurationFingerprint: "d".repeat(64) } }), identity, { now });
  assert.equal(changedConfig.decision, "needs-full");
  assert.match(changedConfig.reason, /configurationFingerprint changed/);
  assert.match(validateEvidence(passingEvidence({ candidateValid: false }), identity, { now }).reason, /candidate validation failed/);
  assert.match(validateEvidence(passingEvidence({ generatedAt: "2026-08-01T00:00:00.000Z" }), identity, { now }).reason, /older than 168 hours/);
});

test("older reports and smoke checks cannot be recertified", () => {
  const result = validateEvidence({ result: "passed", candidateValid: true, generatedAt: "2026-09-07T00:00:00.000Z", summary: { caseCount: 50, repeats: 3, runCount: 150 }, failures: [], observations }, identity, { now: Date.parse("2026-09-08T00:00:00.000Z") });
  assert.equal(result.decision, "needs-full");
  assert.match(result.reason, /no recorded identity/);
  const smoke = validateEvidence(passingEvidence({ summary: { caseCount: 1, repeats: 1, runCount: 1 }, observations: [{ id: "smoke", repeat: 1 }] }), identity, { now: Date.parse("2026-09-08T00:00:00.000Z") });
  assert.equal(smoke.decision, "needs-full");
  assert.match(smoke.reason, /complete 50-case/);
});

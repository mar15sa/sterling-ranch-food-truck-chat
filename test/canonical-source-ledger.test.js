const test = require("node:test");
const assert = require("node:assert/strict");
const {
  applyExplicitDecision,
  approvalForCommunity,
  canonicalUrl,
  emptyLedger,
  importPacket,
  summary,
  upsertObservation,
  validateLedger,
  versionKey,
} = require("../lib/canonical-source-ledger");
const { buildLedger } = require("../scripts/build-canonical-source-ledger");

const url = "https://Example.test/path/?utm_source=mail&b=2&a=1#section";
const hash = "a".repeat(64);

test("canonical identity removes trackers but preserves meaningful query parameters", () => {
  assert.equal(canonicalUrl(url), "https://example.test/path?a=1&b=2");
  assert.equal(versionKey({ sourceUrl: url, contentHash: hash }), `https://example.test/path?a=1&b=2#sha256:${hash}`);
  assert.throws(() => versionKey({ sourceUrl: url, contentHash: "not-a-sha256" }), /exact SHA-256 hex digest/);
});

test("one URL/version accumulates observations and a changed hash creates a new record", () => {
  const ledger = emptyLedger();
  upsertObservation(ledger, { sourceUrl: url, contentHash: hash, checkedAt: "2026-09-01T00:00:00Z", communityId: "alpha" });
  upsertObservation(ledger, { sourceUrl: "https://example.test/path/?a=1&b=2", contentHash: hash, checkedAt: "2026-09-02T00:00:00Z", communityId: "alpha" });
  upsertObservation(ledger, { sourceUrl: url, contentHash: "b".repeat(64), checkedAt: "2026-09-03T00:00:00Z", communityId: "alpha" });
  assert.equal(ledger.records.length, 2);
  assert.equal(ledger.records[0].observations.length, 2);
  assert.equal(summary(ledger).pendingReview, 2);
});

test("review packets create pending records and never infer content approval", () => {
  const ledger = emptyLedger();
  importPacket(ledger, { packetId: "packet-a", communityId: "alpha", preparedAt: "2026-09-01T00:00:00Z", records: [{ sourceUrl: url, contentHash: hash, proposedDisposition: "pending review" }] });
  assert.equal(ledger.records[0].disposition, "pending-review");
  assert.deepEqual(ledger.records[0].approvals, []);
});

test("approval requires an explicit, exact-version decision", () => {
  const ledger = emptyLedger();
  upsertObservation(ledger, { sourceUrl: url, contentHash: hash, checkedAt: "2026-09-01T00:00:00Z", communityId: "alpha" });
  assert.equal(applyExplicitDecision(ledger, { sourceUrl: url, contentHash: "b".repeat(64), decision: "approve-proposed", reviewId: "wrong" }).reason, "version-not-in-ledger");
  assert.equal(applyExplicitDecision(ledger, { sourceUrl: url, contentHash: hash, decision: "approve-proposed", reviewId: "owner-17", communityId: "alpha", scope: "links only" }).applied, true);
  assert.equal(approvalForCommunity(ledger.records[0], "alpha").scope, "links only");
  assert.doesNotThrow(() => validateLedger(ledger));
});

test("one source version can serve multiple communities without sharing approval scope", () => {
  const ledger = emptyLedger();
  upsertObservation(ledger, { sourceUrl: url, contentHash: hash, checkedAt: "2026-09-01T00:00:00Z", communityId: "alpha" });
  upsertObservation(ledger, { sourceUrl: url, contentHash: hash, checkedAt: "2026-09-02T00:00:00Z", communityId: "bravo" });
  assert.equal(ledger.records.length, 1);
  assert.deepEqual(ledger.records[0].communityIds, ["alpha", "bravo"]);
  applyExplicitDecision(ledger, { sourceUrl: url, contentHash: hash, decision: "approve-proposed", reviewId: "alpha-owner", communityId: "alpha", scope: "navigation only" });
  assert.equal(approvalForCommunity(ledger.records[0], "alpha").scope, "navigation only");
  assert.equal(approvalForCommunity(ledger.records[0], "bravo"), null);
  assert.equal(ledger.records[0].disposition, "pending-review");
  assert.doesNotThrow(() => validateLedger(ledger));
});

test("A/B/C/D reconciliation preserves packet work and exact approvals remain version-scoped", () => {
  const ledger = buildLedger();
  assert.deepEqual(ledger.reconciliation.historicalSnapshots.map(snapshot => snapshot.count), [222, 917]);
  assert.equal(ledger.summary.uniqueVersions, 27);
  assert.equal(ledger.summary.approvedEvidence, 5);
  assert.equal(ledger.unmatchedLegacyDecisions.length, 0);
  assert.equal(ledger.records.filter(record => record.packetRefs.some(ref => /batch-[bc]/.test(ref))).every(record => record.approvals.length === 0), true);
  const batchD = ledger.records.filter(record => record.packetRefs.includes("resident-navigation-batch-d-2026-09-09"));
  assert.equal(batchD.length, 4);
  assert.equal(batchD.every(record => record.disposition === "pending-review" && record.approvals.length === 0), true);
});

test("Decision Swipe approvals are exact-version, community-scoped claim boundaries", () => {
  const ledger = buildLedger();
  assert.deepEqual(new Set(ledger.decisionApplications.map(item => item.decisionId)), new Set([
    "water-rates-2026", "tap-facility-2026", "cab-fees-effective-date", "delinquency-policy", "monthly-fee-overview",
    "water-payment-primary-page", "water-payment-direct-link", "card-processing-fee", "water-bill-explanation", "monthly-fee-payment-page",
  ]));
  assert.equal(ledger.decisionApplications.length, 11);
  const paymentPage = ledger.records.find(record => record.canonicalUrl.endsWith("/334/Water-Billing-Payment-Options"));
  assert.equal(paymentPage.disposition, "pending-review");
  assert.equal(approvalForCommunity(paymentPage, "sterling-ranch", "water-payment-primary-page").scopeKind, "scoped-claims");
  assert.deepEqual(approvalForCommunity(paymentPage, "sterling-ranch", "card-processing-fee").approvedClaims, ["card-processing-fee"]);
  const directLink = ledger.records.find(record => record.canonicalUrl.endsWith("/332/View-and-Pay-Your-Water-Bill"));
  assert.deepEqual(approvalForCommunity(directLink, "sterling-ranch", "water-payment-direct-link").withheldClaims, ["water-rate-amounts", "contacts", "payment-terms"]);
  const explanation = ledger.records.find(record => record.canonicalUrl.endsWith("/333/Understanding-Your-Water-Bill"));
  assert.ok(approvalForCommunity(explanation, "sterling-ranch", "water-bill-explanation").withheldClaims.includes("documentcenter-2419"));
  assert.equal(ledger.deferred[0].canonicalUrl, "https://sterlingranchcab.com/DocumentCenter/View/2419");
});

test("Batch 1 decisions bind only their approved claim scope to the exact source version", () => {
  const ledger = buildLedger();
  const byDecision = (decisionId) => ledger.records.find((record) => approvalForCommunity(record, "sterling-ranch", decisionId));
  const water = byDecision("water-rates-2026");
  assert.equal(water.contentHash, "3d8fb271534ee84bd4d8c35e6c3982e0de631dd6273f6ee2d3a3372cb66ce3c6");
  assert.deepEqual(approvalForCommunity(water, "sterling-ranch", "water-rates-2026").withheldClaims, ["master-meter", "nonresidential", "public-school", "construction-water", "irrigation", "unlabelled-or-clipped-row", "generic-2025-rate"]);
  const tap = byDecision("tap-facility-2026");
  assert.ok(approvalForCommunity(tap, "sterling-ranch", "tap-facility-2026").withheldClaims.includes("commercial"));
  assert.ok(approvalForCommunity(tap, "sterling-ranch", "tap-facility-2026").withheldClaims.includes("pool"));
  const cab = byDecision("cab-fees-effective-date");
  assert.deepEqual(approvalForCommunity(cab, "sterling-ranch", "cab-fees-effective-date").withheldClaims, ["standalone-effective-date-claim"]);
  const monthly = byDecision("monthly-fee-overview");
  assert.deepEqual(approvalForCommunity(monthly, "sterling-ranch", "monthly-fee-overview").approvedClaims, ["monthly-fee-overview-action-link"]);
  assert.deepEqual(approvalForCommunity(monthly, "sterling-ranch", "monthly-fee-overview").withheldClaims, ["controlling-fee-evidence", "fee-amounts"]);
  assert.equal(ledger.unmatchedLegacyDecisions.length, 0);
});

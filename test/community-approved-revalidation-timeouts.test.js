const test = require("node:test");
const assert = require("node:assert/strict");
const { pageText } = require("../lib/community-ingest");
const { observeCanonicalSource, revalidateApprovedEvidence, sourceHash } = require("../lib/community-approved-revalidation");
const { sourceReviewState } = require("../lib/community-source-answerability");
const { searchCommunityIndex } = require("../lib/community-search");
const { runBridge } = require("../scripts/check-approved-community-revalidation");

const URL = "https://alpha.gov/m/faq?cat=21";
const HTML = "<main><h1>Pool FAQ</h1><p>Official pool guidance.</p></main>";
const EXPIRED = "2026-09-01T00:00:00.000Z";
const NOW = Date.parse("2026-09-10T12:00:00.000Z");

function timeout() {
  const error = new Error("request timed out");
  error.name = "TimeoutError";
  return error;
}

function dueIndex() {
  const contentHash = sourceHash(pageText(HTML));
  return {
    sources: [{ id: "pool-faq", communityId: "alpha", title: "Pool FAQ", sourceUrl: URL, contentHash, text: "Pool FAQ official guidance.",
      excerpt: "Pool FAQ official guidance.", authorityClass: "official-page", authorityScore: 1, actions: [], connectorType: "civicplus-pages",
      sourceType: "services", reviewStatus: "approved", checkedAt: EXPIRED, staleAfter: EXPIRED }],
    factLedger: [{ id: "pool-fact", sourceId: "pool-faq", sourceVersion: contentHash, reviewStatus: "approved",
      reviewDecisionId: "owner-decision", reviewedAt: EXPIRED, reviewedBy: "owner", normalizedValue: "pool-guidance",
      displayValue: "Pool guidance", supportingText: "Pool FAQ official guidance.", facet: "information", scopeKey: "pool-guidance",
      lifecycle: "current", lastObservedAt: EXPIRED, staleAfter: EXPIRED }],
  };
}

function dueIndexWithIndependentEvidence() {
  const value = dueIndex();
  value.sources.push({ id: "rules", communityId: "alpha", title: "Rules", sourceUrl: "https://alpha.gov/rules", contentHash: "rules-hash", text: "Rules official guidance.", actions: [], connectorType: "civicplus-pages",
    sourceType: "rules", reviewStatus: "approved", checkedAt: EXPIRED, staleAfter: EXPIRED });
  value.factLedger.push({ id: "rules-fact", sourceId: "rules", sourceVersion: "rules-hash", reviewStatus: "approved",
    reviewDecisionId: "rules-owner-decision", reviewedAt: EXPIRED, reviewedBy: "owner", lastObservedAt: EXPIRED, staleAfter: EXPIRED });
  return value;
}

function availabilityGate(index) {
  const review = sourceReviewState(index, NOW);
  const pool = index.sources.find((source) => source.id === "pool-faq");
  const rules = index.sources.find((source) => source.id === "rules");
  assert.equal(review.canUseProjection(pool), false, "unavailable evidence must not answer residents");
  assert.equal(review.canUseProjection(rules), true, "independent exact evidence remains usable");
}

test("a transient official-page timeout retries once and still requires exact proof before renewal", async () => {
  let calls = 0;
  const proof = await observeCanonicalSource(URL, [{ actions: [] }], {
    fetchAttempts: 2,
    retryDelayMs: 0,
    sleepImpl: async () => {},
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw timeout();
      return { ok: true, url: URL, text: async () => HTML };
    },
  });
  assert.equal(calls, 2);
  assert.deepEqual(proof.observedHashes, [sourceHash(pageText(HTML))]);
  assert.equal(proof.actionMismatch, false);
});

test("persistent official-page timeouts remain withheld after the bounded retry", async () => {
  const original = dueIndex();
  let calls = 0;
  const result = await revalidateApprovedEvidence(original, {
    now: NOW,
    fetchObservedHashes: (sourceUrl, approvedSources) => observeCanonicalSource(sourceUrl, approvedSources, {
      fetchAttempts: 2,
      retryDelayMs: 0,
      sleepImpl: async () => {},
      fetchImpl: async () => { calls += 1; throw timeout(); },
    }),
  });
  assert.equal(calls, 2, "a persistent timeout gets only the configured retry");
  assert.equal(result.checks[0].outcome, "review-required");
  assert.match(result.checks[0].error, /failed after 2 attempts/i);
  assert.equal(result.temporaryIndex.sources[0].staleAfter, EXPIRED);
  assert.equal(result.temporaryIndex.factLedger[0].staleAfter, EXPIRED);
  assert.deepEqual(original, dueIndex(), "the approved input is never changed by a failed retry");
});

test("an unchanged unavailable source is quarantined from the temporary answerable snapshot while unrelated evidence remains usable", async () => {
  const index = dueIndexWithIndependentEvidence();
  const result = await runBridge({
    index,
    baselineIndex: structuredClone(index),
    now: NOW,
    auditFn: availabilityGate,
    fetchObservedHashes: async (sourceUrl) => {
      if (sourceUrl === URL) throw timeout();
      return { observedHashes: ["rules-hash"], actionMismatch: false };
    },
  });
  assert.equal(result.valid, true);
  assert.equal(result.attestation.status, "passed-with-withheld-evidence");
  assert.deepEqual(result.attestation.quarantined.map((source) => source.id), ["pool-faq"]);
  assert.equal(result.temporaryIndex.sources.find((source) => source.id === "pool-faq").staleAfter, EXPIRED,
    "quarantine must not renew the unavailable source");
});

test("a branch that changes unavailable evidence cannot pass under the quarantine exception", async () => {
  const baseline = dueIndexWithIndependentEvidence();
  const changed = structuredClone(baseline);
  changed.sources[0].actions = [{ label: "Changed action", url: "https://alpha.gov/changed", actionType: "information" }];
  const result = await runBridge({
    index: changed,
    baselineIndex: baseline,
    now: NOW,
    auditFn: () => {},
    fetchObservedHashes: async (sourceUrl) => {
      if (sourceUrl === URL) throw timeout();
      return { observedHashes: ["rules-hash"], actionMismatch: false };
    },
  });
  assert.equal(result.valid, false);
  assert.equal(result.attestation.quarantined.length, 0);
  assert.match(result.attestation.gateErrors.join(" "), /requires owner review/i);
});

test("an unavailable source with changed authority, source text, or claim value cannot enter quarantine", async () => {
  for (const change of [
    (index) => { index.sources[0].authorityClass = "historical-reference"; },
    (index) => { index.sources[0].text = "Different official guidance."; },
    (index) => { index.factLedger[0].normalizedValue = "different-claim"; },
  ]) {
    const baseline = dueIndexWithIndependentEvidence();
    const changed = structuredClone(baseline);
    change(changed);
    const result = await runBridge({
      index: changed,
      baselineIndex: baseline,
      now: NOW,
      auditFn: () => {},
      fetchObservedHashes: async (sourceUrl) => {
        if (sourceUrl === URL) throw timeout();
        return { observedHashes: ["rules-hash"], actionMismatch: false };
      },
    });
    assert.equal(result.valid, false);
    assert.equal(result.attestation.quarantined.length, 0);
  }
});

test("the resident retrieval path keeps quarantined evidence out of answerable sources", async () => {
  const index = dueIndexWithIndependentEvidence();
  const result = await runBridge({
    index,
    baselineIndex: structuredClone(index),
    now: NOW,
    auditFn: availabilityGate,
    fetchObservedHashes: async (sourceUrl) => {
      if (sourceUrl === URL) throw timeout();
      return { observedHashes: ["rules-hash"], actionMismatch: false };
    },
  });
  const search = searchCommunityIndex("pool FAQ", { index: result.temporaryIndex, communityId: "alpha", intent: "services", now: NOW });
  assert.equal(search.sources.some((source) => source.id === "pool-faq"), false);
  assert.equal(search.withheldSources.some((source) => source.id === "pool-faq"), true);
});

test("recovery removes the temporary quarantine only after the exact approved version is proved", async () => {
  const index = dueIndexWithIndependentEvidence();
  const result = await runBridge({
    index,
    baselineIndex: structuredClone(index),
    now: NOW,
    auditFn: (temporary) => {
      const review = sourceReviewState(temporary, NOW);
      assert.equal(review.canUseProjection(temporary.sources.find((source) => source.id === "pool-faq")), true);
    },
    fetchObservedHashes: async (sourceUrl) => ({
      observedHashes: [sourceUrl === URL ? index.sources[0].contentHash : "rules-hash"], actionMismatch: false,
    }),
  });
  assert.equal(result.valid, true);
  assert.equal(result.attestation.quarantined.length, 0);
  assert.ok(Date.parse(result.temporaryIndex.sources[0].staleAfter) > NOW);
  assert.ok(Date.parse(result.temporaryIndex.factLedger[0].staleAfter) > NOW);
});

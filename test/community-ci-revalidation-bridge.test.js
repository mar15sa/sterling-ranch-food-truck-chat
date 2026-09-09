const test = require("node:test");
const assert = require("node:assert/strict");
const { fingerprint } = require("../lib/community-release");
const { sourceReviewState } = require("../lib/community-source-answerability");
const { observeCanonicalSource, runBridge } = require("../scripts/check-approved-community-revalidation");

const NOW = Date.parse("2026-09-08T12:00:00.000Z");
const URL = "https://alpha.gov/rules";
function index() {
  const source = { id: "rules", title: "Rules", sourceUrl: URL, sourceType: "rules", connectorType: "civicplus-pages", contentHash: "same", actions: [{ label: "Apply", url: "https://alpha.gov/apply", actionType: "submit" }], staleAfter: "2026-09-01T00:00:00.000Z", checkedAt: "2026-09-01T00:00:00.000Z" };
  return { communityId: "alpha", sources: [source], factLedger: [{ id: "rule-fact", sourceId: "rules", sourceVersion: "same", reviewStatus: "approved",
    reviewDecisionId: 'rule-owner-decision', reviewedAt: '2026-08-31T00:00:00Z', reviewedBy: 'owner',
    staleAfter: source.staleAfter, lastObservedAt: source.checkedAt }] };
}
const observer = async () => ({ observedHashes: ["same"], actionMismatch: false });
const normalGate = (value) => {
  const source = value.sources[0];
  if (Date.parse(source.staleAfter) <= NOW || value.factLedger.some((fact) => fact.sourceVersion !== source.contentHash || Date.parse(fact.staleAfter) <= NOW)) throw new Error("stale fact/version");
  if (sourceReviewState(value, NOW).entriesFor(source).length !== 1) throw new Error("answer gate withheld temporary evidence");
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

test("a realistic unchanged HTML page and actions renew, while an action-only URL change fails", async () => {
  const html = "<main><h1>Rules</h1><p>Apply by Friday.</p><a href='/apply'>Apply now</a></main>";
  const response = (body) => async () => ({ ok: true, url: URL, text: async () => body });
  const proof = await observeCanonicalSource(URL, [{ actions: [] }], { fetchImpl: response(html) });
  const approved = index();
  approved.sources[0].contentHash = proof.observedHashes[0];
  approved.factLedger[0].sourceVersion = proof.observedHashes[0];
  approved.sources[0].actions = proof.actionProof.observed.actions;
  const unchanged = await runBridge({ index: approved, now: NOW, fetchObservedHashes: async (url, sources) => observeCanonicalSource(url, sources, { fetchImpl: response(html) }), auditFn: normalGate });
  assert.equal(unchanged.valid, true);
  assert.equal(unchanged.attestation.checks[0].actionProof.observed.digest.length, 64);
  const actionOnlyChange = html.replace("href='/apply'", "href='/apply-later'");
  const changed = await runBridge({ index: approved, now: NOW, fetchObservedHashes: async (url, sources) => observeCanonicalSource(url, sources, { fetchImpl: response(actionOnlyChange) }), auditFn: normalGate });
  assert.equal(changed.valid, false);
  assert.equal(changed.checks[0].reason, "action-identity-changed");
});

test("a changed approved fingerprint is an explicit bridge failure", async () => {
  const result = await runBridge({
    index: index(), now: NOW,
    fetchObservedHashes: async (url, sources) => { sources[0].contentHash = "tampered"; return { observedHashes: ["tampered"], actionMismatch: false }; },
    auditFn: () => {},
  });
  assert.equal(result.valid, false);
  assert.match(result.attestation.gateErrors.join(" "), /fingerprint changed/);
});

test("PDF proof accepts the same canonical document and rejects a same-origin redirect to another document", async () => {
  const pdfUrl = "https://alpha.gov/DocumentCenter/View/100";
  const source = { ...index().sources[0], id: "pdf-rules", sourceUrl: pdfUrl, connectorType: "official-pdf", actions: [], contentHash: "pdf-proof" };
  const extractText = async (url, { fetchImpl }) => {
    let response = await fetchImpl(url, { redirect: "manual" });
    if (response.status >= 300 && response.status < 400) response = await fetchImpl(new globalThis.URL(response.headers.get("location"), url).href, { redirect: "manual" });
    assert.equal(response.ok, true);
    return "approved PDF text";
  };
  const same = await observeCanonicalSource(pdfUrl, [source], {
    extractPdfTextImpl: extractText,
    fetchImpl: async () => ({ ok: true, status: 200, headers: new Headers() }),
  });
  assert.deepEqual(same.observedHashes, [require("node:crypto").createHash("sha256").update("approved PDF text").digest("hex")]);
  assert.equal(same.actionMismatch, false);
  await assert.rejects(
    observeCanonicalSource(pdfUrl, [source], {
      extractPdfTextImpl: extractText,
      // The extractor asked for /100, but its fetch implementation followed a
      // same-origin redirect and returned /101. This must not renew /100.
      fetchImpl: async () => ({ ok: true, status: 200, url: "https://alpha.gov/DocumentCenter/View/101", headers: new Headers() }),
    }),
    /Canonical URL changed during PDF revalidation/,
  );
  await assert.rejects(
    observeCanonicalSource(pdfUrl, [source], {
      extractPdfTextImpl: extractText,
      fetchImpl: async () => ({ ok: true, status: 200, url: "https://outside.example/DocumentCenter/View/100", headers: new Headers() }),
    }),
    /Document redirected outside the official website/,
  );
  await assert.rejects(
    observeCanonicalSource(pdfUrl, [source], {
      extractPdfTextImpl: extractText,
      fetchImpl: async (url) => String(url).endsWith("/100")
        ? { ok: false, status: 302, headers: new Headers({ location: "/DocumentCenter/View/101" }) }
        : { ok: true, status: 200, headers: new Headers() },
    }),
    /Canonical URL changed during PDF revalidation/,
  );
});

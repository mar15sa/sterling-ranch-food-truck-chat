const test = require("node:test");
const assert = require("node:assert/strict");
const { fingerprint } = require("../lib/community-release");
const { sourceReviewState } = require("../lib/community-source-answerability");
const { actionIdentity, actionUrlIdentity, observeCanonicalSource, sourceHash } = require("../lib/community-approved-revalidation");
const { chunkText, pageText } = require("../lib/community-ingest");
const { runBridge } = require("../scripts/check-approved-community-revalidation");

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

test("a scoped exact-version projection renews its full long page and semantic action without approving deferred links", async () => {
  const projectedUrl = "https://alpha.gov/water-payment";
  const paymentUrl = "https://billing.alpha.gov/login";
  const context = "Payment Options: register through UtilityHawk.";
  const longText = `${context} ${"Current payment instructions remain available. ".repeat(55)}`;
  const htmlFor = ({ paymentHref = paymentUrl, includePayment = true, text = longText } = {}) => `<main><p>${text}</p>${includePayment ? `<a href="${paymentHref}">https://billing.alpha.gov/login</a>` : ""}<a href="/DocumentCenter/View/2419">Understanding your water bill (pdf)</a></main>`;
  const exactHtml = htmlFor();
  const exactText = require("../lib/community-ingest").pageText(exactHtml);
  assert.ok(exactText.length > 1800, "fixture must exceed ordinary ingestion chunk size");
  const projection = {
    id: "water-payment-projection", sourceUrl: projectedUrl, connectorType: "civicplus-pages", sourceType: "services",
    reviewStatus: "candidate", contentHash: sourceHash(exactText), staleAfter: "2026-09-01T00:00:00.000Z",
    facts: [{ id: "approved-fact", reviewStatus: "approved" }],
    actions: [{ id: "utility-hawk", label: "UtilityHawk", url: paymentUrl, actionType: "payment", context, reviewStatus: "approved" }],
  };
  const observed = async (html) => observeCanonicalSource(projectedUrl, [projection], {
    fetchImpl: async () => ({ ok: true, url: projectedUrl, text: async () => html }),
  });
  const unchanged = await observed(exactHtml);
  assert.deepEqual(unchanged.observedHashes, [projection.contentHash], "the full exact page hash is preserved");
  assert.equal(unchanged.actionMismatch, false, "URL/context proves the semantic payment projection despite raw link label/type");
  assert.equal(unchanged.actionProof.observed[0].matches[0].label, "https://billing.alpha.gov/login");

  const revalidated = await runBridge({
    index: { sources: [projection], factLedger: [{ id: "fact", sourceId: projection.id, sourceVersion: projection.contentHash, reviewStatus: "approved", reviewDecisionId: "owner", reviewedBy: "owner", reviewedAt: "2026-09-01", staleAfter: projection.staleAfter }] },
    now: NOW, fetchObservedHashes: async () => unchanged, auditFn: () => {},
  });
  assert.equal(revalidated.valid, true, "the deferred DocumentCenter link does not enter this claim-scoped renewal");

  const changedText = await observed(htmlFor({ text: `${longText} Changed.` }));
  assert.notDeepEqual(changedText.observedHashes, [projection.contentHash]);
  const changedDestination = await observed(htmlFor({ paymentHref: "https://billing.alpha.gov/new-login" }));
  assert.equal(changedDestination.actionMismatch, true);
  const missingDestination = await observed(htmlFor({ includePayment: false }));
  assert.equal(missingDestination.actionMismatch, true);
});

test("ordinary chunks and a scoped projection on the same unchanged page renew together", async () => {
  const projectedUrl = "https://alpha.gov/pool";
  const scheduleUrl = "https://alpha.gov/pool-schedule";
  const context = "Pool schedule: use the official schedule page for current details.";
  const longText = `${context} ${"Published pool information remains available. ".repeat(55)}`;
  const htmlFor = ({ scheduleHref = scheduleUrl, text = longText } = {}) =>
    `<main><p>${text}</p><a href="${scheduleHref}">View pool schedule</a></main>`;
  const exactHtml = htmlFor();
  const exactText = pageText(exactHtml);
  assert.ok(exactText.length > 1800, "fixture must exercise both chunk and full-page identities");

  const fetchHtml = (html) => async () => ({ ok: true, url: projectedUrl, text: async () => html });
  const ordinaryProof = await observeCanonicalSource(projectedUrl, [{ actions: [] }], { fetchImpl: fetchHtml(exactHtml) });
  const ordinaryActions = ordinaryProof.actionProof.observed.actions;
  const expired = "2026-09-01T00:00:00.000Z";
  const ordinarySources = chunkText(exactText).map((chunk, position) => ({
    id: `pool-chunk-${position + 1}`, sourceUrl: projectedUrl, connectorType: "civicplus-pages", sourceType: "facilities",
    contentHash: sourceHash(chunk), actions: ordinaryActions, staleAfter: expired, checkedAt: expired,
  }));
  const projection = {
    id: "pool-hours-projection", sourceUrl: projectedUrl, connectorType: "civicplus-pages", sourceType: "facilities",
    reviewStatus: "candidate", contentHash: sourceHash(exactText), staleAfter: expired, checkedAt: expired,
    facts: [{ id: "pool-hours", reviewStatus: "approved" }],
    actions: [{ id: "pool-schedule", label: "Official pool schedule", url: scheduleUrl, actionType: "information", context, reviewStatus: "approved" }],
  };
  const sources = [...ordinarySources, projection];
  const factLedger = sources.map((source, position) => ({
    id: `pool-fact-${position + 1}`, sourceId: source.id, sourceVersion: source.contentHash, reviewStatus: "approved",
    reviewDecisionId: "owner", reviewedBy: "owner", reviewedAt: expired, staleAfter: expired, lastObservedAt: expired,
  }));
  const value = { communityId: "alpha", sources, factLedger };
  const observe = (html) => (url, approvedSources) => observeCanonicalSource(url, approvedSources, { fetchImpl: fetchHtml(html) });

  const unchanged = await runBridge({ index: value, now: NOW, fetchObservedHashes: observe(exactHtml), auditFn: () => {} });
  assert.equal(unchanged.valid, true);
  assert.deepEqual(new Set(unchanged.checks[0].observedHashes), new Set(sources.map((source) => source.contentHash)));
  assert.ok(unchanged.temporaryIndex.sources.every((source) => Date.parse(source.staleAfter) > NOW));
  assert.ok(unchanged.temporaryIndex.factLedger.every((fact) => Date.parse(fact.staleAfter) > NOW));

  const changedText = await runBridge({
    index: value, now: NOW, fetchObservedHashes: observe(htmlFor({ text: `${longText} Changed.` })), auditFn: () => {},
  });
  assert.equal(changedText.valid, false);
  assert.equal(changedText.checks[0].outcome, "review-required");

  const changedAction = await runBridge({
    index: value, now: NOW, fetchObservedHashes: observe(htmlFor({ scheduleHref: "https://alpha.gov/new-pool-schedule" })), auditFn: () => {},
  });
  assert.equal(changedAction.valid, false);
  assert.equal(changedAction.checks[0].reason, "action-identity-changed");
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

test("action identity ignores a destination fragment but preserves the resident-facing deep link", () => {
  const base = { label: "Bulk Item Pick Up", url: "https://vendor.example/contact-us/", actionType: "form" };
  const anchored = { ...base, url: "https://vendor.example/contact-us/#1010" };
  assert.equal(actionIdentity([base]), actionIdentity([anchored]));
  assert.equal(anchored.url.endsWith("#1010"), true);
  assert.equal(actionUrlIdentity(anchored.url), base.url);
});

test("homepage calendar CTA is revalidated even when event cards are removed from stable page text", async () => {
  const homepage = "https://alpha.gov/";
  const html = `<main data-cpRole="mainContentContainer"><h1>Welcome</h1><div data-widget-controller-path="/Calendar/Widget"><a href="/calendar.aspx?CID=1">View All Events</a><div class="addItemModal hidden"></div></div></main>`;
  const source = { id: "home", sourceUrl: homepage, contentHash: "unused", actions: [{ label: "View All Events", url: "https://alpha.gov/calendar.aspx?CID=1", actionType: "form" }] };
  const proof = await observeCanonicalSource(homepage, [source], { fetchImpl: async () => ({ ok: true, url: homepage, text: async () => html }) });
  assert.equal(proof.actionMismatch, false);
  assert.deepEqual(proof.actionProof.observed.actions.map(action => action.label), ["View All Events"]);
});

test("FAQ fingerprint ignores only its self link and keeps copied page actions monitored", async () => {
  const faqUrl = "https://alpha.gov/m/faq?cat=15";
  const shared = { label: "General Inquiries", url: "https://alpha.gov/contact", actionType: "form" };
  const self = { label: "How do I apply?", url: faqUrl, actionType: "form" };
  const local = { label: "Submit design request", url: "https://alpha.gov/FormCenter/DRC", actionType: "form" };
  const sources = [
    { id: "faq-1", sourceUrl: faqUrl, actions: [shared, self, local] },
    { id: "faq-2", sourceUrl: faqUrl, actions: [shared, self] },
  ];
  const html = `<main><p>FAQ text.</p><a href="/contact">General Inquiries</a><a href="/m/faq?cat=15">How do I apply?</a><a href="/FormCenter/DRC">Submit design request</a></main>`;
  const proof = await observeCanonicalSource(faqUrl, sources, { fetchImpl: async () => ({ ok: true, url: faqUrl, text: async () => html }) });
  assert.equal(proof.actionMismatch, false);
  const missingSharedAction = await observeCanonicalSource(faqUrl, sources, {
    fetchImpl: async () => ({ ok: true, url: faqUrl, text: async () => html.replace('<a href="/contact">General Inquiries</a>', "") }),
  });
  assert.equal(missingSharedAction.actionMismatch, true);
});

test("a transient PDF failure is retried and remains a visible failure when both attempts fail", async () => {
  const pdfUrl = "https://alpha.gov/DocumentCenter/View/100";
  const source = { id: "pdf", sourceUrl: pdfUrl, actions: [], contentHash: "unused" };
  let calls = 0;
  const recovered = await observeCanonicalSource(pdfUrl, [source], {
    extractPdfTextImpl: async (url, { fetchImpl }) => { calls += 1; if (calls === 1) throw new Error("temporary network error"); await fetchImpl(url, { redirect: "manual" }); return "approved PDF text"; },
    fetchImpl: async () => ({ ok: true, status: 200, url: pdfUrl, headers: new Headers() }),
  });
  assert.equal(calls, 2);
  assert.deepEqual(recovered.observedHashes, [require("node:crypto").createHash("sha256").update("approved PDF text").digest("hex")]);
  await assert.rejects(
    observeCanonicalSource(pdfUrl, [source], { extractPdfTextImpl: async (url, { fetchImpl }) => { await fetchImpl(url, { redirect: "manual" }); throw new Error("unavailable"); }, fetchImpl: async () => ({ ok: true, status: 200, url: pdfUrl, headers: new Headers() }) }),
    /Official PDF extraction failed after 2 attempts: unavailable/,
  );
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
  const sameDocumentWithSlug = await observeCanonicalSource(pdfUrl, [source], {
    extractPdfTextImpl: extractText,
    fetchImpl: async () => ({ ok: true, status: 200, url: "https://alpha.gov/DocumentCenter/View/100/Official-Document?bidId=", headers: new Headers() }),
  });
  assert.equal(sameDocumentWithSlug.documentProof.retrievedUrl, "https://alpha.gov/DocumentCenter/View/100/Official-Document?bidId=");
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

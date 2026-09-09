const crypto = require("node:crypto");
const {
  contentHtml, extractActions, extractPdfText, isDocumentUrl, linksFromHtml,
  pageText, stripEmbeddedInstructions, chunkText, canonicalPageUrl,
} = require("./community-ingest");
const { isFreshnessTrackedSource } = require("./community-source-identity");
const { APPROVED_REVIEW_STATUSES } = require("./community-truth");

function isApprovedSource(source = {}) {
  return isFreshnessTrackedSource(source)
    && !["candidate", "excluded", "escalated", "rejected"].includes(source.reviewStatus);
}

function hasApprovedProjection(source = {}, index = {}) {
  return (index.factLedger || []).some((fact) => APPROVED_REVIEW_STATUSES.has(fact.reviewStatus)
    && fact.sourceId === source.id && fact.sourceVersion === source.contentHash);
}

function isRevalidatableApprovedSource(source = {}, index = {}) {
  return isFreshnessTrackedSource(source)
    && !["excluded", "escalated", "rejected"].includes(source.reviewStatus)
    && (isApprovedSource(source) || hasApprovedProjection(source, index));
}

function actionUrlIdentity(value = "") {
  // A fragment changes where a browser opens a page, but it does not change
  // the official action or its destination. Keep the original URL everywhere
  // else so residents still receive that useful deep link.
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href;
  } catch {
    return String(value || "");
  }
}

function isFaqUrl(value = "") {
  try { return /\/(?:m\/faq|faq\.aspx)\/?$/i.test(new URL(value).pathname); } catch { return false; }
}

function civicPlusDocumentId(value = "") {
  try {
    const match = new URL(value).pathname.match(/\/DocumentCenter\/View\/(\d+)(?:\/|$)/i);
    return match?.[1] || "";
  } catch {
    return "";
  }
}

function sameOfficialDocumentIdentity(sourceUrl, observedUrl) {
  try {
    const source = new URL(sourceUrl);
    const observed = new URL(observedUrl);
    const sourceId = civicPlusDocumentId(sourceUrl);
    const observedId = civicPlusDocumentId(observedUrl);
    return Boolean(sourceId && observedId && source.origin === observed.origin && sourceId === observedId);
  } catch {
    return false;
  }
}

function actionIdentity(actions = []) {
  return actions.length ? JSON.stringify(actions.map(action => [
    action.label, actionUrlIdentity(action.url), action.actionType || "", [...(action.keywords || [])].sort(),
  ]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))) : "";
}

function sourceHash(text) {
  // This must stay text-only because it is the hash used by the approved
  // snapshot. Action identity is proved separately below.
  return crypto.createHash("sha256").update(text).digest("hex");
}

function actionDigest(actions = []) {
  return crypto.createHash("sha256").update(actionIdentity(actions)).digest("hex");
}

function selectRevalidationTargetUrls(index = {}, now = Date.now()) {
  const activeSources = (index.sources || []).filter((source) => isRevalidatableApprovedSource(source, index));
  const activeByVersion = new Map(activeSources.map((source) => [`${source.id}:${source.contentHash}`, source]));
  const urls = new Set(activeSources.filter((source) => Date.parse(source.staleAfter) < now).map((source) => source.sourceUrl));
  for (const fact of index.factLedger || []) {
    if (!APPROVED_REVIEW_STATUSES.has(fact.reviewStatus) || !(Date.parse(fact.staleAfter) < now)) continue;
    const source = activeByVersion.get(`${fact.sourceId}:${fact.sourceVersion}`);
    if (source) urls.add(source.sourceUrl);
  }
  return [...urls].sort();
}

function renewExactApprovedEvidence(index = {}, { sourceUrl, observedHashes = [], checkedAt, staleAfter } = {}) {
  const hashes = new Set(observedHashes);
  const renewedSources = (index.sources || []).filter((source) => source.sourceUrl === sourceUrl
    && isRevalidatableApprovedSource(source, index) && hashes.has(source.contentHash));
  const renewedVersions = new Set(renewedSources.map((source) => `${source.id}:${source.contentHash}`));
  for (const source of renewedSources) Object.assign(source, { checkedAt, staleAfter });
  const renewedFacts = (index.factLedger || []).filter((fact) => APPROVED_REVIEW_STATUSES.has(fact.reviewStatus)
    && renewedVersions.has(`${fact.sourceId}:${fact.sourceVersion}`));
  for (const fact of renewedFacts) Object.assign(fact, { lastObservedAt: checkedAt, staleAfter });
  const requiresReview = (index.sources || []).filter((source) => source.sourceUrl === sourceUrl
    && isRevalidatableApprovedSource(source, index) && !hashes.has(source.contentHash));
  return { renewedSources, renewedFacts, requiresReview };
}

function reviewRecord(sourceUrl, sources, outcome, details = {}) {
  return {
    sourceUrl,
    sources: sources.map(({ id, contentHash, actions = [] }) => ({ id, contentHash, actionCount: actions.length,
      actionIdentity: actionIdentity(actions) })),
    outcome,
    ...details,
  };
}

function actionFingerprintForSource(source = {}) {
  const sourceIdentity = actionUrlIdentity(source.sourceUrl || "");
  return actionIdentity((source.actions || []).filter(action => actionUrlIdentity(action.url) !== sourceIdentity));
}

function scopedExpectedActionIdentity(sourceUrl, sources = []) {
  if (!isFaqUrl(sourceUrl)) return new Set(sources.map(actionFingerprintForSource));
  // FAQ records share the page-wide action set even though each record is a
  // separate answer. Compare that full set once, excluding only a link back
  // to the exact FAQ page itself. Shared payment, signup, contact, and form
  // actions remain monitored.
  const localActions = sources.flatMap((source) => (source.actions || []).filter((action) => {
    return actionUrlIdentity(action.url) !== actionUrlIdentity(sourceUrl);
  }));
  const uniqueActions = localActions.filter((action, index) =>
    localActions.findIndex((candidate) => actionIdentity([candidate]) === actionIdentity([action])) === index);
  return new Set([actionIdentity(uniqueActions)]);
}

function stableObservedActions(html, sourceUrl) {
  const contentActions = extractActions(linksFromHtml(contentHtml(html), sourceUrl));
  // CivicPlus's calendar widget is intentionally removed from text extraction
  // because individual event cards change constantly. Its stable "View All
  // Events" call-to-action is still an official action and must be observed.
  const eventWidgetActions = extractActions(linksFromHtml(html, sourceUrl)).filter((action) =>
    /^view all events$/i.test(action.label.trim()) && /\/calendar\.aspx\b/i.test(action.url));
  const seen = new Set();
  return [...contentActions, ...eventWidgetActions].filter((action) => {
    const key = `${action.label}\n${action.url}\n${action.actionType || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function extractOfficialPdfWithRetry(sourceUrl, extractPdfTextImpl, options, attempts = 2) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { return await extractPdfTextImpl(sourceUrl, options); } catch (error) { lastError = error; }
  }
  const error = new Error(`Official PDF extraction failed after ${attempts} attempts: ${lastError?.message || "unknown error"}`);
  error.cause = lastError;
  throw error;
}

async function observeCanonicalSource(sourceUrl, approvedSources, { fetchImpl = globalThis.fetch, extractPdfTextImpl = extractPdfText, timeoutMs = 30_000 } = {}) {
  if (!approvedSources.length) throw new Error("No approved evidence was found for the due URL.");
  const expectedUrl = canonicalPageUrl(sourceUrl);
  let text;
  let observedActions = [];
  let documentProof = null;
  if (isDocumentUrl(sourceUrl)) {
    const requests = [];
    const returnedUrls = [];
    const trackedFetch = async (requestedUrl, options) => {
      const requested = String(requestedUrl);
      requests.push(requested);
      if (new URL(requested).origin !== new URL(sourceUrl).origin) throw new Error("Document redirected outside the official website.");
      const response = await fetchImpl(requested, options);
      // A PDF fetcher can follow a redirect internally. Its requested URL is
      // not proof of the returned document, so the response URL must remain
      // the approved canonical document too.
      const finalUrl = String(response?.url || requested);
      if (new URL(finalUrl).origin !== new URL(sourceUrl).origin) throw new Error("Document redirected outside the official website.");
      if (canonicalPageUrl(finalUrl) !== expectedUrl && !sameOfficialDocumentIdentity(sourceUrl, finalUrl)) {
        throw new Error("Canonical URL changed during PDF revalidation.");
      }
      returnedUrls.push(finalUrl);
      return response;
    };
    text = await extractOfficialPdfWithRetry(sourceUrl, extractPdfTextImpl, { fetchImpl: trackedFetch });
    if (!requests.length || (canonicalPageUrl(requests.at(-1)) !== expectedUrl
      && !sameOfficialDocumentIdentity(sourceUrl, requests.at(-1)))) throw new Error("Canonical URL changed during PDF revalidation.");
    documentProof = { requestedUrl: sourceUrl, retrievedUrl: returnedUrls.at(-1) || requests.at(-1) };
  } else {
    const response = await fetchImpl(sourceUrl, {
      redirect: "follow", signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": "Sterling Ranch approved-evidence verifier" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (canonicalPageUrl(response.url || sourceUrl) !== expectedUrl) throw new Error("Canonical URL changed during revalidation.");
    const html = await response.text();
    text = stripEmbeddedInstructions(pageText(html));
    observedActions = stableObservedActions(html, response.url || sourceUrl);
  }
  if (!String(text || "").trim()) throw new Error("Extraction returned no usable text.");
  const expectedActions = scopedExpectedActionIdentity(sourceUrl, approvedSources);
  const observedActionIdentity = isFaqUrl(sourceUrl)
    ? actionIdentity(observedActions.filter((action) => actionUrlIdentity(action.url) !== actionUrlIdentity(sourceUrl)))
    : actionIdentity(observedActions);
  return {
    observedHashes: chunkText(text).map(sourceHash),
    actionMismatch: expectedActions.size !== 1 || !expectedActions.has(observedActionIdentity),
    actionProof: {
      expected: approvedSources.map((source) => ({ id: source.id, digest: actionDigest(source.actions || []), actions: source.actions || [] })),
      observed: { digest: actionDigest(observedActions), actions: observedActions },
    },
    ...(documentProof ? { documentProof } : {}),
  };
}

async function revalidateApprovedEvidence(index, { now = Date.now(), fetchObservedHashes, staleAfterMs = 86_400_000, concurrency = 4 } = {}) {
  if (typeof fetchObservedHashes !== "function") throw new Error("A canonical source observer is required.");
  const temporaryIndex = structuredClone(index);
  const urls = selectRevalidationTargetUrls(temporaryIndex, now);
  const checks = new Array(urls.length);
  const workerCount = Math.max(1, Math.min(Number(concurrency) || 1, urls.length || 1));
  let next = 0;
  const check = async (sourceUrl) => {
    const approvedSources = temporaryIndex.sources.filter((source) => source.sourceUrl === sourceUrl
      && isRevalidatableApprovedSource(source, temporaryIndex));
    const checkedAt = new Date(now).toISOString();
    const staleAfter = new Date(now + staleAfterMs).toISOString();
    try {
      const observation = await fetchObservedHashes(sourceUrl, approvedSources);
      const observedHashes = Array.isArray(observation?.observedHashes) ? observation.observedHashes : [];
      const expectedHashes = new Set(approvedSources.map((source) => source.contentHash));
      const extraHashes = observedHashes.filter((hash) => !expectedHashes.has(hash));
      const missing = approvedSources.filter((source) => !observedHashes.includes(source.contentHash));
      // Do not renew a matching chunk from a page that also changed. The full
      // exact URL, content-version set, and action identity must prove safe.
      if (observation?.actionMismatch || !observedHashes.length || extraHashes.length || missing.length) {
        return reviewRecord(sourceUrl, approvedSources, "review-required", {
          reason: observation?.actionMismatch ? "action-identity-changed" : !observedHashes.length ? "no-valid-proof"
            : extraHashes.length ? "extra-source-identity-or-content-hash" : "source-identity-or-content-hash-changed",
          observedHashes, actionProof: observation?.actionProof || null, documentProof: observation?.documentProof || null, extraHashes,
          missing: missing.map(({ id, contentHash }) => ({ id, contentHash })), checkedAt, staleAfter,
        });
      }
      const renewal = renewExactApprovedEvidence(temporaryIndex, { sourceUrl, observedHashes, checkedAt, staleAfter });
      return reviewRecord(sourceUrl, approvedSources, "renewed", { observedHashes, actionProof: observation?.actionProof || null, documentProof: observation?.documentProof || null, checkedAt, staleAfter,
        renewedSourceCount: renewal.renewedSources.length, renewedFactCount: renewal.renewedFacts.length });
    } catch (error) {
      return reviewRecord(sourceUrl, approvedSources, "review-required", { reason: "fetch-or-extraction-failed", error: error.message, checkedAt, staleAfter });
    }
  };
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (next < urls.length) {
      const position = next++;
      checks[position] = await check(urls[position]);
    }
  }));
  return { temporaryIndex, checks };
}

module.exports = { actionDigest, actionIdentity, actionUrlIdentity, civicPlusDocumentId, hasApprovedProjection, isApprovedSource, isRevalidatableApprovedSource, observeCanonicalSource, renewExactApprovedEvidence, revalidateApprovedEvidence, sameOfficialDocumentIdentity, selectRevalidationTargetUrls, sourceHash, stableObservedActions };

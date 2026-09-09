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

function actionIdentity(actions = []) {
  return actions.length ? JSON.stringify(actions.map(action => [
    action.label, action.url, action.actionType || "", [...(action.keywords || [])].sort(),
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

async function observeCanonicalSource(sourceUrl, approvedSources, { fetchImpl = globalThis.fetch, extractPdfTextImpl = extractPdfText, timeoutMs = 30_000 } = {}) {
  if (!approvedSources.length) throw new Error("No approved evidence was found for the due URL.");
  const expectedUrl = canonicalPageUrl(sourceUrl);
  let text;
  let observedActions = [];
  if (isDocumentUrl(sourceUrl)) {
    const requests = [];
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
      if (canonicalPageUrl(finalUrl) !== expectedUrl) throw new Error("Canonical URL changed during PDF revalidation.");
      return response;
    };
    text = await extractPdfTextImpl(sourceUrl, { fetchImpl: trackedFetch });
    if (!requests.length || canonicalPageUrl(requests.at(-1)) !== expectedUrl) throw new Error("Canonical URL changed during PDF revalidation.");
  } else {
    const response = await fetchImpl(sourceUrl, {
      redirect: "follow", signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": "Sterling Ranch approved-evidence verifier" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (canonicalPageUrl(response.url || sourceUrl) !== expectedUrl) throw new Error("Canonical URL changed during revalidation.");
    const html = await response.text();
    text = stripEmbeddedInstructions(pageText(html));
    observedActions = extractActions(linksFromHtml(contentHtml(html), response.url || sourceUrl));
  }
  if (!String(text || "").trim()) throw new Error("Extraction returned no usable text.");
  const expectedActions = new Set(approvedSources.map((source) => actionIdentity(source.actions || [])));
  return {
    observedHashes: chunkText(text).map(sourceHash),
    actionMismatch: expectedActions.size !== 1 || !expectedActions.has(actionIdentity(observedActions)),
    actionProof: {
      expected: approvedSources.map((source) => ({ id: source.id, digest: actionDigest(source.actions || []), actions: source.actions || [] })),
      observed: { digest: actionDigest(observedActions), actions: observedActions },
    },
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
          observedHashes, actionProof: observation?.actionProof || null, extraHashes,
          missing: missing.map(({ id, contentHash }) => ({ id, contentHash })), checkedAt, staleAfter,
        });
      }
      const renewal = renewExactApprovedEvidence(temporaryIndex, { sourceUrl, observedHashes, checkedAt, staleAfter });
      return reviewRecord(sourceUrl, approvedSources, "renewed", { observedHashes, actionProof: observation?.actionProof || null, checkedAt, staleAfter,
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

module.exports = { actionDigest, actionIdentity, hasApprovedProjection, isApprovedSource, isRevalidatableApprovedSource, observeCanonicalSource, renewExactApprovedEvidence, revalidateApprovedEvidence, selectRevalidationTargetUrls, sourceHash };

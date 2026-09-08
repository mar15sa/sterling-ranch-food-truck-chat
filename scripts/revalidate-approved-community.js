#!/usr/bin/env node
const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const { pageText, stripEmbeddedInstructions, extractPdfText, chunkText, isDocumentUrl } = require("../lib/community-ingest");
const { isFreshnessTrackedSource } = require("../lib/community-source-manager");
const { APPROVED_REVIEW_STATUSES } = require("../lib/community-truth");

const VERIFIER_VERSION = "approved-evidence-ci-bridge-v1";

function isApprovedSource(source = {}) {
  // The active index is the reviewed source snapshot. An explicit non-approved
  // review status is still never renewable through this unattended path.
  return isFreshnessTrackedSource(source)
    && !["candidate", "excluded", "escalated", "rejected"].includes(source.reviewStatus);
}

function selectRevalidationTargetUrls(index = {}, now = Date.now()) {
  const activeSources = (index.sources || []).filter(isApprovedSource);
  const activeByVersion = new Map(activeSources.map((source) => [`${source.id}:${source.contentHash}`, source]));
  const urls = new Set(activeSources
    .filter((source) => Date.parse(source.staleAfter) < now)
    .map((source) => source.sourceUrl));
  // A fact can have its own earlier deadline. Recheck the exact active source
  // version that supports it, even when the page-level source record is fresh.
  // A missing or changed source version cannot be renewed through this path.
  for (const fact of index.factLedger || []) {
    if (!APPROVED_REVIEW_STATUSES.has(fact.reviewStatus) || !(Date.parse(fact.staleAfter) < now)) continue;
    const source = activeByVersion.get(`${fact.sourceId}:${fact.sourceVersion}`);
    if (source) urls.add(source.sourceUrl);
  }
  return [...urls].sort();
}

function renewExactApprovedEvidence(index = {}, { sourceUrl, observedHashes = [], checkedAt, staleAfter } = {}) {
  const hashes = new Set(observedHashes);
  const renewedSources = (index.sources || []).filter((source) =>
    source.sourceUrl === sourceUrl && isApprovedSource(source) && hashes.has(source.contentHash)
  );
  const renewedVersions = new Set(renewedSources.map((source) => `${source.id}:${source.contentHash}`));
  for (const source of renewedSources) Object.assign(source, { checkedAt, staleAfter });
  const renewedFacts = (index.factLedger || []).filter((fact) =>
    APPROVED_REVIEW_STATUSES.has(fact.reviewStatus)
      && renewedVersions.has(`${fact.sourceId}:${fact.sourceVersion}`)
  );
  for (const fact of renewedFacts) Object.assign(fact, { lastObservedAt: checkedAt, staleAfter });
  const requiresReview = (index.sources || []).filter((source) =>
    source.sourceUrl === sourceUrl && isApprovedSource(source) && !hashes.has(source.contentHash)
  );
  return { renewedSources, renewedFacts, requiresReview };
}

function approvedFingerprint(index = {}) {
  // This deliberately delegates to the release fingerprint instead of adding a
  // second interpretation of "approved" evidence. Dynamic records remain out
  // of the release identity exactly as they do for an owner-approved release.
  return require("../lib/community-release").fingerprint(index);
}

function inputFingerprint(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function reviewRecord(sourceUrl, sources, outcome, details = {}) {
  return {
    sourceUrl,
    sources: sources.map(({ id, contentHash, actions = [] }) => ({ id, contentHash, actionCount: actions.length })),
    outcome,
    ...details,
  };
}

async function revalidateApprovedEvidence(index, { now = Date.now(), fetchObservedHashes, staleAfterMs = 86_400_000 } = {}) {
  if (typeof fetchObservedHashes !== "function") throw new Error("A canonical source observer is required.");
  const temporaryIndex = structuredClone(index);
  const checks = [];
  for (const sourceUrl of selectRevalidationTargetUrls(temporaryIndex, now)) {
    const approvedSources = temporaryIndex.sources.filter((source) => source.sourceUrl === sourceUrl && isApprovedSource(source));
    const checkedAt = new Date(now).toISOString();
    const staleAfter = new Date(now + staleAfterMs).toISOString();
    try {
      const observation = await fetchObservedHashes(sourceUrl, approvedSources);
      const observedHashes = Array.isArray(observation?.observedHashes) ? observation.observedHashes : [];
      const expectedHashes = new Set(approvedSources.map((source) => source.contentHash));
      const extraHashes = observedHashes.filter((hash) => !expectedHashes.has(hash));
      const renewal = renewExactApprovedEvidence(temporaryIndex, { sourceUrl, observedHashes, checkedAt, staleAfter });
      const missing = approvedSources.filter((source) => !renewal.renewedSources.some((item) => item.id === source.id && item.contentHash === source.contentHash));
      if (observation?.actionMismatch || !observedHashes.length || extraHashes.length || missing.length || renewal.requiresReview.length) {
        checks.push(reviewRecord(sourceUrl, approvedSources, "review-required", {
          reason: observation?.actionMismatch ? "action-identity-changed" : !observedHashes.length ? "no-valid-proof" : extraHashes.length ? "extra-source-identity-or-content-hash" : "source-identity-or-content-hash-changed",
          observedHashes,
          extraHashes,
          missing: missing.map(({ id, contentHash }) => ({ id, contentHash })),
          requiresReview: renewal.requiresReview.map(({ id, contentHash }) => ({ id, contentHash })),
          checkedAt,
          staleAfter,
        }));
        continue;
      }
      checks.push(reviewRecord(sourceUrl, approvedSources, "renewed", { observedHashes, checkedAt, staleAfter }));
    } catch (error) {
      checks.push(reviewRecord(sourceUrl, approvedSources, "review-required", { reason: "fetch-or-extraction-failed", error: error.message, checkedAt, staleAfter }));
    }
  }
  return { temporaryIndex, checks };
}

async function main() {
  const file = "data/community-index.json";
  const index = JSON.parse(await fs.readFile(file, "utf8"));
  const checks = [];
  for (const sourceUrl of selectRevalidationTargetUrls(index)) {
    try {
      let content;
      if (isDocumentUrl(sourceUrl)) content = await extractPdfText(sourceUrl);
      else {
        const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(30_000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        content = stripEmbeddedInstructions(pageText(await response.text()));
      }
      const observedHashes = chunkText(content).map((text) => crypto.createHash("sha256").update(text).digest("hex"));
      const checkedAt = new Date().toISOString();
      const staleAfter = new Date(Date.now() + 86_400_000).toISOString();
      const renewal = renewExactApprovedEvidence(index, { sourceUrl, observedHashes, checkedAt, staleAfter });
      checks.push({
        sourceUrl,
        checkedAt,
        renewed: renewal.renewedSources.map(({ id, contentHash }) => ({ id, contentHash })),
        renewedFacts: renewal.renewedFacts.map(({ id, sourceId, sourceVersion }) => ({ id, sourceId, sourceVersion })),
        requiresReview: renewal.requiresReview.map(({ id, contentHash }) => ({ id, contentHash })),
      });
    } catch (error) { checks.push({ sourceUrl, error: error.message }); }
  }
  const report = { checkedAt: new Date().toISOString(), mode: "exact-url-and-content-hash-only", checks };
  await fs.writeFile("data/community-approved-revalidation.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (process.argv.includes("--write")) await fs.writeFile(file, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    checkedUrls: checks.length,
    renewed: checks.flatMap((check) => check.renewed || []).length,
    renewedFacts: checks.flatMap((check) => check.renewedFacts || []).length,
    review: checks.flatMap((check) => check.requiresReview || []).length,
    failures: checks.filter((check) => check.error).length,
  }));
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { VERIFIER_VERSION, approvedFingerprint, inputFingerprint, isApprovedSource, renewExactApprovedEvidence, revalidateApprovedEvidence, selectRevalidationTargetUrls };

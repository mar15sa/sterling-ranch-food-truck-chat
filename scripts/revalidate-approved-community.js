#!/usr/bin/env node
const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const { pageText, stripEmbeddedInstructions, extractPdfText, chunkText, isDocumentUrl } = require("../lib/community-ingest");
const { isFreshnessTrackedSource } = require("../lib/community-source-manager");
const { APPROVED_REVIEW_STATUSES } = require("../lib/community-truth");

function isApprovedSource(source = {}) {
  // The active index is the reviewed source snapshot. An explicit non-approved
  // review status is still never renewable through this unattended path.
  return isFreshnessTrackedSource(source)
    && !["candidate", "excluded", "escalated", "rejected"].includes(source.reviewStatus);
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

async function main() {
  const file = "data/community-index.json";
  const index = JSON.parse(await fs.readFile(file, "utf8"));
  const overdue = index.sources.filter((source) => isApprovedSource(source) && Date.parse(source.staleAfter) < Date.now());
  const checks = [];
  for (const sourceUrl of [...new Set(overdue.map((source) => source.sourceUrl))]) {
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

module.exports = { isApprovedSource, renewExactApprovedEvidence };

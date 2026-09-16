#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { buildReviewedSources, sourceUrlIdentity } = require("../lib/community-reviewed-package");
const { buildFactLedger } = require("../lib/community-truth");
const { refreshTruthStatus } = require("./revalidate-approved-community");
const { buildLedger } = require("./build-canonical-source-ledger");

const root = path.join(__dirname, "..");
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const write = (file, value) => fs.writeFileSync(path.join(root, file), `${JSON.stringify(value, null, 2)}\n`);

function reviewRecord(decision, decidedAt) {
  const version = decision.versions[0];
  return {
    sourceUrl: version.canonicalUrl,
    ...(decision.categoryId ? { categoryId: decision.categoryId } : {}),
    title: decision.title,
    disposition: "answer-evidence",
    reason: decision.scope,
    versionFingerprint: version.contentHash,
    indexed: true,
    approvedRole: "owner-approved-scoped-evidence",
    reviewedAt: decidedAt,
    reviewedContentHash: version.contentHash,
    approvedClaimCount: decision.facts.length,
    approvedActionCount: decision.actions.length,
    approvedClaims: decision.facts.map((fact) => fact.text),
    withheldClaims: decision.withheldClaims,
    verification: decision.verification,
  };
}

function updateDispositionFile(file, packageData) {
  const value = read(file);
  const replacements = new Map(packageData.decisions.map((decision) => {
    const record = reviewRecord(decision, packageData.decidedAt);
    return [sourceUrlIdentity(record.sourceUrl), record];
  }));
  value.records = (value.records || []).map((record) => {
    const replacement = replacements.get(sourceUrlIdentity(record.sourceUrl));
    return replacement ? { ...record, ...replacement } : record;
  });
  for (const replacement of replacements.values()) {
    if (!value.records.some((record) => sourceUrlIdentity(record.sourceUrl) === sourceUrlIdentity(replacement.sourceUrl))) {
      value.records.push(replacement);
    }
  }
  write(file, value);
}

function main() {
  const packageData = read("data/community-source-approvals-v9.json");
  write("data/canonical-source-ledger.json", buildLedger());

  const index = read("data/community-index.json");
  const additions = buildReviewedSources(packageData);
  const replacementIds = new Set(additions.map((source) => source.id));
  index.sources = index.sources.filter((source) => !replacementIds.has(source.id));
  index.sources.push(...additions);
  for (const page of index.pages || []) {
    const identity = sourceUrlIdentity(page.sourceUrl || page.url);
    const matchingIds = additions.filter((source) => sourceUrlIdentity(source.sourceUrl) === identity).map((source) => source.id);
    if (!matchingIds.length) continue;
    page.indexedSourceIds = [...new Set([...(page.indexedSourceIds || []).filter((id) => !replacementIds.has(id)), ...matchingIds])];
  }
  index.sourceCount = index.sources.length;
  index.factLedger = buildFactLedger(index, { previousLedger: index.factLedger });
  refreshTruthStatus(index, packageData.decidedAt);
  write("data/community-index.json", index);

  updateDispositionFile("data/community-page-dispositions.json", packageData);
  updateDispositionFile("data/community-full-url-audit.json", packageData);
  console.log(JSON.stringify({ approvedSources: additions.length, approvedFacts: additions.reduce((sum, source) => sum + source.facts.length, 0), approvedActions: additions.reduce((sum, source) => sum + source.actions.length, 0) }));
}

if (require.main === module) main();
module.exports = { main, reviewRecord, updateDispositionFile };

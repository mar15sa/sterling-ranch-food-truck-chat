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

function main() {
  const packageData = read("data/community-source-approvals-v10.json");
  write("data/canonical-source-ledger.json", buildLedger());

  const index = read("data/community-index.json");
  const additions = buildReviewedSources(packageData);
  const replacementIds = new Set(additions.map((source) => source.id));
  const replacementUrls = new Set(additions.map((source) => sourceUrlIdentity(source.sourceUrl)));
  // Once the owner approves a scoped projection for a changed page, remove
  // the older raw extraction chunks for that page. Keeping both makes stale
  // raw text answer-eligible and causes one page change to appear as several
  // separate failures.
  index.sources = index.sources.filter((source) => !replacementIds.has(source.id)
    && !replacementUrls.has(sourceUrlIdentity(source.sourceUrl)));
  index.sources.push(...additions);
  for (const page of index.pages || []) {
    const identity = sourceUrlIdentity(page.sourceUrl || page.url);
    if (!replacementUrls.has(identity)) continue;
    page.indexedSourceIds = additions
      .filter((source) => sourceUrlIdentity(source.sourceUrl) === identity)
      .map((source) => source.id);
  }
  index.sourceCount = index.sources.length;
  index.factLedger = buildFactLedger(index, { previousLedger: index.factLedger });
  refreshTruthStatus(index, packageData.decidedAt);
  write("data/community-index.json", index);

  console.log(JSON.stringify({
    approvedSources: additions.length,
    approvedFacts: additions.reduce((sum, source) => sum + source.facts.length, 0),
    approvedActions: additions.reduce((sum, source) => sum + source.actions.length, 0),
  }));
}

if (require.main === module) main();
module.exports = { main };

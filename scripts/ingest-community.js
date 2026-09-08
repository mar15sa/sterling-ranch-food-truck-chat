#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const { crawlCommunity } = require("../lib/community-ingest");
const { validateCommunityProfile } = require("../lib/community-contracts");

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function main() {
  const profilePath = path.resolve(option("--profile", path.join(__dirname, "..", "data", "communities", "sterling-ranch.json")));
  const outputPath = path.resolve(option("--output", path.join(__dirname, "..", "data", "community-index.json")));
  const previousPath = path.resolve(option("--previous", path.join(__dirname, "..", "data", "community-index.json")));
  const maxPages = Number(option("--max-pages", "80"));
  const maxDocuments = Number(option("--max-documents", "80"));
  const profile = validateCommunityProfile(JSON.parse(await fs.readFile(profilePath, "utf8")));
  let previousIndex = null;
  try { previousIndex = JSON.parse(await fs.readFile(previousPath, "utf8")); } catch { /* first collection */ }
  const index = await crawlCommunity(profile, { maxPages, maxDocuments, previousIndex, forceContent: process.argv.includes("--force-content") });
  await fs.writeFile(outputPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  console.log(`Wrote ${outputPath} with ${index.sourceCount} source records. Checked ${index.pageCount} pages; inventory: ${index.inventory?.indexedPageCount || 0} indexed, ${index.inventory?.pendingCount || 0} pending, ${index.inventory?.excludedCount || 0} explicitly excluded (${index.failureCount} failures).`);
  if (index.failureCount) {
    for (const failure of index.failures.slice(0, 10)) console.warn(`- ${failure.url}: ${failure.error}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

#!/usr/bin/env node
const fs = require("node:fs/promises");
const path = require("node:path");
const { listReviewRecords } = require("../lib/community-source-review");
const { pendingReviewItems } = require("../lib/community-review-queue");

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function main() {
  const output = path.resolve(option("--output", path.join(__dirname, "..", "data", "community-review-decisions.json")));
  const records = await listReviewRecords();
  const decisions = records.filter((record) => record.recordType === "decision");
  const overdue = pendingReviewItems(records).filter((record) =>
    Date.now() - new Date(record.createdAt || 0).getTime() > 7 * 24 * 60 * 60 * 1000
  );
  await fs.writeFile(output, `${JSON.stringify(decisions, null, 2)}\n`, "utf8");
  console.log(`Exported ${decisions.length} immutable source-review decisions to ${output}.`);
  if (overdue.length) {
    console.warn(`${overdue.length} source reviews have been waiting longer than seven days.`);
    if (process.argv.includes("--fail-overdue")) throw new Error("The overdue source-review alert requires owner attention.");
  }
}

main().catch((error) => {
  console.error(`Source-review decision export failed: ${error.message}`);
  process.exitCode = 1;
});

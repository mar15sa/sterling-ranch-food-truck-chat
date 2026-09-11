#!/usr/bin/env node
const fs = require("node:fs/promises");
const path = require("node:path");
// Enforce a read-only Notion client before importing the review repository.
require("./source-review-readonly.cjs");
const { listReviewRecords, reviewConfig } = require("../lib/community-source-review");
const { buildSourceOperationsReport, reportMarkdown } = require("../lib/community-source-operations-report");

function flag(name, fallback = "") {
  const position = process.argv.indexOf(name);
  return position >= 0 && process.argv[position + 1] ? process.argv[position + 1] : fallback;
}

async function readJson(file, fallback = null) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); } catch (error) {
    if (error.code === "ENOENT" && fallback !== null) return fallback;
    throw error;
  }
}

function requireReviewConfiguration(config = reviewConfig()) {
  const missing = [];
  if (!config.token) missing.push("COMMUNITY_SOURCE_REVIEW_NOTION_TOKEN");
  if (!config.dataSourceId && !config.databaseId) missing.push("COMMUNITY_SOURCE_REVIEW_NOTION_DATA_SOURCE_ID or COMMUNITY_SOURCE_REVIEW_NOTION_DATABASE_ID");
  if (!config.titleProperty) missing.push("COMMUNITY_SOURCE_REVIEW_NOTION_TITLE_PROPERTY");
  if (missing.length) throw new Error(`Community source operations reporting requires configured private review secrets: ${missing.join(", ")}.`);
}

function revalidationSummary(attestation = {}) {
  return {
    status: attestation.status || "not-run",
    checkedUrlCount: Array.isArray(attestation.checks) ? attestation.checks.length : 0,
  };
}

async function main() {
  const indexPath = path.resolve(flag("--index", "data/community-index.json"));
  const output = path.resolve(flag("--output", "artifacts/community-source-operations-report.json"));
  const markdown = path.resolve(flag("--markdown", "artifacts/community-source-operations-report.md"));
  const previous = path.resolve(flag("--previous", ""));
  const attestationPath = flag("--revalidation-attestation", "");
  const monthly = process.argv.includes("--monthly");
  requireReviewConfiguration();
  const [index, reviewRecords, previousReport, attestation] = await Promise.all([
    readJson(indexPath), listReviewRecords(), previous ? readJson(previous, {}) : Promise.resolve({}),
    attestationPath ? readJson(path.resolve(attestationPath), {}) : Promise.resolve({}),
  ]);
  const report = buildSourceOperationsReport({ index, reviewRecords, previousReport, revalidation: revalidationSummary(attestation) });
  await Promise.all([fs.mkdir(path.dirname(output), { recursive: true }), fs.mkdir(path.dirname(markdown), { recursive: true })]);
  await Promise.all([
    fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`),
    fs.writeFile(markdown, reportMarkdown(report, { monthly })),
  ]);
  console.log(JSON.stringify({ generatedAt: report.generatedAt, pendingReviewItems: report.reviewQueue.pendingCount, expiredApprovedSources: report.approvedBundle.expiredSources, expiredApprovedFacts: report.approvedBundle.expiredFacts }));
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { requireReviewConfiguration, revalidationSummary };

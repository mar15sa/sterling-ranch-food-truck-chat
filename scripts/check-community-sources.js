#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { crawlCommunity } = require("../lib/community-ingest");
const { validateCommunityProfile, validateSourceRecord } = require("../lib/community-contracts");

const root = path.join(__dirname, "..");
const profile = validateCommunityProfile(JSON.parse(fs.readFileSync(path.join(root, "data", "communities", "sterling-ranch.json"), "utf8")));
const bundled = JSON.parse(fs.readFileSync(path.join(root, "data", "community-index.json"), "utf8"));

function audit(index) {
  if (index.communityId !== profile.communityId) throw new Error("Index community does not match its profile.");
  if (!Array.isArray(index.sources) || index.sources.length < 20) throw new Error("Community index has too few usable source records.");
  index.sources.forEach(validateSourceRecord);
  const required = ["rules", "facilities", "forms", "events", "status", "services"];
  const present = new Set(index.sources.map((source) => source.sourceType));
  const missing = required.filter((type) => !present.has(type));
  if (missing.length) throw new Error(`Community index is missing source types: ${missing.join(", ")}.`);
  const noisy = index.sources.filter((source) => /WidgetSkinID|activeWidgetSkinComponentsOnPageJson|Google Tag Manager/i.test(source.text));
  if (noisy.length) throw new Error(`${noisy.length} source records still contain CivicPlus page code.`);
  const instructionLeakage = index.sources.filter((source) => /ignore (?:all |any |the )?(?:previous|prior|system)|reveal (?:the )?(?:system prompt|api key|secret|token)|follow these instructions instead/i.test(source.text));
  if (instructionLeakage.length) throw new Error(`${instructionLeakage.length} source records contain embedded instructions.`);
  const canonicalUrl = (value) => {
    try {
      const url = new URL(value);
      return `${url.hostname.replace(/^www\./i, "").toLowerCase()}${url.pathname.replace(/\/$/, "")}${url.search}`;
    } catch {
      return String(value || "").trim().toLowerCase();
    }
  };
  const failedUrls = new Set((index.failures || []).map((failure) => canonicalUrl(failure.url)));
  const brokenActions = index.sources.flatMap((source) => source.actions || []).filter((action) => failedUrls.has(canonicalUrl(action.url)));
  if (brokenActions.length) throw new Error(`${brokenActions.length} resident action links point to sources that failed this crawl.`);
  const failureRate = Number(index.failureCount || 0) / Math.max(1, Number(index.pageCount || index.sources.length));
  if (failureRate > 0.25) throw new Error(`Source failure rate is too high (${Math.round(failureRate * 100)}%).`);
  return { sourceCount: index.sources.length, failureCount: Number(index.failureCount || 0), brokenActionCount: 0, sourceTypes: [...present].sort() };
}

async function main() {
  const live = process.argv.includes("--live");
  const index = live ? await crawlCommunity(profile) : bundled;
  const before = new Map(bundled.sources.map((source) => [source.id, source]));
  const after = new Map(index.sources.map((source) => [source.id, source]));
  const identity = (source) => ({ id: source.id, title: source.title, url: source.url, contentHash: source.contentHash });
  const report = {
    checkedAt: new Date().toISOString(),
    mode: live ? "live" : "bundled",
    status: "pending",
    publicationApproved: false,
    failures: index.failures || [],
    changedSources: live ? index.sources.filter((source) => before.get(source.id)?.contentHash !== source.contentHash).map((source) => ({ ...identity(source), previousContentHash: before.get(source.id)?.contentHash || null })) : [],
    absentSources: live ? bundled.sources.filter((source) => !after.has(source.id)).map(identity) : [],
    reviewNote: "Crawl differences require review. Absence from this crawl does not establish removal from the official site. This check does not approve changes or renew production freshness.",
  };
  report.reviewRequired = report.failures.length > 0 || report.changedSources.length > 0 || report.absentSources.length > 0;
  const saveReport = () => {
    if (process.argv.includes("--write")) fs.writeFileSync(path.join(root, "data", "community-source-check-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  };
  try {
    const result = audit(index);
    if (live) {
      result.changedSourceCount = report.changedSources.length;
      result.absentSourceCount = report.absentSources.length;
    }
    report.status = "passed";
    report.summary = result;
    console.log(`Community source check passed: ${JSON.stringify(result)}`);
  } catch (error) {
    report.status = "failed";
    report.error = error.message;
    throw error;
  } finally {
    saveReport();
  }
}

main().catch((error) => { console.error(`Community source check failed: ${error.message}`); process.exitCode = 1; });

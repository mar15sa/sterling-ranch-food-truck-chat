#!/usr/bin/env node
const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const { isApprovedSource, observeCanonicalSource, renewExactApprovedEvidence, revalidateApprovedEvidence, selectRevalidationTargetUrls } = require("../lib/community-approved-revalidation");

const VERIFIER_VERSION = "approved-evidence-ci-bridge-v1";

function approvedFingerprint(index = {}) {
  // This deliberately delegates to the release fingerprint instead of adding a
  // second interpretation of "approved" evidence. Dynamic records remain out
  // of the release identity exactly as they do for an owner-approved release.
  return require("../lib/community-release").fingerprint(index);
}

function inputFingerprint(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function main() {
  const file = "data/community-index.json";
  const index = JSON.parse(await fs.readFile(file, "utf8"));
  const result = await revalidateApprovedEvidence(index, { fetchObservedHashes: observeCanonicalSource });
  const { checks } = result;
  const report = { checkedAt: new Date().toISOString(), mode: "exact-url-and-content-hash-only", checks };
  await fs.writeFile("data/community-approved-revalidation.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (process.argv.includes("--write")) await fs.writeFile(file, `${JSON.stringify(result.temporaryIndex, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    checkedUrls: checks.length,
    renewed: checks.filter((check) => check.outcome === "renewed").length,
    review: checks.filter((check) => check.outcome !== "renewed").length,
  }));
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { VERIFIER_VERSION, approvedFingerprint, inputFingerprint, isApprovedSource, renewExactApprovedEvidence, revalidateApprovedEvidence, selectRevalidationTargetUrls };

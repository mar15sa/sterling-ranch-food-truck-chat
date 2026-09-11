#!/usr/bin/env node
// CI-only evidence bridge. It renews freshness in a disposable snapshot and
// never changes the owner-approved community-index.json file.
const fs = require("node:fs/promises");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { actionDigest, actionIdentity, observeCanonicalSource, sourceHash } = require("../lib/community-approved-revalidation");
const { audit } = require("./check-community-sources");
const { VERIFIER_VERSION, approvedFingerprint, inputFingerprint, revalidateApprovedEvidence } = require("./revalidate-approved-community");

function argument(flag, fallback = "") {
  const position = process.argv.indexOf(flag);
  return position >= 0 && process.argv[position + 1] ? process.argv[position + 1] : fallback;
}

function gitCommit() {
  try { return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch { return "unavailable"; }
}

function canonicalize(value, volatileKeys = new Set()) {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item, volatileKeys))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().flatMap((key) => {
    if (volatileKeys.has(key)) return [];
    return [[key, canonicalize(value[key], volatileKeys)]];
  }));
}

function sourceEvidenceIdentity(index = {}, source = {}) {
  const sourceVolatileKeys = new Set(["checkedAt", "staleAfter", "lastObservedAt"]);
  const ledgerVolatileKeys = new Set(["staleAfter", "lastObservedAt"]);
  const ledger = (index.factLedger || []).filter((entry) => entry.sourceId === source.id
    && entry.sourceVersion === source.contentHash)
    .map((entry) => canonicalize(entry, ledgerVolatileKeys))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return JSON.stringify({
    source: canonicalize(source, sourceVolatileKeys),
    ledger,
  });
}

function quarantineUnchangedUnavailableEvidence(temporaryIndex, checks = [], baselineIndex) {
  if (!baselineIndex) return [];
  const baselineById = new Map((baselineIndex.sources || []).map((source) => [source.id, source]));
  const quarantined = [];
  for (const check of checks) {
    if (check.outcome !== "review-required" || check.reason !== "fetch-or-extraction-failed") continue;
    const currentSources = (temporaryIndex.sources || []).filter((source) => source.sourceUrl === check.sourceUrl);
    const baselineSources = (baselineIndex.sources || []).filter((source) => source.sourceUrl === check.sourceUrl);
    // An outage may only be quarantined when this branch retained every exact
    // approved record from its baseline. A changed/new decision or source is
    // never allowed to hide behind an unreachable official page.
    if (!currentSources.length || currentSources.length !== baselineSources.length || !currentSources.every((source) => {
      const baseline = baselineById.get(source.id);
      return baseline && sourceEvidenceIdentity(temporaryIndex, source) === sourceEvidenceIdentity(baselineIndex, baseline);
    })) continue;
    quarantined.push(...currentSources.map((source) => ({ id: source.id, sourceUrl: source.sourceUrl,
      contentHash: source.contentHash, reason: check.reason, checkedAt: check.checkedAt })));
  }
  if (quarantined.length) {
    temporaryIndex.revalidationQuarantine = {
      mode: "temporary-unavailable-approved-evidence",
      sources: quarantined,
    };
  }
  return quarantined;
}

async function runBridge({ index, baselineIndex, now = Date.now(), fetchObservedHashes, auditFn = audit, staleAfterMs } = {}) {
  const beforeFingerprint = approvedFingerprint(index);
  const result = await revalidateApprovedEvidence(index, { now, fetchObservedHashes, ...(staleAfterMs === undefined ? {} : { staleAfterMs }) });
  const quarantined = quarantineUnchangedUnavailableEvidence(result.temporaryIndex, result.checks, baselineIndex);
  const quarantinedIds = new Set(quarantined.map((source) => source.id));
  const gateErrors = [];
  try { auditFn(result.temporaryIndex); } catch (error) { gateErrors.push(error.message); }
  if (result.checks.some((check) => check.outcome !== "renewed" && !check.sources.every((source) => quarantinedIds.has(source.id)))) {
    gateErrors.push("Approved evidence requires owner review.");
  }
  const afterFingerprint = approvedFingerprint(result.temporaryIndex);
  if (beforeFingerprint !== afterFingerprint) gateErrors.push("Approved evidence fingerprint changed during revalidation.");
  const attestation = {
    verifierVersion: VERIFIER_VERSION,
    commit: gitCommit(),
    inputFingerprint: inputFingerprint(index),
    beforeApprovedFingerprint: beforeFingerprint,
    afterApprovedFingerprint: afterFingerprint,
    checkedAt: new Date(now).toISOString(),
    status: gateErrors.length ? "failed" : quarantined.length ? "passed-with-withheld-evidence" : "passed",
    checks: result.checks,
    quarantined,
    gateErrors,
  };
  return { ...result, attestation, valid: gateErrors.length === 0 };
}

async function main() {
  const input = path.resolve(argument("--input", "data/community-index.json"));
  const output = path.resolve(argument("--temporary-output", path.join("artifacts", "community-index.revalidated.json")));
  const attestationOutput = path.resolve(argument("--attestation", path.join("artifacts", "community-approved-revalidation-attestation.json")));
  const reviewOutput = path.resolve(argument("--review-output", path.join("artifacts", "community-approved-revalidation-review.json")));
  const baseline = argument("--baseline", "");
  if (input === output || output.endsWith(`${path.sep}data${path.sep}community-index.json`)) throw new Error("The CI bridge may not overwrite the approved index.");
  const index = JSON.parse(await fs.readFile(input, "utf8"));
  const baselineIndex = baseline ? JSON.parse(await fs.readFile(path.resolve(baseline), "utf8")) : undefined;
  const result = await runBridge({ index, baselineIndex, fetchObservedHashes: observeCanonicalSource });
  await Promise.all([fs.mkdir(path.dirname(output), { recursive: true }), fs.mkdir(path.dirname(attestationOutput), { recursive: true }), fs.mkdir(path.dirname(reviewOutput), { recursive: true })]);
  await fs.writeFile(output, `${JSON.stringify(result.temporaryIndex, null, 2)}\n`);
  await fs.writeFile(attestationOutput, `${JSON.stringify(result.attestation, null, 2)}\n`);
  await fs.writeFile(reviewOutput, `${JSON.stringify({ checkedAt: result.attestation.checkedAt, status: result.attestation.status, checks: result.checks, gateErrors: result.attestation.gateErrors }, null, 2)}\n`);
  console.log(JSON.stringify({ status: result.attestation.status, checkedUrls: result.checks.length, approvedFingerprint: result.attestation.afterApprovedFingerprint }));
  if (!result.valid) process.exitCode = 1;
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { actionDigest, actionIdentity, canonicalize, observeCanonicalSource, quarantineUnchangedUnavailableEvidence, runBridge, sourceEvidenceIdentity, sourceHash };

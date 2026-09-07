#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { isDynamicSource } = require("../lib/community-source-identity");

const ROOT = path.join(__dirname, "..");
const DEFAULT_SOURCE_INDEX = path.join(ROOT, "data", "community-index.json");
const DEFAULT_MAX_AGE_HOURS = 7 * 24;
const ROUTING_MINIMUMS = Object.freeze({
  goalAndSubjectAccuracy: 0.98,
  intentAccuracy: 0.98,
  structuredAccuracy: 0.98,
  consistency: 0.98,
  injectionRejection: 1,
});
const VOLATILE_SOURCE_KEYS = new Set([
  "checkedAt", "staleAfter", "lastCheckedAt", "lastRefreshAt", "refreshedAt",
  "fetchedAt", "generatedAt", "observedAt", "lastRunAt", "nextRefreshAt",
]);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]));
}

function stripVolatile(value) {
  if (Array.isArray(value)) return value.map(stripVolatile);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !VOLATILE_SOURCE_KEYS.has(key))
    .map(([key, child]) => [key, stripVolatile(child)]));
}

function approvedSourceFingerprint(index = {}) {
  const { sources = [], ...topLevel } = index;
  const approved = sources
    .filter((source) => !isDynamicSource(source))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  return sha256(JSON.stringify(canonicalJson(stripVolatile({ ...topLevel, sources: approved }))));
}

function runtimeFiles(root = ROOT) {
  const files = [
    "server.js", "package.json", "package-lock.json", "scripts/eval-community-routing-live.js",
    "scripts/check-community-application-soak.js", "data/community-routing-benchmark.json",
    "data/rules-index.json", "data/rules-fact-catalog.json", "data/rules-supplements.json",
    "data/rules-supplement-sections.json", "data/rules-official-resources.json",
  ];
  const libDir = path.join(root, "lib");
  for (const entry of fs.readdirSync(libDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".js")) files.push(path.join("lib", entry.name));
  }
  const profilesDir = path.join(root, "data", "communities");
  for (const entry of fs.readdirSync(profilesDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".json")) files.push(path.join("data", "communities", entry.name));
  }
  return files.sort();
}

function runtimeFingerprint(root = ROOT) {
  const entries = runtimeFiles(root).map((relativePath) => ({
    path: relativePath.replace(/\\/g, "/"),
    content: fs.readFileSync(path.join(root, relativePath)),
  }));
  const hash = crypto.createHash("sha256");
  for (const entry of entries) {
    hash.update(entry.path);
    hash.update("\0");
    hash.update(entry.content);
    hash.update("\0");
  }
  return hash.digest("hex");
}

function currentIdentity({ root = ROOT, sourceIndex = DEFAULT_SOURCE_INDEX, configurationFingerprint }) {
  if (!/^[a-f0-9]{64}$/i.test(String(configurationFingerprint || ""))) {
    throw new Error("Provide the 64-character configuration fingerprint from the deployment health response.");
  }
  return {
    runtimeFingerprint: runtimeFingerprint(root),
    sourceFingerprint: approvedSourceFingerprint(JSON.parse(fs.readFileSync(sourceIndex, "utf8"))),
    configurationFingerprint: String(configurationFingerprint).toLowerCase(),
  };
}

function validateEvidence(evidence = {}, identity, { now = Date.now(), maxAgeHours = DEFAULT_MAX_AGE_HOURS } = {}) {
  const reasons = [];
  const evidenceIdentity = evidence.identity;
  if (!evidenceIdentity || typeof evidenceIdentity !== "object") reasons.push("evidence has no recorded identity");
  for (const key of ["runtimeFingerprint", "sourceFingerprint", "configurationFingerprint"]) {
    if (!evidenceIdentity?.[key]) reasons.push(`evidence is missing ${key}`);
    else if (evidenceIdentity[key] !== identity[key]) reasons.push(`${key} changed`);
  }
  if (evidence.result !== "passed") reasons.push("evidence did not record a passed result");
  if (evidence.candidateValid !== true) reasons.push(evidence.candidateValid === false ? "candidate validation failed" : "candidate validation is missing");
  if (!Array.isArray(evidence.failures) || evidence.failures.length) reasons.push("evidence has failures or an incomplete failure record");
  const summary = evidence.summary || {};
  if (!Number.isInteger(summary.caseCount) || summary.caseCount !== 50 || !Number.isInteger(summary.repeats) || summary.repeats < 3 || summary.runCount !== summary.caseCount * summary.repeats) {
    reasons.push("evidence is not a complete 50-case, three-repeat routing benchmark");
  }
  for (const [key, minimum] of Object.entries(ROUTING_MINIMUMS)) {
    if (typeof summary[key] !== "number" || summary[key] < minimum) reasons.push(`${key} is below the required threshold`);
  }
  if (!Array.isArray(evidence.observations) || evidence.observations.length !== summary.runCount) {
    reasons.push("evidence observations are incomplete");
  } else {
    const observationKeys = new Set(evidence.observations.map((item) => `${item.id}:${item.repeat}`));
    if (observationKeys.size !== summary.runCount || evidence.observations.some((item) => !item.id || !Number.isInteger(item.repeat) || item.repeat < 1 || item.repeat > summary.repeats)) {
      reasons.push("evidence observations do not cover each benchmark run exactly once");
    }
  }
  const generatedAt = Date.parse(evidence.generatedAt || evidence.completedAt || "");
  if (!Number.isFinite(generatedAt)) reasons.push("evidence timestamp is missing");
  else if (generatedAt > now || now - generatedAt > maxAgeHours * 60 * 60 * 1000) reasons.push(`evidence is older than ${maxAgeHours} hours`);
  return {
    decision: reasons.length ? "needs-full" : "reusable",
    reason: reasons.length ? reasons.join("; ") : "same approved sources, runtime behavior, and model configuration",
    reasons,
    identity,
  };
}

function option(argv, name, fallback = "") {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
}

function main(argv = process.argv.slice(2)) {
  const evidencePath = option(argv, "evidence");
  const configFingerprint = option(argv, "config-fingerprint");
  if (!evidencePath) throw new Error("Use --evidence <routing-report.json>.");
  const sourceIndex = option(argv, "source-index", DEFAULT_SOURCE_INDEX);
  const maxAgeHours = Number(option(argv, "max-age-hours", String(DEFAULT_MAX_AGE_HOURS)));
  const now = Number(option(argv, "now", String(Date.now())));
  if (!Number.isFinite(maxAgeHours) || maxAgeHours < 0 || !Number.isFinite(now)) throw new Error("Age and clock values must be valid numbers.");
  const identity = currentIdentity({ sourceIndex, configurationFingerprint: configFingerprint });
  const evidence = JSON.parse(fs.readFileSync(path.resolve(evidencePath), "utf8"));
  console.log(JSON.stringify(validateEvidence(evidence, identity, { now, maxAgeHours }), null, 2));
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { ROUTING_MINIMUMS, approvedSourceFingerprint, currentIdentity, runtimeFiles, runtimeFingerprint, stripVolatile, validateEvidence };

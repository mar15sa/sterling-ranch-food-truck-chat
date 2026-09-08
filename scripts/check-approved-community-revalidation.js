#!/usr/bin/env node
// CI-only evidence bridge. It renews freshness in a disposable snapshot and
// never changes the owner-approved community-index.json file.
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { contentHtml, extractActions, extractPdfText, isDocumentUrl, linksFromHtml, pageText, stripEmbeddedInstructions, chunkText, canonicalPageUrl } = require("../lib/community-ingest");
const { audit } = require("./check-community-sources");
const { VERIFIER_VERSION, approvedFingerprint, inputFingerprint, revalidateApprovedEvidence } = require("./revalidate-approved-community");

function argument(flag, fallback = "") {
  const position = process.argv.indexOf(flag);
  return position >= 0 && process.argv[position + 1] ? process.argv[position + 1] : fallback;
}

function actionIdentity(actions = []) {
  return actions.length ? JSON.stringify(actions.map(action => [action.label, action.url, action.actionType || "", [...(action.keywords || [])].sort()])
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))) : "";
}

function sourceHash(text) {
  // Approved chunks predate action-aware page identities. Keep their established
  // text-only hash exactly intact; actions are verified as separate evidence.
  return crypto.createHash("sha256").update(text).digest("hex");
}

function actionDigest(actions = []) {
  return crypto.createHash("sha256").update(actionIdentity(actions)).digest("hex");
}

function canonical(value) {
  return canonicalPageUrl(value);
}

async function observeCanonicalSource(sourceUrl, approvedSources, { fetchImpl = globalThis.fetch } = {}) {
  if (!approvedSources.length) throw new Error("No approved evidence was found for the due URL.");
  const expectedUrl = canonical(sourceUrl);
  let text;
  let observedActions = [];
  if (isDocumentUrl(sourceUrl)) text = await extractPdfText(sourceUrl);
  else {
    const response = await fetchImpl(sourceUrl, { redirect: "follow", signal: AbortSignal.timeout(30_000), headers: { "user-agent": "Sterling Ranch approved-evidence verifier" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (canonical(response.url || sourceUrl) !== expectedUrl) throw new Error("Canonical URL changed during revalidation.");
    const html = await response.text();
    text = stripEmbeddedInstructions(pageText(html));
    observedActions = extractActions(linksFromHtml(contentHtml(html), response.url || sourceUrl));
  }
  if (!String(text || "").trim()) throw new Error("Extraction returned no usable text.");
  const expectedActionIdentity = new Set(approvedSources.map((source) => actionIdentity(source.actions || [])));
  const observedActionIdentity = actionIdentity(observedActions);
  return {
    observedHashes: chunkText(text).map((chunk) => sourceHash(chunk)),
    actionMismatch: expectedActionIdentity.size !== 1 || !expectedActionIdentity.has(observedActionIdentity),
    actionProof: {
      expected: approvedSources.map((source) => ({ id: source.id, digest: actionDigest(source.actions || []), actions: source.actions || [] })),
      observed: { digest: actionDigest(observedActions), actions: observedActions },
    },
  };
}

function gitCommit() {
  try { return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch { return "unavailable"; }
}

async function runBridge({ index, now = Date.now(), fetchObservedHashes, auditFn = audit, staleAfterMs } = {}) {
  const beforeFingerprint = approvedFingerprint(index);
  const result = await revalidateApprovedEvidence(index, { now, fetchObservedHashes, ...(staleAfterMs === undefined ? {} : { staleAfterMs }) });
  const gateErrors = [];
  try { auditFn(result.temporaryIndex); } catch (error) { gateErrors.push(error.message); }
  if (result.checks.some((check) => check.outcome !== "renewed")) gateErrors.push("Approved evidence requires owner review.");
  const afterFingerprint = approvedFingerprint(result.temporaryIndex);
  if (beforeFingerprint !== afterFingerprint) gateErrors.push("Approved evidence fingerprint changed during revalidation.");
  const attestation = {
    verifierVersion: VERIFIER_VERSION,
    commit: gitCommit(),
    inputFingerprint: inputFingerprint(index),
    beforeApprovedFingerprint: beforeFingerprint,
    afterApprovedFingerprint: afterFingerprint,
    checkedAt: new Date(now).toISOString(),
    status: gateErrors.length ? "failed" : "passed",
    checks: result.checks,
    gateErrors,
  };
  return { ...result, attestation, valid: gateErrors.length === 0 };
}

async function main() {
  const input = path.resolve(argument("--input", "data/community-index.json"));
  const output = path.resolve(argument("--temporary-output", path.join("artifacts", "community-index.revalidated.json")));
  const attestationOutput = path.resolve(argument("--attestation", path.join("artifacts", "community-approved-revalidation-attestation.json")));
  const reviewOutput = path.resolve(argument("--review-output", path.join("artifacts", "community-approved-revalidation-review.json")));
  if (input === output || output.endsWith(`${path.sep}data${path.sep}community-index.json`)) throw new Error("The CI bridge may not overwrite the approved index.");
  const index = JSON.parse(await fs.readFile(input, "utf8"));
  const result = await runBridge({ index, fetchObservedHashes: observeCanonicalSource });
  await Promise.all([fs.mkdir(path.dirname(output), { recursive: true }), fs.mkdir(path.dirname(attestationOutput), { recursive: true }), fs.mkdir(path.dirname(reviewOutput), { recursive: true })]);
  await fs.writeFile(output, `${JSON.stringify(result.temporaryIndex, null, 2)}\n`);
  await fs.writeFile(attestationOutput, `${JSON.stringify(result.attestation, null, 2)}\n`);
  await fs.writeFile(reviewOutput, `${JSON.stringify({ checkedAt: result.attestation.checkedAt, status: result.attestation.status, checks: result.checks, gateErrors: result.attestation.gateErrors }, null, 2)}\n`);
  console.log(JSON.stringify({ status: result.attestation.status, checkedUrls: result.checks.length, approvedFingerprint: result.attestation.afterApprovedFingerprint }));
  if (!result.valid) process.exitCode = 1;
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { actionDigest, actionIdentity, observeCanonicalSource, runBridge, sourceHash };

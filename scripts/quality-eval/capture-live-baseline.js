"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const corpus = require("./diagnostic-cases.json");
const delay = ms => new Promise(r => setTimeout(r, ms));
async function capture({ baseUrl, outDir, limit = corpus.cases.length, fetchImpl = fetch, wait = delay }) {
  if (!Number.isInteger(limit) || limit < 1 || limit > corpus.cases.length) throw new Error("Invalid case limit");
  const base = new URL(baseUrl);
  if (base.protocol !== "https:" && base.hostname !== "127.0.0.1" && base.hostname !== "localhost") throw new Error("HTTPS required");
  fs.mkdirSync(outDir, { recursive: true });
  const manifestPath = path.join(outDir, "manifest.json");
  if (fs.existsSync(manifestPath)) throw new Error("Use a new output directory; preserve existing evidence");
  async function health() {
    const res = await fetchImpl(new URL("/api/health", base), { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error("Health HTTP " + res.status);
    const h = await res.json();
    return { checkedAt: new Date().toISOString(), deploymentRevision: h.deploymentRevision || null,
      communityLlm: h.communityLlm, optionalLlmRewrite: h.optionalLlmRewrite, rulesSearch: h.rulesSearch };
  }
  const before = await health();
  const manifest = { schemaVersion: 1, corpusId: corpus.id, corpusSha256: crypto.createHash("sha256").update(JSON.stringify(corpus)).digest("hex"),
    baseUrl: base.origin, startedAt: new Date().toISOString(), isTest: true, before,
    status: "running", plannedCases: limit, rows: [], billingCoverage: "Public aggregate metrics are incomplete and may include other traffic; do not treat deltas as exact answer costs." };
  const save = () => fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  save();
  const prior = new Map();
  for (const item of corpus.cases.slice(0, limit)) {
    const startedAt = new Date().toISOString(), started = Date.now();
    const context = item.contextCaseId && prior.has(item.contextCaseId)
      ? [{ question: prior.get(item.contextCaseId).question, answer: prior.get(item.contextCaseId).response.answer,
          resolvedQuestion: prior.get(item.contextCaseId).response.resolvedQuestion }] : [];
    if (item.contextCaseId && !context.length) throw new Error("Missing prerequisite conversation");
    let row = { ...item, isTest: true, context, startedAt };
    try {
      const res = await fetchImpl(new URL("/api/community/ask", base), {
        method: "POST", headers: { "content-type": "application/json", "user-agent": "Community-Quality-Diagnostic/1.0" },
        body: JSON.stringify({ question: item.question, context, isTest: true }), signal: AbortSignal.timeout(60000)
      });
      row = { ...row, httpStatus: res.status, durationMs: Date.now() - started, response: await res.json() };
      if (!res.ok) row.error = "HTTP " + res.status;
    } catch (e) { row.error = e.name; row.durationMs = Date.now() - started; }
    fs.writeFileSync(path.join(outDir, item.id + ".json"), JSON.stringify(row, null, 2) + "\n", { flag: "wx" });
    manifest.rows.push({ id: item.id, family: item.family, file: item.id + ".json", durationMs: row.durationMs,
      httpStatus: row.httpStatus || null, error: row.error || null });
    prior.set(item.id, row); save();
    console.log(JSON.stringify({ case: item.id, httpStatus: row.httpStatus, durationMs: row.durationMs, error: row.error || null }));
    if (row.httpStatus === 429 || row.httpStatus === 503) { manifest.status = "stopped-service-limit"; break; }
    await wait(2200);
  }
  manifest.after = await health();
  manifest.finishedAt = new Date().toISOString();
  manifest.revisionStable = Boolean(before.deploymentRevision && before.deploymentRevision === manifest.after.deploymentRevision);
  manifest.status = manifest.rows.length === limit && manifest.rows.every(x => !x.error) ? "captured" : "incomplete";
  save(); return manifest;
}
if (require.main === module) capture({ baseUrl: process.argv[2], outDir: process.argv[3], limit: Number(process.argv[4] || corpus.cases.length) })
  .catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { capture };

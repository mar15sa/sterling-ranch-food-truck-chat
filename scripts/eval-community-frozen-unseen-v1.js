"use strict";

const crypto = require("node:crypto");
const fixture = require("./community-frozen-unseen-v1.json");
const { cases: sourceCases } = require("./eval-community-need-first-offline");
const { answerCommunityQuestion } = require("../lib/community-assistant");
const { assessCommunityAnswerQuality } = require("../lib/community-quality-rubric");

function casesHash(cases) {
  return crypto.createHash("sha256").update(JSON.stringify(cases)).digest("hex");
}

function phrasePattern(value) {
  const escaped = String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped.replace(/\\ /g, "[\\s-]+"), "i");
}

function nearestRank(values, percentile) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(percentile * sorted.length) - 1)] || 0;
}

async function main() {
  const actualHash = casesHash(fixture.cases);
  if (fixture.casesSha256 !== actualHash) throw new Error(`Frozen case hash mismatch: expected ${fixture.casesSha256}, received ${actualHash}.`);
  const sourceById = new Map(sourceCases.map((item) => [item.id, item]));
  const requestedIds = new Set((process.argv.find((arg) => arg.startsWith("--ids="))?.slice(6) || "").split(",").filter(Boolean));
  const selectedCases = requestedIds.size ? fixture.cases.filter((item) => requestedIds.has(item.id)) : fixture.cases;
  if (!selectedCases.length || (requestedIds.size && selectedCases.length !== requestedIds.size)) throw new Error("Every requested case ID must exist.");
  const rows = [];
  for (const item of selectedCases) {
    const source = sourceById.get(item.sourceCaseId);
    if (!source) throw new Error(`Unknown source case ${item.sourceCaseId}.`);
    const started = process.hrtime.bigint();
    const result = await answerCommunityQuestion(item.question, source.options());
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    const answer = String(result.answer || "");
    const missing = (item.mustInclude || []).filter((value) => !phrasePattern(value).test(answer));
    const missingAny = item.mustIncludeAny?.length && !item.mustIncludeAny.some((value) => phrasePattern(value).test(answer))
      ? item.mustIncludeAny : [];
    const forbidden = (item.mustExclude || []).filter((value) => phrasePattern(value).test(answer));
    const proofFailures = (result.claims || []).filter((claim) => claim.verified !== true || !(claim.evidenceSourceIds || []).length);
    const passed = result.completion?.outcome === item.expectedOutcome && !missing.length && !missingAny.length && !forbidden.length && !proofFailures.length;
    const quality = assessCommunityAnswerQuality(item.question, result);
    rows.push({
      id: item.id, family: item.family, passed, expectedOutcome: item.expectedOutcome,
      actualOutcome: result.completion?.outcome || null, missing, missingAny, forbidden,
      proofFailureCount: proofFailures.length, elapsedMs, rating: quality.rating || "Not rated",
      dimensionTotal: quality.dimensionTotal ?? null, answer,
      sources: (result.sources || []).map((source) => ({ id: source.id || source.nodeId, title: source.title, retrievedForNeedIds: source.retrievedForNeedIds })),
      claims: (result.claims || []).map((claim) => ({ text: claim.text, evidenceSourceIds: claim.evidenceSourceIds, supportedForNeedIds: claim.supportedForNeedIds })),
    });
  }
  const familyRows = [...new Set(rows.map((row) => row.family))].map((family) => {
    const subset = rows.filter((row) => row.family === family);
    return { family, cases: subset.length, useful: subset.filter((row) => row.passed).length,
      excellent: subset.filter((row) => row.passed && row.rating === "Excellent").length };
  });
  const useful = rows.filter((row) => row.passed).length;
  const excellent = rows.filter((row) => row.passed && row.rating === "Excellent").length;
  const report = {
    schemaVersion: 1,
    name: fixture.name,
    frozenAt: fixture.frozenAt,
    casesSha256: actualHash,
    firstRunCandidateRevision: fixture.candidateRevision,
    firstExecutionReportFailed: true,
    reportAttempt: 2,
    evaluationPhase: "post-reveal-development-replay",
    isTest: true,
    status: useful === rows.length ? "passed" : "failed",
    scope: fixture.scope,
    totals: {
      cases: rows.length, useful, usefulRate: useful / rows.length,
      diagnosticExcellent: excellent, diagnosticExcellentRate: excellent / rows.length,
      proofFailures: rows.reduce((sum, row) => sum + row.proofFailureCount, 0),
      p95ElapsedMs: nearestRank(rows.map((row) => row.elapsedMs), 0.95),
      modelCalls: 0, addedModelApiCostUsd: 0,
    },
    families: familyRows,
    failures: rows.filter((row) => !row.passed),
    cases: process.argv.includes("--full") ? rows : undefined,
    limitations: [
      "The phrasings are frozen and unused for tuning before this first run, but they are author-created rather than independent owner labels.",
      "This report is a development replay after the first inspectable blind result; it cannot be presented as a new unseen score.",
      "Deterministic source fixtures isolate request understanding, evidence routing, composition, and rating behavior; they do not recheck live source availability.",
      "Excellent is an unpublished diagnostic rating until calibrated against owner judgments.",
    ],
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.status !== "passed") process.exitCode = 1;
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });

module.exports = { casesHash, phrasePattern, main };

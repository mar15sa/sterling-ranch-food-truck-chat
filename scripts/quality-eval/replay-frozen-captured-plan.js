"use strict";

const fs = require("node:fs");
const path = require("node:path");
const fixture = require("../community-frozen-unseen-v1.json");
const { cases: sourceCases } = require("../eval-community-need-first-offline");
const { answerCommunityQuestion } = require("../../lib/community-assistant");
const { capabilityCatalog, normalizePlannedContract } = require("../../lib/community-need-llm");
const { buildResidentRequestContract } = require("../../lib/community-request-contract");
const { assessCommunityAnswerQuality } = require("../../lib/community-quality-rubric");

function capturedContract(question, needs, model, profile) {
  const catalog = capabilityCatalog(profile);
  const fallback = buildResidentRequestContract(question);
  const parsed = { needs: needs.map((need) => ({
      quotedText: question,
      request: need.request,
      routeRequest: need.routeRequest,
      goal: need.goal,
      requestedDetails: need.requestedDetails,
      subject: need.subjectHint,
      capabilityId: need.capabilityId,
      // The accepted provider contract used an exact resident quote, but the
      // bounded capture intentionally retained only normalized needs. The full
      // synthetic question is an allowed exact quote and preserves the already
      // observed acceptance decision during this no-call replay.
      dateRange: null,
      filters: { audience: "", category: "", facility: "", location: "" },
  })) };
  const normalized = normalizePlannedContract(question, {}, parsed, fallback, model, catalog);
  return normalized ? { ...normalized, planning: { method: "ai-replay", model } } : null;
}

function phrasePattern(value) {
  const escaped = String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped.replace(/\\ /g, "[\\s-]+"), "i");
}

function passedCase(item, result) {
  const answer = String(result.answer || "");
  return result.completion?.outcome === item.expectedOutcome
    && (item.mustInclude || []).every((value) => phrasePattern(value).test(answer))
    && (!item.mustIncludeAny?.length || item.mustIncludeAny.some((value) => phrasePattern(value).test(answer)))
    && (item.mustExclude || []).every((value) => !phrasePattern(value).test(answer))
    && (result.claims || []).every((claim) => claim.verified === true && (claim.evidenceSourceIds || []).length);
}

async function main() {
  const reportPath = process.argv[2] || "artifacts/quality-eval/frozen-haiku-planner-20260916/report-complete.json";
  const ids = new Set((process.argv.find((value) => value.startsWith("--ids="))?.slice(6) || "")
    .split(",").map((value) => value.trim()).filter(Boolean));
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const fixtureById = new Map(fixture.cases.map((item) => [item.id, item]));
  const sourceById = new Map(sourceCases.map((item) => [item.id, item]));
  const rows = [];
  for (const captured of report.rows.filter((row) => !ids.size || ids.has(row.id))) {
    const item = fixtureById.get(captured.id);
    const source = sourceById.get(item.sourceCaseId);
    const options = source.options();
    const contract = captured.plannerAccepted
      ? capturedContract(item.question, captured.needs, report.model, options.communityProfile)
      : null;
    const result = await answerCommunityQuestion(item.question, {
      ...options,
      planResidentNeeds: async () => contract,
    });
    const quality = assessCommunityAnswerQuality(item.question, result);
    rows.push({
      id: item.id,
      family: item.family,
      question: item.question,
      plannerAccepted: captured.plannerAccepted,
      contractAccepted: captured.plannerAccepted
        ? result._requestContract?.candidate?.planningMethod === "ai-replay"
        : result._requestContract?.candidate?.planningMethod !== "ai-replay",
      passed: passedCase(item, result),
      rating: quality.rating || "Not rated",
      outcome: result.completion?.outcome || null,
      completion: result.completion || null,
      contract,
      answer: result.answer,
      needs: result._requestContract?.assessment?.needs || [],
      sources: (result.sources || []).map((sourceItem) => ({ id: sourceItem.id || sourceItem.nodeId, title: sourceItem.title, text: sourceItem.text })),
      claims: result.claims || [],
    });
  }
  const out = path.resolve("artifacts/quality-eval/frozen-haiku-planner-20260916/replayed-plans.json");
  const summary = {
    schemaVersion: 1,
    isTest: true,
    status: "post-reveal-captured-plan-local-replay",
    cases: rows.length,
    useful: rows.filter((row) => row.passed).length,
    plannerAccepted: rows.filter((row) => row.plannerAccepted).length,
    contractAccepted: rows.filter((row) => row.contractAccepted).length,
    diagnosticExcellent: rows.filter((row) => row.passed && row.rating === "Excellent").length,
    paidModelCalls: 0,
    addedModelCostUsd: 0,
    rows,
  };
  fs.writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ ...summary, rows: rows.map(({ answer, needs, sources, claims, ...row }) => row) }, null, 2)}\n`);
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });

module.exports = { capturedContract, main };

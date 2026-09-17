"use strict";

const fs = require("node:fs");
const path = require("node:path");
const fixture = require("../community-frozen-unseen-v1.json");
const { cases: sourceCases } = require("../eval-community-need-first-offline");
const { answerCommunityQuestion } = require("../../lib/community-assistant");
const { planResidentNeedContract } = require("../../lib/community-need-llm");
const { assessCommunityAnswerQuality } = require("../../lib/community-quality-rubric");
const { ensureAllowedModel, summarize } = require("./usage");
const { createObservedFetch } = require("./observe-fetch");

const MODEL = "claude-haiku-4-5";

function option(name, fallback = "") {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || fallback;
}

const CAP_USD = Number(option("cap", "0.2"));
const MAX_TOKENS = Number(option("max-tokens", "1000"));
const OUTPUT_LABEL = option("output-label", "frozen-haiku-planner-20260916").replace(/[^a-z0-9-]/gi, "-");
const REQUESTED_IDS = new Set(option("ids").split(",").map((value) => value.trim()).filter(Boolean));

function phrasePattern(value) {
  const escaped = String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped.replace(/\\ /g, "[\\s-]+"), "i");
}

function passedCase(item, result) {
  const answer = String(result.answer || "");
  const required = (item.mustInclude || []).every((value) => phrasePattern(value).test(answer));
  const any = !item.mustIncludeAny?.length || item.mustIncludeAny.some((value) => phrasePattern(value).test(answer));
  const excluded = (item.mustExclude || []).every((value) => !phrasePattern(value).test(answer));
  const proof = (result.claims || []).every((claim) => claim.verified === true && (claim.evidenceSourceIds || []).length);
  return result.completion?.outcome === item.expectedOutcome && required && any && excluded && proof;
}

async function main() {
  ensureAllowedModel(MODEL);
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is required.");
  if (!Number.isFinite(CAP_USD) || CAP_USD <= 0 || CAP_USD > 0.2) throw new Error("This comparison cap must be between $0 and $0.20.");
  if (!Number.isInteger(MAX_TOKENS) || MAX_TOKENS < 300 || MAX_TOKENS > 1000) throw new Error("Planner max tokens must be between 300 and 1,000.");
  const selectedCases = REQUESTED_IDS.size ? fixture.cases.filter((item) => REQUESTED_IDS.has(item.id)) : fixture.cases;
  if (!selectedCases.length || (REQUESTED_IDS.size && selectedCases.length !== REQUESTED_IDS.size)) throw new Error("Every requested case ID must exist.");
  const outDir = path.resolve(`artifacts/quality-eval/${OUTPUT_LABEL}`);
  fs.mkdirSync(outDir, { recursive: true });
  const sourceById = new Map(sourceCases.map((item) => [item.id, item]));
  const calls = [];
  const observedFetch = createObservedFetch(global.fetch, { calls, capUsd: CAP_USD });
  const rows = [];
  for (const item of selectedCases) {
    const source = sourceById.get(item.sourceCaseId);
    if (!source) throw new Error(`Unknown source case ${item.sourceCaseId}.`);
    const diagnostics = [];
    const options = source.options();
    options.planResidentNeeds = (question, plannerOptions = {}) => planResidentNeedContract(question, {
      ...plannerOptions,
      model: MODEL,
      cache: false,
      maxTokens: MAX_TOKENS,
      fetchImpl: observedFetch,
      onDiagnostic: (value) => diagnostics.push(value),
    });
    const result = await answerCommunityQuestion(item.question, options);
    const quality = assessCommunityAnswerQuality(item.question, result);
    rows.push({
      id: item.id,
      family: item.family,
      passed: passedCase(item, result),
      outcome: result.completion?.outcome || null,
      rating: quality.rating || "Not rated",
      plannerAccepted: result._requestContract?.candidate?.planningMethod === "ai",
      needs: (result._requestContract?.needs || []).map((need) => ({ request: need.request, routeRequest: need.routeRequest,
        subjectHint: need.subjectHint, goal: need.goal, requestedDetails: need.requestedDetails, capabilityId: need.capabilityId })),
      answer: result.answer,
      diagnostics,
    });
  }
  const useful = rows.filter((row) => row.passed).length;
  const cost = summarize(calls);
  const report = {
    schemaVersion: 1,
    isTest: true,
    frozenCasesSha256: fixture.casesSha256,
    candidateRevision: fixture.candidateRevision,
    model: MODEL,
    stage: "request-understanding-only",
    writerModelCalls: 0,
    budget: { capUsd: CAP_USD, maxTokens: MAX_TOKENS, selectedCaseIds: selectedCases.map((item) => item.id), reservedUsd: observedFetch.reservedUsd() },
    totals: { cases: rows.length, useful, usefulRate: useful / rows.length,
      plannerAccepted: rows.filter((row) => row.plannerAccepted).length,
      diagnosticExcellent: rows.filter((row) => row.passed && row.rating === "Excellent").length },
    cost,
    per1000QuestionProjectionUsd: cost.estimatedTotalUsd === null ? null : cost.estimatedTotalUsd / rows.length * 1000,
    rows,
    limitations: [
      "This is one bounded planner-stage diagnostic on the already revealed frozen set, not a second blind acceptance score.",
      "The writer remains deterministic; changes measure request planning plus downstream compatibility.",
      "The automatic Excellent label remains unpublished and uncalibrated.",
    ],
  };
  fs.writeFileSync(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ totals: report.totals, cost, per1000QuestionProjectionUsd: report.per1000QuestionProjectionUsd,
    failures: rows.filter((row) => !row.passed).map((row) => ({ id: row.id, plannerAccepted: row.plannerAccepted, outcome: row.outcome, rating: row.rating })) }, null, 2)}\n`);
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { main };

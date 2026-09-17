"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { answerCommunityQuestion } = require("../../lib/community-assistant");
const { planResidentNeedContract, rewriteNeedFirstCandidate } = require("../../lib/community-need-llm");
const { cases } = require("../eval-community-need-first-offline");
const { ensureAllowedModel, priceUsage } = require("./usage");

const DEFAULT_CAP_USD = 1;
const CASES = [
  {
    id: "novel-food-and-menu",
    baseId: "food-truck-menu",
    question: "I'm sorting out dinner for tomorrow. Who's parked here, and what could we actually order from them?",
  },
  {
    id: "novel-shed-rule-and-paperwork",
    baseId: "shed-height-form",
    question: "We're planning a backyard shed. What's the tallest it can be, and what paperwork do I send the DRC?",
  },
  {
    id: "novel-recycling-and-cart-storage",
    baseId: "recycling-storage",
    question: "For Ascent, when does recycling come next, and once it's collected, where are the carts supposed to live?",
  },
  {
    id: "novel-specific-report-not-nearby-contact",
    baseId: "wrong-subject-contact",
    question: "I need the CAB's actual 2025 water-quality findings—not a billing contact. Can you open the report itself?",
  },
];

const ARMS = [
  { id: "deterministic", plannerModel: null, writerModel: null },
  { id: "haiku-haiku", plannerModel: "claude-haiku-4-5", writerModel: "claude-haiku-4-5" },
  { id: "sonnet-haiku", plannerModel: "claude-sonnet-5", writerModel: "claude-haiku-4-5" },
  { id: "haiku-sonnet", plannerModel: "claude-haiku-4-5", writerModel: "claude-sonnet-5" },
];

function hash(value) {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

function diagnosticUsage(row) {
  if (!row?.usage || !row.model || row.cacheHit) return null;
  return {
    stage: row.stage,
    model: row.model,
    usage: {
      input_tokens: row.usage.inputTokens,
      output_tokens: row.usage.outputTokens,
    },
  };
}

function costSummary(calls) {
  let measuredUsd = 0;
  let unknown = 0;
  const stages = {};
  for (const call of calls) {
    const priced = priceUsage(call.model, call.usage);
    const stage = stages[call.stage] ||= { calls: 0, inputTokens: 0, outputTokens: 0, measuredUsd: 0, unknown: 0 };
    stage.calls += 1;
    if (priced.estimatedUsd === null) {
      stage.unknown += 1;
      unknown += 1;
    } else {
      stage.inputTokens += priced.inputTokens;
      stage.outputTokens += priced.outputTokens;
      stage.measuredUsd += priced.estimatedUsd;
      measuredUsd += priced.estimatedUsd;
    }
  }
  return { calls: calls.length, measuredUsd, unknown, stages };
}

function proofFailures(result) {
  const ids = new Set((result.sources || []).map((source) => String(source.id || source.nodeId || source.sourceUrl || "")));
  return (result.claims || []).filter((claim) => claim.verified !== true
    || !(claim.evidenceSourceIds || []).length
    || claim.evidenceSourceIds.some((id) => !ids.has(String(id))));
}

function shuffledBlindRows(rows) {
  const blind = rows.map((row) => ({
    reviewId: hash(`${row.caseId}:${row.arm}`).slice(0, 10),
    caseId: row.caseId,
    family: row.family,
    question: row.question,
    answer: row.answer,
    outcome: row.outcome,
    humanRating: null,
    humanUseful: null,
    notes: "",
  }));
  return blind.sort((left, right) => left.reviewId.localeCompare(right.reviewId));
}

async function main() {
  const outputArg = process.argv.find((arg) => arg.startsWith("--out="));
  const capArg = process.argv.find((arg) => arg.startsWith("--cap-usd="));
  const capUsd = Number(capArg?.slice("--cap-usd=".length) || DEFAULT_CAP_USD);
  if (!Number.isFinite(capUsd) || capUsd <= 0 || capUsd > 2) throw new Error("Use a comparison cap between $0 and $2.");
  for (const arm of ARMS) {
    if (arm.plannerModel) ensureAllowedModel(arm.plannerModel);
    if (arm.writerModel) ensureAllowedModel(arm.writerModel);
  }
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is required for the bounded comparison.");
  const outDir = path.resolve(outputArg?.slice("--out=".length) || "artifacts/quality-eval/need-first-ai-generalization-20260916");
  const cwd = `${path.resolve(process.cwd())}${path.sep}`;
  if (!`${outDir}${path.sep}`.startsWith(cwd)) throw new Error("Output directory must stay inside the project.");
  fs.mkdirSync(outDir, { recursive: true });

  const calls = [];
  const rows = [];
  for (const benchmarkCase of CASES) {
    const base = cases.find((item) => item.id === benchmarkCase.baseId);
    if (!base) throw new Error(`Missing base fixture ${benchmarkCase.baseId}`);
    for (const arm of ARMS) {
      if (costSummary(calls).measuredUsd >= capUsd) throw new Error("Comparison stopped at the configured cost cap.");
      const diagnostics = [];
      const options = base.options();
      if (arm.plannerModel) {
        options.planResidentNeeds = (question, plannerOptions = {}) => planResidentNeedContract(question, {
          ...plannerOptions,
          model: arm.plannerModel,
          cache: false,
          onDiagnostic: (value) => diagnostics.push(value),
        });
      }
      if (arm.writerModel) {
        options.rewriteNeedFirstAnswer = (payload) => rewriteNeedFirstCandidate(payload, {
          model: arm.writerModel,
          onDiagnostic: (value) => diagnostics.push(value),
        });
      }
      const startedAt = process.hrtime.bigint();
      const result = await answerCommunityQuestion(benchmarkCase.question, options);
      const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      for (const diagnostic of diagnostics) {
        const usage = diagnosticUsage(diagnostic);
        if (usage) calls.push({ caseId: benchmarkCase.id, arm: arm.id, ...usage });
      }
      rows.push({
        caseId: benchmarkCase.id,
        family: base.family,
        arm: arm.id,
        question: benchmarkCase.question,
        answer: result.answer,
        answerMode: result.answerMode,
        outcome: result.completion?.outcome,
        expectedOutcome: base.expectedOutcome,
        outcomeMatch: result.completion?.outcome === base.expectedOutcome,
        proofFailureCount: proofFailures(result).length,
        plannerAccepted: result._requestContract?.candidate?.planningMethod === "ai",
        writerAccepted: result._requestContract?.candidate?.writerAccepted === true,
        needCount: result._requestContract?.needCount,
        elapsedMs,
        diagnostics,
      });
    }
  }

  const cost = costSummary(calls);
  const manifest = {
    schemaVersion: 1,
    status: "captured-pending-human-review",
    isTest: true,
    purpose: "Bounded development comparison of AI stages inside the repaired need-first contract; not a final holdout or release score.",
    casesHash: hash(CASES),
    arms: ARMS,
    capUsd,
    cost,
    limitations: [
      "Authored unfamiliar phrasings reuse deterministic source fixtures and are not the final unseen acceptance set.",
      "Outcome and proof checks are software checks, not human judgments of usefulness or excellence.",
      "A writer rejection falls back to the deterministic candidate and remains visible as writerAccepted false.",
    ],
  };
  fs.writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, "results.json"), `${JSON.stringify(rows, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, "calls.json"), `${JSON.stringify(calls, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, "blind-review.json"), `${JSON.stringify(shuffledBlindRows(rows), null, 2)}\n`);
  console.log(JSON.stringify({
    status: manifest.status,
    cases: CASES.length,
    arms: ARMS.map((arm) => arm.id),
    rows: rows.length,
    plannerAccepted: rows.filter((row) => row.plannerAccepted).length,
    writerAccepted: rows.filter((row) => row.writerAccepted).length,
    outcomeMatches: rows.filter((row) => row.outcomeMatch).length,
    proofFailures: rows.reduce((sum, row) => sum + row.proofFailureCount, 0),
    cost,
    output: outDir,
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { ARMS, CASES, main };

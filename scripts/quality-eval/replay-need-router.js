#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { resolveConversationQuestion } = require("../../lib/community-conversation");
const { runNeedFirstShadow } = require("../../lib/community-need-router");
const { buildResidentRequestContract } = require("../../lib/community-request-contract");

async function main() {
  const captureDirectory = path.resolve(process.argv[2] || "artifacts/quality-eval/september-paired-flow-20260915");
  const reviewPath = path.join(captureDirectory, "answer-review-by-question.json");
  if (!fs.existsSync(reviewPath)) throw new Error(`Missing review file: ${reviewPath}`);
  const review = JSON.parse(fs.readFileSync(reviewPath, "utf8"));
  const rows = [];
  for (const item of review.cases || []) {
    const current = (item.runs || []).find((run) => run.variant === "current-local");
    const flowPath = current?.id ? path.join(captureDirectory, `${current.id}.json`) : "";
    if (!flowPath || !fs.existsSync(flowPath)) continue;
    const flow = JSON.parse(fs.readFileSync(flowPath, "utf8"));
    const context = (flow.context || []).map((pair) => ({
      ...pair,
      answer: "Captured replay placeholder; never used as evidence.",
    }));
    const resolved = resolveConversationQuestion(item.question, context);
    const contract = buildResidentRequestContract(resolved.resolvedQuestion, flow.response?.routingPlan, {
      originalQuestion: resolved.question,
      resolvedQuestion: resolved.resolvedQuestion,
      usedPriorContext: resolved.usedPriorContext,
    });
    // This replay makes no retrieval or model call. It deliberately gives the
    // same saved legacy response to each need so sibling leakage and wrong-
    // subject evidence are rechecked against the new contract.
    const shadow = await runNeedFirstShadow(contract, async () => structuredClone(flow.response));
    rows.push({
      caseId: item.id,
      oldAnswerStatus: flow.response?.answerStatus || "",
      shadowAnswerStatus: shadow.answerStatus,
      shadowOutcome: shadow.completion.outcome,
      needs: shadow.completion.needs,
      selectedActionLabels: shadow.actions.map((action) => action.label),
      shadowAnswer: shadow.answer,
    });
  }
  const outcomeCounts = rows.reduce((counts, row) => {
    counts[row.shadowOutcome] = (counts[row.shadowOutcome] || 0) + 1;
    return counts;
  }, {});
  process.stdout.write(`${JSON.stringify({
    isTest: true,
    evidenceMode: "captured-global-response-rechecked-per-need",
    limitation: "This proves need isolation and composition behavior against saved outputs; it does not measure new retrieval or answer quality.",
    captureDirectory,
    outcomeCounts,
    rows,
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});

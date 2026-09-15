#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { assessResidentNeeds, buildResidentRequestContract } = require("../../lib/community-request-contract");
const { resolveConversationQuestion } = require("../../lib/community-conversation");

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

const captureDirectory = path.resolve(process.argv[2] || "artifacts/quality-eval/september-paired-flow-20260915");
const reviewPath = path.join(captureDirectory, "answer-review-by-question.json");
if (!fs.existsSync(reviewPath)) {
  fail(`Missing review file: ${reviewPath}`);
} else {
  const review = JSON.parse(fs.readFileSync(reviewPath, "utf8"));
  const rows = (review.cases || []).map((item) => {
    const current = (item.runs || []).find((run) => run.variant === "current-local");
    const flowPath = current?.id ? path.join(captureDirectory, `${current.id}.json`) : "";
    const flow = flowPath && fs.existsSync(flowPath) ? JSON.parse(fs.readFileSync(flowPath, "utf8")) : null;
    const routingPlan = flow?.response?.routingPlan || null;
    const context = (flow?.context || []).map((pair) => ({
      ...pair,
      // Conversation resolution requires transcript-shaped context, but only
      // resident-authored question fields may influence the resolved request.
      answer: "Captured replay placeholder; never used as evidence.",
    }));
    const resolved = resolveConversationQuestion(item.question, context);
    const contract = buildResidentRequestContract(resolved.resolvedQuestion, routingPlan, {
      originalQuestion: resolved.question,
      resolvedQuestion: resolved.resolvedQuestion,
      usedPriorContext: resolved.usedPriorContext,
    });
    const assessment = assessResidentNeeds(contract, flow?.response || {});
    return {
      caseId: item.id,
      question: item.question,
      resolvedQuestion: resolved.resolvedQuestion,
      usedPriorContext: resolved.usedPriorContext,
      oldRequestedDetails: flow?.response?.completion?.requestedDetails || [],
      oldAnswerStatus: flow?.response?.answerStatus || "",
      needCount: contract.needCount,
      shadowOutcome: assessment.outcome,
      needs: contract.needs.map((need) => {
        const evidence = assessment.needs.find((item) => item.needId === need.id);
        return {
          text: need.text,
          request: need.request,
          task: need.task,
          evidenceKind: need.evidenceKind,
          requestedDetails: need.requestedDetails,
          status: evidence.status,
          reason: evidence.reason,
          candidateSourceIds: evidence.candidateSourceIds,
          supportingSourceIds: evidence.supportingSourceIds,
        };
      }),
    };
  });
  const outcomeCounts = rows.reduce((counts, row) => {
    counts[row.shadowOutcome] = (counts[row.shadowOutcome] || 0) + 1;
    return counts;
  }, {});
  process.stdout.write(`${JSON.stringify({ isTest: true, captureDirectory, outcomeCounts, rows }, null, 2)}\n`);
}

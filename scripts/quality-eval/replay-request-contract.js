#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { buildResidentRequestContract } = require("../../lib/community-request-contract");

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
    const contract = buildResidentRequestContract(item.question, routingPlan);
    return {
      caseId: item.id,
      question: item.question,
      oldRequestedDetails: flow?.response?.completion?.requestedDetails || [],
      needCount: contract.needCount,
      needs: contract.needs.map((need) => ({ text: need.text, goal: need.goal, requestedDetails: need.requestedDetails })),
    };
  });
  process.stdout.write(`${JSON.stringify({ isTest: true, captureDirectory, rows }, null, 2)}\n`);
}

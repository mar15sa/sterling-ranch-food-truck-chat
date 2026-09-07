#!/usr/bin/env node
"use strict";

// A small, dependency-free helper evaluators can call after they have counted
// tokens. It never contacts a model provider and estimates are never billing data.
const fs = require("node:fs");

const DEFAULT_TOKEN_WARNING = 100000;
const DEFAULT_REQUEST_WARNING = 100;
const DEFAULT_RUN_WARNING_USD = 0.25;
const KNOWN_MODEL_RATES = Object.freeze({
  "claude-haiku-4-5": { inputUsdPerMillion: 1, outputUsdPerMillion: 5 },
  "claude-haiku-4-5-20251001": { inputUsdPerMillion: 1, outputUsdPerMillion: 5 },
});

function nonNegativeNumber(value, name) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${name} must be a non-negative number.`);
  return number;
}

function optionalNonNegativeNumber(value, name) {
  if (value === undefined || value === null || value === "") return null;
  return nonNegativeNumber(value, name);
}

function summarizeSpend(usage = {}, config = {}) {
  const suppliedRuns = usage.runs || usage.responses;
  const rawRuns = suppliedRuns ? (Array.isArray(suppliedRuns) ? suppliedRuns : (() => { throw new Error("runs or responses must be an array."); })()) : [usage];
  const runs = rawRuns.map((run, index) => {
    const values = run.response?.usage || run.usage || run;
    const model = run.response?.model ?? run.model ?? values.model ?? "";
    const inputTokens = nonNegativeNumber(values.inputTokens ?? values.input_tokens, `runs[${index}].inputTokens`);
    const outputTokens = nonNegativeNumber(values.outputTokens ?? values.output_tokens, `runs[${index}].outputTokens`);
    const requestCount = nonNegativeNumber(values.requestCount ?? values.request_count ?? 1, `runs[${index}].requestCount`);
    const rate = config.inputUsdPerMillion !== undefined || config.outputUsdPerMillion !== undefined
      ? { inputUsdPerMillion: optionalNonNegativeNumber(config.inputUsdPerMillion, "inputUsdPerMillion"), outputUsdPerMillion: optionalNonNegativeNumber(config.outputUsdPerMillion, "outputUsdPerMillion") }
      : KNOWN_MODEL_RATES[String(model).toLowerCase()];
    return { inputTokens, outputTokens, requestCount, model, estimatedUsd: rate && rate.inputUsdPerMillion !== null && rate.outputUsdPerMillion !== null ? (inputTokens * rate.inputUsdPerMillion + outputTokens * rate.outputUsdPerMillion) / 1000000 : null };
  });
  const inputTokens = runs.reduce((total, run) => total + run.inputTokens, 0);
  const outputTokens = runs.reduce((total, run) => total + run.outputTokens, 0);
  const requestCount = runs.reduce((total, run) => total + run.requestCount, 0);
  const estimated = runs.every((run) => run.estimatedUsd !== null);
  const estimatedUsd = estimated ? runs.reduce((total, run) => total + run.estimatedUsd, 0) : null;
  const warningUsd = optionalNonNegativeNumber(config.warningUsd, "warningUsd") ?? DEFAULT_RUN_WARNING_USD;
  const tokenWarning = optionalNonNegativeNumber(config.tokenWarning, "tokenWarning") ?? DEFAULT_TOKEN_WARNING;
  const requestWarning = optionalNonNegativeNumber(config.requestWarning, "requestWarning") ?? DEFAULT_REQUEST_WARNING;
  const warning = estimated
    ? estimatedUsd >= warningUsd
    : inputTokens + outputTokens >= tokenWarning || requestCount >= requestWarning;

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    requestCount,
    runs,
    estimated,
    estimatedUsd,
    warning,
    warningBasis: estimated ? "estimated-usd-per-run" : "usage-fallback",
    warningUsd,
    tokenWarning,
    requestWarning,
  };
}

function formatReport(report) {
  const estimate = report.estimated
    ? `Estimated total spend: $${report.estimatedUsd.toFixed(4)} USD (estimate only; not actual billing).`
    : "Estimated spend unavailable because one or more model rates are unknown; this is not actual billing.";
  const threshold = report.warningBasis === "estimated-usd-per-run"
    ? `Warning threshold: $${report.warningUsd.toFixed(4)} estimated USD per run.`
    : `Fallback warning thresholds: ${report.tokenWarning} total tokens or ${report.requestWarning} requests.`;
  return [
    "## Evaluation spend report",
    "",
    `- Input tokens: ${report.inputTokens}`,
    `- Output tokens: ${report.outputTokens}`,
    `- Total tokens: ${report.totalTokens}`,
    `- Requests: ${report.requestCount}`,
    `- ${estimate}`,
    `- ${threshold}`,
    `- Status: ${report.warning ? "warning" : "within configured warning threshold"}`,
  ].join("\n");
}

function emitGitHubWarning(report, write = console.log) {
  if (!report.warning) return false;
  const detail = report.estimated
    ? `at least one run exceeded $${report.warningUsd.toFixed(4)} estimated USD; estimate only, not actual billing`
    : `one or more model rates were unknown and usage reached the token/request fallback warning threshold (not actual billing)`;
  write(`::warning title=Evaluation spend warning::${detail}`);
  return true;
}

function writeStepSummary(report, summaryPath = process.env.GITHUB_STEP_SUMMARY) {
  if (!report.warning || !summaryPath) return false;
  fs.appendFileSync(summaryPath, `${formatReport(report)}\n`);
  return true;
}

function readArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!flag.startsWith("--")) throw new Error(`Unknown argument: ${flag}`);
    const key = flag.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    values[key] = argv[index + 1];
    index += 1;
  }
  return values;
}

function main(argv = process.argv.slice(2), env = process.env) {
  const args = readArgs(argv);
  const report = summarizeSpend({
    inputTokens: args.inputTokens ?? env.EVAL_INPUT_TOKENS,
    outputTokens: args.outputTokens ?? env.EVAL_OUTPUT_TOKENS,
    requestCount: args.requestCount ?? env.EVAL_REQUEST_COUNT,
    model: args.model ?? env.EVAL_MODEL,
  }, {
    inputUsdPerMillion: args.inputUsdPerMillion ?? env.EVAL_INPUT_USD_PER_MILLION,
    outputUsdPerMillion: args.outputUsdPerMillion ?? env.EVAL_OUTPUT_USD_PER_MILLION,
    warningUsd: args.warningUsd ?? env.EVAL_SPEND_WARNING_USD,
    tokenWarning: args.tokenWarning ?? env.EVAL_TOKEN_WARNING,
    requestWarning: args.requestWarning ?? env.EVAL_REQUEST_WARNING,
  });
  console.log(formatReport(report));
  emitGitHubWarning(report);
  writeStepSummary(report, env.GITHUB_STEP_SUMMARY);
  return report;
}

if (require.main === module) main();

module.exports = { DEFAULT_REQUEST_WARNING, DEFAULT_RUN_WARNING_USD, DEFAULT_TOKEN_WARNING, KNOWN_MODEL_RATES, emitGitHubWarning, formatReport, main, summarizeSpend, writeStepSummary };

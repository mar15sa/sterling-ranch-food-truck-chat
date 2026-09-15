#!/usr/bin/env node
"use strict";

const { isMainThread, parentPort, Worker, workerData } = require("node:worker_threads");
const { createHash } = require("node:crypto");
const { answerCommunityQuestion } = require("../lib/community-assistant");
const { answerRulesQuestion } = require("../lib/rules-assistant");
const communityIndex = require("../data/community-index.json");
const communityProfile = require("../data/communities/sterling-ranch.json");
const ruleCases = require("./rules-eval-cases.json");
const communityCases = require("./community-eval-cases.json");

const NOW = new Date("2026-09-14T18:00:00.000Z");
const CONCURRENCY = 4;

function expandCases(items, suite) {
  return items.flatMap((item, caseIndex) => [...new Set([item.question, ...(item.variants || [])].filter(Boolean))]
    .map((question, variantIndex) => ({
      ...item,
      question,
      primaryQuestion: item.question,
      id: `${suite}-${String(caseIndex + 1).padStart(3, "0")}-${String(variantIndex + 1).padStart(2, "0")}`,
      suite,
    })));
}

function includesAny(text, needles = []) {
  const haystack = String(text || "").toLowerCase();
  return needles.some((needle) => haystack.includes(String(needle).toLowerCase()));
}

function sourceText(source = {}) {
  return [source.title, source.nodeId, source.sourceUrl, source.excerpt].filter(Boolean).join(" ");
}

function proofFailures(result = {}) {
  const sourceIds = new Set((result.sources || []).map((source) => String(source.id || source.nodeId || "")));
  return (result.claims || []).filter((claim) => claim.verified !== true
    || !(claim.evidenceSourceIds || []).length
    || claim.evidenceSourceIds.some((id) => !sourceIds.has(String(id))));
}

function evaluate(testCase, result, elapsedMs) {
  const issues = [];
  const answer = String(result.answer || "");
  const sources = result.sources || [];
  const refused = testCase.shouldRefuse === true;
  if (refused) {
    if (!["handled-boundary", "missing-evidence", "ambiguous", "unassessed"].includes(result.completion?.outcome)) {
      issues.push(`expected safe refusal, got ${result.completion?.outcome || "unknown"}`);
    }
  } else if (result.completion?.outcome !== "complete") {
    issues.push(`expected complete, got ${result.completion?.outcome || "unknown"}`);
  }
  if (testCase.expectedNoSources && sources.length) issues.push("expected no sources");
  if (!refused && testCase.expectedFirstAny
    && (!sources[0] || !includesAny(sourceText(sources[0]), testCase.expectedFirstAny))) {
    issues.push(`first source missing: ${testCase.expectedFirstAny.join(" | ")}`);
  }
  if (!refused && testCase.expectedAny
    && !sources.some((source) => includesAny(sourceText(source), testCase.expectedAny))) {
    issues.push(`source set missing: ${testCase.expectedAny.join(" | ")}`);
  }
  if (!refused && testCase.answerIncludesAny && !includesAny(answer, testCase.answerIncludesAny)) {
    issues.push(`answer missing any: ${testCase.answerIncludesAny.join(" | ")}`);
  }
  if (!refused && testCase.answerIncludesAll
    && !testCase.answerIncludesAll.every((needle) => includesAny(answer, [needle]))) {
    issues.push(`answer missing all: ${testCase.answerIncludesAll.join(" | ")}`);
  }
  const excluded = testCase.answerExcludesAny || testCase.mustExclude || [];
  if (excluded.length && includesAny(answer, excluded)) issues.push(`answer included excluded text: ${excluded.join(" | ")}`);
  if (/(?:\.\.\.|…)(?:\s|$)/.test(answer)) issues.push("presentation contains a clipped source excerpt");
  const failedProof = proofFailures(result);
  if (failedProof.length) issues.push(`${failedProof.length} claim proof failure(s)`);
  return {
    id: testCase.id,
    suite: testCase.suite,
    primaryQuestion: testCase.primaryQuestion,
    question: testCase.question,
    passed: issues.length === 0,
    issues,
    outcome: result.completion?.outcome || "unknown",
    answerStatus: result.answerStatus || "unknown",
    elapsedMs,
    sourceCount: sources.length,
    proofFailureCount: failedProof.length,
    answer,
  };
}

async function runCase(testCase) {
  const startedAt = process.hrtime.bigint();
  const result = await answerCommunityQuestion(testCase.question, {
    isTest: true,
    requestContractMode: "need-first-candidate",
    needRouterBackend: "current-local",
    planCommunitySearch: false,
    synthesizeCommunityAnswer: false,
    interpretationMode: "structured",
    answerRulesQuestion,
    rulesOptions: { searchMode: "legacy", llmMode: "off" },
    index: communityIndex,
    communityId: "sterling-ranch",
    communityProfile,
    now: NOW,
  });
  return evaluate(testCase, result, Number(process.hrtime.bigint() - startedAt) / 1e6);
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function numericArgument(name) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  if (raw === undefined) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error(`Invalid --${name} value.`);
  return value;
}

function runIsolatedCase(testCase, caseIndex) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, { workerData: { caseIndex } });
    let settled = false;
    worker.once("message", (row) => {
      settled = true;
      resolve(row);
    });
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (!settled && code !== 0) reject(new Error(`Isolated case ${testCase.id} failed (${code}).`));
      else if (!settled) reject(new Error(`Isolated case ${testCase.id} returned no result.`));
    });
  });
}

function nearestRank(values, percentile) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(percentile * sorted.length) - 1)] || 0;
}

function resultFingerprint(rows) {
  const stableRows = rows.map(({ elapsedMs, ...row }) => row);
  return createHash("sha256").update(JSON.stringify(stableRows)).digest("hex");
}

function countsBy(items, keyFor) {
  return Object.fromEntries([...items.reduce((counts, item) => {
    const key = keyFor(item);
    counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map())].sort(([left], [right]) => left.localeCompare(right)));
}

function issueKind(issue = "") {
  if (/^expected complete/.test(issue)) return "expected-complete-but-withheld";
  if (/^source set missing|^first source missing/.test(issue)) return "saved-source-expectation";
  if (/^answer missing/.test(issue)) return "saved-answer-content-expectation";
  if (/^answer included excluded/.test(issue)) return "excluded-content-rendered";
  if (/claim proof failure/.test(issue)) return "claim-proof-failure";
  if (/^presentation contains a clipped/.test(issue)) return "clipped-source-presentation";
  return "other";
}

async function main() {
  const allCases = [
    ...expandCases(ruleCases, "existing-rules-coverage-v1"),
    ...expandCases(communityCases, "existing-community-coverage-v1"),
  ];
  const caseIndex = isMainThread ? numericArgument("case-index") : workerData.caseIndex;
  if (caseIndex !== null) {
    if (!allCases[caseIndex]) throw new Error("Case index is outside the authored coverage set.");
    const row = await runCase(allCases[caseIndex]);
    if (isMainThread) console.log(JSON.stringify(row, null, 2));
    else parentPort.postMessage(row);
    return;
  }
  const limit = numericArgument("limit");
  const cases = limit === null ? allCases : allCases.slice(0, limit);
  const sharedProcess = process.argv.includes("--shared-process");
  const rows = await mapWithConcurrency(cases, CONCURRENCY,
    sharedProcess ? runCase : (testCase, index) => runIsolatedCase(testCase, index));
  const failures = rows.filter((row) => !row.passed);
  const report = {
    schemaVersion: 1,
    name: "need-first-existing-coverage-v1",
    status: failures.length ? "failed" : "passed",
    isTest: true,
    executionIsolation: sharedProcess ? "shared-process" : "one-worker-isolate-per-case",
    concurrency: CONCURRENCY,
    resultFingerprint: resultFingerprint(rows),
    scope: "Existing authored rules and community coverage cases expanded across their saved wording variants; diagnostic coverage, not unseen or human-rated acceptance.",
    totals: {
      cases: rows.length,
      passed: rows.length - failures.length,
      failed: failures.length,
      complete: rows.filter((row) => row.outcome === "complete").length,
      safeNonAnswers: rows.filter((row) => ["handled-boundary", "missing-evidence", "ambiguous", "unassessed"].includes(row.outcome)).length,
      proofFailures: rows.reduce((sum, row) => sum + row.proofFailureCount, 0),
      modelCalls: 0,
      addedModelApiCostUsd: 0,
      p95ElapsedMs: nearestRank(rows.map((row) => row.elapsedMs), 0.95),
    },
    failureOutcomes: countsBy(failures, (row) => row.outcome),
    failureIssueKinds: countsBy(failures.flatMap((row) => row.issues), issueKind),
    suites: [...new Set(rows.map((row) => row.suite))].map((suite) => ({
      suite,
      cases: rows.filter((row) => row.suite === suite).length,
      passed: rows.filter((row) => row.suite === suite && row.passed).length,
    })),
    failures,
  };
  console.log(JSON.stringify(process.argv.includes("--full") ? { ...report, cases: rows } : report, null, 2));
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

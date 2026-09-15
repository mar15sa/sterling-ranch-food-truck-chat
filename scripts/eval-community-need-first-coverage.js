#!/usr/bin/env node
"use strict";

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
      results[index] = await mapper(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function nearestRank(values, percentile) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(percentile * sorted.length) - 1)] || 0;
}

async function main() {
  const cases = [
    ...expandCases(ruleCases, "existing-rules-coverage-v1"),
    ...expandCases(communityCases, "existing-community-coverage-v1"),
  ];
  const rows = await mapWithConcurrency(cases, CONCURRENCY, runCase);
  const failures = rows.filter((row) => !row.passed);
  const report = {
    schemaVersion: 1,
    name: "need-first-existing-coverage-v1",
    status: failures.length ? "failed" : "passed",
    isTest: true,
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

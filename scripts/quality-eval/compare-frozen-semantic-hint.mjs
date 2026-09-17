import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createCommunitySemanticRanker } from "./community-semantic-ranker.mjs";
import { createSemanticRanker } from "./semantic-ranker.mjs";
import corpusTools from "./semantic-corpus.js";

const require = createRequire(import.meta.url);
const fixture = require("../community-frozen-unseen-v1.json");
const { cases: sourceCases } = require("../eval-community-need-first-offline");
const { answerCommunityQuestion } = require("../../lib/community-assistant");
const { assessCommunityAnswerQuality } = require("../../lib/community-quality-rubric");
const rules = require("../../lib/rules-assistant");
const communityIndex = require("../../data/community-index.json");
const profile = require("../../data/communities/sterling-ranch.json");

function phrasePattern(value) {
  const escaped = String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped.replace(/\\ /g, "[\\s-]+"), "i");
}

function nearestRank(values, percentile) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(percentile * sorted.length) - 1)] || 0;
}

function localNeedOptions(options) {
  const copy = {
    ...options,
    requestContractMode: undefined,
    requestContext: undefined,
    interpretationMode: "structured",
  };
  delete copy.answerResidentNeed;
  delete copy.needRouterBackend;
  delete copy.requestContractPlan;
  delete copy.planResidentNeeds;
  delete copy.rewriteNeedFirstAnswer;
  return copy;
}

function titleHint(sources) {
  return [...new Set(sources.map((source) => String(source.title || "").trim()).filter(Boolean))].slice(0, 2).join("; ");
}

const rulesIndex = await rules.loadRulesIndex();
const documents = corpusTools.eligibleCorpus(rulesIndex, profile.communityId, Date.now());
const scopedRulesIndex = { ...rulesIndex, documents };
const output = path.resolve("artifacts/quality-eval/frozen-semantic-hint-20260916");
fs.mkdirSync(output, { recursive: true });
const sourceById = new Map(sourceCases.map((item) => [item.id, item]));
let communityRanker;
let ruleRanker;
const rows = [];
const initializedAt = Date.now();

try {
  communityRanker = await createCommunitySemanticRanker({
    directory: path.resolve("artifacts/quality-eval/community-action-proof-20260915"),
    communityId: profile.communityId,
    index: communityIndex,
  });
  ruleRanker = await createSemanticRanker({
    directory: path.resolve("artifacts/quality-eval/semantic-identity-recapture-20260914"),
    documents,
    communityId: profile.communityId,
  });
  const initializationMs = Date.now() - initializedAt;
  for (const item of fixture.cases) {
    const source = sourceById.get(item.sourceCaseId);
    if (!source) throw new Error(`Unknown source case ${item.sourceCaseId}.`);
    const options = source.options();
    const needRuns = [];
    const started = Date.now();
    const result = await answerCommunityQuestion(item.question, {
      ...options,
      needRouterBackend: undefined,
      answerResidentNeed: async (need) => {
        if (need.evidenceKind === "live-operation") {
          needRuns.push({ needId: need.id, query: need.routeRequest || need.request, hint: "", bypass: "live-operation" });
          return answerCommunityQuestion(need.routeRequest || need.request, localNeedOptions(options));
        }
        const query = need.request || need.routeRequest;
        const [community, governing] = await Promise.all([
          communityRanker.search(communityIndex, query, 3),
          ruleRanker.search(scopedRulesIndex, query, 3, {
            now: Date.now(),
            eligibilityQuestion: query,
            method: "hybrid",
          }),
        ]);
        const selected = need.evidenceKind === "governing-rule"
          ? governing
          : ["official-action", "official-process", "official-information"].includes(need.evidenceKind)
            ? community
            : [...community.slice(0, 1), ...governing.slice(0, 1)];
        const hint = titleHint(selected);
        const routed = [need.routeRequest || need.request, hint].filter(Boolean).join(" — official source topic: ");
        needRuns.push({
          needId: need.id,
          query,
          hint,
          topCommunity: community.map((entry) => ({ id: entry.id, title: entry.title })),
          topGoverning: governing.map((entry) => ({ id: entry.id, title: entry.title })),
        });
        return answerCommunityQuestion(routed, localNeedOptions(options));
      },
    });
    const elapsedMs = Date.now() - started;
    const answer = String(result.answer || "");
    const missing = (item.mustInclude || []).filter((value) => !phrasePattern(value).test(answer));
    const missingAny = item.mustIncludeAny?.length && !item.mustIncludeAny.some((value) => phrasePattern(value).test(answer))
      ? item.mustIncludeAny : [];
    const forbidden = (item.mustExclude || []).filter((value) => phrasePattern(value).test(answer));
    const proofFailures = (result.claims || []).filter((claim) => claim.verified !== true || !(claim.evidenceSourceIds || []).length);
    const passed = result.completion?.outcome === item.expectedOutcome
      && !missing.length && !missingAny.length && !forbidden.length && !proofFailures.length;
    const quality = assessCommunityAnswerQuality(item.question, result);
    rows.push({
      id: item.id,
      family: item.family,
      passed,
      expectedOutcome: item.expectedOutcome,
      actualOutcome: result.completion?.outcome || null,
      missing,
      missingAny,
      forbidden,
      proofFailureCount: proofFailures.length,
      rating: quality.rating || "Not rated",
      elapsedMs,
      answer,
      needRuns,
    });
  }
  const useful = rows.filter((row) => row.passed).length;
  const report = {
    schemaVersion: 1,
    isTest: true,
    status: "completed-local-semantic-hint-development-diagnostic",
    frozenCasesSha256: fixture.casesSha256,
    cases: rows.length,
    useful,
    usefulRate: useful / rows.length,
    diagnosticExcellent: rows.filter((row) => row.passed && row.rating === "Excellent").length,
    proofFailures: rows.reduce((sum, row) => sum + row.proofFailureCount, 0),
    initializationMs,
    medianElapsedMs: nearestRank(rows.map((row) => row.elapsedMs), 0.5),
    p95ElapsedMs: nearestRank(rows.map((row) => row.elapsedMs), 0.95),
    paidApiCalls: 0,
    addedModelApiCostUsd: 0,
    newSubscriptions: 0,
    rows,
    limitations: [
      "The frozen questions had already been revealed, so this is a development diagnostic and cannot be a final release score.",
      "Semantic retrieval only adds approved source-title hints to the existing evidence-safe answer flow; it does not change source content.",
      "Local embedding startup, query latency, memory, and production hosting cost require deployment measurement before adoption.",
      "Literal fixture expectations are a reproducible screen, not owner judgments of human quality.",
    ],
  };
  fs.writeFileSync(path.join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    ...report,
    rows: rows.map(({ answer, needRuns, ...row }) => row),
    failures: rows.filter((row) => !row.passed).map(({ needRuns, ...row }) => row),
  }, null, 2));
} finally {
  await ruleRanker?.dispose();
  await communityRanker?.dispose();
}

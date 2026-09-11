#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const residentQuestions = require("./resident-rules-corpus.json");
const authoredCases = require("./rules-eval-cases.json");
const communityCases = require("./community-eval-cases.json");
const unseenCases = require("./rules-unseen-eval-cases.json");
const inputPosition = process.argv.indexOf("--input");
const inputPath = inputPosition >= 0 ? process.argv[inputPosition + 1] : process.env.COMMUNITY_EVIDENCE_INDEX || "";
const communityIndex = inputPath ? JSON.parse(fs.readFileSync(inputPath, "utf8")) : require("../data/community-index.json");
const communityProfile = require("../data/communities/sterling-ranch.json");
const { answerRulesQuestion } = require("../lib/rules-assistant");
const { answerCommunityQuestion } = require("../lib/community-assistant");
const { classifyCommunityIntent } = require("../lib/community-search");
const { planCommunitySearchFixture, synthesizeCommunityAnswerFixture } = require("./community-ai-eval-fixtures");
const { residentEffortAssessment, scoreCommunityAnswer, handoffIsQuestionSpecific } = require("../lib/community-answer-quality");

const outputPath = process.env.COMMUNITY_EVIDENCE_REPORT_DIR
  ? path.join(process.env.COMMUNITY_EVIDENCE_REPORT_DIR, "community-assistant-eval.json")
  : path.join(__dirname, "..", "data", "community-assistant-eval.json");
const expectationByQuestion = new Map();

function normalizeEvaluationQuestion(question = "") {
  return String(question)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

for (const item of authoredCases) {
  for (const question of [item.question, ...(item.variants || [])]) expectationByQuestion.set(normalizeEvaluationQuestion(question), item);
}
for (const item of communityCases) {
  for (const question of [item.question, ...(item.variants || [])]) expectationByQuestion.set(normalizeEvaluationQuestion(question), item);
}
for (const item of unseenCases) expectationByQuestion.set(normalizeEvaluationQuestion(item.question), item);
const allQuestions = [...new Set([
  ...residentQuestions,
  ...authoredCases.flatMap((item) => [item.question, ...(item.variants || [])]),
  ...communityCases.flatMap((item) => [item.question, ...(item.variants || [])]),
  ...unseenCases.map((item) => item.question),
].map((question) => String(question).trim()).filter(Boolean))];

function summary(rows, field) {
  const ratings = rows.reduce((all, row) => { const value = row[field].rating; all[value] = (all[value] || 0) + 1; return all; }, {});
  const average = rows.length ? rows.reduce((sum, row) => sum + row[field].score, 0) / rows.length : 0;
  return { average: Number(average.toFixed(2)), ratings };
}

function effortSummary(rows, field) {
  const values = rows.map((row) => row[field].residentEffort);
  const ratings = values.reduce((all, value) => { all[value.rating] = (all[value.rating] || 0) + 1; return all; }, {});
  return {
    average: Number((values.length ? values.reduce((sum, value) => sum + value.score, 0) / values.length : 0).toFixed(2)),
    ratings,
    highEffortQuestions: values.filter((value) => value.score <= 2).length,
  };
}

function quarantineWithholdsRequiredEvidence(question, result = {}, index = {}) {
  const quarantine = index.revalidationQuarantine;
  if (quarantine?.mode !== "temporary-unavailable-approved-evidence") return false;
  if (!new Set(["community-access-withheld", "community-freshness-withheld"]).has(result.answerMode)) return false;
  if (result.answerStatus !== "source-unavailable" || result.authorityDecision !== "freshness-withheld") return false;
  if (result.confidence?.canAnswer !== false || result.confidence?.reason !== "source-review-required") return false;
  if ((result.claims || []).length || !result.sources?.length) return false;

  const indexedById = new Map((index.sources || []).map((source) => [String(source.id || ""), source]));
  const quarantinedById = new Map((quarantine.sources || []).map((source) => [String(source.id || ""), source]));
  const exactWithheldSources = result.sources.map((source) => {
    const id = String(source.id || "");
    const indexed = indexedById.get(id);
    const withheld = quarantinedById.get(id);
    return id && indexed && withheld
      && indexed.sourceUrl === source.sourceUrl
      && indexed.sourceUrl === withheld.sourceUrl
      && indexed.contentHash === source.contentHash
      && indexed.contentHash === withheld.contentHash
      && withheld.reason === "fetch-or-extraction-failed"
      ? indexed
      : null;
  });
  return exactWithheldSources.every(Boolean)
    && handoffIsQuestionSpecific(question, { sources: exactWithheldSources });
}

function expectedNoSourceEvidenceBoundary(result = {}, expectation = {}) {
  return expectation.shouldRefuse === true
    && expectation.expectedAnswerMode === "source-evidence-boundary"
    && expectation.expectedNoSources === true
    && result.answerMode === expectation.expectedAnswerMode
    && result.confidence?.canAnswer === false
    && (!expectation.expectedReason || result.confidence?.reason === expectation.expectedReason)
    && !(result.sources || []).length
    && !(result.actions || []).length
    && !(result.claims || []).length;
}

function legacySourcesAreStaleOrNotQuestionSpecific(question, result = {}) {
  const sources = result.sources || [];
  if (!sources.length) return true;
  if (sources.some((source) => ["stale", "expired", "superseded", "pending-review"].includes(source.lifecycle))) return true;
  return !handoffIsQuestionSpecific(question, { sources });
}

function isSafeNoClaimHold(result = {}, assessment = {}) {
  const boundaryMode = /(?:boundary|withheld)$/.test(String(result.answerMode || ""));
  const disqualifyingIssues = new Set([
    "confidence-reason-mismatch",
    "irrelevant-handoff-source",
    "required-refusal-missing",
    "answer-mode-mismatch",
    "official-source-missing",
    "resident-effort-high",
    "question-form-mismatch",
  ]);
  return boundaryMode
    && result.confidence?.canAnswer === false
    && !(result.claims || []).length
    && assessment.score >= 4
    && !(assessment.issues || []).some((issue) => disqualifyingIssues.has(issue));
}

function safeHoldSupersedesLegacyBaseline(question, current = {}, currentAssessment = {}, upgraded = {}, upgradedAssessment = {}, expectation = {}) {
  if (!isSafeNoClaimHold(upgraded, upgradedAssessment)) return false;
  const knownEvidenceBoundary = expectation?.shouldRefuse === true && current.confidence?.canAnswer === false;
  return knownEvidenceBoundary || legacySourcesAreStaleOrNotQuestionSpecific(question, current);
}

async function main() {
  const rows = [];
  for (const question of allQuestions) {
    const current = await answerRulesQuestion(question, { searchMode: "legacy", llmMode: "off" });
    const upgraded = await answerCommunityQuestion(question, {
      index: communityIndex,
      communityId: "sterling-ranch",
      communityProfile,
      answerRulesQuestion,
      rulesOptions: { searchMode: "legacy", llmMode: "off" },
      planCommunitySearch: planCommunitySearchFixture,
      synthesizeCommunityAnswer: synthesizeCommunityAnswerFixture,
    });
    const expectation = expectationByQuestion.get(normalizeEvaluationQuestion(question));
    const currentAssessment = scoreCommunityAnswer(question, current, { expectation });
    const upgradedAssessment = scoreCommunityAnswer(question, upgraded, { expectation });
    const qualityDisposition = quarantineWithholdsRequiredEvidence(question, upgraded, communityIndex)
      || expectedNoSourceEvidenceBoundary(upgraded, expectation)
      ? "withheld-unscored"
      : "scored";
    const safeHoldBaseline = safeHoldSupersedesLegacyBaseline(question, current, currentAssessment, upgraded, upgradedAssessment, expectation);
    const scoreChange = safeHoldBaseline && upgradedAssessment.score < currentAssessment.score
      ? 0
      : upgradedAssessment.score - currentAssessment.score;
    rows.push({
      question,
      intent: classifyCommunityIntent(question),
      current: { ...currentAssessment, answer: current.answer, mode: current.answerMode, sourceCount: current.sources?.length || 0 },
      upgraded: { ...upgradedAssessment, answer: upgraded.answer, mode: upgraded.answerMode, sourceCount: upgraded.sources?.length || 0, sourceIds: (upgraded.sources || []).map((source) => source.id || source.nodeId || source.sourceUrl), actions: upgraded.actions || [], claims: upgraded.claims || [] },
      scoreChange,
      qualityDisposition,
      baselineSupersededBySafeHold: safeHoldBaseline,
      changeReason: safeHoldBaseline
        ? "The upgraded answer safely withheld an unsupported claim; the legacy baseline used stale, non-specific, or explicitly non-answerable evidence."
        : upgradedAssessment.score > currentAssessment.score
        ? "The upgraded answer passed more usefulness and grounding checks."
        : upgradedAssessment.score < currentAssessment.score
          ? "The upgraded answer lost a required usefulness or grounding check."
          : "The upgraded answer retained the prior quality score.",
    });
  }
  const scoredRows = rows.filter((row) => row.qualityDisposition === "scored");
  const withheldRows = rows.filter((row) => row.qualityDisposition === "withheld-unscored");
  const report = {
    generatedAt: new Date().toISOString(),
    questionCount: rows.length,
    scoredQuestionCount: scoredRows.length,
    withheldUnscoredCount: withheldRows.length,
    withheldUnscoredQuestions: withheldRows.map((row) => row.question),
    current: summary(scoredRows, "current"),
    upgraded: summary(scoredRows, "upgraded"),
    improved: scoredRows.filter((row) => row.scoreChange > 0).length,
    retained: scoredRows.filter((row) => row.scoreChange === 0).length,
    regressed: scoredRows.filter((row) => row.scoreChange < 0).length,
    unsupportedClaimCount: rows.reduce((sum, row) => sum + (row.upgraded.claims || []).filter((claim) => !claim.verified).length, 0),
    currentResidentEffort: effortSummary(scoredRows, "current"),
    upgradedResidentEffort: effortSummary(scoredRows, "upgraded"),
    rows,
  };
  const outputPosition = process.argv.indexOf("--output");
  const requestedOutput = outputPosition >= 0 ? process.argv[outputPosition + 1] : "";
  if (process.argv.includes("--write") || requestedOutput) fs.writeFileSync(requestedOutput || outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Community Assistant audit: ${report.questionCount} unique questions.`);
  if (report.withheldUnscoredCount) console.log(`Withheld and unscored: ${report.withheldUnscoredCount} question(s): ${report.withheldUnscoredQuestions.join("; ")}.`);
  console.log(`Current: ${JSON.stringify(report.current)}.`);
  console.log(`Upgraded: ${JSON.stringify(report.upgraded)}.`);
  console.log(`Improved ${report.improved}; retained ${report.retained}; regressed ${report.regressed}.`);
  console.log(`Resident effort: ${JSON.stringify(report.upgradedResidentEffort)}.`);
  for (const row of scoredRows.filter((item) => item.upgraded.score < 4 || item.scoreChange < 0).slice(0, 30)) {
    console.log(`\n[${row.upgraded.score}; ${row.scoreChange >= 0 ? "+" : ""}${row.scoreChange}] ${row.question}\n${row.upgraded.issues.join(", ")}\n${row.upgraded.answer.replace(/\s+/g, " ").slice(0, 420)}`);
  }
  if (process.argv.includes("--enforce")) {
    const releaseFailures = [];
    if (report.questionCount < 200) releaseFailures.push(`evaluation corpus unexpectedly shrank to ${report.questionCount} questions`);
    if (report.regressed) releaseFailures.push(`${report.regressed} answer regressions`);
    if (report.upgraded.average < report.current.average) releaseFailures.push("upgraded average is lower than the current assistant");
    const belowGood = scoredRows.filter((row) => row.upgraded.score < 4);
    if (belowGood.length) releaseFailures.push(`${belowGood.length} upgraded answers scored below Good`);
    if (report.unsupportedClaimCount) releaseFailures.push(`${report.unsupportedClaimCount} unsupported claims were returned`);
    if (report.upgradedResidentEffort.highEffortQuestions) releaseFailures.push(`${report.upgradedResidentEffort.highEffortQuestions} answers still leave high resident effort`);
    if (report.upgradedResidentEffort.average < 4.5) releaseFailures.push(`resident-effort score ${report.upgradedResidentEffort.average} is below 4.5`);
    if (releaseFailures.length) {
      console.error(`Community Assistant release gate failed: ${releaseFailures.join("; ")}.`);
      process.exitCode = 1;
    }
  }
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });

module.exports = {
  residentEffortAssessment,
  score: scoreCommunityAnswer,
  isSafeNoClaimHold,
  legacySourcesAreStaleOrNotQuestionSpecific,
  safeHoldSupersedesLegacyBaseline,
  quarantineWithholdsRequiredEvidence,
  expectedNoSourceEvidenceBoundary,
  normalizeEvaluationQuestion,
};

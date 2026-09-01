#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const residentQuestions = require("./resident-rules-corpus.json");
const authoredCases = require("./rules-eval-cases.json");
const unseenCases = require("./rules-unseen-eval-cases.json");
const communityIndex = require("../data/community-index.json");
const { answerRulesQuestion } = require("../lib/rules-assistant");
const { answerCommunityQuestion } = require("../lib/community-assistant");
const { classifyCommunityIntent } = require("../lib/community-search");
const { planCommunitySearchFixture, synthesizeCommunityAnswerFixture } = require("./community-ai-eval-fixtures");
const { residentEffortAssessment, scoreCommunityAnswer } = require("../lib/community-answer-quality");

const outputPath = path.join(__dirname, "..", "data", "community-assistant-eval.json");
const expectationByQuestion = new Map();
for (const item of authoredCases) {
  for (const question of [item.question, ...(item.variants || [])]) expectationByQuestion.set(question.toLowerCase().trim(), item);
}
for (const item of unseenCases) expectationByQuestion.set(item.question.toLowerCase().trim(), item);
const allQuestions = [...new Set([
  ...residentQuestions,
  ...authoredCases.flatMap((item) => [item.question, ...(item.variants || [])]),
  ...unseenCases.map((item) => item.question),
].map((question) => String(question).trim()).filter(Boolean))];

function summary(rows, field) {
  const ratings = rows.reduce((all, row) => { const value = row[field].rating; all[value] = (all[value] || 0) + 1; return all; }, {});
  const average = rows.reduce((sum, row) => sum + row[field].score, 0) / rows.length;
  return { average: Number(average.toFixed(2)), ratings };
}

function effortSummary(rows, field) {
  const values = rows.map((row) => row[field].residentEffort);
  const ratings = values.reduce((all, value) => { all[value.rating] = (all[value.rating] || 0) + 1; return all; }, {});
  return {
    average: Number((values.reduce((sum, value) => sum + value.score, 0) / values.length).toFixed(2)),
    ratings,
    highEffortQuestions: values.filter((value) => value.score <= 2).length,
  };
}

async function main() {
  const rows = [];
  for (const question of allQuestions) {
    const current = await answerRulesQuestion(question, { searchMode: "legacy", llmMode: "off" });
    const upgraded = await answerCommunityQuestion(question, {
      index: communityIndex,
      communityId: "sterling-ranch",
      answerRulesQuestion,
      rulesOptions: { searchMode: "legacy", llmMode: "off" },
      planCommunitySearch: planCommunitySearchFixture,
      synthesizeCommunityAnswer: synthesizeCommunityAnswerFixture,
    });
    const expectation = expectationByQuestion.get(question.toLowerCase().trim());
    const currentAssessment = scoreCommunityAnswer(question, current, { expectation });
    const upgradedAssessment = scoreCommunityAnswer(question, upgraded, { expectation });
    rows.push({
      question,
      intent: classifyCommunityIntent(question),
      current: { ...currentAssessment, answer: current.answer, mode: current.answerMode, sourceCount: current.sources?.length || 0 },
      upgraded: { ...upgradedAssessment, answer: upgraded.answer, mode: upgraded.answerMode, sourceCount: upgraded.sources?.length || 0, sourceIds: (upgraded.sources || []).map((source) => source.id || source.nodeId || source.sourceUrl), actions: upgraded.actions || [], claims: upgraded.claims || [] },
      scoreChange: upgradedAssessment.score - currentAssessment.score,
      changeReason: upgradedAssessment.score > currentAssessment.score
        ? "The upgraded answer passed more usefulness and grounding checks."
        : upgradedAssessment.score < currentAssessment.score
          ? "The upgraded answer lost a required usefulness or grounding check."
          : "The upgraded answer retained the prior quality score.",
    });
  }
  const report = {
    generatedAt: new Date().toISOString(),
    questionCount: rows.length,
    current: summary(rows, "current"),
    upgraded: summary(rows, "upgraded"),
    improved: rows.filter((row) => row.scoreChange > 0).length,
    retained: rows.filter((row) => row.scoreChange === 0).length,
    regressed: rows.filter((row) => row.scoreChange < 0).length,
    unsupportedClaimCount: rows.reduce((sum, row) => sum + (row.upgraded.claims || []).filter((claim) => !claim.verified).length, 0),
    currentResidentEffort: effortSummary(rows, "current"),
    upgradedResidentEffort: effortSummary(rows, "upgraded"),
    rows,
  };
  if (process.argv.includes("--write")) fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Community Assistant audit: ${report.questionCount} unique questions.`);
  console.log(`Current: ${JSON.stringify(report.current)}.`);
  console.log(`Upgraded: ${JSON.stringify(report.upgraded)}.`);
  console.log(`Improved ${report.improved}; retained ${report.retained}; regressed ${report.regressed}.`);
  console.log(`Resident effort: ${JSON.stringify(report.upgradedResidentEffort)}.`);
  for (const row of rows.filter((item) => item.upgraded.score < 4 || item.scoreChange < 0).slice(0, 30)) {
    console.log(`\n[${row.upgraded.score}; ${row.scoreChange >= 0 ? "+" : ""}${row.scoreChange}] ${row.question}\n${row.upgraded.issues.join(", ")}\n${row.upgraded.answer.replace(/\s+/g, " ").slice(0, 420)}`);
  }
  if (process.argv.includes("--enforce")) {
    const releaseFailures = [];
    if (report.questionCount < 200) releaseFailures.push(`evaluation corpus unexpectedly shrank to ${report.questionCount} questions`);
    if (report.regressed) releaseFailures.push(`${report.regressed} answer regressions`);
    if (report.upgraded.average < report.current.average) releaseFailures.push("upgraded average is lower than the current assistant");
    const belowGood = rows.filter((row) => row.upgraded.score < 4);
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

module.exports = { residentEffortAssessment, score: scoreCommunityAnswer };

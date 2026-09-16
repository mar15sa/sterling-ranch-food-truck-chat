"use strict";

const { answerCommunityQuestion } = require("../../lib/community-assistant");
const { assessCommunityAnswerQuality, VERSION } = require("../../lib/community-quality-rubric");
const { cases } = require("../eval-community-need-first-offline");

async function main() {
  const rows = [];
  for (const benchmarkCase of cases) {
    const result = await answerCommunityQuestion(benchmarkCase.question, benchmarkCase.options());
    const assessment = assessCommunityAnswerQuality(benchmarkCase.question, result);
    const expectedComplete = ["complete", "handled-boundary"].includes(benchmarkCase.expectedOutcome);
    const falsePositive = !expectedComplete && benchmarkCase.expectedOutcome !== "ambiguous"
      && ["Good", "Excellent"].includes(assessment.rating);
    const falseNegative = expectedComplete && !["Good", "Excellent"].includes(assessment.rating);
    rows.push({
      id: benchmarkCase.id,
      family: benchmarkCase.family,
      expectedOutcome: benchmarkCase.expectedOutcome,
      actualOutcome: result.completion?.outcome || null,
      rating: assessment.rating || "Not rated",
      score: assessment.score || 0,
      dimensionTotal: assessment.dimensionTotal ?? null,
      hardFailures: assessment.hardFailures || [],
      falsePositive,
      falseNegative,
    });
  }

  const ratings = {};
  for (const row of rows) ratings[row.rating] = (ratings[row.rating] || 0) + 1;
  const report = {
    schemaVersion: 1,
    rubricVersion: VERSION,
    status: rows.every((row) => !row.falsePositive && !row.falseNegative) ? "passed-structural-check" : "failed-structural-check",
    calibrated: false,
    publishable: false,
    scope: "The existing 19 authored production-shape and frozen rule fixtures; not human calibration or an unseen acceptance set.",
    totals: {
      cases: rows.length,
      ratings,
      falsePositiveCompleteRatings: rows.filter((row) => row.falsePositive).length,
      falseNegativeCompleteRatings: rows.filter((row) => row.falseNegative).length,
      modelCalls: 0,
      addedModelApiCostUsd: 0,
    },
    failures: rows.filter((row) => row.falsePositive || row.falseNegative),
    cases: process.argv.includes("--full") ? rows : undefined,
    limitations: [
      "Fixture expectations verify structural rating behavior, not agreement with the owner.",
      "A complete answer can still need a human presentation judgment.",
      "The rubric remains blocked from publication until negative and positive human examples pass calibration.",
    ],
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.status !== "passed-structural-check") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

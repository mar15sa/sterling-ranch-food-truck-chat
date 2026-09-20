"use strict";

const assert = require("node:assert/strict");
const { answerCommunityQuestion } = require("../lib/community-assistant");
const { answerRulesQuestion } = require("../lib/rules-assistant");
const index = require("../data/community-index.json");
const communityProfile = require("../data/communities/sterling-ranch.json");

const fixtureFiles = [
  "../test/fixtures/community-root-holdout-2026-09-18.json",
  "../test/fixtures/community-root-holdout-2-2026-09-18.json",
  "../test/fixtures/community-root-holdout-3-2026-09-18.json",
  "../test/fixtures/community-root-holdout-4-2026-09-18.json",
];
const cases = fixtureFiles.flatMap((file) => require(file));

async function main() {
  const rows = [];
  for (const [indexPosition, item] of cases.entries()) {
    const startedAt = Date.now();
    const result = await answerCommunityQuestion(item.question, {
      isTest: true,
      requestContractMode: "need-audited-candidate",
      needRouterBackend: "current-local",
      needFirstResidentRelease: true,
      planCommunitySearch: false,
      synthesizeCommunityAnswer: false,
      interpretationMode: "structured",
      answerRulesQuestion,
      rulesOptions: { searchMode: "legacy", llmMode: "off" },
      index,
      communityId: "sterling-ranch",
      communityProfile,
      now: new Date("2026-09-18T18:00:00Z"),
    });
    const failures = [];
    for (const pattern of item.mustMatch || []) {
      if (!new RegExp(pattern, "i").test(result.answer || "")) failures.push(`missing /${pattern}/i`);
    }
    for (const pattern of item.mustNotMatch || []) {
      if (new RegExp(pattern, "i").test(result.answer || "")) failures.push(`included /${pattern}/i`);
    }
    const row = {
      id: item.id,
      pass: failures.length === 0,
      failures,
      durationMs: Date.now() - startedAt,
      answerMode: result.answerMode,
      answerStatus: result.answerStatus,
      baselinePreserved: result._requestContract?.candidate?.baselinePreserved === true,
      selectionReason: result._requestContract?.candidate?.reason || "",
    };
    rows.push(row);
    process.stdout.write(`${JSON.stringify({ completed: indexPosition + 1, total: cases.length, ...row })}\n`);
  }

  const passed = rows.filter((row) => row.pass).length;
  const summary = {
    isTest: true,
    mode: "audited-legacy-candidate",
    cases: rows.length,
    passed,
    failed: rows.length - passed,
    baselinePreserved: rows.filter((row) => row.baselinePreserved).length,
    fallbackSelected: rows.filter((row) => !row.baselinePreserved).length,
    modelCalls: 0,
    addedModelApiCostUsd: 0,
  };
  process.stdout.write(`${JSON.stringify({ summary })}\n`);
  assert.equal(passed, rows.length, `${passed}/${rows.length} audited candidate cases passed`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

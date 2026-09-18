const assert = require("node:assert/strict");
const cases = require("../test/fixtures/community-root-holdout-4-2026-09-18.json");
const { answerCommunityQuestion } = require("../lib/community-assistant");
const { answerRulesQuestion } = require("../lib/rules-assistant");
const index = require("../data/community-index.json");
const communityProfile = require("../data/communities/sterling-ranch.json");

async function main() {
  let passed = 0;
  for (const item of cases) {
    const result = await answerCommunityQuestion(item.question, {
      isTest: true,
      requestContractMode: "need-first-candidate",
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
    if (result.completion?.outcome !== "complete") failures.push(`outcome=${result.completion?.outcome || "missing"}`);
    for (const pattern of item.mustMatch || []) {
      if (!new RegExp(pattern, "i").test(result.answer || "")) failures.push(`missing /${pattern}/i`);
    }
    for (const pattern of item.mustNotMatch || []) {
      if (new RegExp(pattern, "i").test(result.answer || "")) failures.push(`included /${pattern}/i`);
    }
    if (!failures.length) passed += 1;
    console.log(JSON.stringify({ id: item.id, pass: failures.length === 0, failures, answer: result.answer }));
  }
  assert.equal(passed, cases.length, `${passed}/${cases.length} fourth untouched holdout cases passed`);
  console.log(`Fourth untouched holdout: ${passed}/${cases.length} passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

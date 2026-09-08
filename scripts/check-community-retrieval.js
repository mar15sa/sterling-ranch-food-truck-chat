#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const inputPosition = process.argv.indexOf("--input");
const inputPath = inputPosition >= 0 ? process.argv[inputPosition + 1] : process.env.COMMUNITY_EVIDENCE_INDEX || "";
const communityIndex = inputPath ? JSON.parse(fs.readFileSync(inputPath, "utf8")) : require("../data/community-index.json");
const { answerCommunityQuestion } = require("../lib/community-assistant");
const { answerRulesQuestion } = require("../lib/rules-assistant");

const CASES = [
  ["Can I build a shed in my backyard?", /Backyard utility sheds/i],
  ["When can I put up holiday lights?", /Updated exterior lighting policy/i],
  ["What are the landscaping and yard rules?", /Required lot landscape/i],
  ["What fees do residents pay?", /water, sanitary sewer, and stormwater/i],
  ["What are the rules for parks and open spaces?", /17-54/i],
  ["How do I reserve the Overlook Clubhouse?", /Rent the Facility/i],
  ["Who do I contact about water billing?", /Water Billing/i, false],
  // The current court-page version is withheld while its conflicting hours,
  // fee, and booking claims are reviewed. Generic park rules can still use the
  // separate governing section; operational questions cannot.
  ["What are the neighborhood pickleball court rules?", /17-54|General rules/i],
  ["What is the maximum height a freestanding flag pole can be?", /2024 CAB Code amendments/i],
  ["What trees can we plant?", /5-131|Preapproved plant list/i],
  ["What are the rules for yard art?", /2024 CAB Code amendments/i],
  ["When am I allowed to water my lawn?", /13-105|Water conservation measures/i],
  ["What approval and setbacks apply to a backyard spa?", /Hot tubs, outdoor spas/i],
  ["Can I have chickens?", /1-33|Pets and livestock/i],
  ["Dogs?", /1-33|Pets and livestock/i],
  ["Can I park on the street?", /1-37|Vehicles; parking/i],
  ["Can I build a greenhouse?", /Greenhouses/i],
  ["What day is trash pickup?", /Trash & Recycling/i, false],
  ["Who do I contact about internet service?", /Important Contact Information/i, false],
  ["What email do I use for design review questions?", /Attachment A-3/i],
];

async function main() {
  let passed = 0;
  const failures = [];
  for (const [question, expected, expectedCanAnswer = true] of CASES) {
    const answer = await answerCommunityQuestion(question, {
      index: communityIndex,
      communityId: "sterling-ranch",
      answerRulesQuestion,
      rulesOptions: { searchMode: "legacy", llmMode: "off" },
      planCommunitySearch: false,
      synthesizeCommunityAnswer: false,
    });
    const firstSource = answer.sources?.[0]?.title || "";
    const safeOutcome = expectedCanAnswer
      ? answer.confidence?.canAnswer === true
      : answer.confidence?.canAnswer === false
        && answer.answerMode === "community-freshness-withheld"
        && answer.confidence?.reason === "source-review-required";
    if (expected.test(firstSource) && safeOutcome) passed += 1;
    else failures.push({ question, expected: String(expected), expectedCanAnswer, firstSource, reason: answer.confidence?.reason });
  }
  const recall = passed / CASES.length;
  console.log(`Community controlling-source retrieval: ${passed}/${CASES.length} (${Math.round(recall * 100)}%).`);
  const outputPosition = process.argv.indexOf("--output");
  const outputPath = outputPosition >= 0 ? process.argv[outputPosition + 1] : process.env.COMMUNITY_EVIDENCE_REPORT_DIR
    ? path.join(process.env.COMMUNITY_EVIDENCE_REPORT_DIR, "community-retrieval-report.json")
    : path.join(__dirname, '../data/community-retrieval-report.json');
  fs.writeFileSync(outputPath, JSON.stringify({checkedAt:new Date().toISOString(),passed,total:CASES.length,failures},null,2)+'\n');
  if (recall < 1) {
    for (const failure of failures) console.error(JSON.stringify(failure));
    throw new Error("Every critical question must use its controlling source before release.");
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });

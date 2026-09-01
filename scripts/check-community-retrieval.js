#!/usr/bin/env node
const communityIndex = require("../data/community-index.json");
const { answerCommunityQuestion } = require("../lib/community-assistant");
const { answerRulesQuestion } = require("../lib/rules-assistant");

const CASES = [
  ["Can I build a shed in my backyard?", /Backyard utility sheds/i],
  ["When can I put up holiday lights?", /Updated exterior lighting policy/i],
  ["What are the landscaping and yard rules?", /Required lot landscape/i],
  ["What fees do residents pay?", /water, sanitary sewer, and stormwater/i],
  ["What are the rules for parks and open spaces?", /17-54/i],
  ["How do I reserve the Overlook Clubhouse?", /Rent the Facility/i],
  ["Who do I contact about water billing?", /Water Billing/i],
  ["What are the neighborhood pickleball court rules?", /Pickleball Courts/i],
  ["What is the maximum height a freestanding flag pole can be?", /2024 CAB Code amendments/i],
  ["What trees can we plant?", /5-131|Preapproved plant list/i],
  ["What are the rules for yard art?", /2024 CAB Code amendments/i],
  ["When am I allowed to water my lawn?", /13-105|Water conservation measures/i],
  ["What approval and setbacks apply to a backyard spa?", /Hot tubs, outdoor spas/i],
  ["Can I have chickens?", /1-33|Pets and livestock/i],
  ["Dogs?", /1-33|Pets and livestock/i],
  ["Can I park on the street?", /1-37|Vehicles; parking/i],
  ["Can I build a greenhouse?", /Greenhouses/i],
  ["What day is trash pickup?", /Trash & Recycling/i],
  ["Who do I contact about internet service?", /Important Contact Information/i],
  ["What email do I use for design review questions?", /21-21|design review process/i],
];

async function main() {
  let passed = 0;
  const failures = [];
  for (const [question, expected] of CASES) {
    const answer = await answerCommunityQuestion(question, {
      index: communityIndex,
      communityId: "sterling-ranch",
      answerRulesQuestion,
      rulesOptions: { searchMode: "legacy", llmMode: "off" },
      planCommunitySearch: false,
      synthesizeCommunityAnswer: false,
    });
    const firstSource = answer.sources?.[0]?.title || "";
    if (expected.test(firstSource) && answer.confidence?.canAnswer === true) passed += 1;
    else failures.push({ question, expected: String(expected), firstSource, reason: answer.confidence?.reason });
  }
  const recall = passed / CASES.length;
  console.log(`Community controlling-source retrieval: ${passed}/${CASES.length} (${Math.round(recall * 100)}%).`);
  if (failures.length) {
    for (const failure of failures) console.error(JSON.stringify(failure));
    throw new Error("Controlling-source retrieval must be 100% for critical questions.");
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });

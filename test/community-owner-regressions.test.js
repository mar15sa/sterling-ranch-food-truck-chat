const test = require("node:test");
const assert = require("node:assert/strict");
const { proactiveCommunityAnswer } = require("../lib/community-proactive");
const { answerRulesQuestion } = require("../lib/rules-assistant");
const index = require("../data/community-index.json");
const { normalizeInterpretation } = require("../lib/community-interpretation");

test("invented open-ended dates cannot narrow a general process or recurring schedule", () => {
  const base = { intent: "services", goal: "schedule", goals: ["schedule"], subject: "trash collection", searchQueries: ["trash collection"], requestedDetails: ["date"] };
  for (const kind of ["open", "open-ended"]) {
    const plan = normalizeInterpretation({ ...base, dateRange: { kind, start: "2026-09-06", end: "2026-12-31" } }, "What day is trash collected?", { now: new Date("2026-09-06") });
    assert.equal(plan.dateRange, null);
  }
});

test("plant establishment billing uses the current official FAQ, even with a payment interpretation", () => {
  for (const question of [
    "Can i get a discount on my water while trying to establish plants",
    "Are water charges reduced for new sod?",
    "Is there a water budget exemption when establishing my lawn?",
  ]) {
    const answer = proactiveCommunityAnswer(question, {
      index, now: new Date("2026-09-06T20:00:00Z"),
      routingPlan: { goal: "payment", subject: "water bill" },
    });
    assert.match(answer.directAnswer, /45-day/);
    assert.match(answer.directAnswer, /first-tier/);
    assert.match(answer.directAnswer, /does not count against your water budget/);
    assert.doesNotMatch(answer.answer, /delinquen|unpaid|disconnection/i);
    assert.match(answer.sources[0].sourceUrl, /faq\?cat=16/);
  }
});

test("establishment billing is not invented from missing or expired evidence", () => {
  const question = "Water discount for new turf?";
  assert.equal(proactiveCommunityAnswer(question, { index: { sources: [] } }), null);
  const expired = { sources: index.sources.map(source => ({ ...source, staleAfter: "2000-01-01" })) };
  assert.equal(proactiveCommunityAnswer(question, { index: expired }), null);
  assert.equal(proactiveCommunityAnswer("What happens if my water bill is unpaid?", { index }), null);
});

test("a complete rules answer avoids a redundant AI search after shared interpretation", async () => {
  let plannerCalls = 0;
  const answer = await answerRulesQuestion("How many months do I have to finish my backyard?", {
    searchMode: "ai-hybrid", llmMode: "off",
    interpretation: { intent: "rules", needsClarification: false },
    planRulesSearch: async () => { plannerCalls++; return null; },
  });
  assert.equal(plannerCalls, 0);
  assert.equal(answer.searchStrategy, "shared-interpretation-strong-match");
  assert.match(answer.answer, /120/);
  assert.ok(answer.sources.length);
});

test("unpaid water bills retain their collection-policy answer", async () => {
  const answer = await answerRulesQuestion("What happens if I do not pay my water bill?", { searchMode: "legacy", llmMode: "off" });
  assert.match(answer.answer, /past.due|unpaid|late.fee|disconnection/i);
  assert.doesNotMatch(answer.answer, /45.day establishment/i);
});

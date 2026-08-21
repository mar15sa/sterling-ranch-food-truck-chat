const test = require("node:test");
const assert = require("node:assert/strict");

const { answerRulesQuestion } = require("../lib/rules-assistant");

async function answer(question, options = {}) {
  return answerRulesQuestion(question, { searchMode: "legacy", llmMode: "off", ...options });
}

test("short-term home-rental phrasings are prohibited and never route to amenity rentals", async () => {
  for (const question of [
    "Can I rent my house on Airbnb for the weekend?",
    "Are VRBO vacation rentals allowed?",
    "Could guests book my place for two nights?",
  ]) {
    const result = await answer(question);
    assert.equal(result.answerVerdict, "prohibited", question);
    assert.match(result.answer, /may not|No\./i, question);
    assert.match(result.answer, /short-term|Airbnb|VRBO/i, question);
    assert.doesNotMatch(result.answer, /facility rental|security deposit/i, question);
  }
});

test("AI cannot misroute a home rental to CAB facility cancellation rules", async () => {
  const result = await answerRulesQuestion("Can I rent my home on Airbnb this weekend?", {
    searchMode: "ai-hybrid",
    llmMode: "off",
    planRulesSearch: async () => ({
      inScope: "yes",
      intent: "rental_cancellation",
      normalizedQuestion: "cancel a facility rental",
      searchQueries: ["clubhouse cancellation refund"],
      entities: [],
    }),
    rerankRulesSources: async (_question, sources) => sources,
  });
  assert.equal(result.answerVerdict, "prohibited");
  assert.match(result.answer, /Airbnb|short-term/i);
  assert.doesNotMatch(result.answer, /refund|security deposit/i);
});

test("RV duration answers compare the requested stay with the current source limit", async () => {
  for (const question of [
    "Can I park my RV in my driveway for a week?",
    "Is a four-day camper stay okay in the driveway?",
    "May my trailer stay for seven days?",
  ]) {
    const result = await answer(question);
    assert.equal(result.answerVerdict, "prohibited", question);
    assert.match(result.answer, /No\..*exceeds/i, question);
    assert.match(result.answer, /72 hours/i, question);
  }
});

test("watering answers apply method, time, and season instead of leading with an exception", async () => {
  for (const question of [
    "Can I water my lawn at noon in July?",
    "May my sprinklers run at 12:30 p.m. in August?",
  ]) {
    const result = await answer(question);
    assert.equal(result.answerVerdict, "prohibited", question);
    assert.match(result.answer, /No\..*inside/i, question);
    assert.match(result.answer, /10:00 a\.m.*6:00 p\.m/i, question);
  }
  const handWatering = await answer("Can I hand water my garden at noon in July?");
  assert.equal(handWatering.answerVerdict, "allowed");
  assert.match(handWatering.answer, /Yes\..*Hand watering/i);
});

test("fence-height answers explain the type distinction and give the sourced standard", async () => {
  for (const question of ["How tall can my fence be?", "What is the maximum fence height?"]) {
    const result = await answer(question);
    assert.match(result.answer, /depends on the fence type and lot/i, question);
    assert.match(result.answer, /54 inches/i, question);
    assert.match(result.answer, /DRC/i, question);
  }
});

test("trash timing questions directly state what the current rule does and does not specify", async () => {
  for (const question of [
    "Can I leave my trash cans out overnight?",
    "Can the bins stay at the curb until tomorrow morning?",
    "When do I need to bring my recycling cans in?",
  ]) {
    const result = await answer(question);
    assert.match(result.answer, /does not give a specific curb-placement or removal time/i, question);
    assert.match(result.answer, /garage|wing fence/i, question);
    assert.doesNotMatch(result.answer, /4:00 a\.m/i, question);
  }
});

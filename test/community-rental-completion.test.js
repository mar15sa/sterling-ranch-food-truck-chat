const test = require("node:test");
const assert = require("node:assert/strict");
const { answerCommunityQuestion } = require("../lib/community-assistant");
const { proactiveCommunityAnswer } = require("../lib/community-proactive");
const { answerRulesQuestion } = require("../lib/rules-assistant");
const index = require("../data/community-index.json");

const now = new Date("2026-09-08T18:00:00Z");
function plan(facility) {
  return {
    intent: "facilities", goal: "booking", goals: ["booking"], subject: `${facility} rental`,
    requestedDetails: ["action"], dateRange: null,
    filters: { audience: "", category: "", facility, location: "" },
    searchQueries: [`${facility} rental reservation`], scope: "community", needsClarification: false,
  };
}
async function ask(question, facility) {
  return answerCommunityQuestion(question, {
    now, index, communityId: "sterling-ranch", synthesizeCommunityAnswer: false,
    planCommunitySearch: async () => plan(facility),
    answerRulesQuestion: async () => ({ confidence: { canAnswer: false, reason: "no-rule-answer" } }),
  });
}

test("held-out rental wording is withheld until the exact booking action is approved", async () => {
  const cases = [
    ["Can I reserve the clubhouse for a meeting?", "Clubhouse"],
    ["How do I book the Great Hall?", "Great Hall"],
    ["I need a pavilion for a birthday. Where do I reserve it?", "Pavilion"],
    ["Can I rent a park shelter?", "park shelter"],
    ["Where can I check availability for the clubhouse?", "Clubhouse"],
  ];
  for (const [question, facility] of cases) {
    const result = await ask(question, facility);
    assert.equal(result.answerStatus, "source-unavailable", question);
    assert.equal(result.confidence.canAnswer, false, question);
    assert.ok(result.sources.some((source) => /Rent-the-Facility|Park-Shelters/i.test(source.sourceUrl)), question);
    assert.ok(result.actions.every((action) => !/secure\.rec1\.com/i.test(action.url)), question);
    assert.doesNotMatch(JSON.stringify(result.sources), /\/187\/Pool|pool FAQ/i, question);
  }
});

test("a canonical facility name cannot make an unapproved rental action answerable", async () => {
  const result = await ask("Can I reserve the clubhouse for a meeting?", "Overlook Clubhouse");
  assert.equal(result.answerStatus, "source-unavailable");
  assert.doesNotMatch(result.answer, /secure\.rec1\.com|select Overlook Clubhouse/i);
});

test("residential rental rules outrank withheld facility pages after a facility misclassification", async () => {
  for (const question of ["Long term rental", "Short term rental"]) {
    const result = await answerCommunityQuestion(question, {
      now, index, communityId: "sterling-ranch", synthesizeCommunityAnswer: false,
      planCommunitySearch: async () => plan("Overlook Clubhouse"),
      answerRulesQuestion: (residentQuestion, options) => answerRulesQuestion(residentQuestion, {
        ...options, searchMode: "legacy", llmMode: "off",
      }),
    });
    assert.equal(result.answerStatus, "verified", question);
    assert.doesNotMatch(result.answerMode, /freshness-withheld|facility/i, question);
    assert.doesNotMatch(JSON.stringify(result.actions || []), /Rent-the-Facility|Amenity-Rentals/i, question);
  }
});

test("raw facility prices cannot create a proactive rental shortcut", () => {
  const cases = [
    ["How much does the Great Hall cost?", /Great Hall.*\$100(?:\.00)? per hour/i, /\$25 per hour/i],
    ["How much does the North Pavilion cost?", /North Pavilion.*\$25 per hour/i, /\$100 per hour/i],
    ["How much does the South Pavilion cost?", /South Pavilion.*\$25 per hour/i, /\$100 per hour/i],
    ["How much does a park shelter cost?", /park shelter.*\$15 per hour/i, /\$100 per hour|\$25 per hour/i],
  ];
  for (const [question] of cases) {
    const result = proactiveCommunityAnswer(question, { index, now });
    assert.equal(result, null, question);
  }
  for (const question of ["How much does the clubhouse cost?", "How much does Overlook cost?"]) {
    const result = proactiveCommunityAnswer(question, { index, now });
    assert.equal(result, null, question);
  }
});

test("generic clubhouse prices remain withheld without exact approved claims", async () => {
  for (const question of ["How much does the clubhouse cost?", "How much does Overlook cost?"]) {
    const result = await answerCommunityQuestion(question, {
      now, index, communityId: "sterling-ranch", synthesizeCommunityAnswer: false,
      planCommunitySearch: async () => ({ ...plan("Overlook Clubhouse"), goal: "cost", goals: ["cost"], requestedDetails: ["price", "action"] }),
      answerRulesQuestion: async () => ({ confidence: { canAnswer: false } }),
    });
    assert.equal(result.answerStatus, "source-unavailable", question);
    assert.doesNotMatch(result.answer, /\$100|\$25/i, question);
    assert.ok(result.sources.some((source) => /^https:\/\/sterlingranchcab\.com/i.test(source.sourceUrl)), question);
    assert.ok(result.actions.every((action) => !/secure\.rec1\.com/i.test(action.url)), question);
    assert.doesNotMatch(JSON.stringify(result.sources), /\/187\/Pool|pool FAQ/i, question);
  }
});

test("rental shortcut retains facility boundaries and source gates", async () => {
  const poolParty = await ask("Can I reserve the pool for a birthday party?", "pool");
  assert.notEqual(poolParty.answerMode, "community-proactive-rental");

  const access = await ask("How do I get pool access at the clubhouse?", "Clubhouse");
  assert.notEqual(access.answerMode, "community-proactive-rental");

  const stale = { ...index, sources: index.sources.map((source) => /Rent-the-Facility|Park-Shelters/.test(source.sourceUrl || "") ? { ...source, staleAfter: "2020-01-01T00:00:00Z" } : source) };
  const staleResult = await answerCommunityQuestion("Can I reserve the clubhouse?", { now, index: stale, communityId: "sterling-ranch", synthesizeCommunityAnswer: false, planCommunitySearch: async () => plan("Clubhouse"), answerRulesQuestion: async () => ({ confidence: { canAnswer: false } }) });
  assert.notEqual(staleResult.answerMode, "community-proactive-rental");

  const unavailable = { ...index, sources: index.sources.filter((source) => source.connectorType !== "civicrec") };
  const unavailableResult = await answerCommunityQuestion("Can I reserve the clubhouse?", { now, index: unavailable, communityId: "sterling-ranch", synthesizeCommunityAnswer: false, planCommunitySearch: async () => plan("Clubhouse"), answerRulesQuestion: async () => ({ confidence: { canAnswer: false } }) });
  assert.notEqual(unavailableResult.answerMode, "community-proactive-rental");

  const connectorOnly = { ...index, sources: index.sources.filter((source) => source.connectorType === "civicrec") };
  const connectorOnlyResult = await answerCommunityQuestion("Can I reserve the clubhouse?", { now, index: connectorOnly, communityId: "sterling-ranch", synthesizeCommunityAnswer: false, planCommunitySearch: async () => plan("Clubhouse"), answerRulesQuestion: async () => ({ confidence: { canAnswer: false } }) });
  assert.notEqual(connectorOnlyResult.answerMode, "community-proactive-rental");
});

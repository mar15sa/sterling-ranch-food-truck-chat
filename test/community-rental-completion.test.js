const test = require("node:test");
const assert = require("node:assert/strict");
const { answerCommunityQuestion } = require("../lib/community-assistant");
const { proactiveCommunityAnswer } = require("../lib/community-proactive");
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

test("held-out rental wording completes with the resolved facility and official booking action", async () => {
  const cases = [
    ["Can I reserve the clubhouse for a meeting?", "Clubhouse"],
    ["How do I book the Great Hall?", "Great Hall"],
    ["I need a pavilion for a birthday. Where do I reserve it?", "Pavilion"],
    ["Can I rent a park shelter?", "park shelter"],
    ["Where can I check availability for the clubhouse?", "Clubhouse"],
  ];
  for (const [question, facility] of cases) {
    const result = await ask(question, facility);
    assert.equal(result.answerStatus, "verified", question);
    assert.equal(result.confidence.canAnswer, true, question);
    assert.match(result.directAnswer, new RegExp(facility, "i"), question);
    assert.ok(result.sources.some((source) => /Rent-the-Facility|Park-Shelters/i.test(source.sourceUrl)), question);
    assert.ok(result.actions.some((action) => action.actionType === "booking" && /secure\.rec1\.com/i.test(action.url)), question);
    assert.doesNotMatch(JSON.stringify(result.sources), /\/187\/Pool|pool FAQ/i, question);
  }
});

test("a canonical facility filter is rendered only when the cited page proves it", async () => {
  const result = await ask("Can I reserve the clubhouse for a meeting?", "Overlook Clubhouse");
  assert.equal(result.answerStatus, "verified");
  assert.match(result.directAnswer, /Overlook Clubhouse/i);
  assert.ok(result.sources.some((source) => /Overlook Clubhouse/i.test(source.text || "")));
});

test("facility prices stay attached to the named rentable space", () => {
  const cases = [
    ["How much does the Great Hall cost?", /Great Hall.*\$100(?:\.00)? per hour/i, /\$25 per hour/i],
    ["How much does the North Pavilion cost?", /North Pavilion.*\$25 per hour/i, /\$100 per hour/i],
    ["How much does the South Pavilion cost?", /South Pavilion.*\$25 per hour/i, /\$100 per hour/i],
    ["How much does a park shelter cost?", /park shelter.*\$15 per hour/i, /\$100 per hour|\$25 per hour/i],
  ];
  for (const [question, expected, absent] of cases) {
    const result = proactiveCommunityAnswer(question, { index, now });
    assert.match(result.directAnswer, expected, question);
    assert.doesNotMatch(result.directAnswer, absent, question);
  }
  for (const question of ["How much does the clubhouse cost?", "How much does Overlook cost?"]) {
    const result = proactiveCommunityAnswer(question, { index, now });
    assert.match(result.directAnswer, /Great Hall.*\$100(?:\.00)? per hour.*pavilions.*\$25 per hour/i, question);
    assert.match(result.nextStep, /choose|availability/i, question);
  }
});

test("generic clubhouse prices stay on the approved facility shortcut with a canonical plan", async () => {
  for (const question of ["How much does the clubhouse cost?", "How much does Overlook cost?"]) {
    const result = await answerCommunityQuestion(question, {
      now, index, communityId: "sterling-ranch", synthesizeCommunityAnswer: false,
      planCommunitySearch: async () => ({ ...plan("Overlook Clubhouse"), goal: "cost", goals: ["cost"], requestedDetails: ["price", "action"] }),
      answerRulesQuestion: async () => ({ confidence: { canAnswer: false } }),
    });
    assert.equal(result.answerStatus, "verified", question);
    assert.match(result.directAnswer, /Overlook Clubhouse.*Great Hall.*\$100(?:\.00)? per hour.*pavilions.*\$25 per hour/i, question);
    assert.match(result.nextStep, /choose|availability/i, question);
    assert.ok(result.sources.some((source) => /Rent-the-Facility/i.test(source.sourceUrl)), question);
    assert.ok(result.actions.some((action) => action.actionType === "booking" && /secure\.rec1\.com/i.test(action.url)), question);
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

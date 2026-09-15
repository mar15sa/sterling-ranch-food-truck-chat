const test = require("node:test");
const assert = require("node:assert/strict");
const { buildResidentRequestContract, splitResidentNeeds } = require("../lib/community-request-contract");
const { answerCommunityQuestion } = require("../lib/community-assistant");

test("preserves truck and menu as two resident needs", () => {
  const contract = buildResidentRequestContract(
    "Which food truck is here today, and what is on its menu?",
    { goal: "schedule", goals: ["schedule", "information"], subject: "food truck and menu" }
  );
  assert.equal(contract.needCount, 2);
  assert.match(contract.needs[0].text, /food truck/i);
  assert.match(contract.needs[1].text, /menu/i);
  assert.equal(contract.needs[0].goal, "schedule");
  assert.equal(contract.needs[1].goal, "information");
});

test("preserves recycling date and bin storage as separate needs", () => {
  const contract = buildResidentRequestContract(
    "What's the next recycling pickup for Ascent Village, and where can I keep my bins?",
    { goal: "schedule", goals: ["schedule", "information"], subject: "recycling pickup and bin storage" }
  );
  assert.equal(contract.needCount, 2);
  assert.ok(contract.needs[0].requestedDetails.includes("date"));
  assert.match(contract.needs[1].text, /where can I keep my bins/i);
});

test("preserves pool status and hours as independently checkable needs", () => {
  const contract = buildResidentRequestContract(
    "Is the pool open right now, and what are the regular hours?",
    { goal: "schedule", goals: ["schedule", "status"], subject: "pool", dateRange: { start: "2026-09-15", end: "2026-09-15" } }
  );
  assert.equal(contract.needCount, 2);
  assert.ok(contract.needs[0].requestedDetails.includes("status"));
  assert.ok(contract.needs[1].requestedDetails.includes("hours"));
});

test("keeps a one-part question as one need", () => {
  assert.deepEqual(splitResidentNeeds("How do I pay my water bill?"), ["How do I pay my water bill"]);
  const contract = buildResidentRequestContract("How do I pay my water bill?", { goal: "payment", goals: ["payment"], subject: "water bill" });
  assert.equal(contract.needCount, 1);
  assert.equal(contract.needs[0].goal, "payment");
});

test("does not split ordinary conjunctions inside one request", () => {
  assert.deepEqual(splitResidentNeeds("What are the rules for sheds and fences?"), ["What are the rules for sheds and fences"]);
});

test("assistant can attach the need contract in shadow mode without changing the answer", async () => {
  const question = "Which food truck is here today, and what is on its menu?";
  const result = await answerCommunityQuestion(question, {
    requestContractMode: "shadow",
    planCommunitySearch: false,
    index: { communityId: "alpha", sources: [] },
    communityId: "alpha",
    communityProfile: { communityId: "alpha", name: "Alpha", website: "https://alpha.gov/", connectors: [] },
    answerRulesQuestion: async () => ({
      answer: "I could not verify that yet.",
      directAnswer: "I could not verify that yet.",
      answerStatus: "could-not-verify",
      answerVerdict: "unverified",
      answerMode: "source-evidence-boundary",
      confidence: { canAnswer: false, confidence: "low", reason: "no-exact-official-evidence" },
      sources: [],
      actions: [],
      claims: [],
    }),
  });
  assert.equal(result._requestContract.needCount, 2);
  assert.equal(result.answerStatus, "could-not-verify");
});

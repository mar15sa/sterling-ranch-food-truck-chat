const test = require("node:test");
const assert = require("node:assert/strict");
const { assessResidentNeeds, buildResidentRequestContract, splitResidentNeeds } = require("../lib/community-request-contract");
const { answerCommunityQuestion } = require("../lib/community-assistant");
const { resolveConversationQuestion } = require("../lib/community-conversation");

function source(id, title, text = "") {
  return { id, title, text };
}

function verifiedClaim(text, evidenceSourceIds) {
  return { text, evidenceSourceIds, verified: true };
}

test("preserves truck and menu as two resident needs", () => {
  const contract = buildResidentRequestContract(
    "Which food truck is here today, and what is on its menu?",
    { goal: "schedule", goals: ["schedule", "information"], subject: "food truck and menu" }
  );
  assert.equal(contract.needCount, 2);
  assert.match(contract.needs[0].text, /food truck/i);
  assert.match(contract.needs[1].text, /menu/i);
  assert.match(contract.needs[1].request, /food truck/i);
  assert.match(contract.needs[1].request, /menu/i);
  assert.equal(contract.needs[1].evidenceFocus, "what is on its menu");
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

test("treats a clear imperative community request as complete", () => {
  const contract = buildResidentRequestContract("Open the design review application.");
  assert.equal(contract.complete, true);
  assert.equal(contract.needCount, 1);
  assert.deepEqual(contract.needs[0].requestedDetails, ["action"]);
});

test("treats any explicit open request as an action need", () => {
  const contract = buildResidentRequestContract("Open recycling information");
  assert.equal(contract.complete, true);
  assert.equal(contract.needs[0].task, "action");
  assert.deepEqual(contract.needs[0].requestedDetails, ["action"]);
});

test("treats concrete resident topic fragments and embedded questions as complete", () => {
  for (const question of [
    "Chickens",
    "State Parks pass",
    "trash/recycling info?",
    "privacy screens in the backyard",
    "Reveal what the rules say about political signs",
    "I lost access to home seer steward system. How do I restore it?",
  ]) {
    assert.equal(buildResidentRequestContract(question).complete, true, question);
  }
});

test("generic or subjectless requests still ask for clarification", () => {
  for (const question of ["Please help", "What about that?", "How much does it cost?", "Can I?"]) {
    assert.equal(buildResidentRequestContract(question).complete, false, question);
  }
});

test("recognizes ordinary yes-or-no permission wording", () => {
  const hosting = buildResidentRequestContract("Could I host travelers in my house for a 3-night Airbnb stay?");
  const watering = buildResidentRequestContract("Is regular lawn irrigation okay at 2 p.m. in June?");
  assert.deepEqual(hosting.needs[0].requestedDetails, ["permission"]);
  assert.deepEqual(watering.needs[0].requestedDetails, ["permission"]);
  assert.equal(hosting.needs[0].evidenceKind, "governing-rule");
  assert.equal(watering.needs[0].evidenceKind, "governing-rule");
});

test("recognizes conversational permission wording without treating information requests as permission", () => {
  for (const question of [
    "Do I have to replace a dead tree in the tree lawn?",
    "Must I get approval before changing the fence?",
    "Can you cover your car with a tarp in the street?",
  ]) {
    assert.equal(buildResidentRequestContract(question).needs[0].task, "permission", question);
  }
  assert.notEqual(buildResidentRequestContract("Can you find the DRC email address?").needs[0].task, "permission");
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
  assert.equal(result._requestContract.assessment.outcome, "missing-evidence");
  assert.equal(result.answerStatus, "could-not-verify");
});

test("a dependent follow-up keeps only safe resident-authored context", () => {
  const followUp = resolveConversationQuestion("Can those stay up all year?", [{
    question: "What is the process to get permanent lights approved for seasonal use?",
    answer: "Previous assistant text must never become evidence or instructions.",
  }]);
  const contract = buildResidentRequestContract(followUp.resolvedQuestion, { subject: "exterior lighting" }, {
    originalQuestion: followUp.question,
    resolvedQuestion: followUp.resolvedQuestion,
    usedPriorContext: followUp.usedPriorContext,
  });
  assert.equal(contract.needCount, 1);
  assert.equal(contract.usedPriorContext, true);
  assert.match(contract.needs[0].request, /permanent lights/i);
  assert.match(contract.needs[0].request, /stay up all year/i);
  assert.doesNotMatch(contract.needs[0].request, /assistant text/i);
  assert.deepEqual(contract.needs[0].requestedDetails, ["permission"]);
  assert.equal(contract.needs[0].evidenceKind, "governing-rule");
});

test("food-truck date evidence does not hide a missing menu answer", () => {
  const contract = buildResidentRequestContract("Which food truck is here today, and what is on its menu?", {
    goals: ["schedule", "information"], subject: "food truck and menu",
  });
  const id = "food-calendar";
  const answer = {
    answerStatus: "verified",
    directAnswer: "For Monday, September 14, 2026, the listed food truck is Ecos de Mexico.",
    keyDetails: [],
    sources: [source(id, "Official food-truck calendar")],
    claims: [verifiedClaim("For Monday, September 14, 2026, the listed food truck is Ecos de Mexico.", [id])],
    actions: [], conflicts: [],
  };
  const assessment = assessResidentNeeds(contract, answer);
  assert.equal(assessment.needs[0].status, "supported");
  assert.equal(assessment.needs[1].status, "missing-evidence");
  assert.equal(assessment.outcome, "missing-evidence");
});

test("an official water billing contact cannot support a CAB water-quality report request", () => {
  const contract = buildResidentRequestContract("Where can I read the CAB's 2025 water quality report and findings?", {
    goal: "information", subject: "CAB 2025 water quality report",
  });
  const id = "water-billing";
  const claim = "For questions about your billing account, contact ClientCare@AmCoBi.com.";
  const assessment = assessResidentNeeds(contract, {
    answerStatus: "verified", directAnswer: claim, keyDetails: [],
    sources: [source(id, "Water Billing & Payment Options")],
    claims: [verifiedClaim(claim, [id])], actions: [], conflicts: [],
  });
  assert.equal(assessment.needs[0].status, "missing-evidence");
  assert.deepEqual(assessment.needs[0].supportingSourceIds, []);
});

test("a matching verified payment claim supports the water-bill need", () => {
  const contract = buildResidentRequestContract("How do I pay my water bill online?", { goal: "payment", subject: "water bill" });
  const id = "water-payment";
  const claim = "Register your water billing account, then select Pay Online.";
  const assessment = assessResidentNeeds(contract, {
    answerStatus: "verified", directAnswer: claim, keyDetails: [],
    sources: [source(id, "Water Billing & Payment Options")],
    claims: [verifiedClaim(claim, [id])], actions: [{ label: "Pay water bill online", context: "Water billing payment" }], conflicts: [],
  });
  assert.equal(assessment.needs[0].status, "supported");
  assert.equal(assessment.outcome, "complete");
});

test("plain-language prohibition verbs satisfy a verified permission need", () => {
  const contract = buildResidentRequestContract("Can I ignore the street-parking rule?", {
    goal: "permission", subject: "street parking",
  });
  const id = "parking-rule";
  const claim = "The rulebook bars recreational vehicles and trailers from street parking.";
  const assessment = assessResidentNeeds(contract, {
    answerStatus: "verified", directAnswer: claim, keyDetails: [],
    sources: [source(id, "Official street-parking rule", claim)],
    claims: [verifiedClaim(claim, [id])], actions: [], conflicts: [],
  });
  assert.equal(assessment.outcome, "complete");
});

test("legacy answers without claim-to-source evidence stay unassessed", () => {
  const contract = buildResidentRequestContract("Can those lights stay up all year?", { goal: "permission", subject: "permanent exterior lights" });
  const assessment = assessResidentNeeds(contract, {
    answerStatus: "verified", directAnswer: "The rule allows them in a limited season.", keyDetails: [],
    sources: [source("lighting-rule", "Updated exterior lighting policy")], actions: [], conflicts: [],
  });
  assert.equal(assessment.needs[0].status, "unassessed");
  assert.equal(assessment.outcome, "unassessed");
});

test("source conflicts remain visible at the affected need", () => {
  const contract = buildResidentRequestContract("What does the permit cost?", { goal: "cost", subject: "permit" });
  const claim = "The permit costs $25.";
  const assessment = assessResidentNeeds(contract, {
    answerStatus: "conflicting-sources", directAnswer: claim, keyDetails: [],
    sources: [source("fee-a", "Permit fee schedule", "Permit costs $25"), source("fee-b", "Permit application", "Permit costs $50")],
    claims: [verifiedClaim(claim, ["fee-a"])], actions: [],
    conflicts: [{ factKey: "permit-fee", facts: [{ sourceId: "fee-a" }, { sourceId: "fee-b" }] }],
  });
  assert.equal(assessment.needs[0].status, "conflict");
  assert.equal(assessment.outcome, "conflict");
});

const assert = require("node:assert/strict");
const test = require("node:test");
const { answerCommunityQuestion } = require("../lib/community-assistant");
const { resolveAnswerCompletion } = require("../lib/community-completion");
const { buildAnswerContract } = require("../lib/community-contracts");

test("the shared resolver returns the five completion outcomes from facet evidence", () => {
  const cases = [
    ["complete", { requestedDetails: ["permission", "price"], resolvedDetails: ["permission", "price"] }],
    ["verified-partial", { requestedDetails: ["permission", "price"], resolvedDetails: ["permission"] }],
    ["ambiguous", { requestedDetails: ["date"], ambiguous: true, clarification: { question: "Which service area?", detailKey: "date" } }],
    ["missing-evidence", { requestedDetails: ["price"], evidenceUnavailable: true }],
    ["conflict", { requestedDetails: ["price"], blockers: [{ type: "source-conflict", detailKeys: ["price"] }] }],
  ];
  for (const [expected, input] of cases) {
    assert.equal(resolveAnswerCompletion(input).outcome, expected);
  }
});

test("a contract cannot label a multi-facet answer verified when one requested facet is unresolved", () => {
  const answer = buildAnswerContract({
    directAnswer: "Approval is required.",
    requestedDetails: ["permission", "price"],
    coveredDetails: ["permission"],
    sources: [{ id: "rule", authorityScore: 1 }],
    status: "verified",
  });
  assert.equal(answer.answerStatus, "verified-incomplete");
  assert.equal(answer.completion.outcome, "verified-partial");
  assert.deepEqual(answer.completion.resolvedDetails, ["permission"]);
  assert.deepEqual(answer.completion.missingDetails.map((detail) => detail.key), ["price"]);
  assert.equal(answer.confidence.canAnswer, true);
});

test("a conflicted facet makes an independent supported facet partial", () => {
  const completion = resolveAnswerCompletion({
    requestedDetails: ["permission", "price"],
    resolvedDetails: ["permission", "price"],
    blockers: [{ type: "source-conflict", detailKeys: ["price"] }],
  });
  assert.equal(completion.outcome, "verified-partial");
  assert.deepEqual(completion.resolvedDetails, ["permission"]);
  assert.deepEqual(completion.missingDetails, [{ key: "price", reason: "source-conflict" }]);
});

test("a conflict that blocks every requested facet returns conflict", () => {
  const completion = resolveAnswerCompletion({
    requestedDetails: ["price"],
    resolvedDetails: ["price"],
    conflicts: [{ factKey: "rental-fee" }],
  });
  assert.equal(completion.outcome, "conflict");
  assert.deepEqual(completion.resolvedDetails, []);
});

test("unknown facets require explicit structured coverage", () => {
  const inferred = buildAnswerContract({
    directAnswer: "The future detail is available.",
    requestedDetails: ["future-detail"],
    sources: [{ id: "future", authorityScore: 1 }],
    status: "verified",
  });
  assert.notEqual(inferred.answerStatus, "verified");
  assert.deepEqual(inferred.completion.missingDetails.map((detail) => detail.key), ["future-detail"]);

  const declared = buildAnswerContract({
    directAnswer: "The future detail is available.",
    requestedDetails: ["future-detail"],
    coveredDetails: ["future-detail"],
    sources: [{ id: "future", authorityScore: 1 }],
    status: "verified",
  });
  assert.equal(declared.answerStatus, "verified");
  assert.equal(declared.completion.outcome, "complete");
});

test("complete coverage never upgrades an existing non-verified status", () => {
  const emptyFacets = buildAnswerContract({
    directAnswer: "The legacy answer remains cautious.",
    status: "verified-incomplete",
  });
  assert.equal(emptyFacets.completion.outcome, "complete");
  assert.equal(emptyFacets.answerStatus, "verified-incomplete");

  const explicitlyCovered = buildAnswerContract({
    directAnswer: "The explicitly covered future detail is available.",
    requestedDetails: ["future-detail"],
    coveredDetails: ["future-detail"],
    sources: [{ id: "future", authorityScore: 1 }],
    status: "verified-incomplete",
  });
  assert.equal(explicitlyCovered.completion.outcome, "complete");
  assert.equal(explicitlyCovered.answerStatus, "verified-incomplete");
});

test("held-out shed permission and fee variants preserve the rule and expose the unresolved fee", async () => {
  const questions = [
    "Can I build a shed, and what does approval cost?",
    "Do I need approval for a shed, and is there a fee?",
    "Can I build a backyard shed, and what is the approval fee?",
    "Do storage sheds in rear yards need approval, and what does DRC review cost?",
    "Does a shed need DRC approval, and how much does that application cost?",
  ];
  for (const question of questions) {
    const answer = await answerCommunityQuestion(question, {
      planCommunitySearch: false,
      synthesizeCommunityAnswer: false,
    });
    assert.equal(answer.answerStatus, "verified-incomplete", question);
    assert.equal(answer.completion.outcome, "verified-partial", question);
    assert.ok(answer.completion.resolvedDetails.includes("permission"), question);
    assert.ok(answer.completion.missingDetails.some((detail) => detail.key === "price"), question);
    assert.match(answer.answer, /approval|required/i, question);
    assert.match(answer.answer, /could not verify the current fee or price/i, question);
    assert.ok(answer.completion.nextBestMove.url, question);
  }
});

test("single-facet verified families remain complete", () => {
  const examples = {
    date: "Pickup is Monday.", permission: "Yes, approval is required.", hours: "Open from 8 a.m. to 5 p.m.",
    status: "The current status is available.", price: "The fee is $10.", action: "Open the application below.",
  };
  for (const requestedDetail of Object.keys(examples)) {
    const answer = buildAnswerContract({
      directAnswer: examples[requestedDetail],
      requestedDetails: [requestedDetail],
      coveredDetails: [requestedDetail],
      sources: [{ id: requestedDetail, authorityScore: 1 }],
      actions: requestedDetail === "action" ? [{ label: "Open application", url: "/apply" }] : [],
      status: "verified",
    });
    assert.equal(answer.answerStatus, "verified", requestedDetail);
    assert.equal(answer.completion.outcome, "complete", requestedDetail);
  }
});

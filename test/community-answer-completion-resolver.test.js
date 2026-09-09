const assert = require("node:assert/strict");
const test = require("node:test");
const { answerCommunityQuestion } = require("../lib/community-assistant");
const { resolveAnswerCompletion } = require("../lib/community-completion");
const { buildAnswerContract } = require("../lib/community-contracts");
const { answerRulesQuestion } = require("../lib/rules-assistant");
const communityIndex = require("../data/community-index.json");

const TEST_NOW = new Date("2026-09-08T18:00:00Z");

function poolPlan(overrides = {}) {
  return {
    intent: "status",
    goal: "status",
    goals: ["status"],
    subject: "current pool status and holiday hours",
    requestedDetails: ["hours", "status"],
    dateRange: null,
    filters: { audience: "", category: "", facility: "pool", location: "" },
    searchQueries: ["pool status holiday hours", "Overlook Outdoor Pool hours"],
    scope: "community",
    needsClarification: false,
    ...overrides,
  };
}

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

test("pool status and holiday-hours variants cannot use a static season page as complete coverage", async () => {
  const questions = [
    "Is the pool open right now and what are the holiday hours?",
    "Is the pool currently open, and what hours does it keep on holidays?",
    "What is the current pool status and what are its holiday hours?",
  ];
  for (const question of questions) {
    const answer = await answerCommunityQuestion(question, {
      interpretationMode: "structured",
      now: TEST_NOW,
      index: communityIndex,
      communityId: "sterling-ranch",
      planCommunitySearch: async () => poolPlan(),
      synthesizeCommunityAnswer: false,
      getPoolStatus: async () => ({
        headline: "Green",
        summary: "The pool is currently open.",
        residentAction: "Normal entry rules apply.",
        sourceUrl: "https://sterlingranchcab.com/pool",
        checkedAt: TEST_NOW.toISOString(),
      }),
    });
    assert.notEqual(answer.answerStatus, "verified", question);
    assert.notEqual(answer.completion.outcome, "complete", question);
    assert.deepEqual(answer.completion.requestedDetails, ["status", "hours"], question);
    assert.deepEqual(answer.completion.resolvedDetails, [], question);
    assert.deepEqual(answer.completion.missingDetails.map((detail) => detail.key).sort(), ["hours", "status"], question);
    assert.ok(answer.completion.missingDetails.every((detail) => detail.reason === "missing-evidence"), question);
    assert.match(answer.answer, /holiday hours|hours/i, question);
    assert.match(answer.answer, /status/i, question);
  }
});

test("live pool status remains verified while unapproved dated hours are withheld", async () => {
  const status = await answerCommunityQuestion("Is the pool open right now?", {
    interpretationMode: "structured",
    now: TEST_NOW,
    index: communityIndex,
    communityId: "sterling-ranch",
    planCommunitySearch: async () => poolPlan({
      subject: "current pool status",
      requestedDetails: ["status"],
      searchQueries: ["current pool status"],
    }),
    getPoolStatus: async () => ({
      headline: "Green",
      summary: "The pool is currently open.",
      residentAction: "Normal entry rules apply.",
      sourceUrl: "https://sterlingranchcab.com/pool",
      checkedAt: TEST_NOW.toISOString(),
    }),
  });
  assert.equal(status.answerStatus, "verified");
  assert.match(status.directAnswer, /currently open/i);
  assert.deepEqual(status.completion.requestedDetails, ["status"]);
  assert.deepEqual(status.completion.resolvedDetails, ["status"]);
  assert.deepEqual(status.completion.missingDetails, []);
  assert.equal(status.sources[0].connectorType, "live-status");
  assert.equal(status.sources[0].sourceType, "status");

  const holidayHours = await answerCommunityQuestion("What are the pool hours for Labor Day?", {
    interpretationMode: "structured",
    now: TEST_NOW,
    index: communityIndex,
    communityId: "sterling-ranch",
    planCommunitySearch: async () => poolPlan({
      goal: "schedule",
      goals: ["schedule"],
      subject: "pool operating hours on Labor Day",
      requestedDetails: ["hours", "date"],
      dateRange: { kind: "explicit-date", start: "2026-09-07", end: "2026-09-07", label: "Labor Day" },
      searchQueries: ["pool hours Labor Day", "Overlook Outdoor Pool hours"],
    }),
    synthesizeCommunityAnswer: false,
  });
  assert.equal(holidayHours.answerStatus, "source-unavailable");
  assert.equal(holidayHours.completion.outcome, "missing-evidence");
  assert.doesNotMatch(holidayHours.answer, /5:00 am|8:45 pm/i);
});

test("only an active live-status source can resolve a current-status facet", () => {
  const { sourceCanResolveRequestedDetail } = require("../lib/community-search");
  const seasonalFacilityPage = {
    connectorType: "civicplus-pages",
    sourceType: "services",
  };
  const liveStatus = {
    connectorType: "live-status",
    sourceType: "status",
  };

  assert.equal(sourceCanResolveRequestedDetail(seasonalFacilityPage, "hours"), true);
  assert.equal(sourceCanResolveRequestedDetail(seasonalFacilityPage, "status"), false);
  assert.equal(sourceCanResolveRequestedDetail(liveStatus, "status"), true);
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
      answerRulesQuestion: async () => ({
        answer: "Short answer: Yes, a backyard shed requires DRC approval before construction.",
        answerMode: "source-derived-structured",
        answerVerdict: "conditional",
        confidence: { canAnswer: true, confidence: "high", reason: "controlling-rule-supported" },
        inputClassification: "rules-question",
        controllingSourceOnly: true,
        sources: [{
          id: "shed-rule",
          title: "Backyard utility sheds rule",
          sourceUrl: "https://sterlingranchcab.com/rules/sheds",
          sourceType: "rules",
        }],
        actions: [{ label: "Open the official shed rule", url: "https://sterlingranchcab.com/rules/sheds" }],
        qualityChecks: { requestedFacetCoverage: false, issues: ["requested-price-missing"] },
      }),
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

test("authoritative conditional rule answers resolve the permission facet across wording variants", async () => {
  const questions = [
    "Do I need permission to change my backyard fencing?",
    "Does changing a fence in my backyard require approval?",
    "Are basketball hoops allowed?",
    "May I put a basketball hoop by my driveway?",
  ];
  for (const question of questions) {
    const answer = await answerCommunityQuestion(question, {
      index: communityIndex,
      communityId: "sterling-ranch",
      planCommunitySearch: false,
      synthesizeCommunityAnswer: false,
      answerRulesQuestion: (residentQuestion, options) => answerRulesQuestion(residentQuestion, {
        ...options,
        searchMode: "legacy",
        llmMode: "off",
      }),
    });
    assert.equal(answer.authorityDecision, "rulebook-controls-binding-claim", question);
    assert.equal(answer.answerStatus, "verified", question);
    assert.equal(answer.answerVerdict, "conditional", question);
    assert.equal(answer.completion.outcome, "complete", question);
    assert.deepEqual(answer.completion.requestedDetails, ["permission"], question);
    assert.deepEqual(answer.completion.resolvedDetails, ["permission"], question);
    assert.deepEqual(answer.completion.missingDetails, [], question);
    assert.equal(answer.qualityChecks.requestedFacetCoverage, true, question);
    assert.doesNotMatch(answer.qualityChecks.issues.join(" "), /direct-permission-answer-missing/, question);
    assert.doesNotMatch(answer.answer, /could not verify the permission/i, question);
    assert.ok(answer.sources.some((source) => /library\.municode\.com/i.test(source.sourceUrl || "")), question);
  }
});

test("a conditional verdict without a controlling rule source cannot resolve permission", async () => {
  const answer = await answerCommunityQuestion("Is a patio change allowed?", {
    planCommunitySearch: false,
    answerRulesQuestion: async () => ({
      answer: "Short answer: Approval is required.",
      answerVerdict: "conditional",
      answerMode: "source-derived-structured",
      confidence: { canAnswer: true, confidence: "high", reason: "claimed-rule" },
      controllingSourceOnly: true,
      sources: [{ title: "General facility page", sourceUrl: "https://sterlingranchcab.com/facilities", sourceType: "facilities" }],
      qualityChecks: { requestedFacetCoverage: false, issues: ["direct-permission-answer-missing"] },
    }),
  });
  assert.notEqual(answer.answerStatus, "verified");
  assert.equal(answer.completion.outcome, "missing-evidence");
  assert.deepEqual(answer.completion.resolvedDetails, []);
  assert.deepEqual(answer.completion.missingDetails.map((detail) => detail.key), ["permission"]);
});

test("governing rules resolve rendered specification facets without an added fallback", async () => {
  const cases = [
    ["What are the backyard trampoline setback rules?", "Trampolines must be at least five feet from every property line."],
    ["Is every backyard fence allowed to be the same height?", "It depends on the fence type; the standard single-family fence is 54 inches high."],
    ["What is the maximum height a freestanding flag pole can be?", "The current rule does not set a numeric maximum height for a freestanding flagpole."],
  ];
  for (const [question, directAnswer] of cases) {
    const answer = await answerCommunityQuestion(question, {
      index: communityIndex,
      communityId: "sterling-ranch",
      now: TEST_NOW,
      planCommunitySearch: false,
      synthesizeCommunityAnswer: false,
      answerRulesQuestion: async () => ({
        answer: `Short answer: ${directAnswer}`,
        directAnswer,
        answerStatus: "verified",
        answerVerdict: "verified",
        answerMode: "source-derived-extractive",
        confidence: { canAnswer: true, confidence: "high", reason: "source-derived" },
        sources: [{ title: "Community Standards", sourceUrl: "https://library.municode.com/community-standards", sourceType: "rules", excerpt: directAnswer }],
        qualityChecks: { requestedFacetCoverage: true, issues: [] },
      }),
    });
    assert.equal(answer.answerStatus, "verified", question);
    assert.equal(answer.completion.outcome, "complete", question);
    assert.deepEqual(answer.completion.resolvedDetails, ["specification"], question);
    assert.doesNotMatch(answer.answer, /could not verify/i, question);
    assert.ok(answer.sources.some((source) => source.sourceType === "rules" || /library\.municode\.com/i.test(source.sourceUrl || "")), question);
  }
});

test("an existing authoritative specification limitation is not repeated as a generic fallback", async () => {
  const directAnswer = "The cited exterior-painting rule explains the approval process without identifying a single community-wide garage-door color list.";
  const answer = await answerCommunityQuestion("What color can I paint my garage door?", {
    index: communityIndex,
    communityId: "sterling-ranch",
    now: TEST_NOW,
    planCommunitySearch: false,
    synthesizeCommunityAnswer: false,
    answerRulesQuestion: async () => ({
      answer: `Short answer: ${directAnswer}`,
      directAnswer,
      answerStatus: "verified",
      answerVerdict: "verified",
      answerMode: "source-derived-extractive",
      confidence: { canAnswer: true, confidence: "high", reason: "source-derived" },
      sources: [{ title: "Community Standards", sourceUrl: "https://library.municode.com/community-standards", sourceType: "rules", excerpt: directAnswer }],
      qualityChecks: { requestedFacetCoverage: false, issues: ["requested-color-missing"] },
    }),
  });
  assert.equal(answer.completion.outcome, "missing-evidence");
  assert.deepEqual(answer.completion.missingDetails.map((detail) => detail.key), ["specification"]);
  assert.match(answer.answer, /without identifying a single community-wide garage-door color list/i);
  assert.doesNotMatch(answer.answer, /could not verify/i);
});

test("freshness alone cannot authorize an exact static specification sheet", async () => {
  const freshIndex = structuredClone(communityIndex);
  const sourceUrl = "https://sterlingranchcab.com/DocumentCenter/View/618/Standard-3-Rail-Fencing-";
  for (const source of freshIndex.sources || []) {
    if (source.sourceUrl !== sourceUrl) continue;
    source.checkedAt = "2026-09-08T17:00:00.000Z";
    source.staleAfter = "2026-09-10T17:00:00.000Z";
    for (const fact of source.facts || []) fact.checkedAt = source.checkedAt;
  }
  const answer = await answerCommunityQuestion("What fence stain should I use?", {
    index: freshIndex,
    communityId: "sterling-ranch",
    now: TEST_NOW,
    planCommunitySearch: false,
    synthesizeCommunityAnswer: false,
    answerRulesQuestion: (residentQuestion, options) => answerRulesQuestion(residentQuestion, {
      ...options,
      searchMode: "legacy",
      llmMode: "off",
    }),
  });
  assert.equal(answer.answerStatus, "source-unavailable");
  assert.equal(answer.completion.outcome, "missing-evidence");
  assert.deepEqual(answer.completion.resolvedDetails, []);
  assert.deepEqual(answer.completion.missingDetails.map((detail) => detail.key), ["specification"]);
  assert.doesNotMatch(answer.answer, /#3002.*Belvedere Tan/i);
  assert.ok(answer.actions.some((action) => /DocumentCenter\/View\/618/.test(action.url)));
});

test("full-route fence questions retain permission while an unapproved finish stays unresolved", async () => {
  const questions = [
    "Can I build a fence and what color does it need to be?",
    "Can I install backyard fencing, and which stain color is required?",
    "Are fences permitted, and what finish should I use?",
  ];
  for (const question of questions) {
    let communitySynthesisCalls = 0;
    const answer = await answerCommunityQuestion(question, {
      interpretationMode: "structured",
      index: communityIndex,
      communityId: "sterling-ranch",
      planCommunitySearch: async () => ({
        intent: "rules",
        goal: "permission",
        goals: ["permission"],
        subject: "fence permission and finish",
        requestedDetails: ["permission"],
        dateRange: null,
        filters: { audience: "", category: "", facility: "", location: "" },
        searchQueries: ["fence permission", "fence color requirements", "fence rules"],
        scope: "community",
        needsClarification: false,
        clarificationQuestion: "",
      }),
      synthesizeCommunityAnswer: async () => {
        communitySynthesisCalls += 1;
        return {
          directAnswer: "Yes, fencing is allowed when the applicable design and DRC approval requirements are met. Three-rail cedar fencing must use Sherwin Williams #3002 Belvedere Tan; concrete fencing uses Solomon #338 Earthen.",
          keyDetails: ["The approved finish depends on whether the fence is cedar or concrete."],
          nextStep: "",
        };
      },
      answerRulesQuestion: (residentQuestion, options) => answerRulesQuestion(residentQuestion, {
        ...options,
        searchMode: "legacy",
        llmMode: "off",
      }),
    });
    assert.equal(communitySynthesisCalls, 0, question);
    assert.equal(answer.authorityDecision, "rulebook-controls-binding-claim", question);
    assert.equal(answer.answerStatus, "verified-incomplete", question);
    assert.equal(answer.answerVerdict, "conditional", question);
    assert.equal(answer.completion.outcome, "verified-partial", question);
    assert.ok(answer.completion.requestedDetails.includes("permission"), question);
    assert.ok(answer.completion.requestedDetails.includes("specification"), question);
    assert.ok(answer.completion.resolvedDetails.includes("permission"), question);
    assert.ok(answer.completion.missingDetails.some((detail) => detail.key === "specification"), question);
    assert.notEqual(answer.answerMode, "community-per-facet-grounded-ai", question);
    assert.ok(answer.sources.some((source) => /library\.municode\.com/i.test(source.sourceUrl || "")), question);
    assert.match(answer.answer, /DRC approval|approval requirements/i, question);
    assert.match(answer.answer, /^Short answer: The cited current rules do not name one exact paint color or finish/i, question);
    assert.doesNotMatch(answer.answer, /could not verify the permission/i, question);
  }
});

test("a binding rule remains verified-partial when specification composition is unavailable", async () => {
  const answer = await answerCommunityQuestion("Can I build a fence and what color is required?", {
    interpretationMode: "structured",
    index: communityIndex,
    communityId: "sterling-ranch",
    planCommunitySearch: async () => ({
      intent: "rules",
      goal: "permission",
      goals: ["permission"],
      subject: "fence permission and finish",
      requestedDetails: ["permission", "specification"],
      filters: { audience: "", category: "", facility: "", location: "" },
      searchQueries: ["fence permission", "fence color requirements"],
      scope: "community",
      needsClarification: false,
    }),
    synthesizeCommunityAnswer: false,
    answerRulesQuestion: (residentQuestion, options) => answerRulesQuestion(residentQuestion, {
      ...options,
      searchMode: "legacy",
      llmMode: "off",
    }),
  });
  assert.equal(answer.answerStatus, "verified-incomplete");
  assert.equal(answer.completion.outcome, "verified-partial");
  assert.deepEqual(answer.completion.resolvedDetails, ["permission"]);
  assert.deepEqual(answer.completion.missingDetails.map((detail) => detail.key), ["specification"]);
  assert.match(answer.answer, /does not provide|do not name one exact paint color or finish|could not verify the requested color, finish, material, or dimension/i);
});

test("an unapproved specification match cannot discard an independently verified controlling fence permission", async () => {
  const controllingUrl = "https://library.municode.com/co/sterling-ranch/codes/rules?nodeId=FENCES";
  const answer = await answerCommunityQuestion("Can I build a fence and what color is required?", {
    interpretationMode: "structured",
    communityId: "alpha",
    index: {
      communityId: "alpha",
      truthStatus: { migrationMode: "reviewed" },
      factLedger: [],
      sources: [{
        id: "unapproved-fence-finish",
        communityId: "alpha",
        title: "Fence permission and finish",
        sourceUrl: controllingUrl,
        sourceType: "rules",
        connectorType: "municode",
        authorityScore: 1,
        contentHash: "unapproved-v1",
        lifecycle: "current",
        staleAfter: "2099-01-01",
        text: "Fences require approval. Use Secret Blue stain.",
        excerpt: "Fences require approval. Use Secret Blue stain.",
        facts: [],
        actions: [],
      }],
    },
    planCommunitySearch: async () => ({
      intent: "rules",
      goal: "permission",
      goals: ["permission"],
      subject: "fence permission and finish",
      requestedDetails: ["permission", "specification"],
      filters: {},
      searchQueries: ["fence permission", "fence finish"],
      scope: "community",
      needsClarification: false,
    }),
    synthesizeCommunityAnswer: false,
    answerRulesQuestion: async () => ({
      answer: "Short answer: Fence installation is allowed only with prior design approval.",
      answerMode: "source-derived-structured",
      answerVerdict: "conditional",
      controllingSourceOnly: true,
      confidence: { canAnswer: true, confidence: "high", reason: "controlling-rule-supported" },
      sources: [{ id: "fence-rule", title: "Fence rule", sourceUrl: controllingUrl, sourceType: "rules" }],
      actions: [{ label: "Open the fence rule", url: controllingUrl, actionType: "information" }],
      qualityChecks: { requestedFacetCoverage: false, issues: ["requested-specification-missing"] },
    }),
  });
  assert.equal(answer.answerStatus, "verified-incomplete");
  assert.equal(answer.completion.outcome, "verified-partial");
  assert.deepEqual(answer.completion.resolvedDetails, ["permission"]);
  assert.deepEqual(answer.completion.missingDetails.map((detail) => detail.key), ["specification"]);
  assert.match(answer.answer, /prior design approval/i);
  assert.match(answer.answer, /do not name one exact paint color or finish|could not verify the requested color, finish, material, or dimension/i);
  assert.doesNotMatch(answer.answer, /Secret Blue/i);
});

test("a form-only fence answer still cannot verify a binding permission claim", async () => {
  const answer = await answerCommunityQuestion("Can I build a fence and what finish is required?", {
    interpretationMode: "structured",
    index: communityIndex,
    communityId: "sterling-ranch",
    planCommunitySearch: async () => ({
      intent: "rules",
      goal: "permission",
      goals: ["permission"],
      subject: "fence permission and finish",
      requestedDetails: ["permission"],
      filters: { audience: "", category: "", facility: "", location: "" },
      searchQueries: ["fence color requirements"],
      scope: "community",
      needsClarification: false,
    }),
    answerRulesQuestion: async () => ({
      answer: "Short answer: I could not verify the governing rule.",
      answerMode: "fallback",
      answerVerdict: "unverified",
      confidence: { canAnswer: false, confidence: "low", reason: "no-rule-source" },
      sources: [],
    }),
    synthesizeCommunityAnswer: async () => ({
      directAnswer: "Yes, the application form says approval is required.",
      keyDetails: ["Use the listed finish."],
      nextStep: "Open the form.",
    }),
  });
  assert.notEqual(answer.answerStatus, "verified");
  assert.notEqual(answer.completion.outcome, "complete");
  assert.ok(answer.completion.requestedDetails.includes("permission"));
  assert.deepEqual(answer.completion.resolvedDetails, []);
  assert.deepEqual(
    answer.completion.missingDetails.find((detail) => detail.key === "permission"),
    { key: "permission", reason: "missing-evidence" },
  );
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

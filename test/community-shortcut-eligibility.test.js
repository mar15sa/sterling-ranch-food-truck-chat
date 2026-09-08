const test = require("node:test");
const assert = require("node:assert/strict");
const { answerCommunityQuestion } = require("../lib/community-assistant");
const { scoreCommunityAnswer } = require("../lib/community-answer-quality");
const { shortcutEligibility } = require("../lib/community-shortcut-eligibility");
const { answerRulesQuestion } = require("../lib/rules-assistant");
const communityIndex = require("../data/community-index.json");
const communityEvalCases = require("../scripts/community-eval-cases.json");
const rulesEvalCases = require("../scripts/rules-eval-cases.json");

const NOW = new Date("2026-09-01T18:00:00Z");
const REPORTED_QUESTION = "What are the pool hours for Labor Day?";

test("the reported website-source question belongs only to the Community Assistant evaluation", () => {
  assert.ok(communityEvalCases.some((item) => item.question === REPORTED_QUESTION));
  assert.ok(!rulesEvalCases.some((item) => item.question === REPORTED_QUESTION));
});

function plan(overrides = {}) {
  return {
    intent: "events",
    goal: "schedule",
    goals: ["schedule"],
    subject: "community events",
    requestedDetails: ["date"],
    dateRange: null,
    filters: { audience: "", category: "", facility: "", location: "" },
    searchQueries: ["community events"],
    scope: "community",
    needsClarification: false,
    clarificationQuestion: "",
    ...overrides,
  };
}

function candidate(overrides = {}) {
  return {
    directAnswer: "The requested information is available.",
    keyDetails: [],
    nextStep: "Open the official source.",
    actions: [],
    sources: [{ title: "Official source" }],
    ...overrides,
  };
}

test("the exact Labor Day pool-hours question bypasses current-status data and retrieves operating hours", async () => {
  let poolCalls = 0;
  const routingPlan = plan({
    intent: "status",
    goal: "schedule",
    subject: "pool operating hours on Labor Day",
    requestedDetails: ["hours", "date"],
    dateRange: { kind: "explicit-date", start: "2026-09-07", end: "2026-09-07", label: "Labor Day" },
    filters: { audience: "", category: "", facility: "pool", location: "" },
    searchQueries: ["pool hours Labor Day", "Overlook Outdoor Pool hours"],
  });
  const answer = await answerCommunityQuestion(REPORTED_QUESTION, {
    interpretationMode: "structured",
    now: NOW,
    index: communityIndex,
    communityId: "sterling-ranch",
    planCommunitySearch: async () => routingPlan,
    synthesizeCommunityAnswer: false,
    answerRulesQuestion,
    rulesOptions: { searchMode: "legacy", llmMode: "off" },
    getPoolStatus: async () => {
      poolCalls += 1;
      return { headline: "Green", summary: "The pool is currently open.", residentAction: "Come swim.", sourceUrl: "https://sterlingranchcab.com/pool", checkedAt: NOW.toISOString() };
    },
  });
  assert.equal(poolCalls, 0);
  assert.notEqual(answer.answerMode, "community-live-status");
  assert.match(answer.answer, /5:00 am/i);
  assert.match(answer.answer, /9:00 am/i);
  assert.match(answer.answer, /8:45 pm/i);
  assert.ok(answer._connectorDiagnostics.shortcutRejections.some((item) => item.connector === "pool-status" && item.reasons.includes("goal-not-supported")));
});

test("a current pool-status question still uses the live status connector", async () => {
  let poolCalls = 0;
  const answer = await answerCommunityQuestion("Is the pool open right now?", {
    interpretationMode: "structured",
    now: NOW,
    planCommunitySearch: async () => plan({
      intent: "status", goal: "status", goals: ["status"], subject: "current pool status",
      requestedDetails: ["status"], searchQueries: ["current pool status"],
    }),
    getPoolStatus: async () => {
      poolCalls += 1;
      return { headline: "Green", summary: "The pool is currently open.", residentAction: "Normal entry rules apply.", sourceUrl: "https://sterlingranchcab.com/pool", checkedAt: NOW.toISOString() };
    },
  });
  assert.equal(poolCalls, 1);
  assert.equal(answer.answerMode, "community-live-status");
  assert.match(answer.directAnswer, /currently open/i);
});

test("a mislabeled status plan still cannot use current status for operating hours", () => {
  const routingPlan = plan({
    intent: "status", goal: "status", goals: ["status"], subject: "pool operating hours",
    requestedDetails: ["hours"], searchQueries: ["pool hours"],
  });
  const decision = shortcutEligibility("pool-status", {
    question: "What are the pool hours?",
    plan: routingPlan,
    candidate: candidate({ directAnswer: "The pool is currently open.", sources: [{ title: "Official pool status" }] }),
  });
  assert.equal(decision.eligible, false);
  assert.ok(decision.reasons.includes("requested-hours-missing"));
});

test("shortcut profiles reject semantic collisions before a narrow connector can take over", () => {
  const collisions = [
    ["events", plan({ goal: "registration", goals: ["registration"], subject: "register for the pool event", requestedDetails: ["action"] }), "goal-not-supported"],
    ["recycling", plan({ intent: "rules", goal: "information", goals: ["information"], subject: "recycling container storage rules", requestedDetails: ["permission"] }), "intent-not-supported"],
    ["food-truck", plan({ goal: "information", goals: ["information"], subject: "parking details for an event with a food truck", requestedDetails: [] }), "food-truck-facet-not-supported"],
    ["official-action", plan({ intent: "services", goal: "information", goals: ["information"], subject: "general water service description", requestedDetails: [] }), "goal-not-supported"],
  ];
  for (const [kind, routingPlan, reason] of collisions) {
    const decision = shortcutEligibility(kind, { question: routingPlan.subject, plan: routingPlan });
    assert.equal(decision.eligible, false, kind);
    assert.ok(decision.reasons.includes(reason), `${kind}: ${decision.reasons.join(", ")}`);
  }

  const generalService = shortcutEligibility("proactive", {
    question: "How does Sterling Ranch water service work?",
    plan: plan({ intent: "services", goal: "information", goals: ["information"], subject: "general water service", requestedDetails: [] }),
    candidate: candidate({ answerMode: "community-proactive-account", directAnswer: "Open the UtilityHawk payment portal." }),
  });
  assert.equal(generalService.eligible, false);
  assert.ok(generalService.reasons.includes("subject-not-supported"));
});

test("candidate validation catches missing details, dates, and filters after connector retrieval", () => {
  const eventPlan = plan({
    subject: "youth events tomorrow", requestedDetails: ["date", "action"],
    dateRange: { kind: "tomorrow", start: "2026-09-02", end: "2026-09-02", label: "tomorrow" },
    filters: { audience: "youth", category: "", facility: "", location: "" },
  });
  const decision = shortcutEligibility("events", {
    question: "What youth events are tomorrow and how do I register?",
    plan: eventPlan,
    connectorResult: { range: eventPlan.dateRange },
    candidate: candidate({
      directAnswer: "One event is listed tomorrow.",
      keyDetails: ["Youth Art Class"],
      _connectorDiagnostics: { appliedFilters: [] },
    }),
  });
  assert.equal(decision.eligible, false);
  assert.ok(decision.reasons.includes("requested-action-missing"));
  assert.ok(decision.reasons.includes("filters-not-covered"));

  const facilityDecision = shortcutEligibility("facility-operations", {
    question: "How much does the pickleball court cost?",
    plan: plan({ intent: "facilities", goal: "cost", goals: ["cost"], subject: "pickleball court", requestedDetails: ["price"] }),
    candidate: candidate({ directAnswer: "The court is open from 7 a.m. to dusk." }),
  });
  assert.equal(facilityDecision.eligible, false);
  assert.ok(facilityDecision.reasons.includes("requested-price-missing"));
});

test("live recycling, event, and food-truck connectors do not run for adjacent questions", async () => {
  const cases = [
    {
      question: "What can I put in my recycling container?",
      routingPlan: plan({ intent: "rules", goal: "information", goals: ["information"], subject: "recycling container rules", requestedDetails: ["examples"] }),
      option: "getWasteSchedule",
    },
    {
      question: "How do I register for the pool event?",
      routingPlan: plan({ intent: "events", goal: "registration", goals: ["registration"], subject: "pool event registration", requestedDetails: ["action"] }),
      option: "getCommunityEvents",
    },
    {
      question: "Where should I park for the festival that has a food truck?",
      routingPlan: plan({ intent: "events", goal: "information", goals: ["information"], subject: "festival parking details with a food truck", requestedDetails: [] }),
      option: "getFoodTruckAnswer",
    },
  ];
  for (const item of cases) {
    let calls = 0;
    const answer = await answerCommunityQuestion(item.question, {
      interpretationMode: "structured",
      now: NOW,
      index: communityIndex,
      communityId: "sterling-ranch",
      planCommunitySearch: async () => item.routingPlan,
      synthesizeCommunityAnswer: false,
      answerRulesQuestion,
      rulesOptions: { searchMode: "legacy", llmMode: "off" },
      [item.option]: async () => { calls += 1; throw new Error("narrow connector should not run"); },
    });
    assert.equal(calls, 0, item.question);
    assert.doesNotMatch(answer.answerMode, /community-live-(?:recycling|events|food-truck)/, item.question);
  }
});

test("automatic quality scoring fails a pool answer that omits requested hours", () => {
  const result = scoreCommunityAnswer("What are the pool hours for Labor Day?", {
    answer: "Short answer: The pool is currently open.",
    directAnswer: "The pool is currently open.",
    answerMode: "community-live-status",
    confidence: { canAnswer: true },
    sources: [{ title: "Official pool status", sourceUrl: "https://sterlingranchcab.com/pool" }],
  });
  assert.equal(result.rating, "Weak");
  assert.ok(result.issues.includes("requested-time-missing"));
});

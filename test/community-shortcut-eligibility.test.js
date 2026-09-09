const test = require("node:test");
const assert = require("node:assert/strict");
const { answerCommunityQuestion, datedFacilityHoursAnswer, sourcedAnswer, relevantActions } = require("../lib/community-assistant");
const { scoreCommunityAnswer } = require("../lib/community-answer-quality");
const { shortcutEligibility } = require("../lib/community-shortcut-eligibility");
const { answerRulesQuestion } = require("../lib/rules-assistant");
const communityIndex = require("../data/community-index.json");
const communityProfile = require("../data/communities/sterling-ranch.json");
const communityEvalCases = require("../scripts/community-eval-cases.json");
const rulesEvalCases = require("../scripts/rules-eval-cases.json");

const NOW = new Date("2026-09-01T18:00:00Z");
const REPORTED_QUESTION = "What are the pool hours for Labor Day?";

function liveWasteEvidence(date) {
  return {
    degradation: { state: "healthy" }, coverage: { requested: ["date"], covered: ["date"] },
    claims: [{ facet: "date", text: date, controllingEvidenceId: "sterling-ranch:waste-schedule:live-calendar", controllingSourceRole: "operational" }],
    evidence: [{ evidenceId: "sterling-ranch:waste-schedule:live-calendar", sourceUrl: "https://www.wasteconnections.com/pickup-schedule-wasteconnect-calendar?areaName=WC-5311#", checkedAt: NOW.toISOString(), staleAfter: "2099-01-01T00:00:00.000Z", controllingSourceRole: "operational" }],
    actions: [{ type: "information", label: "Check an address in the official pickup calendar", url: "https://www.wasteconnections.com/pickup-schedule-wasteconnect-calendar?areaName=WC-5311#" }],
  };
}

test("the reported website-source question belongs only to the Community Assistant evaluation", () => {
  assert.ok(communityEvalCases.some((item) => item.question === REPORTED_QUESTION));
  assert.ok(!rulesEvalCases.some((item) => item.question === REPORTED_QUESTION));
});

test("food-truck schedule, menu, and cost requests normalize status plans before the live connector", async () => {
  const cases = [
    ["Which food truck is here tomorrow?", plan({
      // Exact production route: correct subject/goal/date but mistaken scope
      // and status intent.
      scope: "unrelated", intent: "status", goal: "schedule", goals: ["schedule"], subject: "food truck", requestedDetails: ["date"],
      dateRange: { kind: "tomorrow", start: "2026-09-02", end: "2026-09-02", label: "tomorrow" }, searchQueries: ["food truck tomorrow"],
    })],
    ["Who is the food truck tomorrow?", plan({
      scope: "unrelated", intent: "status", goal: "schedule", goals: ["schedule"], subject: "food truck schedule", requestedDetails: ["date"],
      dateRange: { kind: "tomorrow", start: "2026-09-02", end: "2026-09-02", label: "tomorrow" }, searchQueries: ["food truck tomorrow"],
    })],
    ["What food truck is here today?", plan({
      scope: "community", intent: "status", goal: "status", goals: ["status"], subject: "food truck", requestedDetails: ["date"],
      dateRange: { kind: "today", start: "2026-09-01", end: "2026-09-01", label: "today" }, searchQueries: ["food truck today"],
    })],
    ["Which truck is here on 2026-09-02?", plan({
      scope: "unrelated", intent: "status", goal: "status", goals: ["status"], subject: "food truck", requestedDetails: ["date"],
      dateRange: { kind: "explicit-date", start: "2026-09-02", end: "2026-09-02", label: "2026-09-02" }, searchQueries: ["food truck 2026-09-02"],
    })],
    ["What does the food truck menu cost tomorrow?", plan({
      scope: "unrelated", intent: "status", goal: "cost", goals: ["cost"], subject: "food truck menu", requestedDetails: ["price", "date"],
      dateRange: { kind: "tomorrow", start: "2026-09-02", end: "2026-09-02", label: "tomorrow" }, searchQueries: ["food truck menu cost tomorrow"],
    })],
  ];
  for (const [question, routingPlan] of cases) {
    const answer = await answerCommunityQuestion(question, {
      interpretationMode: "structured", now: NOW, index: communityIndex, communityProfile, communityId: "sterling-ranch",
      planCommunitySearch: async () => routingPlan, synthesizeCommunityAnswer: false,
      getFoodTruckAnswer: async () => ({ date: routingPlan.dateRange.start, friendlyDate: "Wednesday, September 2, 2026", truck: "Example Eats", sourceUrl: "https://sterlingranchcab.com/Calendar.aspx", menu: { links: [{ title: "Example Eats menu", url: "https://www.facebook.com/example-eats/menu" }], items: [{ name: "Taco", price: "$12", url: "https://www.facebook.com/example-eats/menu" }] } }),
      answerRulesQuestion: async () => ({ inputClassification: "unrelated", confidence: { canAnswer: false, reason: "known-unrelated-topic" } }),
    });
    assert.equal(answer.answerMode, "community-live-food-truck", question);
    assert.match(answer.directAnswer, /Example Eats/, question);
    assert.equal(answer.routingPlan.scope, "community", question);
    assert.equal(answer.routingPlan.intent, "events", question);
    assert.notEqual(answer.routingPlan.goal, "status", question);
  }
});

test("the Community Assistant returns the official food-truck schedule when menu enrichment is degraded", async () => {
  const routingPlan = plan({
    scope: "community", intent: "events", goal: "schedule", goals: ["schedule"], subject: "food truck", requestedDetails: ["date"],
    dateRange: { kind: "explicit-date", start: "2026-09-09", end: "2026-09-09", label: "September 9" }, searchQueries: ["food truck September 9"],
  });
  const answer = await answerCommunityQuestion("What food truck is here on September 9?", {
    interpretationMode: "structured", now: NOW, index: communityIndex, communityProfile, communityId: "sterling-ranch", synthesizeCommunityAnswer: false,
    planCommunitySearch: async () => routingPlan,
    getFoodTruckAnswer: async () => ({
      date: "2026-09-09", friendlyDate: "Wednesday, September 9, 2026", truck: "Example Eats",
      sourceUrl: "https://sterlingranchcab.com/Calendar.aspx", menu: { links: [], items: [] },
      menuEnrichment: { status: "degraded", failures: [{ truck: "Example Eats", component: "menu-profile" }] },
    }),
    answerRulesQuestion: async () => ({ inputClassification: "unrelated", confidence: { canAnswer: false, reason: "known-unrelated-topic" } }),
  });

  assert.equal(answer.answerMode, "community-live-food-truck");
  assert.equal(answer.answerStatus, "verified");
  assert.match(answer.directAnswer, /Example Eats/);
  assert.deepEqual(answer.menuEnrichment, { status: "degraded", failures: [{ truck: "Example Eats", component: "menu-profile" }] });
  assert.ok(answer.actions.some((action) => action.actionType === "calendar" && action.url === "https://sterlingranchcab.com/Calendar.aspx?EID=6150"));
});

test("food-truck business-rule questions do not enter the live schedule connector", async () => {
  for (const scope of ["unrelated", "community"]) {
    let calls = 0;
    const answer = await answerCommunityQuestion("Can I run a food truck from my driveway?", {
      interpretationMode: "structured", now: NOW, index: communityIndex, communityId: "sterling-ranch", synthesizeCommunityAnswer: false,
      planCommunitySearch: async () => plan({ scope, intent: "status", goal: "status", goals: ["status"], subject: "operating a food truck business", requestedDetails: ["status"], searchQueries: ["food truck driveway"], }),
      getFoodTruckAnswer: async () => { calls += 1; throw new Error("live schedule connector must not run for a business-rule question"); },
      answerRulesQuestion,
      rulesOptions: { searchMode: "legacy", llmMode: "off" },
    });
    assert.equal(calls, 0, scope);
    assert.doesNotMatch(answer.answerMode, /community-live-food-truck/, scope);
  }
});

test("trash holiday schedules use the live Waste Connections path without taking over storage rules", async () => {
  const liveSchedule = async () => ({
    service: "garbage", date: "2026-09-08", range: { start: "2026-09-07", end: "2026-09-07" }, timing: "this week", anchorDate: "2026-09-08",
    serviceAreas: [{ label: "Providence Village", date: "2026-09-08" }, { label: "Ascent Village", date: "2026-09-09" }, { label: "Prospect Village", date: "2026-09-11" }],
    holidayNote: "Labor Day: Collection may be delayed.", checkedAt: NOW.toISOString(), evidence: liveWasteEvidence("2026-09-08"),
  });
  for (const question of ["Is there trash pickup on Labor Day?", "Is trash pickup delayed for Labor Day?", "What is the garbage collection schedule for Labor Day?"]) {
    const delayedStatus = question === "Is trash pickup delayed for Labor Day?";
    const answer = await answerCommunityQuestion(question, {
      interpretationMode: "structured", now: NOW, index: communityIndex, communityId: "sterling-ranch", synthesizeCommunityAnswer: false,
      planCommunitySearch: async () => plan({
        // The delayed-pickup case is the exact production status/status
        // route; the other phrasings preserve the ordinary schedule route.
        intent: delayedStatus ? "status" : "services", goal: delayedStatus ? "status" : "schedule", goals: [delayedStatus ? "status" : "schedule"], subject: "trash pickup Labor Day", requestedDetails: [delayedStatus ? "status" : "date"],
        dateRange: { kind: "explicit-date", start: "2026-09-07", end: "2026-09-07", label: "Labor Day" }, searchQueries: ["trash pickup Labor Day"],
      }),
      getWasteSchedule: liveSchedule,
    });
    assert.equal(answer.answerMode, delayedStatus ? "community-freshness-withheld" : "community-live-trash", question);
    assert.match(answer.answer, delayedStatus ? /could not safely confirm/i : /September 8/i, question);
    assert.doesNotMatch(answer.answer, /screened|garage/i, question);
    assert.equal(answer.routingPlan.intent, "services", question);
    assert.equal(answer.routingPlan.goal, delayedStatus ? "status" : "schedule", question);
  }
  let calls = 0;
  const storage = await answerCommunityQuestion("Do trash cans need to be screened?", {
    interpretationMode: "structured", now: NOW, index: communityIndex, communityId: "sterling-ranch", synthesizeCommunityAnswer: false,
    planCommunitySearch: async () => plan({ intent: "rules", goal: "information", goals: ["information"], subject: "trash can storage rules", requestedDetails: ["permission"], searchQueries: ["trash can screening rules"] }),
    getWasteSchedule: async () => { calls += 1; throw new Error("must not run"); }, answerRulesQuestion,
    rulesOptions: { searchMode: "legacy", llmMode: "off" },
  });
  assert.equal(calls, 0);
  assert.doesNotMatch(storage.answerMode, /community-live-trash/);
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

test("the exact Labor Day pool-hours question bypasses current status and withholds unapproved hours", async () => {
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
  assert.equal(answer.answerStatus, "source-unavailable");
  assert.doesNotMatch(answer.answer, /5:00 am|9:00 am|8:45 pm/i);
  assert.ok(answer._connectorDiagnostics.shortcutRejections.some((item) => item.connector === "pool-status" && item.reasons.includes("goal-not-supported")));
});

test("dated facility hours do not revive raw pool-page prose after rejecting an AI answer", async () => {
  const routingPlan = plan({ intent: "status", goal: "schedule", subject: "pool operating hours on Labor Day", requestedDetails: ["hours", "date"], dateRange: { kind: "explicit-date", start: "2026-09-07", end: "2026-09-07", label: "Labor Day" }, filters: { audience: "", category: "", facility: "pool", location: "" }, searchQueries: ["pool hours Labor Day"] });
  const answer = await answerCommunityQuestion(REPORTED_QUESTION, {
    interpretationMode: "structured", now: NOW, index: communityIndex, communityId: "sterling-ranch", planCommunitySearch: async () => routingPlan,
    synthesizeCommunityAnswer: async () => ({ directAnswer: "Saturday and Sunday hours are 7:00 am to 8:45 pm.", keyDetails: [], nextStep: "Go swim." }),
    answerRulesQuestion,
    rulesOptions: { searchMode: "legacy", llmMode: "off" },
  });
  assert.equal(answer.answerStatus, "source-unavailable");
  assert.doesNotMatch(answer.answer, /5:00 am|9:00 am|8:45 pm|Open Swim/i);
  assert.doesNotMatch(answer.answer, /maintenance|cleaning/i);
  assert.doesNotMatch(answer.answer, /Saturday and Sunday hours are 7:00 am/i);
});

test("dated facility hours reject raw current page prose without an approved claim projection", () => {
  const pool = { ...communityIndex.sources.find((source) => source.id === "sterling-ranch-overlook-outdoor-pool-1"), staleAfter: "2099-01-01T00:00:00.000Z" };
  const answer = datedFacilityHoursAnswer("What are pool hours Tuesday, September 8?", { sources: [pool] }, {
    routingPlan: plan({ intent: "facilities", goal: "schedule", subject: "pool hours", requestedDetails: ["hours", "date"], dateRange: { kind: "explicit-date", start: "2026-09-08", end: "2026-09-08", label: "September 8" }, searchQueries: ["pool hours Tuesday"] }),
  });
  assert.equal(answer, null);
});

test("dated facility hours bind a Sunday request to Sunday rather than weekday hours", () => {
  const source = {
    id: "alpha-clubhouse", title: "Clubhouse", sourceUrl: "https://alpha.gov/clubhouse", sourceType: "facilities", connectorType: "civicplus-pages", authorityScore: 1, checkedAt: NOW.toISOString(), staleAfter: "2099-01-01T00:00:00Z", contentHash: "hours", canonicalScopedProjection: true, approvalClaimIds: ["clubhouse-hours"], actions: [], facts: [],
    text: "Clubhouse operating hours. Clubhouse hours Monday-Friday: 8:00 am - 6:00 pm Saturday: 9:00 am - 4:00 pm Sunday: 10:00 am - 2:00 pm Guest passes.", excerpt: "Clubhouse hours Monday-Friday: 8:00 am - 6:00 pm Saturday: 9:00 am - 4:00 pm Sunday: 10:00 am - 2:00 pm.",
  };
  const answer = datedFacilityHoursAnswer("What are the clubhouse hours on Sunday, September 13?", { sources: [source] }, {
    routingPlan: plan({ intent: "facilities", goal: "schedule", subject: "clubhouse hours", requestedDetails: ["hours", "date"], dateRange: { kind: "explicit-date", start: "2026-09-13", end: "2026-09-13", label: "September 13" }, searchQueries: ["clubhouse hours Sunday"] }),
  });
  assert.equal(answer.answerMode, "community-dated-facility-hours");
  assert.match(answer.answer, /Sunday: 10:00 am - 2:00 pm/i);
  assert.doesNotMatch(answer.answer, /Monday-Friday: 8:00 am/i);
});

test("the full ask route withholds stale dated facility hours instead of repeating them as current", async () => {
  const stalePool = {
    ...communityIndex.sources.find((source) => source.id === "sterling-ranch-overlook-outdoor-pool-1"),
    checkedAt: "2026-08-01T00:00:00.000Z", staleAfter: "2026-08-02T00:00:00.000Z",
  };
  const routingPlan = plan({ intent: "facilities", goal: "schedule", subject: "pool hours", requestedDetails: ["hours", "date"], dateRange: { kind: "explicit-date", start: "2026-09-07", end: "2026-09-07", label: "Labor Day" }, searchQueries: ["pool hours Monday"] });
  const answer = await answerCommunityQuestion("What are the pool hours for Labor Day?", {
    interpretationMode: "structured", now: NOW, communityId: "sterling-ranch", index: { communityId: "sterling-ranch", sources: [stalePool] },
    planCommunitySearch: async () => routingPlan, synthesizeCommunityAnswer: false,
    answerRulesQuestion: async () => ({ confidence: { canAnswer: false, reason: "no-rule-answer" } }),
  });
  assert.equal(answer.answerMode, "community-dated-facility-hours-stale");
  assert.equal(answer.answerStatus, "could-not-verify");
  assert.equal(answer.answerVerdict, "unverified");
  assert.equal(answer.confidence.reason, "source-stale");
  assert.equal(answer.authorityDecision, "freshness-withheld");
  assert.deepEqual(answer.completion.requestedDetails, ["date", "hours"]);
  assert.deepEqual(answer.completion.resolvedDetails, []);
  assert.deepEqual(answer.completion.missingDetails, [
    { key: "date", reason: "missing-evidence" },
    { key: "hours", reason: "missing-evidence" },
  ]);
  assert.doesNotMatch(answer.answer, /5:00 am|9:00 am|8:45 pm|Open Swim/i);
  assert.equal(answer.sources[0].text, undefined);
});

test("fresh raw dated facility hours still require an approved claim projection", () => {
  const source = {
    ...communityIndex.sources.find((item) => item.id === "sterling-ranch-overlook-outdoor-pool-1"),
    staleAfter: "2026-09-02T00:00:00.000Z",
  };
  const answer = datedFacilityHoursAnswer("What are pool hours on Labor Day?", { sources: [source] }, {
    now: NOW,
    routingPlan: plan({ intent: "facilities", goal: "schedule", subject: "pool hours", requestedDetails: ["hours", "date"], dateRange: { kind: "explicit-date", start: "2026-09-07", end: "2026-09-07", label: "Labor Day" }, searchQueries: ["pool hours Monday"] }),
  });
  assert.equal(answer, null);
});

test("dated facility hours retain the conflict boundary and prefer an exact weekday heading", async () => {
  const planForMonday = plan({ intent: "facilities", goal: "schedule", subject: "clubhouse hours", requestedDetails: ["hours", "date"], dateRange: { kind: "explicit-date", start: "2026-09-07", end: "2026-09-07", label: "Labor Day" }, searchQueries: ["clubhouse hours Monday"] });
  const base = { id: "one", title: "Clubhouse", sourceUrl: "https://alpha.gov/clubhouse", sourceType: "facilities", connectorType: "civicplus-pages", authorityScore: 1, checkedAt: NOW.toISOString(), contentHash: "one", canonicalScopedProjection: true, approvalClaimIds: ["clubhouse-monday-hours"], actions: [], text: "Monday: 8:00 am - 6:00 pm Tuesday-Friday: 9:00 am - 5:00 pm Saturday: 10:00 am - 2:00 pm.", excerpt: "Monday: 8:00 am - 6:00 pm", facts: [{ factKey: "clubhouse-monday-hours", type: "time", value: "8:00 am", context: "Monday: 8:00 am - 6:00 pm" }] };
  const exact = datedFacilityHoursAnswer("What are clubhouse hours on Labor Day?", { sources: [base] }, { routingPlan: planForMonday });
  assert.match(exact.answer, /Monday: 8:00 am - 6:00 pm/i);
  assert.doesNotMatch(exact.answer, /Tuesday-Friday/i);
  const conflict = { ...base, id: "two", sourceUrl: "https://alpha.gov/clubhouse-new", contentHash: "two", text: "Monday: 9:00 am - 6:00 pm", excerpt: "Monday: 9:00 am - 6:00 pm", facts: [{ factKey: "clubhouse-monday-hours", type: "time", value: "9:00 am", context: "Monday: 9:00 am - 6:00 pm" }] };
  const answer = await sourcedAnswer("What are clubhouse hours on Labor Day?", { sources: [{ ...base, score: 50 }, { ...conflict, score: 49 }], requestedDetails: ["hours", "date"] }, { routingPlan: planForMonday, synthesizeCommunityAnswer: false });
  assert.equal(answer.answerMode, "community-source-conflict");
  assert.notEqual(answer.answerStatus, "verified");
});

test("a confident rental fallback cannot replace pool hours after live status is rejected", async () => {
  let poolCalls = 0;
  let rulesCalls = 0;
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
    getPoolStatus: async () => {
      poolCalls += 1;
      return { headline: "Green", summary: "The pool is currently open.", residentAction: "Come swim.", sourceUrl: "https://sterlingranchcab.com/pool", checkedAt: NOW.toISOString() };
    },
    answerRulesQuestion: async () => {
      rulesCalls += 1;
      return {
        answer: "Short answer: To reserve an Overlook space, use the rental catalog.\n\nWhat I found:\n- The Great Hall is $100 per hour.\n- A security deposit applies.",
        directAnswer: "To reserve an Overlook space, use the rental catalog.",
        keyDetails: ["The Great Hall is $100 per hour.", "A security deposit applies."],
        answerMode: "source-derived-structured",
        answerStatus: "verified",
        confidence: { canAnswer: true, confidence: "high", reason: "supported" },
        actions: [{ label: "Open rental catalog", url: "https://sterlingranchcab.com/rentals" }],
        sources: [
          { title: "Community facility rental fees", sourceUrl: "https://sterlingranchcab.com/rental-fees" },
          { title: "Specific facility rental rules", sourceUrl: "https://sterlingranchcab.com/rental-rules" },
          { title: "Overlook Outdoor Pool", sourceUrl: "https://sterlingranchcab.com/412/Overlook-Outdoor-Pool" },
        ],
      };
    },
  });
  assert.equal(poolCalls, 0);
  assert.equal(rulesCalls, 1);
  assert.notEqual(answer.answerMode, "source-derived-structured");
  assert.doesNotMatch(answer.answer, /reserve an Overlook space|security deposit/i);
  assert.equal(answer.answerStatus, "source-unavailable");
  assert.doesNotMatch(answer.answer, /5:00 am|9:00 am|8:45 pm/i);
  assert.ok(answer._connectorDiagnostics.shortcutRejections.some((item) =>
    item.connector === "grounded-fallback"
      && item.reasons.includes("requested-hours-missing")
      && item.reasons.includes("date-range-not-covered")
  ));
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
  assert.ok(generalService.reasons.includes("unknown-shortcut-profile"));
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

test("retired proactive price shortcuts stay ineligible even when old candidates carry evidence metadata", () => {
  const costPlan = plan({ intent: "facilities", goal: "cost", goals: ["cost"], subject: "pool rental", requestedDetails: ["price"] });
  const supported = shortcutEligibility("proactive", {
    question: "What is the pool rental fee?", plan: costPlan,
    candidate: candidate({ answerMode: "community-proactive-pool-party", directAnswer: "There is no pool rental fee because the official pool FAQ says the pool is not available for rental.", sources: [{ id: "pool-faq", title: "Pool FAQ" }], detailResolutions: { price: { status: "not-applicable", evidenceSourceIds: ["pool-faq"] } } }),
  });
  assert.equal(supported.eligible, false);
  assert.ok(supported.reasons.includes("unknown-shortcut-profile"));
  const unsupported = shortcutEligibility("proactive", {
    question: "What is the pool rental fee?", plan: costPlan,
    candidate: candidate({ answerMode: "community-proactive-pool-party", directAnswer: "The pool is not available for rental.", sources: [{ id: "pool-faq", title: "Pool FAQ" }] }),
  });
  assert.equal(unsupported.eligible, false);
  assert.ok(unsupported.reasons.includes("unknown-shortcut-profile"));
});

test("pool cost actions exclude unrelated downloads that only share generic fee language", () => {
  const actions = relevantActions("What is the pool rental fee?", [{
    title: "Pool FAQ", sourceUrl: "https://sterlingranchcab.com/faq", actions: [
      { label: "Download and complete the direct debit authorization form.", url: "https://sterlingranchcab.com/direct-debit.pdf", context: "Quarterly CAB service fee payment options." },
      { label: "Open the pool FAQ", url: "https://sterlingranchcab.com/pool-faq", context: "The pool is not available for rental." },
    ],
  }], 3, plan({ intent: "facilities", goal: "cost", goals: ["cost"], subject: "pool rental", requestedDetails: ["price"] }));
  assert.ok(actions.some((action) => /pool FAQ/i.test(action.label)));
  assert.ok(actions.every((action) => !/direct debit/i.test(action.label)));
});

test("a sole generic form remains available when its source itself matches the facility topic", () => {
  const actions = relevantActions("How do I reserve the Great Hall?", [{
    title: "Great Hall amenity rentals", sourceUrl: "https://alpha.gov/rentals",
    text: "Residents can reserve the Great Hall for private events.",
    actions: [{ label: "Rental request form", url: "https://alpha.gov/forms/rental", actionType: "booking" }],
  }], 3, plan({ intent: "facilities", goal: "booking", goals: ["booking"], subject: "Great Hall rental", requestedDetails: ["action"] }));
  assert.deepEqual(actions.map((action) => action.url), ["https://alpha.gov/forms/rental"]);
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

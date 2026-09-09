const assert = require("node:assert/strict");
const test = require("node:test");
const { answerCommunityQuestion, directlyAnswersQuestionForm } = require("../lib/community-assistant");
const { answerRulesQuestion } = require("../lib/rules-assistant");
const { nextDrcReview, proactiveCommunityAnswer } = require("../lib/community-proactive");
const { residentEffortAssessment } = require("../scripts/eval-community-assistant");
const communityIndex = require("../data/community-index.json");

async function ask(question, now = new Date("2026-08-31T18:00:00Z")) {
  return answerCommunityQuestion(question, {
    index: communityIndex,
    communityId: "sterling-ranch",
    answerRulesQuestion,
    rulesOptions: { searchMode: "legacy", llmMode: "off" },
    planCommunitySearch: false,
    synthesizeCommunityAnswer: false,
    now,
  });
}

async function askWithDraft(question, draft) {
  return answerCommunityQuestion(question, {
    index: communityIndex,
    communityId: "sterling-ranch",
    answerRulesQuestion,
    rulesOptions: { searchMode: "legacy", llmMode: "off" },
    planCommunitySearch: false,
    synthesizeCommunityAnswer: async () => draft,
    now: new Date("2026-08-31T18:00:00Z"),
  });
}

test("approved-landscaper questions withhold unapproved directory prose and company names", async () => {
  const answer = await ask("list of approved landscapers");
  assert.equal(answer.answerStatus, "source-unavailable");
  assert.equal(answer.answerMode, "community-freshness-withheld");
  assert.doesNotMatch(answer.answer, /AAA Landscaping|A Complete Exterior|AGR Landscape/i);
  assert.ok(answer.actions.some((action) => /\/414\/Approved-Landscapers-List/.test(action.url)));
});

test("legacy water-usage wording uses approved projections without inventing a missing portal claim", async () => {
  const answer = await ask("Internet access for water usage");
  assert.equal(answer.answerMode, "community-source-extractive");
  assert.equal(answer.answerStatus, "verified");
  assert.doesNotMatch(answer.answer, /does not provide a resident login link|no (?:portal|login)/i);
  assert.ok(answer.sources.filter((source) => !source.connectorType?.includes("live")).every((source) => source.canonicalScopedProjection));
});

test("operational portal questions no longer use a topic-specific proactive answer", () => {
  const answer = proactiveCommunityAnswer("Internet access for water usage", {
    index: communityIndex,
    now: new Date("2026-08-31T18:00:00Z"),
  });
  assert.equal(answer, null);
});

test("AI goal-and-subject routing sends payment questions to the current portal, not delinquency policy", async () => {
  let plannerCalls = 0;
  for (const question of [
    "Where can I pay my water bill?",
    "How do I pay my water bill?",
    "Can I pay my water bill online?",
    "What is the water bill payment portal?",
    "Pay utility bill",
    "What's the online place for settling my monthly utility charge?",
  ]) {
    const answer = await answerCommunityQuestion(question, {
      index: communityIndex,
      communityId: "sterling-ranch",
      answerRulesQuestion,
      rulesOptions: { searchMode: "legacy", llmMode: "off" },
      planCommunitySearch: async () => {
        plannerCalls += 1;
        return { intent: "services", goal: "payment", subject: "water bill", searchQueries: ["pay water bill UtilityHawk", "water billing payment options"] };
      },
      synthesizeCommunityAnswer: async (_question, sources, options) => ({
        directAnswer: "Pay your Sterling Ranch water bill through UtilityHawk. Sign in, then select “Pay Online.”",
        keyDetails: [
          "Bank-account payments (ACH) are free.",
          "Debit and credit cards have a 2.95% processing fee charged by Paymentus.",
          "American Conservation and Billing Solutions (AmCoBi) administers the monthly water bill.",
        ],
        nextStep: "Open UtilityHawk and sign in to pay your bill.",
        answerMode: "community-grounded-ai",
        claims: [{ text: "Pay through UtilityHawk.", evidenceSourceIds: [sources[0].id], verified: true }],
        routingPlan: options.routingPlan,
      }),
    });
    assert.equal(answer.answerMode, "community-approved-operational", question);
    assert.equal(answer.routingDecision, "ai-planned", question);
    assert.equal(answer.routingPlan.goal, "payment", question);
    assert.equal(answer.routingPlan.subject, "water bill", question);
    assert.match(answer.answer, /UtilityHawk.*Pay Online/i, question);
    assert.doesNotMatch(answer.answer, /threshold|alerts?|monitor|water rate/i, question);
    assert.doesNotMatch(answer.answer, /2\.95%/i, question);
    assert.match(JSON.stringify(answer.actions), /srcab\.utilityhawk\.us/i, question);
    assert.doesNotMatch(answer.answer, /possible disconnection|past-due notice/i, question);
  }
  assert.equal(plannerCalls, 6);

  const outageFallback = await answerCommunityQuestion("Where can I pay my water bill?", {
    index: communityIndex,
    communityId: "sterling-ranch",
    answerRulesQuestion,
    rulesOptions: { searchMode: "legacy", llmMode: "off" },
    planCommunitySearch: false,
    synthesizeCommunityAnswer: false,
  });
  assert.equal(outageFallback.routingDecision, "official-action-fallback");
  assert.equal(outageFallback.routingFallbackReason, "planner-unavailable-or-disabled");
  assert.match(outageFallback.answer, /Utility Hawk[\s\S]*Pay Online/i);
  assert.match(JSON.stringify(outageFallback.actions), /srcab\.utilityhawk\.us/i);
  assert.doesNotMatch(JSON.stringify(outageFallback.actions), /Water Concern/i);
  assert.doesNotMatch(outageFallback.answer, /possible disconnection|past-due notice/i);

  const rejectedSynthesisFallback = await answerCommunityQuestion("Where can I pay my water bill?", {
    index: communityIndex,
    communityId: "sterling-ranch",
    answerRulesQuestion,
    rulesOptions: { searchMode: "legacy", llmMode: "off" },
    planCommunitySearch: async () => ({
      intent: "services",
      goal: "payment",
      subject: "water bill",
      searchQueries: ["pay water bill UtilityHawk"],
    }),
    synthesizeCommunityAnswer: false,
  });
  assert.equal(rejectedSynthesisFallback.routingDecision, "ai-planned");
  assert.match(rejectedSynthesisFallback.answer, /Utility Hawk[\s\S]*Pay Online/i);
  assert.match(JSON.stringify(rejectedSynthesisFallback.actions), /srcab\.utilityhawk\.us/i);

  const late = await ask("What happens if I do not pay my water bill?");
  assert.notEqual(late.routingDecision, "ai-planned");
  assert.match(late.answer, /past due|late fee|disconnection/i);

  const rates = await ask("How much will my water bill be?");
  assert.notEqual(rates.routingDecision, "ai-planned");
});

test("unapproved facility rental facts and booking actions stay withheld", async () => {
  for (const question of [
    "How do I book the park?",
    "Can I rent the clubhouse?",
    "How do I reserve an Overlook space?",
    "How much does the Overlook Great Hall cost?",
  ]) {
    const answer = await ask(question);
    assert.equal(answer.answerStatus, "source-unavailable", question);
    assert.equal(answer.answerMode, "community-freshness-withheld", question);
    assert.ok(answer.actions.every((action) => action.actionType === "information"), question);
    assert.doesNotMatch(JSON.stringify(answer), /secure\.rec1\.com|\$15 per hour|\$100 per hour|\$250 refundable/i, question);
  }
});

test("an AI draft cannot restore a retired static rental shortcut", async () => {
  const tailored = await askWithDraft("How do I reserve an Overlook space?", {
    directAnswer: "Open the live rental catalog, choose the Overlook space you want, and select an available date and time.",
    keyDetails: ["The official facility page lists separate rentable spaces and conditions."],
    nextStep: "Use the live rental catalog to start the reservation.",
  });
  assert.equal(tailored.answerStatus, "source-unavailable");
  assert.equal(tailored.answerMode, "community-freshness-withheld");
  assert.doesNotMatch(tailored.answer, /live rental catalog|select an available date/i);
  assert.doesNotMatch(JSON.stringify(tailored.actions), /secure\.rec1\.com/i);
});

test("a price-heavy AI draft also cannot bypass the static approval boundary", async () => {
  const mismatched = await askWithDraft("How do I reserve an Overlook space?", {
    directAnswer: "Yes. The Great Hall is $100 per hour with a two-hour minimum ($200 minimum rental).",
    keyDetails: ["North and South outdoor pavilions are currently listed at $25 per hour."],
    nextStep: "Open the live catalog to check your date and start the reservation.",
  });
  assert.equal(mismatched.answerStatus, "source-unavailable");
  assert.equal(mismatched.answerMode, "community-freshness-withheld");
  assert.doesNotMatch(mismatched.answer, /\$100|\$25|live catalog/i);
});

test("trash-return questions retain the official storage limit when no removal time is published", async () => {
  const answer = await ask("When do I need to bring my recycling cans in?");
  assert.equal(answer.answerMode, "source-derived-structured");
  assert.match(answer.answer, /does not give a specific curb-placement or removal time/i);
  assert.match(answer.answer, /screened area behind the wing fence/i);
  assert.ok(answer.sources.some((source) => /Resolution-No-2024-11-02/.test(source.sourceUrl || "")));
});

test("generic DRC submission questions give the approved application destination and required materials", async () => {
  const answer = await ask("I need to submit something to the DRC. How do I do that?");
  assert.equal(answer.answerMode, "official-resource");
  assert.match(answer.answer, /official DRC application page/i);
  assert.match(answer.answer, /site plan, dimensions, materials, colors/i);
  assert.match(JSON.stringify(answer.actions), /201\/Design-Review-Documents/);
  assert.ok(answer.sources.some((source) => /\/201\/Design-Review-Documents/.test(source.sourceUrl || "")));
  assert.deepEqual(nextDrcReview(new Date("2026-08-31T18:00:00Z")), { meeting: "2026-09-17", deadline: "2026-09-11" });
});

test("rule answers remain grounded after post-answer topic templates are retired", async () => {
  const watering = await ask("When am I allowed to water my lawn?");
  assert.match(watering.answer, /before 10:00 a\.m\. or after 6:00 p\.m\..*May 1 through September 30/i);
  assert.ok(watering.sources.some((source) => /library\.municode\.com/i.test(source.sourceUrl || "")));
  const lights = await ask("When can I put up holiday lights?");
  assert.match(lights.answer, /June 18 to July 7.*October 1 through January 31/i);
  assert.match(lights.answer, /off by 10:00 p\.m\./i);
});

test("approved fee, rate, and delinquency evidence no longer receives canned calculation prompts", async () => {
  const cases = [
    ["What are utility tap fees?", /DocumentCenter\/View\/2472/],
    ["What are water rates?", /DocumentCenter\/View\/2473/],
    ["What happens if I do not pay my water bill?", /DocumentCenter\/View\/2615/],
  ];
  for (const [question, sourcePattern] of cases) {
    const answer = await ask(question);
    assert.equal(answer.answerStatus, "verified", question);
    assert.ok(answer.sources.some((source) => sourcePattern.test(source.sourceUrl || "")), question);
    assert.doesNotMatch(answer.answer, /Tell me (?:the property type|whether the usage|the due date).*I’ll calculate/i, question);
  }
});

test("question-form checks still accept a grounded missing-time answer", async () => {
  const storage = await ask("When does trash need to be stored?");
  const storageDirect = storage.directAnswer || storage.answer.match(/^Short answer:\s*([^\n]+)/i)?.[1] || "";
  assert.match(storageDirect, /does not give a specific.*time/i);
  assert.equal(directlyAnswersQuestionForm("When does trash need to be stored?", { directAnswer: storageDirect }), true);
});

test("resident-effort rubric catches polished handoffs and accepts resolved answers", async () => {
  const oldAnswer = {
    answer: "Short answer: The rulebook does not include a current roster. Before you act: Use the official website.",
    actions: [],
  };
  const oldEffort = residentEffortAssessment("list of approved landscapers", oldAnswer);
  assert.ok(oldEffort.score <= 2);
  assert.ok(oldEffort.gaps.includes("directory-examples-missing"));

  const upgraded = await ask("Who do I contact about water billing?");
  assert.equal(residentEffortAssessment("Who do I contact about water billing?", upgraded).score, 5);
});

test("DRC contact questions withhold the unapproved contact shortcut", async () => {
  const answer = await ask("What is the DRC email address?");
  assert.equal(answer.answerStatus, "source-unavailable");
  assert.equal(answer.answerMode, "community-freshness-withheld");
  assert.doesNotMatch(answer.answer, /residentsubmit@sterlingranchcab\.com|submit@sterlingranchdrc\.com/i);
  assert.ok(answer.actions.every((action) => action.actionType === "information"));
});

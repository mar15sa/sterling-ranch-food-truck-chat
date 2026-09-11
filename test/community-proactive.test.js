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

test("revalidated projections cannot answer an unrelated directory lookup", async () => {
  const renewed = structuredClone(communityIndex);
  const renewedIds = new Set([
    "approved-mailbox-keys-route",
    "approved-great-hall-booking-link",
  ]);
  renewed.sources = renewed.sources.map((source) => renewedIds.has(source.id)
    ? { ...source, checkedAt: "2026-09-11T05:00:00Z", staleAfter: "2099-01-01T00:00:00Z" }
    : source);
  renewed.factLedger = (renewed.factLedger || []).map((fact) => renewedIds.has(fact.sourceId)
    ? { ...fact, lastObservedAt: "2026-09-11T05:00:00Z", staleAfter: "2099-01-01T00:00:00Z" }
    : fact);
  const options = {
    index: renewed,
    communityId: "sterling-ranch",
    answerRulesQuestion,
    rulesOptions: { searchMode: "legacy", llmMode: "off" },
    planCommunitySearch: false,
    synthesizeCommunityAnswer: false,
    now: new Date("2026-09-11T06:00:00Z"),
  };

  const directory = await answerCommunityQuestion("list of approved landscapers", options);
  assert.notEqual(directory.answerStatus, "verified");
  assert.doesNotMatch(directory.answer, /mailbox|builder|Littleton Post Office/i);
  assert.doesNotMatch(JSON.stringify(directory.actions || []), /\/227\/Mailbox-Keys/i);

  const greatHall = await answerCommunityQuestion("How do I book the Great Hall?", options);
  assert.equal(greatHall.answerStatus, "verified");
  assert.match(JSON.stringify(greatHall.actions), /secure\.rec1\.com/i);
});

test("approved water-usage monitoring instructions do not borrow payment facts", async () => {
  const answer = await ask("Internet access for water usage");
  assert.equal(answer.answerMode, "community-approved-operational-instruction");
  assert.equal(answer.answerStatus, "verified");
  assert.equal(answer.confidence?.canAnswer, true);
  assert.ok(answer.sources.some((source) => /\/m\/faq\?cat=16/.test(source.sourceUrl || "")));
  assert.deepEqual(answer.sources.map((source) => source.id), ["approved-utilityhawk-water-monitoring-2026"]);
  assert.match(answer.answer, /select Registration/i);
  assert.match(JSON.stringify(answer.actions), /srcab\.utilityhawk\.us/i);
  assert.doesNotMatch(answer.answer, /Pay Online|rate|billing help|AmCoBi/i);
});

test("structured routing separates online water-usage access from billing and payment", async () => {
  const structuredAnswer = (question, plan) => answerCommunityQuestion(question, {
    index: communityIndex,
    communityId: "sterling-ranch",
    answerRulesQuestion,
    rulesOptions: { searchMode: "legacy", llmMode: "off" },
    planCommunitySearch: async () => plan,
    synthesizeCommunityAnswer: false,
    now: new Date("2026-09-09T02:00:00Z"),
  });
  const billingBiasedPlan = {
    intent: "services",
    goal: "contact",
    goals: ["contact"],
    subject: "Water Billing & Payment Options",
    requestedDetails: ["contact"],
    searchQueries: ["water billing payment options", "AmCoBi water billing contact"],
    scope: "community",
  };

  for (const question of [
    "Internet access for water usage",
    "How can I view my water usage online?",
    "Where is the portal for my water consumption?",
    "How do I access my water use account?",
    "Can I monitor our water consumption on the web?",
  ]) {
    const answer = await structuredAnswer(question, billingBiasedPlan);
    assert.equal(answer.routingPlan.goal, "account-access", question);
    assert.deepEqual(answer.routingPlan.goals, ["account-access"], question);
    assert.equal(answer.routingPlan.subject, "water usage monitoring account access", question);
    assert.deepEqual(answer.routingPlan.searchQueries, ["water usage monitoring", "water usage account access"], question);
    assert.deepEqual(answer.routingPlan.requestedDetails, ["action"], question);
    assert.equal(answer.answerMode, "community-approved-operational-instruction", question);
    assert.equal(answer.answerStatus, "verified", question);
    assert.equal(answer.confidence?.canAnswer, true, question);
    assert.ok(answer.sources.some((source) => /\/m\/faq\?cat=16/.test(source.sourceUrl || "")), question);
    assert.match(JSON.stringify(answer.actions), /srcab\.utilityhawk\.us/i, question);
    assert.match(answer.answer, /Registration/i, question);
    assert.doesNotMatch(answer.answer, /ClientCare@AmCoBi\.com|833[-)\s]772[-\s]2240|Pay Online|water rate/i, question);
  }

  const paymentPageOnlyIndex = {
    ...communityIndex,
    sources: communityIndex.sources.filter((source) => /\/334\/Water-Billing-Payment-Options/.test(source.sourceUrl || "")),
  };
  const paymentPageOnly = await answerCommunityQuestion("How can I view my water usage online?", {
    index: paymentPageOnlyIndex,
    communityId: "sterling-ranch",
    answerRulesQuestion: false,
    planCommunitySearch: async () => billingBiasedPlan,
    synthesizeCommunityAnswer: false,
    now: new Date("2026-09-09T02:00:00Z"),
  });
  assert.equal(paymentPageOnly.answerMode, "community-access-withheld");
  assert.equal(paymentPageOnly.answerStatus, "source-unavailable");
  assert.equal(paymentPageOnly.confidence?.canAnswer, false);
  assert.doesNotMatch(paymentPageOnly.answer, /Utility ?Hawk|Pay Online|monitor|threshold|usage alerts?/i);
  assert.doesNotMatch(JSON.stringify(paymentPageOnly.actions), /srcab\.utilityhawk\.us/i);

  const secondCommunityIndex = {
    ...paymentPageOnlyIndex,
    communityId: "pine-creek",
    communityName: "Pine Creek",
    website: "https://pine-creek.example.test/",
    sources: paymentPageOnlyIndex.sources.map((source) => ({ ...source, communityId: "pine-creek" })),
  };
  const secondCommunity = await answerCommunityQuestion("How can I view my water usage online?", {
    index: secondCommunityIndex,
    communityId: "pine-creek",
    answerRulesQuestion: false,
    planCommunitySearch: async () => billingBiasedPlan,
    synthesizeCommunityAnswer: false,
    now: new Date("2026-09-09T02:00:00Z"),
  });
  assert.equal(secondCommunity.answerMode, "community-access-withheld");
  assert.equal(secondCommunity.answerStatus, "source-unavailable");
  assert.equal(secondCommunity.authorityDecision, "source-approval-required");
  assert.match(JSON.stringify(secondCommunity), /Pine Creek|pine-creek\.example\.test/);
  assert.doesNotMatch(JSON.stringify(secondCommunity), /Sterling|Utility ?Hawk|srcab\.utilityhawk|AmCoBi/i);

  const payment = await structuredAnswer("Can I pay my water bill online?", {
    ...billingBiasedPlan,
    goal: "payment",
    goals: ["payment"],
    requestedDetails: ["action"],
    searchQueries: ["water bill online payment"],
  });
  assert.equal(payment.routingPlan.goal, "payment");
  assert.match(payment.answer, /Utility Hawk[\s\S]*Pay Online/i);

  const billingContact = await structuredAnswer("Who do I contact about water billing?", billingBiasedPlan);
  assert.equal(billingContact.routingPlan.goal, "contact");
  assert.match(billingContact.answer, /AmCoBi[\s\S]*ClientCare@AmCoBi\.com/i);
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
  assert.match(answer.answer, /screened from view behind the wing fence/i);
  assert.ok(answer.sources.some((source) => /Resolution-No-2024-11-02/.test(source.sourceUrl || "")));
});

test("generic DRC submission questions use only the approved submission route and directory", async () => {
  const answer = await ask("I need to submit something to the DRC. How do I do that?");
  assert.equal(answer.answerMode, "community-approved-operational-submission");
  assert.match(answer.answer, /completed application by email/i);
  assert.match(answer.answer, /emailed or dropped off during office hours/i);
  assert.match(JSON.stringify(answer.actions), /201\/Design-Review-Documents/);
  assert.ok(answer.sources.some((source) => /\/201\/Design-Review-Documents/.test(source.sourceUrl || "")));
  assert.doesNotMatch(answer.answer, /site plan|dimensions|materials|colors|project-specific form|fee|review timeline|mailing address|written approval/i);
  assert.deepEqual(nextDrcReview(new Date("2026-08-31T18:00:00Z")), { meeting: "2026-09-17", deadline: "2026-09-11" });
});

test("rule answers remain grounded after post-answer topic templates are retired", async () => {
  const watering = await ask("When am I allowed to water my lawn?");
  assert.match(watering.answer, /prohibited between the hours of 10:00 a\.m\. and 6:00 p\.m\./i);
  assert.match(watering.answer, /May 1 (?:to|through) September 30/i);
  assert.ok(watering.sources.some((source) => /library\.municode\.com/i.test(source.sourceUrl || "")));
  const lights = await ask("When can I put up holiday lights?");
  assert.match(lights.answer, /June 18 to July 7.*October 1 through January 31/i);
  assert.match(lights.answer, /(?:turn off|off)\b.*by 10:00 p\.m\./i);
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

test("current approved operational contacts outrank older general rulebook contact wording", async () => {
  for (const question of [
    "What is the DRC email address?",
    "What email should I use for a DRC application?",
    "How do I contact the DRC?",
  ]) {
    const answer = await ask(question);
    assert.equal(answer.answerStatus, "verified", question);
    assert.equal(answer.answerMode, "community-approved-operational-contact", question);
    assert.equal(answer.authorityDecision, "exact-version-approved-claims", question);
    assert.match(answer.answer, /ResidentSubmit@SterlingRanchCAB\.com/i, question);
    assert.doesNotMatch(answer.answer, /submit@sterlingranchdrc\.com/i, question);
    assert.deepEqual(answer.sources.map((source) => source.id), ["approved-drc-contact-current"], question);
    assert.ok(answer.claims.every((claim) => claim.approvalClaimIds?.includes("drc-email")), question);
  }
});

test("approved operational contact priority is profile-driven and fails closed when its version changes", async () => {
  const contactUrl = "https://beta.example.gov/permits/contact";
  const approvedVersion = "a".repeat(64);
  const contactSource = {
    id: "beta-permit-office-contact",
    communityId: "beta",
    title: "Permit office contact",
    sourceUrl: contactUrl,
    sourceType: "forms",
    connectorType: "civicplus-pages",
    authorityScore: 1,
    text: "For permit questions, email permits@beta.example.gov.",
    excerpt: "For permit questions, email permits@beta.example.gov.",
    actions: [],
    facts: [{
      id: "permit-office-email",
      type: "email",
      value: "permits@beta.example.gov",
      context: "For permit questions, email permits@beta.example.gov.",
      approvalClaim: "permit-office-email",
    }],
    contentHash: approvedVersion,
    checkedAt: "2026-09-09T00:00:00Z",
    staleAfter: "2099-01-01T00:00:00Z",
    lifecycle: "current",
  };
  const betaIndex = {
    communityId: "beta",
    communityName: "Beta Civic",
    website: "https://beta.example.gov",
    sources: [contactSource],
    factLedger: [],
    canonicalSourceLedger: {
      records: [{
        key: `${contactUrl}#sha256:${approvedVersion}`,
        canonicalUrl: contactUrl,
        contentHash: approvedVersion,
        approvals: [{
          status: "approved",
          communityId: "beta",
          decisionId: "beta-permit-contact",
          scopeKind: "scoped-claims",
          approvedClaims: ["permit-office-email"],
          withheldClaims: [],
        }],
      }],
    },
  };
  const betaOptions = {
    index: betaIndex,
    communityId: "beta",
    answerRulesQuestion: false,
    planCommunitySearch: false,
    synthesizeCommunityAnswer: false,
    now: new Date("2026-09-09T12:00:00Z"),
  };
  const approved = await answerCommunityQuestion("What is the permit office email?", betaOptions);
  assert.equal(approved.answerStatus, "verified");
  assert.equal(approved.answerMode, "community-approved-operational-contact");
  assert.match(approved.answer, /permits@beta\.example\.gov/i);
  assert.doesNotMatch(JSON.stringify(approved), /Sterling Ranch|ResidentSubmit/i);

  const changed = await answerCommunityQuestion("What is the permit office email?", {
    ...betaOptions,
    index: { ...betaIndex, sources: [{ ...contactSource, contentHash: "b".repeat(64) }] },
  });
  assert.notEqual(changed.answerStatus, "verified");
  assert.doesNotMatch(changed.answer, /permits@beta\.example\.gov/i);
});

test("approved pool hours provide regular context without claiming an unproven holiday schedule", async () => {
  for (const question of ["What are the pool hours for Labor Day?", "Is the pool open on Labor Day, and what are the hours?"]) {
    const answer = await ask(question, new Date("2026-09-01T12:00:00Z"));
    assert.equal(answer.answerStatus, "verified-incomplete", question);
    assert.match(answer.answer, /Memorial Day weekend through Labor Day/i, question);
    assert.match(answer.answer, /Monday-Friday: 5:00 am - 9:00 am/i, question);
    assert.match(answer.answer, /does not publish separate Labor Day hours/i, question);
    assert.deepEqual(answer.completion.resolvedDetails, ["date"], question);
    assert.deepEqual(answer.completion.missingDetails.map((detail) => detail.key), ["hours"], question);
    assert.doesNotMatch(answer.answer, /depends on your village|current hours cannot be verified/i, question);
    assert.deepEqual(answer.sources.map((source) => source.id), ["approved-pool-hours-current-page"], question);
  }
});

test("approved conditional instruction claims preserve their boundary and do not invent a form", async () => {
  for (const question of ["Do I submit a rain barrel application to the DRC?", "Where do I send a rain barrel application if approval is required?"]) {
    const answer = await ask(question);
    assert.equal(answer.answerStatus, "verified", question);
    assert.equal(answer.answerMode, /if approval is required/i.test(question)
      ? "community-rule-conditional-action"
      : "community-approved-operational-instruction", question);
    assert.match(answer.answer, /If the controlling rain-barrel rule says approval is needed/i, question);
    assert.match(answer.answer, /ResidentSubmit@SterlingRanchCAB\.com/i, question);
    assert.doesNotMatch(answer.answer, /rain-barrel form|approval is required/i, question);
    assert.ok(answer.actions.some((action) => /\/201\/Design-Review-Documents/.test(action.url)), question);
  }
});

test("conditional project submissions combine the controlling rule with the approved next step", async () => {
  for (const question of [
    "I need to submit for a rainwater harvesting barrels",
    "How do I apply for a rain barrel if approval is needed?",
    "Where do I submit a rain barrel project that needs approval?",
  ]) {
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
    assert.equal(answer.answerStatus, "verified", question);
    assert.equal(answer.answerMode, "community-rule-conditional-action", question);
    assert.equal(answer.answerVerdict, "conditional", question);
    assert.match(answer.answer, /Residents are allowed two 55-gallon rain barrels/i, question);
    assert.match(answer.answer, /If the controlling rain-barrel rule says approval is needed/i, question);
    assert.match(answer.answer, /ResidentSubmit@SterlingRanchCAB\.com/i, question);
    assert.doesNotMatch(answer.answer, /rain-barrel form|approval is required/i, question);
    assert.ok(answer.sources.some((source) => /library\.municode\.com/i.test(source.sourceUrl || "")), question);
    assert.ok(answer.actions.some((action) => /\/201\/Design-Review-Documents/.test(action.url)), question);
  }
});

test("approved instruction claims work for a second community and withdraw when their version changes", async () => {
  const sourceUrl = "https://beta.example.gov/permits/register";
  const sourceVersion = "c".repeat(64);
  const source = {
    id: "beta-permit-registration", communityId: "beta", title: "Permit conditional submission", sourceUrl,
    sourceType: "services", connectorType: "civicplus-pages", authorityScore: 1,
    text: "If your permit requires approval, go to https://beta.example.gov/permit-portal and select Registration.",
    excerpt: "If your permit requires approval, go to https://beta.example.gov/permit-portal and select Registration.", actions: [],
    facts: [{ type: "information", value: "If your permit requires approval, go to https://beta.example.gov/permit-portal and select Registration.", context: "If your permit requires approval, go to https://beta.example.gov/permit-portal and select Registration.", approvalClaim: "permit-registration" }],
    contentHash: sourceVersion, checkedAt: "2026-09-09T00:00:00Z", staleAfter: "2099-01-01T00:00:00Z", lifecycle: "current",
  };
  const index = {
    communityId: "beta", communityName: "Beta", website: "https://beta.example.gov", sources: [source], factLedger: [],
    canonicalSourceLedger: { records: [{ key: `${sourceUrl}#sha256:${sourceVersion}`, canonicalUrl: sourceUrl, contentHash: sourceVersion,
      approvals: [{ status: "approved", communityId: "beta", decisionId: "beta-permit-registration", scopeKind: "scoped-claims", approvedClaims: ["permit-registration"], withheldClaims: [] }] }] },
  };
  const options = { index, communityId: "beta", answerRulesQuestion: false, planCommunitySearch: false, synthesizeCommunityAnswer: false, now: new Date("2026-09-09T12:00:00Z") };
  const approved = await answerCommunityQuestion("Where do I submit a permit form if approval is required?", options);
  assert.equal(approved.answerStatus, "verified");
  assert.match(approved.answer, /permit-portal/i);
  assert.doesNotMatch(JSON.stringify(approved), /Sterling|UtilityHawk/i);
  const changed = await answerCommunityQuestion("Where do I submit a permit form if approval is required?", { ...options, index: { ...index, sources: [{ ...source, contentHash: "d".repeat(64) }] } });
  assert.notEqual(changed.answerStatus, "verified");
  assert.doesNotMatch(changed.answer, /permit-portal/i);

  const unrelated = await answerCommunityQuestion("What fees do residents pay?", options);
  assert.doesNotMatch(unrelated.answer, /permit-portal|If your permit requires approval/i);
});

test("conditional instruction projections do not activate for unrelated fees or facilities", async () => {
  for (const question of ["What fees do residents pay?", "How do I reserve a park shelter?"]) {
    const answer = await ask(question);
    assert.doesNotMatch(answer.answer, /rain-barrel|ResidentSubmit@SterlingRanchCAB\.com/i, question);
  }
});

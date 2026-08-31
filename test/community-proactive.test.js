const assert = require("node:assert/strict");
const test = require("node:test");
const { answerCommunityQuestion, directlyAnswersQuestionForm } = require("../lib/community-assistant");
const { answerRulesQuestion } = require("../lib/rules-assistant");
const { nextDrcReview } = require("../lib/community-proactive");
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

test("approved-landscaper questions provide current examples and the official directory", async () => {
  const answer = await ask("list of approved landscapers");
  assert.equal(answer.answerMode, "community-proactive-directory");
  assert.match(answer.answer, /AAA Landscaping.*A Complete Exterior.*AGR Landscape/i);
  assert.match(JSON.stringify(answer.actions), /414\/Approved-Landscapers-List/);
  assert.match(answer.answer, /not a CAB endorsement/i);
});

test("water-usage portal questions provide the direct UtilityHawk login and capabilities", async () => {
  const answer = await ask("Internet access for water usage");
  assert.equal(answer.answerMode, "community-proactive-account");
  assert.match(answer.answer, /daily, weekly, or monthly usage thresholds/i);
  assert.match(JSON.stringify(answer.actions), /srcab\.utilityhawk\.us\/login/);
});

test("park and clubhouse rentals give prices, terms, and a live booking path", async () => {
  const park = await ask("How do I book the park?");
  assert.doesNotMatch(park.directAnswer, /^(?:yes|no)\b/i);
  assert.match(park.directAnswer, /open the official rental catalog.*choose.*select/i);
  assert.match(park.answer, /\$15 per hour/i);
  assert.match(park.answer, /playgrounds and grassy areas are not reserved exclusively/i);
  assert.match(JSON.stringify(park.actions), /secure\.rec1\.com/);

  const clubhouse = await ask("Can I rent the clubhouse?");
  assert.match(clubhouse.directAnswer, /^Yes\b/i);
  assert.match(clubhouse.answer, /\$200 minimum rental.*\$250 refundable security deposit/i);
  assert.match(clubhouse.answer, /pavilions.*\$25 per hour/i);

  const overlook = await ask("How do I reserve an Overlook space?");
  assert.equal(overlook.answerVerdict, "informational");
  assert.doesNotMatch(overlook.directAnswer, /^(?:yes|no)\b/i);
  assert.match(overlook.directAnswer, /open the live rental catalog.*choose.*select/i);

  const cost = await ask("How much does the Overlook Great Hall cost?");
  assert.match(cost.directAnswer, /\$100 per hour.*\$200 minimum.*\$250 refundable/i);
});

test("verified proactive facts can be AI-composed around the resident's actual question", async () => {
  const tailored = await askWithDraft("How do I reserve an Overlook space?", {
    directAnswer: "Open the live rental catalog, choose the Overlook space you want, and select an available date and time.",
    keyDetails: ["The Great Hall is $100 per hour with a two-hour minimum ($200 minimum rental)."],
    nextStep: "Use the live rental catalog to start the reservation.",
  });
  assert.equal(tailored.answerMode, "community-proactive-grounded-ai");
  assert.doesNotMatch(tailored.directAnswer, /^(?:yes|no)\b/i);
  assert.match(tailored.directAnswer, /^Open the live rental catalog/i);
  assert.ok(tailored.claims.every((claim) => claim.verified));
});

test("a grounded but question-mismatched AI draft falls back safely", async () => {
  const mismatched = await askWithDraft("How do I reserve an Overlook space?", {
    directAnswer: "Yes. The Great Hall is $100 per hour with a two-hour minimum ($200 minimum rental).",
    keyDetails: ["North and South outdoor pavilions are currently listed at $25 per hour."],
    nextStep: "Open the live catalog to check your date and start the reservation.",
  });
  assert.equal(mismatched.answerMode, "community-proactive-rental");
  assert.doesNotMatch(mismatched.directAnswer, /^(?:yes|no)\b/i);
  assert.match(mismatched.directAnswer, /open the live rental catalog.*choose.*select/i);
});

test("trash-return questions combine the collection page with the storage rule", async () => {
  const answer = await ask("When do I need to bring my recycling cans in?");
  assert.equal(answer.answerMode, "community-proactive-trash-storage");
  assert.match(answer.answer, /by the end of pickup day/i);
  assert.match(answer.answer, /screened storage location/i);
});

test("generic DRC submission questions give the destination, form, and next normal deadline", async () => {
  const answer = await ask("I need to submit something to the DRC. How do I do that?");
  assert.equal(answer.answerMode, "community-proactive-drc");
  assert.match(answer.answer, /residentsubmit@sterlingranchcab\.com/i);
  assert.match(answer.answer, /Friday, September 11, 2026.*Thursday, September 17, 2026/i);
  assert.match(JSON.stringify(answer.actions), /201\/Design-Review-Documents/);
  assert.deepEqual(nextDrcReview(new Date("2026-08-31T18:00:00Z")), { meeting: "2026-09-17", deadline: "2026-09-11" });
});

test("watering and seasonal-light answers state what the date means now", async () => {
  const watering = await ask("When am I allowed to water my lawn?");
  assert.match(watering.answer, /currently in effect.*not allowed right now/i);
  const lights = await ask("When can I put up holiday lights?");
  assert.match(lights.answer, /not currently.*next allowed window begins October 1/i);
});

test("tap-fee, water-rate, and delinquency answers offer a calculation follow-up", async () => {
  assert.match((await ask("What are utility tap fees?")).answer, /property type, lot size, meter size/i);
  assert.match((await ask("What are water rates?")).answer, /usage is indoor or outdoor.*gallons/i);
  assert.match((await ask("What happens if I do not pay my water bill?")).answer, /Tell me the due date.*calculate/i);
});

test("question-form checks require the requested value in the opening answer", async () => {
  const fees = await ask("How much are trash and streetlight fees?");
  assert.match(fees.directAnswer, /streetlight is \$9\.90.*trash is \$14\.17/i);
  assert.equal(directlyAnswersQuestionForm("How much are trash and streetlight fees?", fees), true);

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

  const upgraded = await ask("list of approved landscapers");
  assert.equal(residentEffortAssessment("list of approved landscapers", upgraded).score, 5);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const { proactiveCommunityAnswer } = require("../lib/community-proactive");
const { answerRulesQuestion } = require("../lib/rules-assistant");
const { answerCommunityQuestion } = require("../lib/community-assistant");
const index = require("../data/community-index.json");
const { normalizeInterpretation } = require("../lib/community-interpretation");

test("non-payment consequences cannot gain a payment-action detail", () => {
  const base = {intent:"rules",goal:"information",goals:["information"],subject:"water bill non-payment",searchQueries:["late bill consequences"],requestedDetails:["action"]};
  assert.deepEqual(normalizeInterpretation(base,"What happens if I do not pay my water bill?").requestedDetails,[]);
});

test("raw landscape packet prose cannot create an application shortcut", () => {
  for (const question of ["Landscaping application", "Where do I submit my yard landscaping form?", "How do I apply for irrigation approval?"]) {
    const answer=proactiveCommunityAnswer(question,{index,now:new Date("2026-09-06T20:00:00Z")});
    assert.equal(answer, null);
  }
  assert.equal(proactiveCommunityAnswer("What is the landscaping application fee?",{index}),null);
});

test("invented open-ended dates cannot narrow a general process or recurring schedule", () => {
  const base = { intent: "services", goal: "schedule", goals: ["schedule"], subject: "trash collection", searchQueries: ["trash collection"], requestedDetails: ["date"] };
  for (const kind of ["open", "open-ended"]) {
    const plan = normalizeInterpretation({ ...base, dateRange: { kind, start: "2026-09-06", end: "2026-12-31" } }, "What day is trash collected?", { now: new Date("2026-09-06") });
    assert.equal(plan.dateRange, null);
  }
});

test("owner-approved establishment billing evidence answers only the narrow treatment", async () => {
  for (const question of [
    "Can i get a discount on my water while trying to establish plants",
    "Are water charges reduced for new sod?",
    "Is there a water budget exemption when establishing my lawn?",
    "Is establishment water free?",
  ]) {
    const answer = await answerCommunityQuestion(question, {
      index,
      answerRulesQuestion,
      rulesOptions: { searchMode: "legacy", llmMode: "off" },
      planCommunitySearch: false,
      synthesizeCommunityAnswer: false,
      isTest: true,
      requestContractMode: "need-first-candidate",
      needRouterBackend: "current-local",
    });
    assert.equal(answer.completion.outcome, "complete");
    assert.match(answer.answer, /45 days.*first tier fee rate.*not count against the water budget/is);
    assert.doesNotMatch(answer.answer, /\bfree\b|\$\s*\d/);
  }
});

test("park-pass reimbursement uses the approved form without inventing policy", async () => {
  for (const question of ["Reimburse for parks pass", "How do I get reimbursed for a state park pass?"]) {
    const answer = await answerCommunityQuestion(question, {
      index,
      answerRulesQuestion,
      rulesOptions: { searchMode: "legacy", llmMode: "off" },
      planCommunitySearch: false,
      synthesizeCommunityAnswer: false,
      isTest: true,
      requestContractMode: "need-first-candidate",
      needRouterBackend: "current-local",
    });
    assert.equal(answer.completion.outcome, "complete");
    assert.match(answer.answer, /^Use the official Park Pass Car Registration Reimbursement Form below\./i);
    assert.match(answer.answer, /vehicle registration receipt/i);
    assert.equal(answer.actions[0].url, "https://sterlingranchcab.com/FormCenter/Parks-Passes-9/Park-Pass-Reimbursement-Form-62");
    assert.doesNotMatch(answer.answer, /\$\s*\d|eligible|guarantee/i);
  }
});

test("an exact establishment rate request keeps the known treatment and withholds unrelated fees", async () => {
  const answer = await answerCommunityQuestion("What is the exact rate for water while establishing new sod?", {
    index,
    answerRulesQuestion,
    rulesOptions: { searchMode: "legacy", llmMode: "off" },
    planCommunitySearch: false,
    synthesizeCommunityAnswer: false,
    isTest: true,
    requestContractMode: "need-first-candidate",
    needRouterBackend: "current-local",
  });
  assert.equal(answer.completion.outcome, "verified-partial");
  assert.match(answer.answer, /45 days.*first tier fee rate.*not count against the water budget/is);
  assert.match(answer.answer, /couldn.t verify.*price/i);
  assert.doesNotMatch(answer.answer, /2\.95%|processing fee/i);
});

test("an exact park-pass amount request leads with the missing amount and keeps the useful form", async () => {
  const answer = await answerCommunityQuestion("What is the exact dollar amount of the park-pass reimbursement?", {
    index,
    answerRulesQuestion,
    rulesOptions: { searchMode: "legacy", llmMode: "off" },
    planCommunitySearch: false,
    synthesizeCommunityAnswer: false,
    isTest: true,
    requestContractMode: "need-first-candidate",
    needRouterBackend: "current-local",
  });
  assert.equal(answer.completion.outcome, "verified-partial");
  assert.match(answer.directAnswer, /^I couldn’t verify a reimbursement amount/i);
  assert.match(answer.answer, /Park Pass Car Registration Reimbursement Form/i);
  assert.match(answer.answer, /vehicle registration receipt/i);
  assert.doesNotMatch(answer.answer, /\$\s*\d|eligible|guarantee/i);
});

test("establishment billing is not invented from missing or expired evidence", () => {
  const question = "Water discount for new turf?";
  assert.equal(proactiveCommunityAnswer(question, { index: { sources: [] } }), null);
  const expired = { sources: index.sources.map(source => ({ ...source, staleAfter: "2000-01-01" })) };
  assert.equal(proactiveCommunityAnswer(question, { index: expired }), null);
  assert.equal(proactiveCommunityAnswer("What happens if my water bill is unpaid?", { index }), null);
});

test("a complete rules answer avoids a redundant AI search after shared interpretation", async () => {
  let plannerCalls = 0;
  const answer = await answerRulesQuestion("How many months do I have to finish my backyard?", {
    searchMode: "ai-hybrid", llmMode: "off",
    interpretation: { intent: "rules", needsClarification: false },
    planRulesSearch: async () => { plannerCalls++; return null; },
  });
  assert.equal(plannerCalls, 0);
  assert.equal(answer.searchStrategy, "shared-interpretation-strong-match");
  assert.match(answer.answer, /120/);
  assert.ok(answer.sources.length);
});

test("unpaid water bills retain their collection-policy answer", async () => {
  const answer = await answerRulesQuestion("What happens if I do not pay my water bill?", { searchMode: "legacy", llmMode: "off" });
  assert.match(answer.answer, /past.due|unpaid|late.fee|disconnection/i);
  assert.doesNotMatch(answer.answer, /45.day establishment/i);
});

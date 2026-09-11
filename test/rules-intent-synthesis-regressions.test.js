const test = require("node:test");
const assert = require("node:assert/strict");

const { answerRulesQuestion } = require("../lib/rules-assistant");
const { llmRewriteIssues } = require("../lib/rules-grounding");
const { isPlantPermissionQuestion } = require("../lib/rules-intent");

const answerWithoutAi = (question) => answerRulesQuestion(question, {
  searchMode: "legacy",
  llmMode: "off",
});

test("a location word cannot replace the plant that the resident is asking about", async () => {
  for (const question of [
    "Can I plant raspberry bushes along my fence line?",
    "Are raspberry plants allowed by a fence?",
    "In general, can I have vine plants like raspberries?",
    "Could I grow a berry bush beside my wall?",
  ]) {
    const result = await answerWithoutAi(question);
    assert.match(result.sources?.[0]?.title || "", /Preapproved plant list/i, question);
    assert.doesNotMatch(result.sources?.[0]?.title || "", /Fencing standards/i, question);
    assert.doesNotMatch(result.answer, /Fence questions are covered/i, question);
  }
});

test("plant routing does not capture tree-house or fence-primary questions", () => {
  for (const question of [
    "Can I have a tree house?",
    "Can I have a fence around my plants?",
    "Can I put up a trellis beside my raspberry bushes?",
    "What fence can I use to protect my berry bushes?",
  ]) {
    assert.equal(isPlantPermissionQuestion(question), false, question);
  }
  assert.equal(isPlantPermissionQuestion("Can I grow lavender by my fence?"), true);
  assert.equal(isPlantPermissionQuestion("Are raspberry bushes permitted along a wall?"), true);
});

test("plant routing yields to garden projects and dead-tree maintenance obligations", () => {
  for (const question of [
    "Can I plant a vegetable garden?",
    "Can I install garden boxes behind my house?",
    "Can I put up a raised garden in my yard?",
    "Do I need permission to replant a dead tree?",
    "Do I have to replace a dead tree in the tree lawn?",
  ]) {
    assert.equal(isPlantPermissionQuestion(question), false, question);
  }
});

test("garden projects and dead-tree obligations reach their controlling clauses", async () => {
  const garden = await answerWithoutAi("Can I plant a vegetable garden?");
  assert.match(garden.sources?.[0]?.title || "", /Sec\. 21-22/i);
  assert.match(garden.answer, /DRC approval/i);
  assert.match(garden.answer, /rear or side yard/i);
  assert.match(garden.answer, /five feet/i);

  for (const question of [
    "Do I need permission to replant a dead tree?",
    "Do I have to replace a dead tree in the tree lawn?",
  ]) {
    const result = await answerWithoutAi(question);
    assert.ok(result.sources?.some((source) => /Sec\. 9-146|Sec\. 21-22/i.test(source.title || "")), question);
    assert.match(result.answer, /dead trees must be replaced/i, question);
    assert.match(result.answer, /two-inch caliper/i, question);
    assert.match(result.answer, /DRC approval/i, question);
  }
});

test("an unapproved service request stays withheld instead of regaining a canned resource answer", async () => {
  for (const question of [
    "What is Atlas WiFi?",
    "What is atlas coffee wifi?",
    "What is the Atlas coffee WiFi?",
  ]) {
    const result = await answerWithoutAi(question);
    assert.equal(result.confidence?.canAnswer, false, question);
    assert.equal(result.confidence?.reason, "no-single-source-support", question);
    assert.equal(result.answerMode, "source-evidence-boundary", question);
    assert.deepEqual(result.sources, [], question);
    assert.doesNotMatch(result.answer, /publish current access details|password|network name|access code/i, question);
  }
});

test("specific plant evidence comes from the selected source instead of answer code", async () => {
  const result = await answerWithoutAi("Can I grow raspberries near my property line?");
  assert.match(result.answer, /Boulder Raspberry/i);
  assert.match(result.sources?.[0]?.excerpt || "", /Boulder Raspberry/i);
  assert.match(result.sources?.[0]?.excerpt || "", /Shrub/i);
});

test("supported answers of different families all use the shared synthesis path", async () => {
  for (const question of [
    "When can I put up holiday lights?",
    "What trees can I plant?",
    "What are the rules for yard art?",
    "What are the landscaping and yard rules?",
  ]) {
    let calls = 0;
    const result = await answerRulesQuestion(question, {
      searchMode: "legacy",
      llmMode: "selective",
      rewriteAnswerWithLLM: async (_residentQuestion, draft) => {
        calls += 1;
        return draft.replace(/^Short answer:\s*/i, "");
      },
    });
    assert.equal(calls, 1, question);
    assert.match(result.answerMode || "", /llm-selective/i, question);
  }
});

test("successful AI synthesis uses natural prose and retains every sourced holiday-light limit", async () => {
  const naturalAnswer = "You can install and use seasonal decorative lights from June 18 to July 7 and from October 1 through January 31. Turn them off by 10:00 p.m., and remove all temporary strings and clips afterward.";
  const result = await answerRulesQuestion("When can I put up holiday lights?", {
    searchMode: "legacy",
    llmMode: "selective",
    rewriteAnswerWithLLM: async () => naturalAnswer,
  });
  assert.equal(result.answer, naturalAnswer);
  assert.doesNotMatch(result.answer, /Short answer|What I found|Before you act/i);
  assert.match(result.answer, /June 18/i);
  assert.match(result.answer, /July 7/i);
  assert.match(result.answer, /October 1/i);
  assert.match(result.answer, /January 31/i);
  assert.match(result.answer, /10:00 p\.m\./i);
});

test("source-built fallback uses natural prose and retains every sourced holiday-light limit", async () => {
  const result = await answerRulesQuestion("When can I put up holiday lights?", {
    searchMode: "legacy",
    llmMode: "selective",
    rewriteAnswerWithLLM: async () => null,
  });
  assert.doesNotMatch(result.answer, /Short answer|What I found|Before you act/i);
  assert.match(result.answer, /June 18/i);
  assert.match(result.answer, /July 7/i);
  assert.match(result.answer, /October 1/i);
  assert.match(result.answer, /January 31/i);
  assert.match(result.answer, /10:00 p\.m\./i);
});

test("natural synthesis may remove scaffolding but cannot drop sourced limits", () => {
  const sources = [{
    title: "Current source",
    text: "The period is June 18 to July 7. The daily cutoff is 10:00 p.m.",
  }];
  const draft = "Short answer: The period is June 18 to July 7.\n\nWhat I found:\n- The daily cutoff is 10:00 p.m.";
  assert.deepEqual(
    llmRewriteIssues("You can use it from June 18 to July 7, with a 10:00 p.m. cutoff.", draft, sources),
    []
  );
  assert.match(
    llmRewriteIssues("You can use it from June 18 to July 7.", draft, sources).join(" "),
    /10:00 p\.m/i
  );
});

test("natural synthesis cannot drop sourced examples that were carried in bullets", () => {
  const sources = [{
    title: "Current plant list",
    text: "Low-water trees include Thornless Cockspur Hawthorn and Blue Point Juniper. Moderate-water trees include Freeman Maple and Amur Maple.",
  }];
  const draft = "Short answer: The source groups approved trees by water need.\n\nWhat I found:\n- Low-water examples include Thornless Cockspur Hawthorn and Blue Point Juniper.\n- Moderate-water examples include Freeman Maple and Amur Maple.";
  assert.deepEqual(
    llmRewriteIssues("The approved list includes Thornless Cockspur Hawthorn, Blue Point Juniper, Freeman Maple, and Amur Maple, grouped by water need.", draft, sources),
    []
  );
  assert.match(
    llmRewriteIssues("The approved list groups trees by water need.", draft, sources).join(" "),
    /proper noun.*dropped/i
  );
});

test("broad overviews retain every available evidence facet before synthesis", async () => {
  const landscape = await answerWithoutAi("Give me an overview of the landscaping and yard requirements");
  for (const fact of [
    /submitted for review and approval/i,
    /front yard design and installation/i,
    /backyard landscaping/i,
    /underground irrigation system/i,
    /kept healthy/i,
  ]) assert.match(landscape.answer, fact);

  const parks = await answerWithoutAi("What should I know about the rules for parks and open spaces?");
  for (const fact of [
    /open from .*a\.m\..*p\.m\./i,
    /must leash/i,
    /motorized vehicles are prohibited/i,
    /glass containers, littering, dumping/i,
    /fires are only permitted/i,
    /swimming or the use of watercraft/i,
    /camping in any CAB Park/i,
  ]) assert.match(parks.answer, fact);
});

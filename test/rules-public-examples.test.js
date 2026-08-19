const test = require("node:test");
const assert = require("node:assert/strict");

const { answerRulesQuestion } = require("../lib/rules-assistant");

const EXAMPLES = [
  {
    question: "Can I build a shed in my backyard?",
    verdict: "conditional",
    includes: ["DRC approval", "150 square feet", "Utilities must run underground"],
  },
  {
    question: "When can I put up holiday lights?",
    verdict: "allowed",
    includes: ["June 18", "July 7", "October 1", "January 31", "10:00 p.m."],
  },
  {
    question: "What are the landscaping and yard rules?",
    verdict: "conditional",
    includes: ["DRC review", "Yard design", "Ongoing care"],
  },
  {
    question: "What fees do residents pay?",
    verdict: "verified",
    includes: ["fixed charges", "Charges that depend on usage", "home type"],
  },
  {
    question: "What are the rules for parks and open spaces?",
    verdict: "verified",
    includes: ["Dogs:", "motorized vehicles", "CAB fishing permit"],
  },
];

for (const example of EXAMPLES) {
  test(`public example stays useful: ${example.question}`, async () => {
    const result = await answerRulesQuestion(example.question);
    assert.equal(result.confidence?.canAnswer, true);
    assert.equal(result.answerVerdict, example.verdict);
    assert.ok(result.answer.length <= 1000, `Answer is ${result.answer.length} characters long.`);
    assert.doesNotMatch(result.answer, /I (?:do not|don't) have enough information/i);
    assert.doesNotMatch(result.answer, /\.\.\.|-- \d+ of \d+ --|WHEREAS|ADOPTED AND APPROVED/i);
    assert.match(result.answer, /^Short answer:/);
    assert.match(result.answer, /\n\nWhat I found:/);
    assert.match(result.answer, /\n\nBefore you act:/);
    for (const phrase of example.includes) {
      assert.ok(
        result.answer.toLowerCase().includes(phrase.toLowerCase()),
        `Expected answer to include "${phrase}".`
      );
    }
    const longestLine = Math.max(...result.answer.split("\n").map((line) => line.length));
    assert.ok(longestLine <= 260, `A resident-facing line is ${longestLine} characters long.`);
  });
}

test("public example questions in the page are covered by the regression suite", async () => {
  const fs = require("node:fs/promises");
  const path = require("node:path");
  const html = await fs.readFile(
    path.join(__dirname, "..", "public", "rules-assistant.html"),
    "utf8"
  );
  const buttons = [...html.matchAll(/<button type="button">([^<]+)<\/button>/g)].map(
    (match) => match[1].trim()
  );
  assert.deepEqual(buttons, EXAMPLES.map((example) => example.question));
  assert.match(html, /rules-assistant\.js\?v=20260818-readable-examples/);
});

test("park and amenity booking questions use the reservation process", async () => {
  for (const question of [
    "How do I book the park?",
    "Can I reserve a park shelter?",
    "How do I rent a pavilion?",
    "Where do I book the clubhouse?",
  ]) {
    const result = await answerRulesQuestion(question);
    assert.equal(result.confidence?.canAnswer, true, question);
    assert.doesNotMatch(result.answer, /I (?:do not|don't) have enough information/i);
    assert.match(result.answer, /Facilities Rental Application and Agreement/i);
    assert.match(result.answer, /first-come, first-served/i);
    assert.ok(
      result.sources.some((source) => /Amenity Rentals/i.test(source.title || "")),
      `${question} should link the official Amenity Rentals page.`
    );
  }
});

test("unseen everyday wording maps to the reusable facility-reservation concept", async () => {
  for (const question of [
    "I want to hold a birthday party at a park shelter. What paperwork do I need?",
    "What is the process for using a pavilion for an event?",
    "Where do I sign up to use a CAB facility?",
  ]) {
    const result = await answerRulesQuestion(question);
    assert.equal(result.confidence?.canAnswer, true, question);
    assert.match(result.confidence?.reason || "", /semantic-concept-supported:facility-reservations/);
    assert.match(result.answer, /Facilities Rental Application and Agreement/i);
    assert.ok(
      result.sources.some((source) => /17-188|Reservation process/i.test(source.title || "")),
      `${question} should retrieve the reservation process without an exact-question route.`
    );
  }
});

test("the same concept layer distinguishes cancellations from new bookings", async () => {
  const result = await answerRulesQuestion("How do I cancel a clubhouse rental and get a refund?");
  assert.equal(result.confidence?.canAnswer, true);
  assert.match(result.confidence?.reason || "", /semantic-concept-supported:rental-cancellations/);
  assert.match(result.answer, /current Rental Agreement/i);
  assert.match(result.sources[0]?.title || "", /17-196|Cancellation and refund policy/i);
});

test("compound questions keep a grounded source for each requested topic", async () => {
  let rewriteSources = [];
  const result = await answerRulesQuestion("Can I add a fence and a shed?", {
    llmMode: "selective",
    rewriteAnswerWithLLM: async (_question, _draft, sources) => {
      rewriteSources = sources;
      return "Short answer: Both projects have rules.\n\nWhat I found:\n- Fence source included.\n- Shed source included.\n\nBefore you act: Review both linked sections.";
    },
  });
  assert.equal(result.confidence?.canAnswer, true);
  assert.ok(rewriteSources.some((source) => /fenc/i.test(source.title || "")));
  assert.ok(rewriteSources.some((source) => /shed/i.test(source.title || "")));
  assert.match(result.answerMode || "", /llm-selective/);
});

test("compound questions keep every topic when the AI rewrite is rejected", async () => {
  const result = await answerRulesQuestion("Can I add a fence and a shed?", {
    llmMode: "selective",
    rewriteAnswerWithLLM: async () => null,
  });
  assert.equal(result.confidence?.canAnswer, true);
  assert.match(result.answer, /Fence:/i);
  assert.match(result.answer, /Shed:/i);
  assert.match(result.answer, /separate projects with separate requirements/i);
  assert.match(result.answerMode || "", /source-derived-extractive/);
});

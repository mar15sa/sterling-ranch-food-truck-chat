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

const test = require("node:test");
const assert = require("node:assert/strict");
const { scoreCommunityAnswer } = require("../lib/community-answer-quality");

function source(title) {
  return { title, sourceUrl: "https://sterlingranchcab.com/example", text: title };
}

test("a source-backed answer can still rate weak when it misses the question", () => {
  const result = scoreCommunityAnswer("what time is the latest i can do a firepit fire", {
    answer: "Short answer: Permanent outdoor fireplaces and fire pits require DRC approval.\n\nBefore you act: Use these current source details for planning, and open the linked section if you need the complete wording.",
    directAnswer: "Permanent outdoor fireplaces and fire pits require DRC approval.",
    answerMode: "source-derived-extractive",
    answerVerdict: "conditional",
    confidence: { canAnswer: true, reason: "supported" },
    sources: [source("Fire pit approval rules")],
  });
  assert.equal(result.rating, "Weak");
  assert.ok(result.issues.includes("requested-time-missing"));
});

test("a well-sourced handoff rates weak when it does not answer a planned-project question", () => {
  const result = scoreCommunityAnswer("are they building a new pool?", {
    answer: "Short answer: The cited pool rules don't cover new construction or planned pool projects.\n\nWhat I found:\n- The rules only address the existing pool.\n\nBefore you act: Check the community's capital plans, contact the CAB directly, or ask at a community meeting.",
    directAnswer: "The cited pool rules don't cover new construction or planned pool projects.",
    answerMode: "grounded-ai-fallback",
    answerVerdict: "verified",
    confidence: { canAnswer: true, reason: "grounded-ai-source-synthesis" },
    sources: [source("Existing pool rules")],
  });
  assert.equal(result.rating, "Weak");
  assert.ok(result.issues.includes("question-unresolved"));
});

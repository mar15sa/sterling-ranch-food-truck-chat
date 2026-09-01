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
  assert.equal(result.residentEffort.rating, "High resident effort");
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
  assert.equal(result.residentEffort.rating, "High resident effort");
});

test("a pool-opening answer rates weak when the resident asked about construction", () => {
  const result = scoreCommunityAnswer("are they building a new community pool?", {
    answer: "Short answer: Open. The pool is currently open for homeowners and guests.\n\nBefore you act: Normal entry rules still apply.",
    directAnswer: "Open. The pool is currently open for homeowners and guests.",
    answerMode: "community-live-status",
    answerVerdict: "informational",
    confidence: { canAnswer: true, reason: "official-source-supported" },
    sources: [source("Official pool status")],
  });
  assert.equal(result.rating, "Weak");
  assert.ok(result.issues.includes("planned-project-answer-missing"));
  assert.equal(result.residentEffort.rating, "High resident effort");
});

test("a no-mention handoff is weak because absence from retrieved sources is not an answer", () => {
  const result = scoreCommunityAnswer("are they building a new community pool?", {
    answer: "Short answer: The sources don't mention any new community pool being built. They only describe the existing pool.\n\nBefore you act: Contact the Community Authority through its General Inquiries form about future construction plans.",
    directAnswer: "The sources don't mention any new community pool being built. They only describe the existing pool.",
    answerMode: "grounded-ai-fallback",
    answerVerdict: "verified",
    confidence: { canAnswer: true, reason: "grounded-ai-source-synthesis" },
    sources: [source("Existing pool rules")],
  });
  assert.equal(result.rating, "Weak");
  assert.ok(result.issues.includes("question-unresolved"));
  assert.equal(result.residentEffort.rating, "High resident effort");
});

test("a clear statement that the rules set no latest time resolves a time question", () => {
  const result = scoreCommunityAnswer("what time is the latest I can use my firepit?", {
    answer: "Short answer: The rules don't set a latest time for firepit use.\n\nWhat I found:\n- Approval and safety rules apply.",
    directAnswer: "The rules don't set a latest time for firepit use.",
    answerMode: "community-grounded-ai",
    answerVerdict: "verified",
    confidence: { canAnswer: true, reason: "supported" },
    sources: [source("Fire pit rules")],
  });
  assert.ok(!result.issues.includes("requested-time-missing"));
});

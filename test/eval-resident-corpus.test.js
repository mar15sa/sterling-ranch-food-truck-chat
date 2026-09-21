const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isExpectedEvidenceBoundaryHold,
  ratingFor,
} = require("../scripts/eval-resident-corpus");

function atlasHold(overrides = {}) {
  return {
    answer: "I don't have enough approved evidence to answer that confidently.",
    answerMode: "source-evidence-boundary",
    confidence: { canAnswer: false, confidence: "low", reason: "no-single-source-support" },
    sources: [],
    claims: [],
    ...overrides,
  };
}

test("Atlas evidence boundaries remain scored after approved WiFi evidence is added", () => {
  for (const question of ["What is atlas coffee wifi?", "What is atlas wifi"]) {
    assert.equal(isExpectedEvidenceBoundaryHold(question, atlasHold()), false, question);
  }
});

test("unexpected or unsafe holds remain scored", () => {
  assert.equal(isExpectedEvidenceBoundaryHold("What are the quiet hours?", atlasHold()), false);
  assert.equal(isExpectedEvidenceBoundaryHold("What is atlas wifi", atlasHold({
    sources: [{ title: "Unrelated source" }],
  })), false);
  assert.equal(isExpectedEvidenceBoundaryHold("What is atlas wifi", atlasHold({
    confidence: { canAnswer: false, confidence: "low", reason: "weak-query-coverage" },
  })), false);
  assert.equal(isExpectedEvidenceBoundaryHold("What is atlas wifi", atlasHold({
    answerMode: "official-resource",
    confidence: { canAnswer: true, confidence: "high", reason: "official-resource-boundary" },
  })), false);
});

test("a normal weak answer still receives a failing resident-quality rating", () => {
  const weak = atlasHold({
    answer: "I don't have enough evidence. Try rephrasing.",
    sources: [{ title: "Unrelated source", excerpt: "Unrelated evidence" }],
  });
  assert.equal(ratingFor("What are the quiet hours?", weak), 2);
});

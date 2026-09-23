const assert = require("node:assert/strict");
const test = require("node:test");

const { shouldRecordRulesLowConfidence } = require("../lib/rules-alerts");

const uncertainAnswer = {
  confidence: { canAnswer: false },
  answerStatus: "unverified",
};

test("test-labeled uncertain answer families never create owner review alerts", () => {
  for (const questionFamily of [
    "food-truck live connector failure",
    "community service ambiguity",
    "internet activation evidence",
    "facility access source review",
    "water billing source review",
  ]) {
    assert.equal(
      shouldRecordRulesLowConfidence(
        { ...uncertainAnswer, questionFamily },
        { isTest: true, logBoundary: "explicit-test-request" }
      ),
      false,
      questionFamily
    );
  }
});

test("deployment-labeled staging questions also stay out of owner alerts", () => {
  assert.equal(
    shouldRecordRulesLowConfidence(uncertainAnswer, {
      isTest: true,
      logBoundary: "railway-staging-environment",
    }),
    false
  );
});

test("real resident uncertainty still creates an owner review alert", () => {
  assert.equal(shouldRecordRulesLowConfidence(uncertainAnswer, { isTest: false }), true);
  assert.equal(shouldRecordRulesLowConfidence(uncertainAnswer), true);
});

test("only the explicit boolean test marker suppresses alerts", () => {
  assert.equal(shouldRecordRulesLowConfidence(uncertainAnswer, { isTest: "true" }), true);
});

test("known non-review and safety answers remain suppressed", () => {
  assert.equal(
    shouldRecordRulesLowConfidence({ ...uncertainAnswer, reviewNeeded: false }),
    false
  );
  assert.equal(
    shouldRecordRulesLowConfidence({ ...uncertainAnswer, answerStatus: "safety-rejected" }),
    false
  );
});

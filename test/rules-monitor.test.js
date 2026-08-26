const test = require("node:test");
const assert = require("node:assert/strict");

const {
  deploymentHealthState,
  evaluateRuleResult,
  freshnessRecheckIssue,
  shouldRetrySlowResponse,
} = require("../lib/rules-monitor");

function goodResult(overrides = {}) {
  return {
    answer: "Short answer: Yes. The current rule is satisfied.",
    answerVerdict: "allowed",
    answerMode: "source-derived-structured",
    confidence: { canAnswer: true, confidence: "high", reason: "source-validated-topic-answer" },
    inputClassification: "rules-question",
    monitorDurationMs: 500,
    sourceStatus: { inlineTopicCount: 120 },
    sources: [{ title: "Current official rule" }],
    ...overrides,
  };
}

test("monitor distinguishes healthy, refreshing, and failed deployments", () => {
  assert.equal(deploymentHealthState(true, { status: "ok", rules: { inlineTopicCount: 120, isStale: false } }), "healthy");
  assert.equal(deploymentHealthState(true, { status: "ok", rules: { inlineTopicCount: 120, isStale: true } }), "refreshing");
  assert.equal(deploymentHealthState(false, { status: "ok", rules: { inlineTopicCount: 120 } }), "failed");
  assert.equal(deploymentHealthState(true, { status: "ok", rules: { inlineTopicCount: 20 } }), "failed");
});

test("monitor retries only slow responses", () => {
  assert.equal(shouldRetrySlowResponse(5001), true);
  assert.equal(shouldRetrySlowResponse(5000), false);
});

test("a recovered cold response passes and a persistently slow response fails", () => {
  const check = { answerIncludes: ["current rule"], expectedVerdict: "allowed" };
  assert.deepEqual(evaluateRuleResult(check, goodResult({ monitorDurationMs: 800 }), { firstDurationMs: 9000 }), []);
  assert.match(evaluateRuleResult(check, goodResult({ monitorDurationMs: 7000 }), { firstDurationMs: 9000 }).join(" "), /remained slow/i);
});

test("monitor catches stale counts, raw excerpts, missing answer details, and source mismatches", () => {
  const issues = evaluateRuleResult(
    { answerIncludes: ["missing detail"], firstSourceIncludes: "Expected", maxAnswerLength: 1000 },
    goodResult({ answer: "WHEREAS ...", sourceStatus: { inlineTopicCount: 2 } })
  );
  assert.match(issues.join(" "), /answer is missing/i);
  assert.match(issues.join(" "), /expected first source/i);
  assert.match(issues.join(" "), /raw-document artifacts/i);
  assert.match(issues.join(" "), /indexed topic cards/i);
});

test("safety checks validate classification, reason, mode, and empty sources", () => {
  const issues = evaluateRuleResult(
    { expectedClassification: "prompt-injection", expectedReason: "prompt-injection-rejected", expectedAnswerMode: "safety", expectedNoSources: true },
    goodResult({ inputClassification: "rules-question", answerMode: "normal", confidence: { reason: "wrong" } })
  );
  assert.equal(issues.length, 4);
});

test("freshness recheck fails closed until sources are current", () => {
  assert.match(freshnessRecheckIssue(true, { status: "ok", rules: { isStale: true } }), /remained stale/i);
  assert.match(freshnessRecheckIssue(false, { status: "ok", rules: { isStale: false } }), /remained stale/i);
  assert.equal(freshnessRecheckIssue(true, { status: "ok", rules: { isStale: false } }), "");
});

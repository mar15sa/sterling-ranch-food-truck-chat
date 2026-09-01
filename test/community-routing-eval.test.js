const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const cases = require("../data/community-routing-benchmark.json");
const { communityAnswerMetrics, privacyFingerprint, recordCommunityAnswer } = require("../lib/community-observability");
const { ROUTING_THRESHOLDS, evaluateRoutingResult, releaseFailures, summarizeRoutingRuns } = require("../scripts/eval-community-routing-live");

test("routing benchmark covers every supported goal plus prompt injection", () => {
  const expectedGoals = new Set(["permission", "payment", "booking", "application", "registration", "account-access", "contact", "cost", "schedule", "status", "information"]);
  const counts = new Map();
  for (const item of cases) {
    assert.ok(item.id && item.question, "Every routing case needs a stable id and question.");
    if (item.expectedGoal) counts.set(item.expectedGoal, (counts.get(item.expectedGoal) || 0) + 1);
  }
  assert.deepEqual(new Set(counts.keys()), expectedGoals);
  for (const goal of expectedGoals) assert.ok(counts.get(goal) >= 3, `${goal} needs at least three cases.`);
  assert.ok(cases.filter((item) => item.expectedClassification === "prompt-injection").length >= 4);
  assert.equal(new Set(cases.map((item) => item.id)).size, cases.length);
});

test("routing scorer checks goal, subject, intent, consistency, and safety independently", () => {
  const payment = cases.find((item) => item.id === "payment-water");
  const correct = evaluateRoutingResult(payment, { accepted: true, classification: "rules-question", plan: { goal: "payment", intent: "services", subject: "water bill" } });
  assert.equal(correct.correct, true);
  const wrongGoal = evaluateRoutingResult(payment, { accepted: true, plan: { goal: "information", intent: "services", subject: "water bill" } });
  assert.equal(wrongGoal.goalCorrect, false);
  const injection = cases.find((item) => item.expectedClassification === "prompt-injection");
  assert.equal(evaluateRoutingResult(injection, { accepted: false, classification: "prompt-injection", plan: null }).correct, true);

  const testCases = [payment, cases.find((item) => item.id === "cost-resident-fees")];
  const responses = [
    { accepted: true, plan: { goal: "payment", intent: "services", subject: "water bill" } },
    { accepted: true, plan: { goal: "cost", intent: "services", subject: "resident fees" } },
    { accepted: true, plan: { goal: "information", intent: "services", subject: "water bill" } },
    { accepted: true, plan: { goal: "cost", intent: "services", subject: "resident fees" } },
  ];
  const runs = responses.map((response, index) => {
    const testCase = testCases[index % 2];
    return { testCase, response, assessment: evaluateRoutingResult(testCase, response) };
  });
  const summary = summarizeRoutingRuns(testCases, runs, 2);
  assert.equal(summary.consistency, 0.5);
  assert.deepEqual(summary.driftCaseIds, ["payment-water"]);
  assert.ok(releaseFailures(summary, ROUTING_THRESHOLDS).some((failure) => /consistency/i.test(failure)));
});

test("production routing visibility detects drift without retaining question text", () => {
  const before = communityAnswerMetrics();
  const baseAnswer = { answerMode: "community-grounded-ai", answerStatus: "verified", communityIntent: "services", confidence: { confidence: "high", canAnswer: true }, sources: [], claims: [], routingDecision: "ai-planned" };
  recordCommunityAnswer({ answer: { ...baseAnswer, routingPlan: { goal: "payment", intent: "services", subject: "water bill" } }, resolvedQuestion: "private payment wording", durationMs: 10 });
  recordCommunityAnswer({ answer: { ...baseAnswer, routingPlan: { goal: "information", intent: "services", subject: "water bill consequences" } }, resolvedQuestion: "private payment wording", durationMs: 10 });
  const after = communityAnswerMetrics();
  const trace = after.recent.at(-1);
  assert.equal(after.routingGoalDrifts, before.routingGoalDrifts + 1);
  assert.ok(Date.parse(after.lastRoutingGoalDriftAt));
  assert.equal(Object.hasOwn(trace, "question"), false);
  assert.equal(Object.hasOwn(trace, "subject"), false);
  assert.match(trace.questionFingerprint, /^[a-f0-9]{16}$/);
  assert.equal(privacyFingerprint("Same wording"), privacyFingerprint("same wording"));
  assert.notEqual(privacyFingerprint("Same wording"), privacyFingerprint("different wording"));
});

test("staging-only real-model endpoint and scheduled benchmark stay wired", () => {
  const root = path.join(__dirname, "..");
  const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
  const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "community-routing-quality.yml"), "utf8");
  assert.match(server, /RAILWAY_ENVIRONMENT_NAME[\s\S]*staging/);
  assert.match(server, /\/api\/community\/route-eval/);
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /COMMUNITY_ROUTING_REPEATS:\s*3/);
  assert.match(workflow, /community:routing:live/);
});

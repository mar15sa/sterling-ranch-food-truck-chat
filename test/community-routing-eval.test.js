const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const cases = require("../data/community-routing-benchmark.json");
const { communityAnswerMetrics, privacyFingerprint, recordCommunityAnswer, supportedLiveRoutingPlan } = require("../lib/community-observability");
const { ROUTING_PROFILES, ROUTING_THRESHOLDS, buildReport, evaluateRoutingResult, isProviderBillingOrCreditError, parseArgs, profileCases, releaseFailures, requestRoute, runBenchmark, safeDiagnostic, safeUsage, spendForRuns, summarizeRoutingRuns } = require("../scripts/eval-community-routing-live");

test("routing profiles use a small one-pass smoke check by default and reserve the full benchmark for explicit use", () => {
  const smoke = parseArgs([]);
  const full = parseArgs(["--profile=full"]);
  assert.equal(smoke.profile, "smoke");
  assert.equal(smoke.repeats, 1);
  assert.equal(profileCases(smoke.profile).length, 10);
  assert.ok(profileCases(smoke.profile).some((item) => item.expectedClassification === "prompt-injection"));
  assert.equal(full.profile, "full");
  assert.equal(full.repeats, 3);
  assert.equal(profileCases(full.profile).length, 50);
  assert.deepEqual(ROUTING_PROFILES.full, cases.map((item) => item.id));
});

test("routing evaluator stops immediately on provider billing or credit errors and preserves only safe diagnostics", async () => {
  const testCase = cases.find((item) => item.id === "payment-water");
  const response = {
    accepted: false,
    classification: "rules-question",
    plan: null,
    deploymentRevision: "a".repeat(40),
    diagnostic: { providerStatus: 402, providerErrorType: "billing_error", providerMessage: "Credit balance exhausted for sk-ant-secret" },
  };
  await assert.rejects(
    () => runBenchmark({ baseUrl: "https://example.test", profile: "smoke", repeats: 1, delayMs: 0 }, { cases: [testCase], fetchRoute: async () => response }),
    (error) => error.code === "provider-billing-or-credit" && error.runs.length === 1,
  );
  assert.equal(isProviderBillingOrCreditError(response.diagnostic), true);
  const diagnostic = safeDiagnostic(response.diagnostic);
  assert.deepEqual(diagnostic, { providerStatus: 402, providerErrorType: "billing_error", providerMessage: "Credit balance exhausted for [redacted]" });
  const report = buildReport({ baseUrl: "https://example.test", profile: "smoke", repeats: 1 }, [testCase], [{ testCase, repeat: 1, response, assessment: evaluateRoutingResult(testCase, response) }], response.deploymentRevision, { reason: "provider-billing-or-credit", diagnostic });
  assert.equal(report.result, "aborted");
  assert.equal(report.observations[0].diagnostic.providerStatus, 402);
  assert.equal(JSON.stringify(report).includes("sk-ant-secret"), false);
});

test("routing evidence records provider token totals without model credentials or prompts", () => {
  const testCase = cases.find((item) => item.id === "payment-water");
  const runs = [{ testCase, response: { usage: { inputTokens: 12, outputTokens: 7, apiKey: "secret" } } }, { testCase, response: { usage: { inputTokens: 3, outputTokens: 2 } } }];
  assert.deepEqual(safeUsage(runs[0].response.usage), { inputTokens: 12, outputTokens: 7 });
  const spend = spendForRuns(runs, { EVAL_TOKEN_WARNING: "10" });
  assert.deepEqual({ inputTokens: spend.inputTokens, outputTokens: spend.outputTokens, requestCount: spend.requestCount, warning: spend.warning }, { inputTokens: 15, outputTokens: 9, requestCount: 2, warning: true });
});

test("routing evaluator limits application rate-limit retries", async () => {
  let calls = 0;
  const limited = () => ({ status: 429, headers: new Headers({ "retry-after": "0" }) });
  await assert.rejects(
    () => requestRoute("https://example.test", "test", async () => { calls += 1; return limited(); }, { maxRateLimitRetries: 2, sleepImpl: async () => {} }),
    /rate limit persisted after 3 response/,
  );
  assert.equal(calls, 3);
});

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
  assert.ok(cases.filter((item) => item.expectedDateKind).length >= 4);
  assert.ok(cases.some((item) => item.expectedNoFilters));
  assert.ok(cases.some((item) => item.expectedFilter));
  assert.ok(cases.some((item) => item.expectedGoalsInclude?.length > 1));
  assert.ok(cases.some((item) => item.expectedClarification));
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
  assert.ok(Object.hasOwn(summary, "structuredAccuracy"));
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

test("a supported live-service route ending out of scope is an observable release failure", () => {
  const before = communityAnswerMetrics();
  const plan = { intent: "status", goal: "schedule", goals: ["schedule"], subject: "food truck", searchQueries: ["food truck tomorrow"] };
  assert.equal(supportedLiveRoutingPlan(plan), true);
  assert.equal(supportedLiveRoutingPlan({ intent: "services", goal: "information", subject: "weather", searchQueries: ["weather"] }), false);
  recordCommunityAnswer({ answer: {
    answerMode: "conversation", answerStatus: "out-of-scope", inputClassification: "unrelated", confidence: { canAnswer: false }, sources: [], claims: [], routingDecision: "ai-planned", routingPlan: plan,
  }, resolvedQuestion: "private food truck wording", durationMs: 10 });
  const after = communityAnswerMetrics();
  assert.equal(after.routingContractFailures, before.routingContractFailures + 1);
  assert.ok(Date.parse(after.lastRoutingContractFailureAt));
});

test("staging-only real-model endpoint and scheduled benchmark stay wired", () => {
  const root = path.join(__dirname, "..");
  const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
  const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "community-routing-quality.yml"), "utf8");
  assert.match(server, /RAILWAY_ENVIRONMENT_NAME[\s\S]*staging/);
  assert.match(server, /\/api\/community\/route-eval/);
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /ROUTING_PROFILE:/);
  assert.match(workflow, /check-community-routing-release\.js/);
});

test("live answer and soak traffic is marked as testing for the private review log", () => {
  const root = path.join(__dirname, "..");
  for (const file of ["eval-community-answers-live.js", "check-community-application-soak.js"]) {
    const script = fs.readFileSync(path.join(root, "scripts", file), "utf8");
    assert.match(script, /JSON\.stringify\(\{ question(?:: item\.question)?, isTest: true \}\)/, file);
  }
});

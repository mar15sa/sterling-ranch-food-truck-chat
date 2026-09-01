const crypto = require("node:crypto");

const MAX_RECENT_TRACES = 100;
const MAX_ROUTE_FINGERPRINTS = 500;
const traceSalt = process.env.COMMUNITY_TRACE_SALT || crypto.randomBytes(32).toString("hex");
const recent = [];
const routeOutcomes = new Map();
const counters = {
  answers: 0,
  followUps: 0,
  foodTruckAnswers: 0,
  fallbacks: 0,
  rejected: 0,
  routingFallbacks: 0,
  routingSynthesisFallbacks: 0,
  routingGoalDrifts: 0,
  lastRoutingGoalDriftAt: "",
  totalDurationMs: 0,
  routingDecisions: {},
  routingGoals: {},
  routingFallbackReasons: {},
};

function privacyFingerprint(value = "") {
  return crypto.createHmac("sha256", traceSalt).update(String(value).trim().toLowerCase()).digest("hex").slice(0, 16);
}

function increment(object, key) {
  if (!key) return;
  object[key] = (object[key] || 0) + 1;
}

function sourceAgeMs(answer, now = Date.now()) {
  const checked = (answer.sources || []).map((source) => Date.parse(source.checkedAt || "")).filter(Number.isFinite);
  return checked.length ? Math.max(0, now - Math.min(...checked)) : null;
}

function recordCommunityAnswer({ answer, resolvedQuestion, usedPriorContext, durationMs, aiUsage } = {}) {
  const answerId = crypto.randomUUID();
  const routingGoal = answer.routingPlan?.goal || "";
  const routingDecision = answer.routingDecision || "not-planned";
  const questionFingerprint = privacyFingerprint(resolvedQuestion);
  const trace = {
    answerId,
    recordedAt: new Date().toISOString(),
    resolvedIntent: answer.communityIntent || "unknown",
    answerMode: answer.answerMode || "unknown",
    answerStatus: answer.answerStatus || "unknown",
    sourceIds: (answer.sources || []).map((source) => source.id || source.nodeId || source.sourceUrl).filter(Boolean).slice(0, 8),
    verifiedClaims: (answer.claims || []).filter((claim) => claim.verified).length,
    rejectedClaims: (answer.claims || []).filter((claim) => !claim.verified).length,
    confidence: answer.confidence?.confidence || "unknown",
    sourceAgeMs: sourceAgeMs(answer),
    durationMs: Math.max(0, Math.round(Number(durationMs) || 0)),
    fallbackReason: answer.confidence?.canAnswer === false ? answer.confidence?.reason || "unverified" : "",
    routingDecision,
    routingGoal,
    routingIntent: answer.routingPlan?.intent || "",
    routingFallbackReason: answer.routingFallbackReason || "",
    routingSubjectFingerprint: answer.routingPlan?.subject ? privacyFingerprint(answer.routingPlan.subject) : "",
    questionFingerprint,
    usedPriorContext: Boolean(usedPriorContext),
    resolvedQuestionLength: String(resolvedQuestion || "").length,
    aiUsage: aiUsage ? {
      ...aiUsage,
      estimatedCostUsd: Number((((Number(aiUsage.inputTokens) || 0) * Number(process.env.COMMUNITY_LLM_INPUT_COST_PER_MILLION || 1)
        + (Number(aiUsage.outputTokens) || 0) * Number(process.env.COMMUNITY_LLM_OUTPUT_COST_PER_MILLION || 5)) / 1_000_000).toFixed(6)),
    } : null,
  };
  counters.answers += 1;
  counters.totalDurationMs += trace.durationMs;
  if (trace.usedPriorContext) counters.followUps += 1;
  if (trace.answerMode === "community-live-food-truck") counters.foodTruckAnswers += 1;
  if (trace.fallbackReason) counters.fallbacks += 1;
  if (trace.answerStatus === "safety-rejected") counters.rejected += 1;
  increment(counters.routingDecisions, routingDecision);
  increment(counters.routingGoals, routingGoal);
  increment(counters.routingFallbackReasons, trace.routingFallbackReason);
  if (routingDecision === "official-action-fallback") counters.routingFallbacks += 1;
  if (routingDecision === "ai-planned" && answer.answerMode !== "community-grounded-ai") counters.routingSynthesisFallbacks += 1;
  const routingOutcome = routingGoal || (routingDecision === "official-action-fallback" ? "verified-fallback" : "");
  if (routingOutcome) {
    const priorGoal = routeOutcomes.get(questionFingerprint);
    if (priorGoal && priorGoal !== routingOutcome) {
      counters.routingGoalDrifts += 1;
      counters.lastRoutingGoalDriftAt = new Date().toISOString();
      console.warn(JSON.stringify({
        event: "community_routing_goal_drift",
        questionFingerprint,
        priorGoal,
        currentGoal: routingOutcome,
      }));
    }
    routeOutcomes.delete(questionFingerprint);
    routeOutcomes.set(questionFingerprint, routingOutcome);
    if (routeOutcomes.size > MAX_ROUTE_FINGERPRINTS) routeOutcomes.delete(routeOutcomes.keys().next().value);
  }
  recent.push(trace);
  if (recent.length > MAX_RECENT_TRACES) recent.shift();
  console.log(JSON.stringify({ event: "community_answer_trace", ...trace }));
  return answerId;
}

function communityAnswerMetrics() {
  return {
    ...counters,
    routingDecisions: { ...counters.routingDecisions },
    routingGoals: { ...counters.routingGoals },
    routingFallbackReasons: { ...counters.routingFallbackReasons },
    averageDurationMs: counters.answers ? Math.round(counters.totalDurationMs / counters.answers) : 0,
    recent: recent.slice(-10),
  };
}

module.exports = { communityAnswerMetrics, privacyFingerprint, recordCommunityAnswer, sourceAgeMs };

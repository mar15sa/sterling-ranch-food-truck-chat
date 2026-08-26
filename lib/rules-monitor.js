const DEFAULT_MAX_RESPONSE_MS = 5000;

function includesAll(text, values) {
  const haystack = String(text || "").toLowerCase();
  return values.every((value) => haystack.includes(String(value).toLowerCase()));
}

function shouldRetrySlowResponse(durationMs, maxResponseMs = DEFAULT_MAX_RESPONSE_MS) {
  return Number(durationMs) > maxResponseMs;
}

function evaluateRuleResult(check, result, options = {}) {
  const issues = [];
  const maxResponseMs = options.maxResponseMs || DEFAULT_MAX_RESPONSE_MS;
  const firstDurationMs = Number(options.firstDurationMs ?? result.monitorDurationMs) || 0;
  const firstSource = result.sources?.[0]?.title || "";

  if (check.expectedClassification) {
    if (result.inputClassification !== check.expectedClassification) {
      issues.push(`expected classification "${check.expectedClassification}", got "${result.inputClassification}"`);
    }
    if (result.confidence?.reason !== check.expectedReason) {
      issues.push(`expected reason "${check.expectedReason}", got "${result.confidence?.reason}"`);
    }
    if (check.expectedAnswerMode && result.answerMode !== check.expectedAnswerMode) {
      issues.push(`expected answer mode "${check.expectedAnswerMode}", got "${result.answerMode}"`);
    }
    if (check.expectedNoSources && result.sources?.length) {
      issues.push(`expected no sources, got ${result.sources.length}`);
    }
  } else if (result.confidence?.canAnswer !== true || result.confidence?.confidence !== "high") {
    issues.push(`expected a high-confidence answer, got ${JSON.stringify(result.confidence)}`);
  }

  if (check.firstSourceIncludes && !firstSource.includes(check.firstSourceIncludes)) {
    issues.push(`expected first source containing "${check.firstSourceIncludes}", got "${firstSource}"`);
  }
  if (check.answerIncludes && !includesAll(result.answer, check.answerIncludes)) {
    issues.push(`answer is missing: ${check.answerIncludes.filter((value) => !includesAll(result.answer, [value])).join(", ")}`);
  }
  if (check.expectedVerdict && result.answerVerdict !== check.expectedVerdict) {
    issues.push(`expected verdict "${check.expectedVerdict}", got "${result.answerVerdict}"`);
  }
  if (check.maxAnswerLength && String(result.answer || "").length > check.maxAnswerLength) {
    issues.push(`answer is ${String(result.answer || "").length} characters; expected no more than ${check.maxAnswerLength}`);
  }
  if (
    check.maxAnswerLength &&
    /I (?:do not|don't) have enough information|\.\.\.|WHEREAS|ADOPTED AND APPROVED|-- \d+ of \d+ --/i.test(result.answer || "")
  ) {
    issues.push("resident-facing answer contains uncertainty or raw-document artifacts");
  }
  if (Number(result.monitorDurationMs) > maxResponseMs) {
    issues.push(`answer remained slow after retry (${firstDurationMs}ms, then ${result.monitorDurationMs}ms); expected no more than ${maxResponseMs}ms`);
  }
  if (!check.expectedClassification && (result.sourceStatus?.inlineTopicCount || 0) < 100) {
    issues.push(`expected at least 100 indexed topic cards, got ${result.sourceStatus?.inlineTopicCount || 0}`);
  }

  return issues;
}

function deploymentHealthState(responseOk, health = {}) {
  if (!responseOk || health.status !== "ok" || (health.rules?.inlineTopicCount || 0) < 100) return "failed";
  if (health.rules?.isStale) return "refreshing";
  return "healthy";
}

function freshnessRecheckIssue(responseOk, health = {}) {
  if (!responseOk || health.status !== "ok" || health.rules?.isStale) {
    return `rules source remained stale after the deployment refresh window: ${JSON.stringify(health.rules)}`;
  }
  return "";
}

module.exports = {
  DEFAULT_MAX_RESPONSE_MS,
  deploymentHealthState,
  evaluateRuleResult,
  freshnessRecheckIssue,
  includesAll,
  shouldRetrySlowResponse,
};

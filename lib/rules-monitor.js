const DEFAULT_MAX_RESPONSE_MS = 5000;

function includesAll(text, values) {
  const haystack = String(text || "").toLowerCase();
  return values.every((value) => haystack.includes(String(value).toLowerCase()));
}

function shouldRetrySlowResponse(durationMs, maxResponseMs = DEFAULT_MAX_RESPONSE_MS) {
  return Number(durationMs) > maxResponseMs;
}

function isOfficialCabUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && (url.hostname === "sterlingranchcab.com" || url.hostname.endsWith(".sterlingranchcab.com"));
  } catch {
    return false;
  }
}

function homepageJourneyIssues(responseOk, html, headers = {}) {
  const issues = [];
  const body = String(html || "");
  const header = (name) => typeof headers.get === "function" ? headers.get(name) || "" : headers[name] || "";
  const semanticMarkers = [
    /<main\b[^>]*\bid=["']main-content["']/i,
    /<h1>\s*The Daily Briefing\s*<\/h1>/i,
    /href=["']\/community-assistant["']/i,
  ];

  if (!responseOk) issues.push("homepage did not return HTTP 200");
  if (!semanticMarkers.every((marker) => marker.test(body))) {
    issues.push("homepage is missing a stable Daily Briefing or Community Assistant marker");
  }
  if (!String(header("content-security-policy")).includes("default-src 'self'")) {
    issues.push("homepage CSP is missing default-src 'self'");
  }
  if (!String(header("strict-transport-security")).includes("max-age=")) {
    issues.push("homepage HSTS is missing max-age");
  }
  return issues;
}

function poolStatusJourneyIssues(result = {}) {
  const sources = Array.isArray(result.sources) ? result.sources : [];
  const actions = Array.isArray(result.actions) ? result.actions : [];
  const verifiedSource = sources.find((source) => isOfficialCabUrl(source?.sourceUrl));
  const verifiedStatus = result.answerStatus === "verified"
    && result.answerMode === "community-live-status"
    && result.confidence?.canAnswer === true
    && verifiedSource?.connectorType === "live-status"
    && verifiedSource?.sourceType === "status"
    && verifiedSource?.controllingSourceRole === "operational"
    && verifiedSource?.authorityFacets?.includes("status")
    && result.evidenceEnvelope?.degradation?.state === "healthy"
    && result.evidenceEnvelope?.coverage?.covered?.includes("status")
    && result.evidenceEnvelope?.claims?.some((claim) => claim.facet === "status"
      && claim.controllingSourceRole === "operational"
      && claim.controllingEvidenceId === verifiedSource.id);
  if (verifiedStatus) return [];

  const officialHandoff = actions.some((action) => action?.label && isOfficialCabUrl(action.url));
  const safelyWithheld = result.answerStatus === "source-unavailable"
    && result.confidence?.canAnswer === false
    && !(result.claims || []).length
    && officialHandoff;
  if (safelyWithheld) return [];

  return ["expected an exact verified CAB operational status or a source-unavailable response with an official CAB handoff"];
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
  const firstSourceRecord = result.sources?.[0];
  if (check.expectedSourceType && firstSourceRecord?.sourceType !== check.expectedSourceType) {
    issues.push(`expected first source type "${check.expectedSourceType}", got "${firstSourceRecord?.sourceType || ""}"`);
  }
  if (check.expectedSourceUrlIncludes && !String(firstSourceRecord?.sourceUrl || "").includes(check.expectedSourceUrlIncludes)) {
    issues.push(`expected first source URL containing "${check.expectedSourceUrlIncludes}"`);
  }
  if (check.expectedAuthorityDecision && result.authorityDecision !== check.expectedAuthorityDecision) {
    issues.push(`expected authority decision "${check.expectedAuthorityDecision}", got "${result.authorityDecision || ""}"`);
  }
  if (check.expectedActionType && !(result.actions || []).some((action) => action.actionType === check.expectedActionType && /^https:\/\//i.test(action.url || ""))) {
    issues.push(`expected an HTTPS ${check.expectedActionType} action`);
  }
  if (check.expectedClaimsFromFirstSource) {
    const sourceId = firstSourceRecord?.id || firstSourceRecord?.nodeId;
    if (!sourceId || !(result.claims || []).length || !(result.claims || []).every((claim) => (claim.evidenceSourceIds || []).includes(sourceId))) {
      issues.push("expected every resident claim to cite the controlling first source");
    }
  }
  for (const pattern of check.answerFactPatterns || []) {
    if (!pattern.test(String(result.answer || ""))) issues.push(`answer is missing semantic fact ${pattern}`);
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
  homepageJourneyIssues,
  includesAll,
  isOfficialCabUrl,
  poolStatusJourneyIssues,
  shouldRetrySlowResponse,
};

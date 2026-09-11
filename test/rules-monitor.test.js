const test = require("node:test");
const assert = require("node:assert/strict");

const {
  deploymentHealthState,
  evaluateRuleResult,
  freshnessRecheckIssue,
  homepageJourneyIssues,
  poolStatusJourneyIssues,
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

test("facility monitoring validates semantics, authority, citations, and action metadata", () => {
  const check = {
    firstSourceIncludes: "Pickleball Courts",
    expectedSourceType: "facilities",
    expectedSourceUrlIncludes: "/facilities/pickleball",
    expectedAuthorityDecision: "current-facility-operations",
    expectedActionType: "booking",
    expectedClaimsFromFirstSource: true,
    answerFactPatterns: [/weekday[\s\S]*dusk/i],
  };
  const result = goodResult({
    answer: "On weekdays, play starts at 6 a.m. and runs until dusk.",
    authorityDecision: "current-facility-operations",
    sources: [{ id: "courts", title: "Pickleball Courts", sourceType: "facilities", sourceUrl: "https://alpha.gov/facilities/pickleball" }],
    actions: [{ label: "Book a court", actionType: "booking", url: "https://alpha.gov/book" }],
    claims: [{ text: "On weekdays, play starts at 6 a.m. and runs until dusk.", evidenceSourceIds: ["courts"] }],
  });
  assert.deepEqual(evaluateRuleResult(check, result), []);
  assert.match(evaluateRuleResult(check, { ...result, actions: [] }).join(" "), /HTTPS booking action/i);
  assert.match(evaluateRuleResult(check, { ...result, claims: [] }).join(" "), /controlling first source/i);
});

test("safety checks validate classification, reason, mode, and empty sources", () => {
  const issues = evaluateRuleResult(
    { expectedClassification: "prompt-injection", expectedReason: "prompt-injection-rejected", expectedAnswerMode: "safety", expectedNoSources: true },
    goodResult({ inputClassification: "rules-question", answerMode: "normal", confidence: { reason: "wrong" } })
  );
  assert.equal(issues.length, 4);
});

test("source-review monitoring requires an explicit withheld answer with its official handoff", () => {
  const check = {
    expectedClassification: "rules-question",
    expectedReason: "source-review-required",
    expectedAnswerMode: "community-freshness-withheld",
    expectedAnswerStatus: "source-unavailable",
    expectedCanAnswer: false,
    firstSourceIncludes: "Pickleball Courts",
    expectedSourceType: "facilities",
    expectedSourceUrlIncludes: "/418/Pickleball-Courts",
    expectedActionType: "information",
  };
  const result = goodResult({
    answerStatus: "source-unavailable",
    answerMode: "community-freshness-withheld",
    inputClassification: "rules-question",
    confidence: { canAnswer: false, confidence: "high", reason: "source-review-required" },
    sources: [{ id: "courts", title: "Pickleball Courts", sourceType: "facilities", sourceUrl: "https://alpha.gov/418/Pickleball-Courts" }],
    actions: [{ label: "Open Pickleball Courts", actionType: "information", url: "https://alpha.gov/418/Pickleball-Courts" }],
  });
  assert.deepEqual(evaluateRuleResult(check, result), []);
  assert.match(evaluateRuleResult(check, { ...result, answerStatus: "verified", confidence: { canAnswer: true, confidence: "high", reason: "source-review-required" } }).join(" "), /answer status.*canAnswer/i);
});

test("freshness recheck fails closed until sources are current", () => {
  assert.match(freshnessRecheckIssue(true, { status: "ok", rules: { isStale: true } }), /remained stale/i);
  assert.match(freshnessRecheckIssue(false, { status: "ok", rules: { isStale: false } }), /remained stale/i);
  assert.equal(freshnessRecheckIssue(true, { status: "ok", rules: { isStale: false } }), "");
});

test("homepage journey follows stable semantic markers and transport protections", () => {
  const headers = new Map([
    ["content-security-policy", "default-src 'self'; object-src 'none'"],
    ["strict-transport-security", "max-age=31536000; includeSubDomains"],
  ]);
  const currentHomepage = '<main id="main-content"><h1>The Daily Briefing</h1><a href="/community-assistant">Assistant</a></main>';
  assert.deepEqual(homepageJourneyIssues(true, currentHomepage, headers), []);
  assert.match(homepageJourneyIssues(true, '<main><h1>Welcome</h1></main>', headers).join(" "), /stable Daily Briefing/i);
  assert.match(homepageJourneyIssues(true, currentHomepage, new Map()).join(" "), /CSP.*HSTS/i);
});

test("pool status journey requires verified operational evidence or a safe official handoff", () => {
  const verified = {
    answerStatus: "verified", answerMode: "community-live-status", confidence: { canAnswer: true },
    sources: [{ id: "pool:current-status", sourceUrl: "https://sterlingranchcab.com/187/Pool", connectorType: "live-status", sourceType: "status", controllingSourceRole: "operational", authorityFacets: ["status"] }],
    evidenceEnvelope: { degradation: { state: "healthy" }, coverage: { covered: ["status"] }, claims: [{ facet: "status", controllingSourceRole: "operational", controllingEvidenceId: "pool:current-status" }] },
  };
  assert.deepEqual(poolStatusJourneyIssues(verified), []);
  assert.deepEqual(poolStatusJourneyIssues({ answerStatus: "source-unavailable", confidence: { canAnswer: false }, claims: [], actions: [{ label: "Open official CAB pool status", url: "https://sterlingranchcab.com/187/Pool" }] }), []);
  assert.match(poolStatusJourneyIssues({ answerStatus: "verified", answerMode: "community-live-status", confidence: { canAnswer: true }, sources: [] }).join(" "), /exact verified CAB operational status/i);
  assert.match(poolStatusJourneyIssues({ answerStatus: "source-unavailable", confidence: { canAnswer: false }, claims: [{ text: "The pool is open" }], actions: [{ label: "Open official CAB pool status", url: "https://sterlingranchcab.com/187/Pool" }] }).join(" "), /official CAB handoff/i);
});

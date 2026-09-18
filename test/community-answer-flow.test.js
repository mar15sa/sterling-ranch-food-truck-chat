const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveCommunityAnswerFlow } = require("../lib/community-answer-flow");

test("Railway staging defaults to the proven resident flow", () => {
  assert.equal(resolveCommunityAnswerFlow({ RAILWAY_ENVIRONMENT_NAME: "staging" }), "legacy");
});

test("production and local environments keep the legacy resident flow by default", () => {
  assert.equal(resolveCommunityAnswerFlow({ RAILWAY_ENVIRONMENT_NAME: "production" }), "legacy");
  assert.equal(resolveCommunityAnswerFlow({}), "legacy");
});

test("an explicit valid setting overrides the environment default", () => {
  assert.equal(resolveCommunityAnswerFlow({
    RAILWAY_ENVIRONMENT_NAME: "staging",
    COMMUNITY_ANSWER_FLOW: "legacy",
  }), "legacy");
  assert.equal(resolveCommunityAnswerFlow({
    RAILWAY_ENVIRONMENT_NAME: "production",
    COMMUNITY_ANSWER_FLOW: "need-first-candidate",
  }), "need-first-candidate");
  assert.equal(resolveCommunityAnswerFlow({
    RAILWAY_ENVIRONMENT_NAME: "staging",
    COMMUNITY_ANSWER_FLOW: "need-first-ai-candidate",
  }), "need-first-ai-candidate");
});

test("an invalid explicit setting fails closed", () => {
  assert.throws(
    () => resolveCommunityAnswerFlow({ COMMUNITY_ANSWER_FLOW: "experimental" }),
    /must be legacy, need-first-candidate, or need-first-ai-candidate/,
  );
});

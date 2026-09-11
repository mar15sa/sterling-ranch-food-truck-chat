const test = require("node:test");
const assert = require("node:assert/strict");
const { questionLogDeployment, questionLogOptions } = require("../lib/community-question-log-boundary");
const { buildQuestionLogEntry } = require("../lib/rules-question-log");

const request = (host) => ({ headers: { host } });

test("Railway staging automatically classifies ordinary assistant questions as tests", () => {
  const options = questionLogOptions(request("sterling-ranch-food-truck-chat-staging.up.railway.app"), false, {
    RAILWAY_ENVIRONMENT_NAME: "staging",
  });
  assert.deepEqual(options, { isTest: true, logBoundary: "railway-staging-environment" });
  const entry = buildQuestionLogEntry("Can I use the pool?", { confidence: { canAnswer: true } }, options);
  assert.equal(entry.isTest, true);
});

test("production remains a resident log even when a client sends a staging Host header", () => {
  const deployment = questionLogDeployment(request("staging.example.test"), {
    RAILWAY_ENVIRONMENT_NAME: "production",
    COMMUNITY_STAGING_HOSTS: "staging.example.test",
    RAILWAY_PUBLIC_DOMAIN: "production.example.test",
  });
  assert.deepEqual(deployment, { isTest: false, reason: "named-nonstaging-environment" });
});

test("an explicit production setting wins over an accidental Railway staging name", () => {
  assert.deepEqual(
    questionLogDeployment(request("staging.example.test"), {
      COMMUNITY_QUESTION_LOG_MODE: "production",
      RAILWAY_ENVIRONMENT_NAME: "staging",
    }),
    { isTest: false, reason: "configured-resident-deployment" }
  );
});

test("explicit test requests remain hidden from the normal owner log in production", () => {
  const options = questionLogOptions(request("sterlingranchsociety.com"), true, {
    COMMUNITY_QUESTION_LOG_MODE: "production",
  });
  assert.deepEqual(options, { isTest: true, logBoundary: "explicit-test-request" });
});

test("host fallback needs both the runtime Railway hostname and configured staging hostname", () => {
  const environment = {
    COMMUNITY_STAGING_HOSTS: "staging.example.test",
    RAILWAY_PUBLIC_DOMAIN: "staging.example.test",
  };
  assert.deepEqual(
    questionLogDeployment(request("staging.example.test"), environment),
    { isTest: true, reason: "verified-staging-public-host" }
  );
  assert.deepEqual(
    questionLogDeployment(request("staging.example.test"), {
      ...environment,
      RAILWAY_PUBLIC_DOMAIN: "production.example.test",
    }),
    { isTest: false, reason: "default-resident-deployment" }
  );
});

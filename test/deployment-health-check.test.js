const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { checkDeployment, healthIssues, openingsIssues, parseOptions } = require("../scripts/check-deployment-health");

function healthy(revision = "expected") {
  return {
    status: "ok",
    deploymentReady: true,
    deploymentRevision: revision,
    rules: { isStale: false },
    communitySources: {
      stale: false,
      failureCount: 0,
      expiredApprovedSourceCount: 0,
      expiredApprovedFactCount: 0,
    },
  };
}

function response(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

function openings() {
  return { updatedAt: "2026-09-21", total: 134, items: [{ name: "SCHEELS" }] };
}

test("deployment health accepts only the expected healthy revision", async () => {
  const observed = await checkDeployment({
    baseUrl: "https://example.test",
    expectedRevision: "expected",
    waitMs: 0,
    intervalMs: 1000,
    requestTimeoutMs: 1000,
  }, { fetchImpl: async () => response(healthy()) });
  assert.equal(observed.deploymentRevision, "expected");
});

test("deployment health waits past an older healthy revision", async () => {
  const responses = [response(healthy("older")), response(healthy("expected"))];
  let clock = 0;
  const observed = await checkDeployment({
    baseUrl: "https://example.test",
    expectedRevision: "expected",
    waitMs: 5000,
    intervalMs: 1000,
    requestTimeoutMs: 1000,
  }, {
    fetchImpl: async () => responses.shift(),
    sleepImpl: async () => { clock += 1000; },
    now: () => clock,
  });
  assert.equal(observed.deploymentRevision, "expected");
});

test("deployment health waits while the expected revision refreshes its evidence", async () => {
  const refreshing = healthy();
  refreshing.rules.isStale = true;
  let clock = 0;
  const responses = [response(refreshing), response(healthy())];
  const observed = await checkDeployment({
    baseUrl: "https://example.test",
    expectedRevision: "expected",
    waitMs: 5000,
    intervalMs: 1000,
    requestTimeoutMs: 1000,
  }, {
    fetchImpl: async () => responses.shift(),
    sleepImpl: async () => { clock += 1000; },
    now: () => clock,
  });
  assert.equal(observed.deploymentRevision, "expected");
});

test("deployment health rejects evidence that stays unhealthy through the deadline", async () => {
  const body = healthy();
  body.communitySources.stale = true;
  body.communitySources.failureCount = 2;
  let clock = 0;
  await assert.rejects(() => checkDeployment({
    baseUrl: "https://example.test",
    expectedRevision: "expected",
    waitMs: 2000,
    intervalMs: 1000,
    requestTimeoutMs: 1000,
  }, {
    fetchImpl: async () => response(body),
    sleepImpl: async () => { clock += 1000; },
    now: () => clock,
  }), /community evidence is stale; 2 source failures/);
});

test("openings-only deployment accepts unrelated stale community evidence after validating the catalog", async () => {
  const body = healthy();
  body.communitySources.stale = true;
  body.communitySources.expiredApprovedFactCount = 3;
  const observed = await checkDeployment({
    baseUrl: "https://example.test",
    expectedRevision: "expected",
    waitMs: 0,
    intervalMs: 1000,
    requestTimeoutMs: 1000,
    openingsOnly: true,
  }, {
    fetchImpl: async (url) => response(url.endsWith("/api/openings") ? openings() : body),
  });
  assert.equal(observed.deploymentRevision, "expected");
});

test("openings-only deployment rejects an empty openings catalog", async () => {
  await assert.rejects(() => checkDeployment({
    baseUrl: "https://example.test",
    expectedRevision: "expected",
    waitMs: 0,
    intervalMs: 1000,
    requestTimeoutMs: 1000,
    openingsOnly: true,
  }, {
    fetchImpl: async (url) => response(url.endsWith("/api/openings")
      ? { updatedAt: "2026-09-21", total: 0, items: [] }
      : healthy()),
  }), /openings catalog is empty or missing/);
});

test("openings catalog validation requires entries, a valid total, and an update date", () => {
  assert.deepEqual(openingsIssues({ items: [], total: 0 }), [
    "openings catalog is empty or missing",
    "openings updatedAt is missing",
  ]);
});

test("deployment health options come from explicit CI environment values", () => {
  assert.deepEqual(parseOptions([], {
    DEPLOYMENT_BASE_URL: "https://example.test/",
    EXPECTED_DEPLOYMENT_REVISION: "abc123",
    DEPLOYMENT_WAIT_MS: "9000",
    DEPLOYMENT_INTERVAL_MS: "2000",
    DEPLOYMENT_REQUEST_TIMEOUT_MS: "3000",
    OPENINGS_ONLY_DEPLOYMENT: "true",
  }), {
    baseUrl: "https://example.test",
    expectedRevision: "abc123",
    waitMs: 9000,
    intervalMs: 2000,
    requestTimeoutMs: 3000,
    openingsOnly: true,
  });
});

test("CI keeps the complete gate before merge and uses deployment health after push", () => {
  const workflow = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "ci.yml"), "utf8");
  const pullRequestJobs = workflow.split("\n  deployment-smoke:")[0];
  const deploymentJob = workflow.split("\n  deployment-smoke:")[1];

  assert.match(pullRequestJobs, /fast:[\s\S]*if: github\.event_name == 'pull_request'[\s\S]*npm run test:fast/);
  assert.match(pullRequestJobs, /quality:[\s\S]*if: github\.event_name == 'pull_request'[\s\S]*needs: fast/);
  assert.match(pullRequestJobs, /revalidate-approved-community-evidence[\s\S]*npm run check/);
  assert.match(pullRequestJobs, /RULES_LLM_MODE: off/);
  assert.match(deploymentJob, /if: github\.event_name == 'push'/);
  assert.match(deploymentJob, /EXPECTED_DEPLOYMENT_REVISION: \$\{\{ github\.sha \}\}[\s\S]*npm run check:deployment/);
  assert.match(deploymentJob, /check-openings-release-scope\.js[\s\S]*github\.event\.before[\s\S]*OPENINGS_ONLY_DEPLOYMENT/);
  assert.doesNotMatch(deploymentJob, /npm run check(?:\s|$)/);
});

#!/usr/bin/env node

const DEFAULT_WAIT_MS = 10 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 10 * 1000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15 * 1000;

function argumentValue(name, argv = process.argv.slice(2)) {
  return argv.find((argument) => argument.startsWith(`--${name}=`))?.split("=").slice(1).join("=") || "";
}

function parseOptions(argv = process.argv.slice(2), env = process.env) {
  return {
    baseUrl: String(argumentValue("base-url", argv) || env.DEPLOYMENT_BASE_URL || "").replace(/\/$/, ""),
    expectedRevision: String(argumentValue("expected-revision", argv) || env.EXPECTED_DEPLOYMENT_REVISION || "").trim(),
    waitMs: Math.max(0, Number(argumentValue("wait-ms", argv) || env.DEPLOYMENT_WAIT_MS || DEFAULT_WAIT_MS)),
    intervalMs: Math.max(1000, Number(argumentValue("interval-ms", argv) || env.DEPLOYMENT_INTERVAL_MS || DEFAULT_INTERVAL_MS)),
    requestTimeoutMs: Math.max(1000, Number(argumentValue("request-timeout-ms", argv) || env.DEPLOYMENT_REQUEST_TIMEOUT_MS || DEFAULT_REQUEST_TIMEOUT_MS)),
  };
}

function healthIssues(health = {}) {
  const issues = [];
  if (health.status !== "ok") issues.push(`status is ${health.status || "missing"}`);
  if (health.deploymentReady !== true) issues.push("deploymentReady is not true");
  if (health.rules?.isStale) issues.push("rules evidence is stale");
  if (health.communitySources?.stale) issues.push("community evidence is stale");
  if ((health.communitySources?.failureCount || 0) > 0) issues.push(`${health.communitySources.failureCount} source failures`);
  if ((health.communitySources?.expiredApprovedSourceCount || 0) > 0) issues.push(`${health.communitySources.expiredApprovedSourceCount} expired approved sources`);
  if ((health.communitySources?.expiredApprovedFactCount || 0) > 0) issues.push(`${health.communitySources.expiredApprovedFactCount} expired approved facts`);
  return issues;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkDeployment(options, dependencies = {}) {
  if (!options.baseUrl) throw new Error("Provide DEPLOYMENT_BASE_URL or --base-url.");
  if (!options.expectedRevision) throw new Error("Provide EXPECTED_DEPLOYMENT_REVISION or --expected-revision.");

  const fetchImpl = dependencies.fetchImpl || global.fetch;
  const sleepImpl = dependencies.sleepImpl || sleep;
  const now = dependencies.now || Date.now;
  const deadline = now() + options.waitMs;
  let lastObservation = "no response";

  do {
    try {
      const response = await fetchImpl(`${options.baseUrl}/api/health`, {
        headers: { "user-agent": "Sterling-Ranch-Deployment-Health/1.0" },
        signal: AbortSignal.timeout(options.requestTimeoutMs),
      });
      const health = await response.json();
      if (response.ok && health.deploymentRevision === options.expectedRevision) {
        const issues = healthIssues(health);
        if (!issues.length) return health;
        lastObservation = `expected revision is still refreshing or unhealthy: ${issues.join("; ")}`;
      } else {
        lastObservation = response.ok
          ? `revision ${health.deploymentRevision || "missing"}`
          : `HTTP ${response.status}`;
      }
    } catch (error) {
      lastObservation = error.message || String(error);
    }

    if (now() >= deadline) break;
    await sleepImpl(options.intervalMs);
  } while (now() <= deadline);

  throw new Error(`Deployment ${options.expectedRevision} did not become ready at ${options.baseUrl} within ${options.waitMs}ms; last observation: ${lastObservation}.`);
}

async function main() {
  const options = parseOptions();
  const health = await checkDeployment(options);
  console.log(`Deployment health passed for ${health.deploymentRevision}: ready, current evidence, zero source failures.`);
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { checkDeployment, healthIssues, parseOptions };

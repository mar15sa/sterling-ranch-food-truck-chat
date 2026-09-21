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
    openingsOnly: argv.includes("--openings-only") || String(env.OPENINGS_ONLY_DEPLOYMENT || "").toLowerCase() === "true",
    releaseScope: argumentValue("scope", argv) || env.DEPLOYMENT_RELEASE_SCOPE || "full",
  };
}

function baseHealthIssues(health = {}) {
  const issues = [];
  if (health.status !== "ok") issues.push(`status is ${health.status || "missing"}`);
  if (health.deploymentReady !== true) issues.push("deploymentReady is not true");
  return issues;
}

function healthIssues(health = {}) {
  const issues = baseHealthIssues(health);
  if (health.rules?.isStale) issues.push("rules evidence is stale");
  if (health.communitySources?.stale) issues.push("community evidence is stale");
  if ((health.communitySources?.failureCount || 0) > 0) issues.push(`${health.communitySources.failureCount} source failures`);
  if ((health.communitySources?.expiredApprovedSourceCount || 0) > 0) issues.push(`${health.communitySources.expiredApprovedSourceCount} expired approved sources`);
  if ((health.communitySources?.expiredApprovedFactCount || 0) > 0) issues.push(`${health.communitySources.expiredApprovedFactCount} expired approved facts`);
  return issues;
}

function openingsIssues(openings = {}) {
  const issues = [];
  if (!Array.isArray(openings.items) || openings.items.length === 0) issues.push("openings catalog is empty or missing");
  if (!Number.isInteger(openings.total) || openings.total < openings.items?.length) issues.push("openings total is invalid");
  if (!openings.updatedAt) issues.push("openings updatedAt is missing");
  return issues;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkDeployment(options, dependencies = {}) {
  if (!options.baseUrl) throw new Error("Provide DEPLOYMENT_BASE_URL or --base-url.");
  if (!options.expectedRevision) throw new Error("Provide EXPECTED_DEPLOYMENT_REVISION or --expected-revision.");
  const scope = options.openingsOnly ? "openings" : (options.releaseScope || "full");
  if (!["full", "openings", "docs", "owner-ui"].includes(scope)) throw new Error("Unknown deployment release scope.");

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
        const issues = scope === "full" ? healthIssues(health) : baseHealthIssues(health);
        if (!issues.length && scope === "openings") {
          const openingsResponse = await fetchImpl(`${options.baseUrl}/api/openings`, {
            headers: { "user-agent": "Sterling-Ranch-Deployment-Health/1.0" },
            signal: AbortSignal.timeout(options.requestTimeoutMs),
          });
          const openings = await openingsResponse.json();
          if (!openingsResponse.ok) issues.push(`openings endpoint returned HTTP ${openingsResponse.status}`);
          else issues.push(...openingsIssues(openings));
        }
        if (!issues.length && scope === "owner-ui") {
          const request = pathname => fetchImpl(`${options.baseUrl}${pathname}`, {
            headers: { "user-agent": "Sterling-Ranch-Deployment-Health/1.0" },
            signal: AbortSignal.timeout(options.requestTimeoutMs), redirect: "manual",
          });
          // No login, stored questions, writes, or model calls: check the public shell and unauthenticated boundary.
          const privateResponse = await request("/api/community-questions");
          if (![401, 403].includes(privateResponse.status)) issues.push("owner question API did not deny an unauthenticated request");
          for (const pathname of ["/community-assistant/questions", "/community-questions.js", "/community-questions.css"]) {
            const asset = await request(pathname);
            if (!asset.ok) issues.push(`owner page asset unavailable: ${pathname}`);
            if (pathname === "/community-assistant/questions" && !/noindex/.test(await asset.text())) issues.push("owner page is missing its noindex marker");
          }
        }
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
  const scope = options.openingsOnly ? "openings" : options.releaseScope;
  const detail = scope === "openings" ? "ready with a valid openings catalog"
    : scope === "docs" ? "ready; documentation-only change"
    : scope === "owner-ui" ? "ready; owner page available and private API protected"
    : "ready, current evidence, zero source failures";
  console.log(`Deployment health passed for ${health.deploymentRevision}: ${detail}.`);
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { baseHealthIssues, checkDeployment, healthIssues, openingsIssues, parseOptions };

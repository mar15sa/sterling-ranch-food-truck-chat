function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

function headerHost(req = {}) {
  const value = req?.headers?.host;
  return normalized(String(value || "").split(",")[0].replace(/:\d+$/, ""));
}

function configuredHosts(value) {
  return new Set(
    String(value || "")
      .split(",")
      .map((host) => normalized(host.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "")))
      .filter(Boolean)
  );
}

// The deployment setting is the primary boundary. A request body or a browser
// header must never be able to turn a production resident question into a test.
function questionLogDeployment(req = {}, environment = process.env) {
  const configuredMode = normalized(environment.COMMUNITY_QUESTION_LOG_MODE);
  if (["staging", "test", "nonresident"].includes(configuredMode)) {
    return { isTest: true, reason: "configured-test-deployment" };
  }
  if (["production", "resident"].includes(configuredMode)) {
    return { isTest: false, reason: "configured-resident-deployment" };
  }

  const railwayEnvironment = normalized(environment.RAILWAY_ENVIRONMENT_NAME);
  if (railwayEnvironment === "staging") {
    return { isTest: true, reason: "railway-staging-environment" };
  }
  if (railwayEnvironment) {
    return { isTest: false, reason: "named-nonstaging-environment" };
  }

  // Host detection is deliberately narrower than a normal host allowlist. It
  // only works when Railway tells this process its own public hostname, so a
  // client cannot suppress production logging simply by sending a staging Host.
  const requestHost = headerHost(req);
  const railwayPublicHost = normalized(environment.RAILWAY_PUBLIC_DOMAIN);
  const stagingHosts = configuredHosts(environment.COMMUNITY_STAGING_HOSTS);
  if (requestHost && railwayPublicHost && requestHost === railwayPublicHost && stagingHosts.has(requestHost)) {
    return { isTest: true, reason: "verified-staging-public-host" };
  }
  return { isTest: false, reason: "default-resident-deployment" };
}

function questionLogOptions(req, requestedTest = false, environment = process.env) {
  const deployment = questionLogDeployment(req, environment);
  return {
    isTest: requestedTest === true || deployment.isTest,
    logBoundary: requestedTest === true ? "explicit-test-request" : deployment.reason,
  };
}

module.exports = {
  configuredHosts,
  questionLogDeployment,
  questionLogOptions,
};

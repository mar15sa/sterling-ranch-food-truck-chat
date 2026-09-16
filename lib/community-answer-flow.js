const ALLOWED_COMMUNITY_ANSWER_FLOWS = new Set(["legacy", "need-first-candidate"]);

function resolveCommunityAnswerFlow(environment = process.env) {
  const configured = String(environment.COMMUNITY_ANSWER_FLOW || "").trim().toLowerCase();
  if (configured) {
    if (!ALLOWED_COMMUNITY_ANSWER_FLOWS.has(configured)) {
      throw new Error("COMMUNITY_ANSWER_FLOW must be legacy or need-first-candidate.");
    }
    return configured;
  }

  return String(environment.RAILWAY_ENVIRONMENT_NAME || "").trim().toLowerCase() === "staging"
    ? "need-first-candidate"
    : "legacy";
}

module.exports = { ALLOWED_COMMUNITY_ANSWER_FLOWS, resolveCommunityAnswerFlow };

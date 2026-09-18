const ALLOWED_COMMUNITY_ANSWER_FLOWS = new Set(["legacy", "audited-legacy-candidate", "need-first-candidate", "need-first-ai-candidate"]);

function resolveCommunityAnswerFlow(environment = process.env) {
  const configured = String(environment.COMMUNITY_ANSWER_FLOW || "").trim().toLowerCase();
  if (configured) {
    if (!ALLOWED_COMMUNITY_ANSWER_FLOWS.has(configured)) {
      throw new Error("COMMUNITY_ANSWER_FLOW must be legacy, audited-legacy-candidate, need-first-candidate, or need-first-ai-candidate.");
    }
    return configured;
  }

  // A deployment name must never silently opt residents into an experimental
  // renderer. Candidate flows require an explicit, bounded test setting.
  return "legacy";
}

module.exports = { ALLOWED_COMMUNITY_ANSWER_FLOWS, resolveCommunityAnswerFlow };

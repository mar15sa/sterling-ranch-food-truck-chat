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

function residentWriterConfiguration(flow, environment = process.env) {
  const { getRulesLlmMode } = require("./rules-llm");
  const mode = getRulesLlmMode(environment);
  const eligible = ["audited-legacy-candidate", "need-first-ai-candidate"].includes(flow);
  return {
    enabled: eligible && mode !== "off" && Boolean(environment.ANTHROPIC_API_KEY),
    configured: Boolean(environment.ANTHROPIC_API_KEY),
    mode,
    model: environment.COMMUNITY_NEED_WRITER_MODEL || environment.COMMUNITY_LLM_MODEL || environment.RULES_LLM_MODEL || "claude-haiku-4-5",
    stage: "after-evidence-audit",
  };
}

module.exports = { ALLOWED_COMMUNITY_ANSWER_FLOWS, resolveCommunityAnswerFlow, residentWriterConfiguration };

const SOURCE_TYPES = new Set(["rules", "facilities", "forms", "events", "alerts", "status", "services"]);
const { validateFactAuthority } = require("./community-truth");
const { isFreshnessTrackedSource } = require("./community-source-identity");
const { answerStatusForCompletion, resolveAnswerCompletion } = require("./community-completion");
const ANSWER_STATUSES = new Set([
  "verified",
  "verified-incomplete",
  "conflicting-sources",
  "source-unavailable",
  "could-not-verify",
  "out-of-scope",
  "safety-rejected",
]);

function requiredString(value, field) {
  if (!String(value || "").trim()) throw new Error(`${field} is required.`);
  return String(value).trim();
}

function validateCommunityProfile(profile) {
  if (!profile || typeof profile !== "object") throw new Error("Community profile is required.");
  requiredString(profile.communityId, "communityId");
  requiredString(profile.name, "name");
  const website = new URL(requiredString(profile.website, "website"));
  if (website.protocol !== "https:") throw new Error("Community website must use HTTPS.");
  if (!Array.isArray(profile.connectors) || !profile.connectors.length) {
    throw new Error("At least one community connector is required.");
  }
  const connectorIds = new Set();
  const allowedHosts = new Set((profile.allowedHosts || []).map((host) => String(host).toLowerCase()));
  if (!allowedHosts.size) throw new Error("At least one allowed host is required.");
  allowedHosts.add(website.hostname.toLowerCase());
  for (const connector of profile.connectors) {
    const id = requiredString(connector.id, "connector.id");
    if (connectorIds.has(id)) throw new Error(`Duplicate connector id: ${id}`);
    connectorIds.add(id);
    const url = new URL(requiredString(connector.baseUrl, `connector ${id} baseUrl`));
    if (url.protocol !== "https:") throw new Error(`Connector ${id} must use HTTPS.`);
    if (!allowedHosts.has(url.hostname.toLowerCase())) {
      throw new Error(`Connector ${id} host is not in allowedHosts.`);
    }
  }
  for (const sourceType of SOURCE_TYPES) {
    if (!Array.isArray(profile.authority?.[sourceType]) || !profile.authority[sourceType].length) {
      throw new Error(`Authority order is required for ${sourceType}.`);
    }
  }
  validateFactAuthority(profile);
  for (const action of profile.actions || []) {
    requiredString(action.id, "action.id");
    requiredString(action.label, "action.label");
    const url = new URL(requiredString(action.url, `action ${action.id} url`));
    if (url.protocol !== "https:" || !allowedHosts.has(url.hostname.toLowerCase())) {
      throw new Error(`Action ${action.id} must use an allowed official HTTPS host.`);
    }
    if (!SOURCE_TYPES.has(action.sourceType)) throw new Error(`Action ${action.id} has an unknown source type.`);
  }
  return profile;
}

function validateSourceRecord(source) {
  if (!source || typeof source !== "object") throw new Error("Source record is required.");
  for (const field of ["id", "communityId", "title", "sourceUrl", "sourceType", "connectorType", "text", "contentHash", "checkedAt"]) {
    requiredString(source[field], `source.${field}`);
  }
  const url = new URL(source.sourceUrl);
  if (url.protocol !== "https:") throw new Error(`Source ${source.id} must use HTTPS.`);
  if (!SOURCE_TYPES.has(source.sourceType)) throw new Error(`Unknown source type: ${source.sourceType}`);
  if (!Array.isArray(source.actions) || !Array.isArray(source.facts)) {
    throw new Error(`Source ${source.id} must include actions and facts arrays.`);
  }
  return source;
}

function calculateConfidence({ sources = [], requestedDetails = [], coveredDetails = [], conflicts = [], stale = false } = {}) {
  if (conflicts.length) return { level: "low", score: 0, reason: "official-source-conflict" };
  if (!sources.length) return { level: "low", score: 0, reason: "no-official-source" };
  const requested = new Set(requestedDetails);
  const covered = new Set(coveredDetails);
  const coverage = requested.size
    ? [...requested].filter((detail) => covered.has(detail)).length / requested.size
    : 1;
  const authority = sources.reduce((sum, source) => sum + (Number(source.authorityScore) || 0), 0) / sources.length;
  const sourceIsStale = stale || sources.some((source) => isFreshnessTrackedSource(source)
    && source.staleAfter && new Date(source.staleAfter).getTime() < Date.now());
  const freshnessPenalty = sourceIsStale ? 0.25 : 0;
  const score = Math.max(0, Math.min(1, 0.55 * coverage + 0.45 * authority - freshnessPenalty));
  return {
    level: score >= 0.82 ? "high" : score >= 0.6 ? "medium" : "low",
    score: Number(score.toFixed(2)),
    reason: coverage < 1 ? "requested-details-incomplete" : sourceIsStale ? "source-stale" : "official-source-supported",
  };
}

function normalizeClaims(claims = [], sources = []) {
  const sourceIds = new Set(sources.map((source) => source.id || source.nodeId).filter(Boolean));
  return claims
    .filter((claim) => claim && String(claim.text || "").trim())
    .map((claim) => {
      const evidenceSourceIds = [...new Set((claim.evidenceSourceIds || []).filter((id) => sourceIds.has(id)))];
      return {
        text: String(claim.text).trim(),
        kind: String(claim.kind || "fact"),
        evidenceSourceIds,
        verified: claim.verified !== false && evidenceSourceIds.length > 0,
      };
    });
}

function detectFactConflicts(sources = [], requestedDetails = []) {
  const requestedTypes = new Set(requestedDetails.flatMap((detail) => ({ price: ["money"], contact: ["phone", "email"], date: ["date"], hours: ["time"] }[detail] || [])));
  if (!requestedTypes.size) return [];
  const groups = new Map();
  for (const source of sources) {
    for (const fact of source.facts || []) {
      if (!fact.factKey || (requestedTypes.size && !requestedTypes.has(fact.type))) continue;
      const group = groups.get(fact.factKey) || [];
      group.push({ value: String(fact.value).toLowerCase(), sourceId: source.id, sourceUrl: source.sourceUrl, context: fact.context });
      groups.set(fact.factKey, group);
    }
  }
  return [...groups.entries()].filter(([, facts]) => new Set(facts.map((fact) => fact.value)).size > 1).map(([factKey, facts]) => ({ factKey, facts }));
}

function renderedCoveredDetails(requestedDetails, coveredDetails, directAnswer, keyDetails, actions) {
  const hasStructuredCoverage = Array.isArray(coveredDetails);
  const declared = hasStructuredCoverage ? coveredDetails : requestedDetails;
  const text = [directAnswer, ...(keyDetails || [])].join(" ");
  return declared.filter((detail) => {
    if (detail === "price") return /\$\s*\d|\b(?:free|no charge|zero dollars)\b/i.test(text);
    if (detail === "permission") return /\b(?:yes|no|allowed|prohibited|required|requires|approval|permission|may|must)\b/i.test(text);
    if (detail === "action") return actions.length > 0 || /\b(?:apply|submit|book|reserve|register|pay|open|call|email)\b/i.test(text);
    if (detail === "contact") return /@|(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/.test(text);
    if (detail === "hours") return /\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b|\b(?:open|closed)\b/i.test(text);
    if (detail === "date") return /\b(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|\d{4}-\d{2}-\d{2})\b/i.test(text);
    return hasStructuredCoverage;
  });
}

function buildAnswerContract({
  directAnswer,
  keyDetails = [],
  nextStep = "",
  actions = [],
  sources = [],
  status = "verified",
  confidence,
  requestedDetails = [],
  coveredDetails,
  conflicts = [],
  checkedAt,
  answerMode = "community-source",
  claims = [],
  completionEvidence = {},
} = {}) {
  if (!ANSWER_STATUSES.has(status)) throw new Error(`Unknown answer status: ${status}`);
  const cleanDirect = requiredString(directAnswer, "directAnswer");
  const resolvedConfidence = confidence || calculateConfidence({ sources, requestedDetails, coveredDetails, conflicts });
  const normalizedActions = actions.filter(
    (action) => action?.label && (/^https?:\/\//i.test(action.url || "") || /^\/(?!\/)/.test(action.url || ""))
  );
  const normalizedClaims = normalizeClaims(claims, sources);
  const unsupportedClaims = normalizedClaims.filter((claim) => !claim.verified);
  if (unsupportedClaims.length && status === "verified") status = "verified-incomplete";
  const legacyUnsupportedWithoutFacets = unsupportedClaims.length > 0 && requestedDetails.length === 0;
  const resolvedDetails = status === "verified"
    ? renderedCoveredDetails(requestedDetails, coveredDetails, cleanDirect, keyDetails, normalizedActions)
    : Array.isArray(coveredDetails) ? coveredDetails : [];
  const completion = ["safety-rejected", "out-of-scope"].includes(status) || legacyUnsupportedWithoutFacets ? null : resolveAnswerCompletion({
    requestedDetails,
    resolvedDetails,
    missingDetails: completionEvidence.missingDetails,
    blockers: status === "conflicting-sources"
      ? [{ type: "source-conflict", detailKeys: requestedDetails }, ...(completionEvidence.blockers || [])]
      : completionEvidence.blockers,
    conflicts,
    ambiguous: completionEvidence.ambiguous,
    evidenceUnavailable: ["source-unavailable", "could-not-verify"].includes(status),
    clarification: completionEvidence.clarification,
    nextBestMove: completionEvidence.nextBestMove || (normalizedActions[0]
      ? { type: "official-action", label: normalizedActions[0].label, actionId: normalizedActions[0].id || "", url: normalizedActions[0].url }
      : {}),
  });
  status = answerStatusForCompletion(completion, status);
  const conciseDetails = keyDetails.filter(Boolean).slice(0, 3).map((detail) => String(detail).replace(/\s+/g, " ").trim().slice(0, 420));
  const lines = [`Short answer: ${cleanDirect}`];
  if (conciseDetails.length) {
    lines.push("", "What I found:", ...conciseDetails.map((detail) => `- ${detail}`));
  }
  if (nextStep) lines.push("", `Before you act: ${nextStep}`);
  return {
    answer: lines.join("\n"),
    directAnswer: cleanDirect,
    keyDetails: conciseDetails,
    nextStep: String(nextStep || ""),
    actions: normalizedActions,
    sources,
    claims: normalizedClaims,
    conflicts,
    ...(completion ? { completion } : {}),
    answerStatus: status,
    answerVerdict: status === "verified" ? "informational" : "unverified",
    answerMode,
    confidence: {
      canAnswer: ["verified", "verified-incomplete"].includes(status),
      confidence: resolvedConfidence.level,
      score: resolvedConfidence.score,
      reason: resolvedConfidence.reason,
    },
    checkedAt: checkedAt || new Date().toISOString(),
  };
}

module.exports = {
  ANSWER_STATUSES,
  SOURCE_TYPES,
  buildAnswerContract,
  calculateConfidence,
  detectFactConflicts,
  normalizeClaims,
  validateCommunityProfile,
  validateSourceRecord,
};

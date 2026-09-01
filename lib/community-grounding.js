const { answerCoverageIssues } = require("./rules-intent");
const { actionSupportsGoal } = require("./community-search");

const STOP = new Set(["about", "after", "also", "and", "are", "before", "but", "can", "for", "from", "have", "into", "its", "more", "official", "that", "the", "their", "this", "use", "with", "you", "your"]);

function words(value = "") {
  return [...new Set((String(value).toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g) || []).filter((word) => word.length > 2 && !STOP.has(word)))];
}

function protectedValues(value = "") {
  const patterns = [
    /\$\d[\d,]*(?:\.\d{2})?/g,
    /\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/gi,
    /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g,
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,\s+20\d{2})?\b/gi,
    /\b\d+(?:\.\d+)?\s*(?:days?|hours?|minutes?|feet|foot|inches?|gallons?|people|persons?|months?|years?|%)\b/gi,
    /#\d{3,6}\b/g,
  ];
  return [...new Set(patterns.flatMap((pattern) => [...String(value).matchAll(pattern)].map((match) => match[0].toLowerCase())))];
}

function sourceId(source) {
  return source.id || source.nodeId || source.sourceUrl;
}

function evidenceForClaim(claim, sources = []) {
  const claimWords = words(claim);
  const protectedClaims = protectedValues(claim);
  return sources
    .map((source) => {
      const actionText = (source.actions || []).map((action) => `${action.label || ""} ${action.url || ""}`).join(" ");
      const corpus = `${source.title || ""} ${source.text || source.excerpt || ""} ${actionText}`.toLowerCase();
      const overlap = claimWords.filter((word) => corpus.includes(word));
      const protectedSupported = protectedClaims.every((value) => corpus.includes(value));
      const minimum = Math.min(3, Math.max(1, Math.ceil(claimWords.length * 0.2)));
      return { id: sourceId(source), supported: protectedSupported && overlap.length >= minimum, overlap: overlap.length };
    })
    .filter((result) => result.supported)
    .sort((a, b) => b.overlap - a.overlap)
    .map((result) => result.id)
    .filter(Boolean);
}

function claimsFromDraft(draft, sources = []) {
  const rows = [
    { text: draft.directAnswer, kind: "answer" },
    ...(draft.keyDetails || []).map((text) => ({ text, kind: "detail" })),
    ...(draft.nextStep ? [{ text: draft.nextStep, kind: "next-step" }] : []),
  ].filter((claim) => String(claim.text || "").trim());
  return rows.map((claim) => {
    const evidenceSourceIds = evidenceForClaim(claim.text, sources);
    return { ...claim, evidenceSourceIds, verified: evidenceSourceIds.length > 0 };
  });
}

function goalCoverageIssues(plan = {}, draft = {}, sources = []) {
  const goal = String(plan.goal || "");
  if (!goal) return [];
  const answer = `${draft.directAnswer || ""} ${(draft.keyDetails || []).join(" ")} ${draft.nextStep || ""}`;
  const actions = sources.flatMap((source) => source.actions || []);
  const checks = {
    payment: /\b(?:pay|payment|e-?pay|ach)\b/i,
    booking: /\b(?:book|booking|reserve|reservation|rental|availability|catalog)\b/i,
    application: /\b(?:apply|application|submit|submission|form|packet)\b/i,
    registration: /\b(?:register|registration|sign up|enroll|subscribe)\b/i,
    "account-access": /\b(?:log ?in|sign ?in|account|password|access|support|ticket)\b/i,
    contact: /(?:@|\b(?:call|contact|email|phone)\b|\d{3}[-.)\s]\d{3})/i,
    cost: /(?:\$\d|\b(?:free|cost|price|fee|rate)\b)/i,
    schedule: /\b(?:today|tomorrow|date|day|week|month|schedule|calendar|a\.m\.|p\.m\.)\b/i,
    status: /\b(?:open|closed|status|available|unavailable|currently)\b/i,
    permission: /\b(?:allowed|not allowed|prohibited|requires? approval|may|must)\b/i,
  };
  const issues = [];
  if (checks[goal] && !checks[goal].test(answer)) issues.push(`requested-goal-missing:${goal}`);
  if (["payment", "booking", "application", "registration", "account-access"].includes(goal)
    && !actions.some((action) => /^https?:\/\//i.test(action.url || "") && actionSupportsGoal(action, goal))) {
    issues.push(`requested-action-link-missing:${goal}`);
  }
  return issues;
}

function verifyStructuredDraft(draft, sources = [], options = {}) {
  if (!draft || typeof draft !== "object") return { valid: false, reason: "invalid-json", claims: [] };
  const directAnswer = String(draft.directAnswer || "").trim();
  const keyDetails = Array.isArray(draft.keyDetails) ? draft.keyDetails.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 5) : [];
  const nextStep = String(draft.nextStep || "").trim();
  if (!directAnswer || directAnswer.length > 700 || keyDetails.some((item) => item.length > 500) || nextStep.length > 400) {
    return { valid: false, reason: "invalid-shape", claims: [] };
  }
  if (/ignore (?:all |any )?(?:previous|prior|system)|system prompt|api key|environment variable/i.test(`${directAnswer} ${keyDetails.join(" ")} ${nextStep}`)) {
    return { valid: false, reason: "instruction-leakage", claims: [] };
  }
  const normalized = { directAnswer, keyDetails, nextStep };
  const relevanceIssues = options.question
    ? answerCoverageIssues(options.question, [directAnswer, ...keyDetails, nextStep].filter(Boolean).join("\n"), sources)
    : [];
  const goalIssues = goalCoverageIssues(options.routingPlan, normalized, sources);
  if (relevanceIssues.length || goalIssues.length) {
    return { valid: false, reason: "question-relevance", relevanceIssues: [...relevanceIssues, ...goalIssues], claims: [] };
  }
  const claims = claimsFromDraft(normalized, sources);
  if (!claims.length || claims.some((claim) => !claim.verified)) {
    return { valid: false, reason: "unsupported-claim", claims };
  }
  return { valid: true, reason: "grounded", claims, draft: normalized };
}

module.exports = { claimsFromDraft, evidenceForClaim, goalCoverageIssues, protectedValues, verifyStructuredDraft, words };

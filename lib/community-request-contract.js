const { deterministicRequestedDetails } = require("./community-interpretation");

const LEADING_QUESTION = /^(?:what|which|where|when|who|whose|how|is|are|am|was|were|can|could|may|might|must|should|would|will|do|does|did|has|have)\b/i;
const SECOND_QUESTION = /(?:\s*[?;]\s*|\s*,?\s+(?:and|also)\s+)(?=(?:what|which|where|when|who|whose|how|is|are|am|was|were|can|could|may|might|must|should|would|will|do|does|did|has|have)\b)/gi;
const SUBJECTLESS_QUESTION = /^(?:how much does it cost|what does it cost|can (?:i|we)|is it (?:allowed|okay|ok|permitted|possible))$/i;
const COMMON_WORDS = new Set([
  "a", "about", "all", "am", "an", "and", "are", "at", "be", "below", "can", "could", "do", "does", "for", "from",
  "get", "had", "has", "have", "here", "how", "i", "in", "is", "it", "its", "me", "my", "of", "on", "or", "our", "please",
  "regarding", "should", "that", "the", "their", "them", "there", "these", "this", "those", "to", "today", "tomorrow", "use", "was",
  "we", "were", "what", "when", "where", "which", "who", "will", "with", "would", "you", "your",
]);

function cleanClause(value = "") {
  return String(value).replace(/^[\s,;?]+|[\s,;?]+$/g, "").replace(/\s+/g, " ").trim();
}

function splitResidentNeeds(question = "") {
  const text = cleanClause(question);
  if (!text) return [];
  const clauses = text.split(SECOND_QUESTION).map(cleanClause).filter(Boolean);
  return clauses.length ? clauses : [text];
}

function goalForNeed(text = "", details = [], routingPlan = {}, index = 0, needCount = 1) {
  if (details.includes("permission")) return "permission";
  if (details.includes("price")) return "cost";
  if (details.includes("contact")) return "contact";
  if (details.includes("status")) return "status";
  if (details.includes("hours")) return "hours";
  if (details.includes("date") || /^when\b/i.test(text)) return "schedule";
  if (/\b(?:next|today|tomorrow|tonight|date|schedule)\b/i.test(text)
    && /\b(?:pickup|collection|food\s*truck|event|meeting|class|appointment)\b/i.test(text)) return "schedule";
  if (details.includes("action")) {
    if (/\b(?:application|apply|form|submit)\b/i.test(text)) return "application";
    if (/\b(?:book|booking|reserve|reservation)\b/i.test(text)) return "booking";
    if (/\b(?:pay|payment|bill)\b/i.test(text)) return "payment";
    if (/\b(?:register|registration)\b/i.test(text)) return "registration";
    const planned = (routingPlan.goals || []).find((goal) =>
      ["payment", "booking", "application", "registration", "account-access"].includes(goal)
    );
    if (planned && (needCount === 1 || index === 0)) return planned;
    return "information";
  }
  if (needCount > 1 && Array.isArray(routingPlan.goals) && routingPlan.goals[index]) return routingPlan.goals[index];
  if (needCount === 1 && routingPlan.goal) return routingPlan.goal;
  return "information";
}

function detailsForGoal(goal = "") {
  return ({ permission: ["permission"], cost: ["price"], contact: ["contact"], schedule: ["date"], status: ["status"], hours: ["hours"],
    payment: ["action"], booking: ["action"], application: ["action"], registration: ["action"], "account-access": ["action"] })[goal] || ["information"];
}

function taskForNeed(goal = "", details = []) {
  if (details.includes("permission")) return "permission";
  if (details.includes("specification")) return "specification";
  if (details.includes("price")) return "price";
  if (details.includes("contact")) return "contact";
  if (details.includes("status")) return "status";
  if (details.includes("hours")) return "hours";
  if (details.includes("date")) return "schedule";
  if (["payment", "booking", "application", "registration", "account-access"].includes(goal)) return "action";
  return "information";
}

function evidenceKindForNeed(goal = "", details = [], text = "") {
  if (["permission", "specification", "quantity", "eligibility"].some((detail) => details.includes(detail))) return "governing-rule";
  if (["date", "status"].some((detail) => details.includes(detail))) return "live-operation";
  if (details.includes("hours") && /\b(?:right now|current|currently|today|tonight)\b/i.test(text)) return "live-operation";
  if (["payment", "booking", "application", "registration", "account-access"].includes(goal)) return "official-action";
  if (details.includes("action")) return "official-process";
  return "official-information";
}

function buildResidentRequestContract(question = "", routingPlan = null, requestContext = {}) {
  const originalQuestion = cleanClause(requestContext.originalQuestion || question);
  const resolvedQuestion = cleanClause(requestContext.resolvedQuestion || question);
  const usedPriorContext = requestContext.usedPriorContext === true && resolvedQuestion !== originalQuestion;
  const clauses = splitResidentNeeds(originalQuestion);
  const plan = routingPlan && typeof routingPlan === "object" ? routingPlan : {};
  const needs = clauses.map((text, index) => {
    const request = usedPriorContext && clauses.length === 1
      ? resolvedQuestion
      : index > 0
        ? `Regarding “${clauses.slice(0, index).join("; ")}”: ${text}`
        : text;
    const evidenceFocus = usedPriorContext && clauses.length === 1 ? request : text;
    let explicitDetails = deterministicRequestedDetails(evidenceFocus);
    if (explicitDetails.includes("status") && !/\bhours?\b/i.test(text)) {
      explicitDetails = explicitDetails.filter((detail) => detail !== "hours");
    }
    if (!explicitDetails.length && /^(?:can|could|may)\s+(?:that|those|these|this|it|they)\b/i.test(text)) {
      explicitDetails = ["permission"];
    }
    if (explicitDetails.includes("action") && /\bwhere\b.{0,80}\b(?:keep|place|store|locate)\b/i.test(request)) {
      explicitDetails = [...new Set(explicitDetails.map((detail) => detail === "action" ? "specification" : detail))];
    }
    if (explicitDetails.includes("action") && /\bwhere\b.{0,80}\b(?:read|find|view|see|learn)\b/i.test(request)) {
      explicitDetails = [...new Set(explicitDetails.map((detail) => detail === "action" ? "information" : detail))];
    }
    const goal = goalForNeed(text, explicitDetails, plan, index, clauses.length);
    const requestedDetails = explicitDetails.length ? explicitDetails : detailsForGoal(goal);
    return {
      id: `need-${index + 1}`,
      text,
      request,
      evidenceFocus,
      task: taskForNeed(goal, requestedDetails),
      evidenceKind: evidenceKindForNeed(goal, requestedDetails, evidenceFocus),
      goal,
      requestedDetails,
      subjectHint: String(plan.subject || ""),
      dateRange: plan.dateRange || null,
      filters: plan.filters || {},
    };
  });
  return {
    version: "resident-needs-v2",
    originalQuestion,
    resolvedQuestion,
    usedPriorContext,
    needCount: needs.length,
    needs,
    complete: needs.length > 0 && needs.every((need) => need.request
      && !SUBJECTLESS_QUESTION.test(need.text)
      && (LEADING_QUESTION.test(need.text) || (usedPriorContext && need.request === resolvedQuestion))),
  };
}

function normalizedToken(value = "") {
  let token = String(value).toLowerCase();
  if (/^payments?$/.test(token)) return "pay";
  if (/^billing$/.test(token)) return "bill";
  if (/^book(?:ed|ing)?$/.test(token)) return "book";
  if (/^reserv(?:e|ed|es|ing|ation|ations)$/.test(token)) return "reserve";
  if (/^find(?:ing|ings)?$/.test(token)) return "find";
  if (/^hours?$/.test(token)) return "hour";
  if (/^menus?$/.test(token)) return "menu";
  if (/^reports?$/.test(token)) return "report";
  if (/^recycl(?:e|ed|es|ing)$/.test(token)) return "recycle";
  if (/^containers?$/.test(token)) return "container";
  if (/^bins?$/.test(token)) return "bin";
  if (/^ke(?:ep|eps|eping|pt)$/.test(token)) return "keep";
  if (/^stor(?:e|ed|es|ing|age)$/.test(token)) return "store";
  if (/^plac(?:e|ed|es|ing|ement)$/.test(token)) return "place";
  return token.replace(/(?:'s|s)$/i, "");
}

function distinctiveTokens(value = "") {
  return new Set((String(value).match(/[a-z0-9]+/gi) || []).map(normalizedToken)
    .filter((token) => token.length > 1 && !COMMON_WORDS.has(token)));
}

function overlapCount(left, right) {
  let count = 0;
  for (const token of left) if (right.has(token)) count += 1;
  return count;
}

function sourceId(source = {}) { return String(source.id || source.nodeId || ""); }

function sourceEvidenceText(source = {}, claims = [], actions = []) {
  const id = sourceId(source);
  const sourceClaims = claims.filter((claim) => (claim.evidenceSourceIds || []).includes(id)).map((claim) => claim.text);
  const sourceActions = actions.filter((action) => action.sourceId === id).map((action) => `${action.label || ""} ${action.context || ""}`);
  return [source.title, source.text, source.excerpt, ...sourceClaims, ...sourceActions].filter(Boolean).join(" ");
}

function enoughSemanticOverlap(needTokens, evidenceText) {
  const count = overlapCount(needTokens, distinctiveTokens(evidenceText));
  return count >= Math.min(2, Math.max(1, needTokens.size));
}

function claimSupportsDetail(detail, text = "", actions = []) {
  if (detail === "information") return true;
  if (detail === "price") return /\$\s*\d|\b\d+(?:\.\d+)?\s*%|\b(?:free|no charge|no additional cost|zero dollars)\b/i.test(text);
  if (detail === "permission") return /\b(?:yes|no|allowed|prohibited|required|requires|approval|permission|may|must)\b/i.test(text);
  if (detail === "action") return actions.length > 0 || /\b(?:apply|submit|book|reserve|register|pay|open|call|email|visit|select)\b/i.test(text);
  if (detail === "contact") return /@|(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/.test(text);
  if (detail === "hours") return /\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/i.test(text);
  if (detail === "date") return /\b(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|\d{4}-\d{2}-\d{2})\b/i.test(text);
  if (detail === "status") return /\b(?:open|closed|available|unavailable|operating|cancelled|canceled|delayed)\b/i.test(text);
  if (detail === "specification") return /#[0-9]{2,}\b|\b(?:\d+(?:[ -]\d+\/\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s*(?:feet|foot|inches|inch|ft\.?|in\.?)\b|\b(?:color|paint|stain|finish|material|height|size|dimension|setback|distance)\b|\b(?:must|required|allowed|prohibited)\b.{0,120}\b(?:location|area|place|screened|visible|inside|behind)\b|\b(?:return|keep|store|place|locate|screen)\w*\b.{0,120}\b(?:location|area|place|screened|visible|inside|behind)\b/i.test(text);
  return true;
}

function conflictSourceIds(conflict = {}) {
  return new Set((conflict.facts || conflict.sources || []).map((fact) => String(fact.sourceId || fact.id || "")).filter(Boolean));
}

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

function responseContainsIsoDate(responseText, isoDate) {
  if (String(responseText).includes(isoDate)) return true;
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day || !MONTH_NAMES[month - 1]) return false;
  const writtenDate = new RegExp(`\\b${MONTH_NAMES[month - 1]}\\s+0?${day}(?:st|nd|rd|th)?(?:,)?\\s+${year}\\b`, "i");
  return writtenDate.test(String(responseText));
}

function claimIsRendered(responseText = "", claimText = "") {
  const isoDates = String(claimText).match(/\b\d{4}-\d{2}-\d{2}\b/g) || [];
  if (isoDates.some((date) => !responseContainsIsoDate(responseText, date))) return false;
  const claimTokens = distinctiveTokens(String(claimText).replace(/\b\d{4}-\d{2}-\d{2}\b/g, " "));
  const responseTokens = distinctiveTokens(responseText);
  return (claimTokens.size > 0 || isoDates.length > 0)
    && [...claimTokens].every((token) => responseTokens.has(token));
}

function assessResidentNeeds(contract, answer = {}) {
  const sources = Array.isArray(answer.sources) ? answer.sources : [];
  const claimsWereReported = Array.isArray(answer.claims);
  const verifiedClaimEntries = claimsWereReported ? answer.claims
    .map((claim, index) => ({ claim, index }))
    .filter(({ claim }) => claim?.verified === true) : [];
  const claims = verifiedClaimEntries.map(({ claim }) => claim);
  const actions = Array.isArray(answer.actions) ? answer.actions : [];
  const conflicts = Array.isArray(answer.conflicts) ? answer.conflicts : [];
  const responseText = [answer.directAnswer, ...(answer.keyDetails || []), answer.answer].filter(Boolean).join(" ");
  const unassessableStatus = ["out-of-scope", "safety-rejected"].includes(answer.answerStatus);

  const needs = contract.needs.map((need) => {
    // The route request carries shared context, while evidenceFocus contains
    // the detail unique to this need. This prevents proof for one sibling
    // need from satisfying another.
    const needTokens = distinctiveTokens(need.evidenceFocus || need.request);
    const explicitSourceIds = new Set(sources.filter((source) => Array.isArray(source.retrievedForNeedIds)
      && source.retrievedForNeedIds.includes(need.id)).map(sourceId));
    const candidateSources = sources.filter((source) => explicitSourceIds.has(sourceId(source))
      || enoughSemanticOverlap(needTokens, sourceEvidenceText(source, claims, actions)));
    const candidateSourceIds = candidateSources.map(sourceId).filter(Boolean);
    const relevantActions = actions.filter((action) => action.sourceId && candidateSourceIds.includes(action.sourceId)
      || enoughSemanticOverlap(needTokens, `${action.label || ""} ${action.context || ""}`));
    const relevantClaimEntries = verifiedClaimEntries.filter(({ claim }) => {
      const mappedCandidates = candidateSources.filter((source) => (claim.evidenceSourceIds || []).includes(sourceId(source)));
      const explicitlyRoutedForNeed = need.requestedDetails.some((detail) => detail !== "information")
        && mappedCandidates.some((source) => (source.retrievedForNeedIds || []).includes(need.id));
      return mappedCandidates.length > 0 && (explicitlyRoutedForNeed
        || enoughSemanticOverlap(needTokens, claim.text)
        || mappedCandidates.some((source) => enoughSemanticOverlap(needTokens, `${source.title || ""} ${source.excerpt || ""}`)));
    });
    const relevantConflicts = conflicts.filter((conflict) => {
      const ids = conflictSourceIds(conflict);
      return !ids.size || candidateSourceIds.some((id) => ids.has(id));
    });
    const claimCoversDetail = (detail, claim) => {
      const ordinarySupport = claimSupportsDetail(detail, claim.text, detail === "action" ? relevantActions : [])
        && claimIsRendered(responseText, claim.text);
      if (ordinarySupport) return true;
      if (detail !== "status" || !claimSupportsDetail("status", responseText)) return false;
      return candidateSources.some((source) => (claim.evidenceSourceIds || []).includes(sourceId(source))
        && ([...(source.capabilities || []), ...(source.authorityFacets || [])].includes("status")));
    };
    const supportingClaimEntries = relevantClaimEntries.filter(({ claim }) =>
      need.requestedDetails.some((detail) => claimCoversDetail(detail, claim)));
    const supportingClaims = supportingClaimEntries.map(({ claim }) => claim);
    const supportedDetails = need.requestedDetails.filter((detail) => supportingClaims.some((claim) => claimCoversDetail(detail, claim)));
    const missingDetails = need.requestedDetails.filter((detail) => !supportedDetails.includes(detail));

    let status = "missing-evidence";
    let reason = "no-verified-claim-for-need";
    if (unassessableStatus) { status = "unassessed"; reason = `answer-${answer.answerStatus}`; }
    else if (!contract.complete) { status = "ambiguous"; reason = "resident-clarification-needed"; }
    else if (relevantConflicts.length) { status = "conflict"; reason = "official-source-conflict"; }
    else if (!missingDetails.length) { status = "supported"; reason = "rendered-verified-claim-covers-need"; }
    else if (!claimsWereReported) { status = "unassessed"; reason = "answer-has-no-claim-evidence-map"; }

    return {
      needId: need.id, request: need.request, status, reason, candidateSourceIds,
      supportingSourceIds: [...new Set(supportingClaims.flatMap((claim) => claim.evidenceSourceIds || []))],
      supportingClaimIndexes: supportingClaimEntries.map(({ index }) => index),
      relevantActionIndexes: relevantActions.map((action) => actions.indexOf(action)),
      supportedDetails, missingDetails,
    };
  });
  const counts = needs.reduce((result, need) => { result[need.status] = (result[need.status] || 0) + 1; return result; }, {});
  const outcome = counts.conflict ? "conflict" : counts.ambiguous ? "ambiguous" : counts["missing-evidence"] ? "missing-evidence" : counts.unassessed ? "unassessed" : "complete";
  return { version: "resident-need-evidence-v1", outcome, counts, needs };
}

module.exports = { assessResidentNeeds, buildResidentRequestContract, splitResidentNeeds };

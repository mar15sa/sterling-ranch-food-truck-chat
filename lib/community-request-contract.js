const { deterministicRequestedDetails } = require("./community-interpretation");

const LEADING_QUESTION = /^(?:what|which|where|when|who|whose|how|is|are|am|was|were|can|could|may|might|must|should|would|will|do|does|did|has|have)\b/i;
const IMPERATIVE_REQUEST = /^(?:check|explain|find|give|help|list|look up|open|reimburse|reveal|show|tell|write)\b/i;
const SECOND_QUESTION = /(?:\s*[?;]\s*|\s*,?\s+(?:and|also)\s+)(?=(?:what|which|where|when|who|whose|how|is|are|am|was|were|can|could|may|might|must|should|would|will|do|does|did|has|have)\b)/gi;
const SUBJECTLESS_QUESTION = /^(?:how much does it cost|what does it cost|can (?:i|we)|is it (?:allowed|okay|ok|permitted|possible))$/i;
const GENERIC_INCOMPLETE_REQUEST = /^(?:please\s+)?(?:help(?:\s+me)?|more info(?:rmation)?|details|tell me more|what about (?:that|this|it))$/i;
const EMBEDDED_QUESTION = /(?:^|[.!?]\s+)(?:what|which|where|when|who|whose|how|is|are|am|was|were|can|could|may|might|must|should|would|will|do|does|did|has|have)\b/i;
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
  // A form and the receipt required by that same reimbursement form are one
  // request. Keeping them together prevents the dependent receipt clause from
  // searching the wider corpus as though it were an unrelated topic.
  if (/\bparks?[- ]?pass\b/i.test(text) && /\breimburs\w*\b/i.test(text) && /\breceipt\b/i.test(text)) return [text];
  const clauses = text.split(SECOND_QUESTION).map(cleanClause).filter(Boolean);
  return clauses.length ? clauses : [text];
}

function priorClauseSubject(value = "") {
  const text = cleanClause(value);
  const afterFor = text.match(/\bfor\s+((?:a|an|the)\s+)?([^?]+)$/i);
  if (afterFor && !/\b(?:village|neighborhood|community)\b/i.test(afterFor[2])) {
    return cleanClause(`${afterFor[1] || ""}${afterFor[2]}`);
  }
  const namedQuestionSubject = text.match(/^(?:which|what)\s+(.+?)\s+(?:is|are|was|were|will|can|does|did)\b/i);
  if (namedQuestionSubject) return cleanClause(namedQuestionSubject[1]);
  const yesNoSubject = text.match(/^(?:is|are|was|were|can|could|may|does|do)\s+((?:the|a|an|my|our)\s+)?(.+?)\s+(?:open|closed|available|allowed|permitted|required|located)\b/i);
  if (yesNoSubject) return cleanClause(`${yesNoSubject[1] || ""}${yesNoSubject[2]}`);
  return "";
}

function priorClauseDateContext(value = "") {
  const text = cleanClause(value);
  return text.match(/\b(?:today|tomorrow|tonight|this week|next week|last week|Labor Day|Memorial Day|Independence Day|New Year(?:'s)? Day|Christmas(?: Day)?|Thanksgiving(?: Day)?|Martin Luther King(?: Jr\.?)? Day|Presidents?' Day|Juneteenth)\b/i)?.[0] || "";
}

function routingRequestForClause(text = "", priorClauses = []) {
  if (!priorClauses.length) return text;
  const prior = priorClauses[priorClauses.length - 1];
  const subject = priorClauseSubject(prior);
  if (!subject) return text;
  const dateContext = priorClauseDateContext(prior);
  const datedSuffix = dateContext && !new RegExp(`\\b${dateContext.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)
    ? ` on ${dateContext}`
    : "";
  if (/\bits\b/i.test(text)) return cleanClause(text.replace(/\bits\b/i, `${subject.replace(/^the\s+/i, "the ")}'s`));
  if (/\b(?:it|they|them|those|these|that|this)\b/i.test(text)) return `${text} for ${subject}`;
  const contentTokens = [...distinctiveTokens(text)].filter((token) => ![
    "action", "application", "cost", "date", "form", "hour", "information", "menu", "permission", "price", "regular", "remain", "status",
  ].includes(token));
  return contentTokens.length ? text : `${text} for ${subject}${datedSuffix}`;
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
  if (details.includes("reimbursement")) return "reimbursement";
  if (details.includes("eligibility")) return "eligibility";
  if (details.includes("price")) return "price";
  if (details.includes("contact")) return "contact";
  if (details.includes("status")) return "status";
  if (details.includes("hours")) return "hours";
  if (details.includes("date")) return "schedule";
  if (details.includes("specification")) return "specification";
  if (details.includes("action")) return "action";
  if (["payment", "booking", "application", "registration", "account-access"].includes(goal)) return "action";
  return "information";
}

function evidenceKindForNeed(goal = "", details = [], text = "") {
  if (["permission", "specification", "quantity", "eligibility", "reimbursement"].some((detail) => details.includes(detail))) return "governing-rule";
  if (["date", "status"].some((detail) => details.includes(detail))) return "live-operation";
  if (details.includes("hours") && /\b(?:right now|current|currently|today|tonight)\b/i.test(text)) return "live-operation";
  if (["payment", "booking", "application", "registration", "account-access"].includes(goal)) return "official-action";
  if (details.includes("action")) return "official-process";
  return "official-information";
}

function landscapeEstablishmentBillingShape(text = "") {
  const value = String(text);
  const establishment = /\b(?:establish(?:ing|ment)?|new)\b.{0,60}\b(?:lawn|landscap(?:e|ing)|plants?|sod|turf)\b|\b(?:lawn|landscap(?:e|ing)|plants?|sod|turf)\b.{0,60}\b(?:establish(?:ing|ment)?|new)\b/i.test(value);
  const billing = /\b(?:water|irrigation)\b/i.test(value)
    && /\b(?:bill(?:ed|ing)?|budget|charge|discount|exempt(?:ion)?|fee|rate|tier|cost|price|reduc(?:e|ed|tion))\b/i.test(value);
  const exactAmount = /\b(?:how much|exact (?:amount|rate|price|cost)|what (?:is|are) (?:the )?(?:amount|rate|price|cost)|percentage|percent)\b|\$\s*\d/i.test(value);
  return { matches: establishment && billing, exactAmount };
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
    const sharedDatedHoursRequest = index === 0
      && clauses.length > 1
      && /\b(?:open|closed)\b/i.test(text)
      && Boolean(priorClauseDateContext(text))
      && clauses.slice(1).some((clause) => /\bhours?\b/i.test(clause));
    const routeRequest = usedPriorContext && clauses.length === 1
      ? resolvedQuestion
      : sharedDatedHoursRequest
        ? routingRequestForClause(clauses.slice(1).find((clause) => /\bhours?\b/i.test(clause)) || text, [text])
      : routingRequestForClause(text, clauses.slice(0, index));
    const evidenceFocus = usedPriorContext && clauses.length === 1 ? request : text;
    const establishmentBilling = landscapeEstablishmentBillingShape(evidenceFocus);
    const parkPassReimbursement = /\b(?:reimburs\w*|refund\w*|pay(?:ing)? me back)\b/i.test(evidenceFocus)
      && /\bparks?\b.{0,30}\bpass\b|\bpass\b.{0,30}\bparks?\b/i.test(evidenceFocus);
    let explicitDetails = deterministicRequestedDetails(evidenceFocus);
    const permissionModal = /^(?:can|could|may)\s+(?:i|we)\s+(?!find|get|see|view|check|pay|contact|call|open|download|access)\b/i.test(evidenceFocus)
      || /^(?:can|could|may)\s+you\s+(?!find|get|see|view|check|pay|contact|call|open|download|access|explain|show|tell|list|look up)\b/i.test(evidenceFocus)
      || /^(?:so\s+)?(?:do\s+(?:i|we)\s+have\s+to|must\s+(?:i|we)|am\s+i\s+required\s+to|are\s+we\s+required\s+to)\b/i.test(evidenceFocus)
      || /^(?:is|are|would)\b.{0,120}\b(?:okay|ok|allowed|permitted|prohibited)\b/i.test(evidenceFocus);
    if (!explicitDetails.includes("permission") && permissionModal
      && !explicitDetails.includes("specification")) {
      explicitDetails = [...explicitDetails, "permission"];
    }
    if (/^open\b/i.test(evidenceFocus)) {
      explicitDetails = ["action"];
    }
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
    if (/\b(?:reimburs\w*|refund\w*|pay(?:ing)? me back)\b/i.test(evidenceFocus)) {
      const requestsAmount = explicitDetails.includes("price")
        || /\b(?:how much|exact(?: dollar)? amount|dollar amount|reimbursement amount|amount reimbursed)\b/i.test(evidenceFocus);
      explicitDetails = requestsAmount ? ["reimbursement", "price"] : ["reimbursement"];
    }
    // A resident asking whether new landscaping receives a special billing
    // treatment is asking about the published utility policy. Words such as
    // "can" and "when" must not reroute that question to permission rules or
    // a live schedule. Preserve a price need only when an amount is requested.
    if (establishmentBilling.matches) {
      explicitDetails = establishmentBilling.exactAmount ? ["information", "price"] : ["information"];
    }
    if (/\bhalloween\b/i.test(evidenceFocus)
      && /\bdecorat(?:e|ed|ing|ions?)\b/i.test(evidenceFocus)
      && !/\b(?:lights?|lighting)\b/i.test(evidenceFocus)
      && explicitDetails.includes("date")) {
      // The approved source sets dates for seasonal lighting, while ordinary
      // "decorate" wording can also mean non-light decor. Preserve that scope
      // distinction so a correct lighting date cannot silently complete the
      // broader request.
      explicitDetails = [...new Set([...explicitDetails, "specification"])];
    }
    const goal = establishmentBilling.matches
      ? (establishmentBilling.exactAmount ? "cost" : "information")
      : goalForNeed(text, explicitDetails, plan, index, clauses.length);
    const requestedDetails = explicitDetails.length ? explicitDetails : detailsForGoal(goal);
    return {
      id: `need-${index + 1}`,
      text,
      request,
      routeRequest: establishmentBilling.matches
        ? `landscape establishment water billing ${establishmentBilling.exactAmount ? "rate amount" : "treatment"}`
        : parkPassReimbursement
          ? "How do I use the park pass reimbursement form?"
        : routeRequest,
      evidenceFocus,
      usedPriorContext,
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
    complete: needs.length > 0 && needs.every((need) => requestLooksComplete(need.text, {
      usedPriorContext, request: need.request, resolvedQuestion,
    })),
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
  if (/^ke(?:ep|eps|eping|pt)$/.test(token)) return "location";
  if (/^stor(?:e|ed|es|ing|age)$/.test(token)) return "location";
  if (/^plac(?:e|ed|es|ing|ement)$/.test(token)) return "location";
  if (/^locat(?:e|ed|es|ing|ion|ions)$/.test(token)) return "location";
  if (/^return(?:s|ed|ing)?$/.test(token)) return "location";
  if (/^(?:stay|stays|stayed|staying|remain|remains|remained|remaining)$/.test(token)) return "remain";
  if (/^(?:year|years|period|periods|season|seasons|seasonal)$/.test(token)) return "period";
  if (/^(?:application|applications|form|forms|sheet|sheets|submittal|submittals|submission|submissions)$/.test(token)) return "application";
  return token.replace(/(?:'s|s)$/i, "");
}

function distinctiveTokens(value = "") {
  return new Set((String(value).match(/[a-z0-9]+/gi) || []).map(normalizedToken)
    .filter((token) => token.length > 1 && !COMMON_WORDS.has(token)));
}

function requestLooksComplete(text = "", { usedPriorContext = false, request = "", resolvedQuestion = "" } = {}) {
  const cleaned = cleanClause(text);
  if (!cleaned || SUBJECTLESS_QUESTION.test(cleaned) || GENERIC_INCOMPLETE_REQUEST.test(cleaned)) return false;
  if (LEADING_QUESTION.test(cleaned) || IMPERATIVE_REQUEST.test(cleaned) || EMBEDDED_QUESTION.test(cleaned)) return true;
  if (usedPriorContext && request === resolvedQuestion) return true;
  // Residents often type the topic itself ("Chickens", "trash/recycling info")
  // rather than a grammatically complete question. A concrete topic is enough
  // to search; generic fragments above still ask for clarification.
  return distinctiveTokens(cleaned).size > 0;
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
  if (detail === "permission") return /\b(?:yes|no|allowed|bars?|forbids?|disallows?|prohibited|required|requires|approval|permission|can|may|must)\b/i.test(text);
  if (detail === "eligibility") return /\b(?:eligible|eligibility|qualif(?:y|ies|ied|ication)|reimburs\w*|refund\w*|pay(?:ing)? back)\b/i.test(text);
  if (detail === "reimbursement") return /\b(?:reimburs\w*|refund\w*|pay(?:ing)? back)\b/i.test(text);
  if (detail === "action") return actions.length > 0 || /\b(?:access|apply|bring|submit|book|exchange|reserve|register|pay|open|call|email|visit(?:ing)?|select)\b/i.test(text);
  if (detail === "contact") return /@|(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/.test(text);
  if (detail === "hours") return /\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/i.test(text)
    || /\bdoes not\b.{0,80}\b(?:give|set|state|specify|provide|publish|list)\b.{0,80}\b(?:time|hour)\b/i.test(text);
  if (detail === "date") return /\b(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)\b|\b\d{4}-\d{2}-\d{2}(?=\b|T)/i.test(text);
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

function responseContainsIsoDate(responseText, isoDate, renderingContext = {}) {
  if (String(responseText).includes(isoDate)) return true;
  const dateRange = renderingContext.routingPlan?.dateRange;
  if (dateRange?.start === isoDate && dateRange?.end === isoDate
    && new RegExp(`\\b${dateRange.kind}\\b`, "i").test(String(responseText))) return true;
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day || !MONTH_NAMES[month - 1]) return false;
  const writtenDate = new RegExp(`\\b${MONTH_NAMES[month - 1]}\\s+0?${day}(?:st|nd|rd|th)?(?:,)?\\s+${year}\\b`, "i");
  const writtenDateWithoutYear = new RegExp(`\\b${MONTH_NAMES[month - 1]}\\s+0?${day}(?:st|nd|rd|th)?\\b(?!\\s*,?\\s*\\d{4})`, "i");
  return writtenDate.test(String(responseText)) || writtenDateWithoutYear.test(String(responseText));
}

function responseContainsIsoTime(responseText, isoDateTime) {
  const match = String(isoDateTime).match(/T(\d{2}):(\d{2})/);
  if (!match) return true;
  const hour24 = Number(match[1]);
  const minute = match[2];
  const hour12 = hour24 % 12 || 12;
  const meridiem = hour24 < 12 ? "a" : "p";
  const writtenTime = new RegExp(`\\b${hour12}${minute === "00" ? "(?::00)?" : `:${minute}`}\\s*${meridiem}\\.?m\\.?(?!\\w)`, "i");
  const twentyFourHourTime = new RegExp(`\\b${String(hour24).padStart(2, "0")}:${minute}\\b`);
  return writtenTime.test(String(responseText)) || twentyFourHourTime.test(String(responseText));
}

function claimIsRendered(responseText = "", claimText = "", renderingContext = {}) {
  const isoDateTimes = String(claimText).match(/\b\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?\b/g) || [];
  if (isoDateTimes.some((value) => !responseContainsIsoDate(responseText, value.slice(0, 10), renderingContext)
    || !responseContainsIsoTime(responseText, value))) return false;
  const claimTokens = distinctiveTokens(String(claimText).replace(/\b\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?\b/g, " "));
  const responseTokens = distinctiveTokens(responseText);
  return (claimTokens.size > 0 || isoDateTimes.length > 0)
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
  const handledBoundaryStatus = ["out-of-scope", "safety-rejected"].includes(answer.answerStatus);
  const completionMissingDetails = new Set((answer.completion?.missingDetails || []).map((detail) => detail?.key).filter(Boolean));
  const hasCompletionFacetContract = Array.isArray(answer.completion?.requestedDetails)
    && answer.completion.requestedDetails.length > 0;

  const needs = contract.needs.map((need) => {
    // The route request carries shared context, while evidenceFocus contains
    // the detail unique to this need. This prevents proof for one sibling
    // need from satisfying another.
    const needTokens = distinctiveTokens(`${need.evidenceFocus || need.request} ${need.usedPriorContext ? need.subjectHint || "" : ""}`);
    const explicitSourceIds = new Set(sources.filter((source) => Array.isArray(source.retrievedForNeedIds)
      && source.retrievedForNeedIds.includes(need.id)).map(sourceId));
    const candidateSources = sources.filter((source) => explicitSourceIds.has(sourceId(source))
      || enoughSemanticOverlap(needTokens, sourceEvidenceText(source, claims, actions)));
    const candidateSourceIds = candidateSources.map(sourceId).filter(Boolean);
    const relevantActions = actions.filter((action) => action.sourceId && candidateSourceIds.includes(action.sourceId)
      || enoughSemanticOverlap(needTokens, `${action.label || ""} ${action.context || ""}`));
    const relevantClaimEntries = verifiedClaimEntries.filter(({ claim }) => {
      if (landscapeEstablishmentBillingShape(need.request).matches
        && !/\b(?:45\s+days?|establish(?:ing|ment)?|lawn|landscap(?:e|ing)|plants?|sod|turf)\b/i.test(String(claim.text || ""))) {
        return false;
      }
      const mappedCandidates = candidateSources.filter((source) => (claim.evidenceSourceIds || []).includes(sourceId(source)));
      const fullRequestTokens = distinctiveTokens(need.request);
      const explicitlySupportedNeed = Array.isArray(claim.supportedForNeedIds)
        && claim.supportedForNeedIds.includes(need.id);
      const explicitlyRoutedVerifiedClaim = answer.confidence?.canAnswer === true
        && answer.answerStatus === "verified"
        && mappedCandidates.some((source) => (source.retrievedForNeedIds || []).includes(need.id));
      const explicitlyRoutedStatus = need.requestedDetails.includes("status")
        && mappedCandidates.some((source) => (source.retrievedForNeedIds || []).includes(need.id)
          && [...(source.capabilities || []), ...(source.authorityFacets || [])].includes("status"));
      const explicitlyRoutedDate = need.requestedDetails.includes("date")
        && mappedCandidates.some((source) => (source.retrievedForNeedIds || []).includes(need.id)
          && [...(source.capabilities || []), ...(source.authorityFacets || [])]
            .some((facet) => ["date", "event-date"].includes(facet)));
      const explicitlyRoutedHours = need.requestedDetails.includes("hours")
        && mappedCandidates.some((source) => (source.retrievedForNeedIds || []).includes(need.id)
          && [...(source.capabilities || []), ...(source.authorityFacets || []), ...(source.facts || []).map((fact) => fact.type)]
            .some((facet) => ["hours", "schedule"].includes(facet))
          && enoughSemanticOverlap(fullRequestTokens, sourceEvidenceText(source, claims, actions)));
      return mappedCandidates.length > 0 && (explicitlySupportedNeed || explicitlyRoutedVerifiedClaim
        || explicitlyRoutedStatus || explicitlyRoutedDate || explicitlyRoutedHours
        || enoughSemanticOverlap(needTokens, claim.text)
        || mappedCandidates.some((source) => {
          const facets = new Set([...(source.capabilities || []), ...(source.authorityFacets || []), ...(source.facts || []).map((fact) => fact.type)]
            .flatMap((facet) => [...distinctiveTokens(facet)])
            .filter((facet) => !["action", "date", "hour", "information", "status"].includes(facet)));
          return [...needTokens].some((token) => facets.has(token));
        })
        || mappedCandidates.some((source) => enoughSemanticOverlap(needTokens, source.title || "")));
    });
    const relevantConflicts = conflicts.filter((conflict) => {
      const ids = conflictSourceIds(conflict);
      return !ids.size || candidateSourceIds.some((id) => ids.has(id));
    });
    const claimCoversDetail = (detail, claim) => {
      const ordinarySupport = claimSupportsDetail(detail, claim.text, detail === "action" ? relevantActions : [])
        && claimIsRendered(responseText, claim.text, answer);
      if (ordinarySupport) return true;
      if (detail !== "status" || !claimSupportsDetail("status", responseText)) return false;
      return candidateSources.some((source) => (claim.evidenceSourceIds || []).includes(sourceId(source))
        && ([...(source.capabilities || []), ...(source.authorityFacets || [])].includes("status")));
    };
    const supportingClaimEntries = relevantClaimEntries.filter(({ claim }) =>
      need.requestedDetails.some((detail) => claimCoversDetail(detail, claim)));
    const supportingClaims = supportingClaimEntries.map(({ claim }) => claim);
    const supportedDetails = need.requestedDetails.filter((detail) => supportingClaims.some((claim) => claimCoversDetail(detail, claim))
      && (!hasCompletionFacetContract || !completionMissingDetails.has(detail)));
    const missingDetails = need.requestedDetails.filter((detail) => !supportedDetails.includes(detail));

    let status = "missing-evidence";
    let reason = "no-verified-claim-for-need";
    if (handledBoundaryStatus) { status = "handled-boundary"; reason = `answer-${answer.answerStatus}`; }
    else if (!contract.complete) { status = "ambiguous"; reason = "resident-clarification-needed"; }
    else if (relevantConflicts.length) { status = "conflict"; reason = "official-source-conflict"; }
    else if (!missingDetails.length) { status = "supported"; reason = "rendered-verified-claim-covers-need"; }
    else if (!claimsWereReported) { status = "unassessed"; reason = "answer-has-no-claim-evidence-map"; }

    return {
      needId: need.id, request: need.request, status, reason, candidateSourceIds,
      supportingSourceIds: [...new Set(supportingClaims.flatMap((claim) => claim.evidenceSourceIds || []))],
      relevantClaimIndexes: relevantClaimEntries.map(({ index }) => index),
      supportingClaimIndexes: supportingClaimEntries.map(({ index }) => index),
      relevantActionIndexes: relevantActions.map((action) => actions.indexOf(action)),
      supportedDetails, missingDetails,
    };
  });
  const counts = needs.reduce((result, need) => { result[need.status] = (result[need.status] || 0) + 1; return result; }, {});
  const outcome = counts.conflict ? "conflict" : counts.ambiguous ? "ambiguous" : counts["missing-evidence"] ? "missing-evidence" : counts.unassessed ? "unassessed" : counts["handled-boundary"] ? "handled-boundary" : "complete";
  return { version: "resident-need-evidence-v1", outcome, counts, needs };
}

module.exports = { assessResidentNeeds, buildResidentRequestContract, requestLooksComplete, splitResidentNeeds };

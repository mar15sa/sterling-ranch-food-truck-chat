const { deterministicRequestedDetails } = require("./community-interpretation");

const LEADING_QUESTION = /^(?:what|which|where|when|who|whose|how|is|are|am|was|were|can|could|may|might|must|should|would|will|do|does|did|has|have)\b/i;
const IMPERATIVE_REQUEST = /^(?:check|explain|find|give|help|list|look up|open|reimburse|reveal|show|tell|write)\b/i;
const SECOND_QUESTION = /(?:\s*[?;]\s*|\s*,?\s+(?:and|also)\s+)(?=(?:what|which|where|when|who|whose|how|is|are|am|was|were|can|could|may|might|must|should|would|will|do|does|did|has|have)\b)/gi;
const CONDITIONAL_SECOND_QUESTION = /\s*,?\s+and\s+if\s+(?:it|that|they)\s+(?:is|are|does|do|can|will),?\s+(?=(?:what|which|where|when|who|whose|how|is|are|can|could|may|should|would|will|do|does)\b)/gi;
const ADDITIONAL_REQUEST = /\?\s*(?=(?:please|also)\s+(?:include|add|tell|show|give)\b)|\s+plus\s+(?=(?:the|a|an|what|which|where|when|how)\b)|\s+and\s+(?=the\s+(?:(?:usual|regular|normal|weekly)\s+(?:schedule|hours?)|rule\s+for)\b)/gi;
const SUBJECTLESS_QUESTION = /^(?:how much does it cost|what does it cost|can (?:i|we)|is it (?:allowed|okay|ok|permitted|possible))$/i;
const GENERIC_INCOMPLETE_REQUEST = /^(?:please\s+)?(?:help(?:\s+me)?|more info(?:rmation)?|details|tell me more|what about (?:that|this|it))$/i;
const GENERIC_ELABORATION = /^(?:what|anything) else\s+(?:(?:should|do|can|could|would)\s+)?(?:i|we)\s+(?:know|do)|^(?:what|anything) else$/i;
const EMBEDDED_QUESTION = /(?:^|[.!?]\s+)(?:what|which|where|when|who|whose|how|is|are|am|was|were|can|could|may|might|must|should|would|will|do|does|did|has|have)\b/i;
const COMMON_WORDS = new Set([
  "a", "about", "after", "all", "am", "an", "and", "are", "at", "be", "before", "below", "can", "could", "do", "does", "for", "from",
  "find", "get", "guidance", "had", "has", "have", "here", "how", "i", "in", "is", "it", "its", "me", "my", "of", "on", "or", "our", "please", "process",
  "regarding", "should", "that", "the", "their", "them", "there", "these", "this", "those", "to", "today", "tomorrow", "use", "was",
  "we", "were", "what", "when", "where", "which", "who", "will", "with", "would", "you", "your", "they",
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
  // Automatic-versus-self-setup is one comparison backed by one official
  // service-setup source. Splitting "which ones" loses the shared service
  // subject and turns ordinary comparison wording into date/permission needs.
  if (/\b(?:services?|utilities?)\b/i.test(text)
    && /\bautomatically\b/i.test(text)
    && /\b(?:set ?up|start|activate)\b/i.test(text)) return [text];
  const clauses = text.split(CONDITIONAL_SECOND_QUESTION).flatMap((clause) => clause.split(SECOND_QUESTION))
    .flatMap((clause) => clause.split(ADDITIONAL_REQUEST)).map(cleanClause).filter(Boolean);
  // “What else should I know?” asks for useful context about the first topic;
  // it is not a separate evidence subject. Splitting it into a standalone
  // need invites broad retrieval to attach unrelated but approved material.
  if (clauses.length > 1 && clauses.slice(1).every((clause) => GENERIC_ELABORATION.test(clause))) return [text];
  return clauses.length ? clauses : [text];
}

function priorClauseSubject(value = "") {
  const text = cleanClause(value);
  const serviceBill = text.match(/\b((?:(?:water|sewer|trash|utility)(?:\s+and\s+(?:water|sewer|trash|utility))?\s+)?bills?)\b/i);
  if (serviceBill) return cleanClause(serviceBill[1]);
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
  if (details.includes("eligibility")) return "eligibility";
  if (details.includes("permission")) return "permission";
  if (details.includes("price")) return "cost";
  if (details.includes("contact")) return "contact";
  if (details.includes("status")) return "status";
  if (details.includes("hours")) return "hours";
  if (details.includes("specification")) return "information";
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
  if (details.includes("action")) return "action";
  if (details.includes("contact")) return "contact";
  if (details.includes("status")) return "status";
  if (details.includes("hours")) return "hours";
  if (details.includes("date")) return "schedule";
  if (details.includes("specification")) return "specification";
  if (["payment", "booking", "application", "registration", "account-access"].includes(goal)) return "action";
  return "information";
}

function evidenceKindForNeed(goal = "", details = [], text = "") {
  if (details.includes("specification")
    && (/\bhow (?:long|far ahead)\b|\bwhen\b.{0,60}\b(?:hear back|response|reply)\b/i.test(text))) {
    return "official-information";
  }
  if (["permission", "specification", "quantity", "eligibility", "reimbursement"].some((detail) => details.includes(detail))) return "governing-rule";
  if (["date", "status"].some((detail) => details.includes(detail))) return "live-operation";
  if (details.includes("hours") && /\b(?:right now|current|currently|today|tonight)\b/i.test(text)) return "live-operation";
  if (["payment", "booking", "application", "registration", "account-access"].includes(goal)) return "official-action";
  if (details.includes("action")) return "official-process";
  return "official-information";
}

function landscapeEstablishmentBillingShape(text = "") {
  const value = String(text);
  const establishment = /\b(?:establish(?:ing|ment)?|new)\b.{0,60}\b(?:lawn|landscap(?:e|ing)|plants?|sod|turf)\b|\b(?:lawn|landscap(?:e|ing)|plants?|sod|turf)\b.{0,60}\b(?:establish(?:ing|ment)?|new)\b|\bestablishment\s+water\b|\bwater\b.{0,40}\b(?:during|for)\s+(?:the\s+)?establishment\b/i.test(value);
  const billing = /\b(?:water|irrigation)\b/i.test(value)
    && /\b(?:bill(?:ed|ing)?|budget|charge|discount|exempt(?:ion)?|fee|free|rate|tier|cost|price|reduc(?:e|ed|tion))\b/i.test(value);
  const exactAmount = /\b(?:how much|exact (?:amount|rate|price|cost)|what (?:is|are) (?:the )?(?:amount|rate|price|cost)|percentage|percent)\b|\$\s*\d/i.test(value);
  return { matches: establishment && billing, exactAmount };
}

function landscapeEstablishmentWaterShape(text = "") {
  const value = String(text);
  return /\b(?:sod|turf|lawn|landscap(?:e|ing)|plants?|plant material)\b/i.test(value)
    && /\b(?:establish(?:ing|ment)?|new|laid|installed?)\b/i.test(value)
    && /\b(?:water|billing|billed|budget|tier|days?|period|last)\b/i.test(value);
}

function caregiverPassShape(text = "") {
  return /\bcaregiver pass\b/i.test(text)
    || /\b(?:watch(?:es|ing)?|care(?:s|d|ing)? for|look(?:s|ed|ing)? after)\b.{0,50}\b(?:kids?|children|child)\b/i.test(text);
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
    let resolvedRouteRequest = usedPriorContext && clauses.length === 1
      ? resolvedQuestion
      : sharedDatedHoursRequest
        ? routingRequestForClause(clauses.slice(1).find((clause) => /\bhours?\b/i.test(clause)) || text, [text])
      : routingRequestForClause(text, clauses.slice(0, index));
    const sharedFacility = originalQuestion.match(/\b(pool|clubhouse|pickleball(?: courts?)?|courts?|facility|amenity|pavilion|shelter)\b/i)?.[0] || "";
    let subjectContext = "";
    if (sharedFacility && !/\b(?:pool|clubhouse|pickleball courts?|courts?|facility|amenity|pavilion|shelter)\b/i.test(text)
      && /\b(?:right now|at the moment|currently|live|open|closed|hours?|schedule|parking|park|late|stay|close|play)\b/i.test(text)) {
      resolvedRouteRequest = `${resolvedRouteRequest} for the ${sharedFacility}`;
      subjectContext = sharedFacility;
    }
    // If a dependent clause does not contain enough grammar to recover its
    // subject ("where do I report it?", "when should I hear back?"), route
    // it with the resident-authored prior clause. This is retrieval context,
    // not answer evidence, and prevents generic process words from selecting
    // an unrelated approved page.
    const independentClauseTokens = [...distinctiveTokens(text)].filter((token) => ![
      "action", "application", "correct", "date", "form", "hour", "information", "menu", "permission", "price", "regular", "report", "status",
    ].includes(token));
    const dependentReference = /\b(?:it|its|they|them|those|these|that|this|their)\b/i.test(text);
    let routeRequest = index > 0 && resolvedRouteRequest === text
      && (independentClauseTokens.length === 0 || dependentReference)
      ? request
      : resolvedRouteRequest;
    const evidenceFocus = usedPriorContext && clauses.length === 1 ? request : text;
    const establishmentBilling = landscapeEstablishmentBillingShape(evidenceFocus);
    const establishmentWater = landscapeEstablishmentWaterShape(request);
    const sharedClauseContext = clauses.slice(0, index + 1).join(" ");
    const sharedWasteSubject = sharedClauseContext.match(/\b(recycling|recycle|trash|garbage|waste)\b/i)?.[1] || "";
    // Containers are meaningful nouns, but they do not identify which service
    // the resident means. Carry a prior waste subject into storage clauses so
    // retrieval searches the governing container rule instead of any page that
    // happens to mention a bin, pickup, or something being kept outside.
    if (index > 0 && sharedWasteSubject
      && /\b(?:bins?|cans?|carts?|containers?)\b/i.test(text)
      && /\b(?:store|stored|storage|keep|keeping|stay|outside|screen(?:ed)?|put away)\b/i.test(text)
      && !/\b(?:recycling|recycle|trash|garbage|waste)\b/i.test(routeRequest)) {
      routeRequest = `${sharedWasteSubject} container storage rule: ${routeRequest}`;
      subjectContext = sharedWasteSubject;
    }
    const foodMenuRequest = /\b(?:menus?|order)\b|\bwhat\b.{0,40}\b(?:sell|serv(?:e|ing))\b/i.test(text)
      && /\b(?:food\s*trucks?|trucks?|dinner)\b/i.test(sharedClauseContext);
    const parkPassReimbursement = /\b(?:reimburs\w*|refund\w*|pay(?:ing)? me back)\b/i.test(evidenceFocus)
      && /\bparks?\b.{0,30}\bpass\b|\bpass\b.{0,30}\bparks?\b/i.test(evidenceFocus);
    let explicitDetails = deterministicRequestedDetails(evidenceFocus);
    if (foodMenuRequest) explicitDetails = ["menu"];
    if (/\b(?:what|which)\s+score\b|\bpoints?\b/i.test(evidenceFocus)
      && /\b(?:court|game|play|player|pickleball|tennis)\b/i.test(sharedClauseContext)) {
      explicitDetails = ["information"];
    }
    if (/\bhow\b.{0,45}\b(?:players?|people|teams?)\b.{0,30}\b(?:rotate|take turns?|move in|join)\b/i.test(evidenceFocus)) {
      explicitDetails = ["information"];
    }
    if (/\b(?:watch|monitor|track)\b.{0,60}\bwater (?:use|usage)\b/i.test(evidenceFocus)
      || /\bwater (?:use|usage)\b.{0,80}\b(?:alert|warn|notif)\w*\b/i.test(evidenceFocus)) {
      explicitDetails = ["information"];
    }
    // "Text, email, or phone" describes UtilityHawk notification channels;
    // it is not a request for a staff phone number or email address.
    if (/\butility\s*hawk\b/i.test(sharedClauseContext)
      && /\b(?:alert|warn|notif)\w*\b/i.test(sharedClauseContext)
      && /\b(?:text|e-?mail|phone)\b/i.test(evidenceFocus)) {
      explicitDetails = ["information"];
    }
    if (/\bwho should\b.{0,70}\bcontact\b/i.test(evidenceFocus)
      && !/\b(?:email|phone|number|address|contact details?|contact information)\b/i.test(evidenceFocus)) {
      explicitDetails = ["information"];
    }
    if (/\bwhen\b.{0,60}\b(?:bins?|cans?|carts?|containers?)?\b.{0,30}\b(?:brought|bring|returned?|put)\b.{0,15}\b(?:back|in)\b/i.test(evidenceFocus)) {
      explicitDetails = ["hours"];
    }
    if (explicitDetails.includes("hours") && explicitDetails.includes("permission")
      && /^(?:what time|when)\b/i.test(evidenceFocus)
      && /\bneed to\b/i.test(evidenceFocus)
      && !/\b(?:permission|approval)\b/i.test(evidenceFocus)) {
      // “What time do I need to…” asks for an operational deadline. Treating
      // “need to” as a second permission request adds an irrelevant caveat.
      explicitDetails = explicitDetails.filter((detail) => detail !== "permission");
    }
    if (/\bwhat does\b.{0,60}\b(?:fixed|monthly|base)\b.{0,30}\b(?:fee|charge)\b.{0,20}\b(?:pay for|include|cover)\b/i.test(evidenceFocus)
      || /\bis\b.{0,40}\busage charge\b.{0,20}\bfixed\b/i.test(evidenceFocus)) {
      explicitDetails = ["information"];
    }
    const explicitFormAction = /\b(?:which|what|where)\b.{0,70}\b(?:application|form|paperwork)\b/i.test(evidenceFocus)
      || /\b(?:application|form|paperwork)\b.{0,70}\b(?:do|should|can)\s+(?:i|we)\s+(?:use|submit|file)\b/i.test(evidenceFocus)
      || /\b(?:application|form|paperwork)\b.{0,30}\bto\s+(?:use|submit|file|apply)\b/i.test(evidenceFocus)
      || /\b(?:submit|file|apply (?:with|using))\b.{0,70}\b(?:application|form|paperwork)\b/i.test(evidenceFocus);
    if (explicitFormAction && !/\b(?:need|require[sd]?)\s+(?:an?\s+)?(?:application\s+)?approval\b/i.test(evidenceFocus)) {
      explicitDetails = [...new Set(["action", ...explicitDetails.filter((detail) => detail === "contact")])];
    }
    if (/\b(?:need|require[sd]?)\s+(?:an?\s+)?(?:application\s+)?approval\b/i.test(evidenceFocus)) {
      explicitDetails = ["permission"];
    }
    if (/\b(?:water|utility)\b.{0,40}\b(?:bill|charge|payment)\b|\b(?:bill|charge|payment)\b.{0,40}\b(?:water|utility)\b/i.test(evidenceFocus)
      && /\b(?:pay|payment)\b/i.test(evidenceFocus)
      && /\b(?:online|portal|website|right place|where)\b/i.test(evidenceFocus)) {
      explicitDetails = ["action"];
    }
    if (/\b(?:pool|clubhouse|court|facility|amenity)\b/i.test(originalQuestion)
      && /\b(?:right now|at the moment|currently|live status)\b/i.test(evidenceFocus)
      && /\b(?:open|swim|use|status)\b/i.test(evidenceFocus)) {
      explicitDetails = explicitDetails.filter((detail) => detail !== "permission");
      if (!explicitDetails.includes("status")) explicitDetails = [...explicitDetails, "status"];
    }
    if (/\b(?:pool|clubhouse|court|facility|amenity)\b/i.test(originalQuestion)
      && /\b(?:regular|normal|normally|usual|weekly)\b.{0,30}\b(?:hours?|schedule|open)\b|\b(?:hours?|schedule)\b.{0,30}\b(?:regular|normal|normally|usual|weekly)\b/i.test(evidenceFocus)) {
      explicitDetails = [...new Set([...explicitDetails.filter((detail) => detail !== "date"), "hours"])];
    }
    if (/\b(?:pool|clubhouse|court|facility|amenity)\b/i.test(originalQuestion)
      && /\b(?:how late|until what time|when (?:does|will) .{0,30} close)\b/i.test(evidenceFocus)) {
      explicitDetails = ["hours"];
    }
    if (/\b(?:bins?|cans?|carts?|containers?)\b/i.test(sharedClauseContext)
      && /\b(?:store|stored|storage|keep|keeping|stay|outside|screen(?:ed)?|put away)\b/i.test(evidenceFocus)) {
      explicitDetails = explicitDetails.filter((detail) => detail !== "date");
      explicitDetails = [...new Set([...explicitDetails, "specification"])];
    }
    if ((/\b(?:home|house|residential (?:unit|property))\b/i.test(evidenceFocus)
      && /\b(?:airbnb|vrbo|vacation(?:ers?| rental)|short[- ]term|paying guests?|rent)\b/i.test(evidenceFocus)
      && /\b(?:nights?|weekend|day-to-day|week-to-week|short[- ]term)\b/i.test(evidenceFocus))
      || /\bpaying guests?\b.{0,50}\b(?:nights?|weekend)\b/i.test(evidenceFocus)) {
      explicitDetails = ["permission"];
    }
    if (/\b(?:campers?|motor ?homes?|recreational vehicles?|rvs?)\b/i.test(evidenceFocus)
      && /\b(?:driveway|park|parking|stay)\b/i.test(evidenceFocus)) {
      explicitDetails = [...new Set(["permission", "specification"] )];
    }
    if (/\bhow much snow\b/i.test(evidenceFocus)
      && /\b(?:trigger|threshold|clear|plow|priority)\b/i.test(evidenceFocus)) {
      explicitDetails = ["specification"];
    }
    if (caregiverPassShape(sharedClauseContext)
      && /\b(?:pay|payment|pickup|check|card|cash)\b/i.test(sharedClauseContext)) {
      explicitDetails = ["information"];
    }
    if (/\bsolar\b/i.test(evidenceFocus)
      && /\b(?:ground[- ]?mounted|roof[- ]?mounted|silver|black|arrang(?:e|ed|ement)|pattern|appearance)\b/i.test(evidenceFocus)) {
      explicitDetails = ["specification"];
    }
    if (explicitDetails.includes("contact")) {
      explicitDetails = explicitDetails.filter((detail) => detail !== "examples");
    }
    if (explicitDetails.includes("date") && /\bfood\s*trucks?|\btrucks?\b/i.test(sharedClauseContext)) {
      explicitDetails = explicitDetails.filter((detail) => detail !== "examples");
    }
    const permissionModal = /^(?:can|could|may)\s+(?:i|we)\s+(?!find|get|see|view|check|pay|contact|call|open|download|access)\b/i.test(evidenceFocus)
      || /^(?:can|could|may)\s+you\s+(?!find|get|see|view|check|pay|contact|call|open|download|access|explain|show|tell|list|look up)\b/i.test(evidenceFocus)
      || /^(?:so\s+)?(?:do\s+(?:i|we)\s+have\s+to|must\s+(?:i|we)|am\s+i\s+required\s+to|are\s+we\s+required\s+to)\b/i.test(evidenceFocus)
      || /^(?:is|are|would)\b.{0,120}\b(?:okay|ok|allowed|permitted|prohibited)\b/i.test(evidenceFocus);
    const subjectPermissionModal = /^(?:can|could|may)\s+(?:(?:the|my|our)\s+)?[^?]{1,100}\b(?:run|remain|stay|operate|park|water|irrigate)\b/i.test(evidenceFocus)
      || /\bdoes (?:that|this|it) (?:fit|follow|meet) (?:the )?(?:rules?|requirements?)\b/i.test(evidenceFocus);
    if (!explicitDetails.includes("permission") && (permissionModal || subjectPermissionModal)
      && !explicitDetails.includes("specification")) {
      explicitDetails = [...explicitDetails, "permission"];
    }
    if (/\b(?:pool|clubhouse|court|facility|amenity)\b/i.test(originalQuestion)
      && /\b(?:right now|at the moment|currently|live status)\b/i.test(evidenceFocus)
      && explicitDetails.includes("status")) {
      explicitDetails = explicitDetails.filter((detail) => detail !== "permission");
    }
    if (/\bcaregiver pass\b/i.test(sharedClauseContext)
      && /\b(?:pay|payment|pickup|check|card|cash)\b/i.test(sharedClauseContext)) {
      // A clause such as “Can I pay by check?” asks for an accepted payment
      // method. The modal verb must not turn it into a policy-permission need.
      explicitDetails = ["information"];
    }
    if (explicitDetails.includes("action") && explicitDetails.includes("permission")
      && /^(?:can|could|may)\s+you\s+(?:find|get|show|open|download|access)\b/i.test(evidenceFocus)) {
      explicitDetails = explicitDetails.filter((detail) => detail !== "permission");
    }
    if (explicitDetails.includes("price")
      && /\b(?:pay|charge[sd]?)\b.{0,20}\b(?:to )?park(?:ing)?\b|\bpark(?:ing)?\b.{0,20}\b(?:pay|charge[sd]?)\b/i.test(evidenceFocus)) {
      explicitDetails = explicitDetails.filter((detail) => detail !== "permission");
    }
    if (explicitDetails.includes("eligibility")) {
      // “Can my guest reserve?” asks whether that person qualifies. A booking
      // link is useful afterward, but eligibility is the fact to prove.
      explicitDetails = explicitDetails.filter((detail) => !["action", "permission"].includes(detail));
    }
    if (explicitDetails.includes("action") && explicitDetails.includes("permission")
      && /^(?:i|we)\s+(?:just\s+)?(?:need|want|would like|am trying)\s+to\s+(?:access|apply|book|download|find|log in|open|pay|register|reserve|sign in|submit)\b/i.test(evidenceFocus)) {
      // “I need to pay…” states the resident's task. It does not ask whether
      // payment is permitted or required. Keep “Do I need to…” as permission.
      explicitDetails = explicitDetails.filter((detail) => detail !== "permission");
    }
    if (/^open\b/i.test(evidenceFocus)) {
      explicitDetails = ["action"];
    }
    if (/^where\s+can\s+(?:i|we)\s+(?:read|view|find|access|download)\b/i.test(evidenceFocus)
      || /^where\s+(?:do|can|should)\s+(?:i|we)\s+(?:go\s+to\s+)?(?:read|view|find|access|download)\b/i.test(evidenceFocus)) {
      // “Where can I read/view…” asks for the usable official destination.
      // A nearby fact about the document is not enough without its action.
      explicitDetails = ["action"];
    }
    if (explicitDetails.includes("status") && !/\bhours?\b/i.test(text)
      && !/\b(?:regular|normal|normally|usual|weekly)\b.{0,30}\bschedule\b/i.test(text)
      && !/\bhow late\b|\buntil what time\b/i.test(text)) {
      explicitDetails = explicitDetails.filter((detail) => detail !== "hours");
    }
    if (explicitDetails.includes("date")
      && /\b(?:pool|clubhouse|court|facility|amenity)\b/i.test(sharedClauseContext)
      && /\bopen\b.{0,30}\b(?:new year(?:'s)? day|memorial day|independence day|labor day|thanksgiving|christmas)\b/i.test(evidenceFocus)) {
      // Being inside a published season does not establish special-holiday
      // operating hours. Keep that as a separate proof obligation.
      explicitDetails = [...new Set([...explicitDetails, "hours"])];
    }
    if (!explicitDetails.length && /^(?:can|could|may)\s+(?:that|those|these|this|it|they)\b/i.test(text)) {
      explicitDetails = ["permission"];
    }
    if (usedPriorContext && /^(?:can|could|may)\s+(?:that|those|these|this|it|they)\b/i.test(text)) {
      explicitDetails = ["permission"];
    }
    if (explicitDetails.includes("action") && /\bwhere\b.{0,80}\b(?:keep|place|store|locate)\b/i.test(request)) {
      explicitDetails = [...new Set(explicitDetails.map((detail) => detail === "action" ? "specification" : detail))];
    }
    if (explicitDetails.includes("action")
      && /\bwhere\b.{0,80}\b(?:read|find|view|see|learn)\b/i.test(request)
      && !/^where\s+(?:can|do|should)\s+(?:i|we)\b/i.test(evidenceFocus)) {
      explicitDetails = [...new Set(explicitDetails.map((detail) => detail === "action" ? "information" : detail))];
    }
    if (/\b(?:reimburs\w*|refund\w*|pay(?:ing)? me back)\b/i.test(evidenceFocus)) {
      const requestsAmount = explicitDetails.includes("price")
        || /\b(?:how much|exact(?: dollar)? amount|dollar amount|reimbursement amount|amount reimbursed)\b/i.test(evidenceFocus)
        || /\b(?:what|which) amount\b.{0,50}\breimburs\w*\b|\bamount\b.{0,50}\b(?:will|would|does|can)\b.{0,20}\breimburs\w*\b/i.test(evidenceFocus);
      explicitDetails = requestsAmount ? ["reimbursement", "price"] : ["reimbursement"];
    }
    // A resident asking whether new landscaping receives a special billing
    // treatment is asking about the published utility policy. Words such as
    // "can" and "when" must not reroute that question to permission rules or
    // a live schedule. Preserve a price need only when an amount is requested.
    if (establishmentBilling.matches) {
      explicitDetails = establishmentBilling.exactAmount ? ["information", "price"] : ["information"];
    }
    if (explicitDetails.includes("date")
      && /\b(?:holiday|hallowe+en|hallowen|christmas|xmas|thanksgiving|hanukkah|easter|valentine(?:'s)?)\b/i.test(evidenceFocus)
      && /\b(?:decor|decorat(?:e|ed|ing|ions?)|decoratons?|displays?|inflatables?)\b/i.test(evidenceFocus)
      && !/\b(?:lights?|lighting)\b/i.test(evidenceFocus)) {
      // This is a relative rule window, not a live calendar date. Require the
      // governing rule to supply its duration instead of an operational page.
      explicitDetails = [...new Set(explicitDetails.map((detail) => detail === "date" ? "specification" : detail))];
    }
    // A closing-time question asks for one clock time. Some general intent
    // parsing also labels "stay" as a rule specification; remove that extra
    // burden after all generic detail rules have run.
    if (/\b(?:pool|clubhouse|court|facility|amenity)\b/i.test(originalQuestion)
      && /\b(?:how late|until what time|when (?:does|will) .{0,30} close)\b/i.test(evidenceFocus)) {
      explicitDetails = ["hours"];
    }
    const goal = establishmentBilling.matches
      ? (establishmentBilling.exactAmount ? "cost" : "information")
      : goalForNeed(text, explicitDetails, plan, index, clauses.length);
    const requestedDetails = explicitDetails.length ? explicitDetails : detailsForGoal(goal);
    const waterPaymentActionRequest = requestedDetails.includes("action")
      && /\bwater\s+(?:bill|billing)\b|\b(?:bill|billing)\b.{0,24}\bwater\b/i.test(evidenceFocus)
      && /\b(?:pay|payment|online|portal|website|where)\b/i.test(evidenceFocus);
    const wateringRuleRequest = requestedDetails.includes("permission")
      && /\b(?:irrigat\w*|sprinklers?|water(?:ing)?)\b/i.test(evidenceFocus)
      && /\b(?:a\.?m\.?|p\.?m\.?|morning|afternoon|evening|summer|june|july|august|time|rules?)\b/i.test(evidenceFocus);
    return {
      id: `need-${index + 1}`,
      text,
      request,
      routeRequest: establishmentBilling.matches
        ? `landscape establishment water billing ${establishmentBilling.exactAmount ? "rate amount" : "treatment"}`
        : establishmentWater
          ? "landscape establishment water billing duration treatment"
        : requestedDetails.includes("action")
          && !parkPassReimbursement
          && /\b(?:application|form|paperwork|submittal|submission)\b/i.test(evidenceFocus)
          ? /^where\b.{0,50}\bapplication\b/i.test(evidenceFocus)
            ? `${originalQuestion} submit for approval`
            : originalQuestion
        : parkPassReimbursement
          ? requestedDetails.includes("price")
            ? "park pass reimbursement amount form vehicle registration receipt"
            : "How do I use the park pass reimbursement form?"
        : /\bstorm\b/i.test(evidenceFocus)
          && /\bclear\b.{0,80}\b(?:sidewalk|driveway)|\b(?:sidewalk|driveway)\b.{0,80}\bclear\b/i.test(evidenceFocus)
          ? "snow removal responsibility for homeowner sidewalks and driveways"
        : /\b(?:leak|excessive[- ]water[- ]use|excessive water use|water[- ]use relief)\b/i.test(sharedClauseContext)
          && /\b(?:relief|adjustment|forgiveness|form)\b/i.test(sharedClauseContext)
          ? `leak relief form for unintentional excessive water use${requestedDetails.includes("contact") ? " email contact" : " follow-up response time"}`
        : caregiverPassShape(sharedClauseContext)
          && /\b(?:pay|payment|pickup|check|card|cash)\b/i.test(sharedClauseContext)
          ? "caregiver pass payment due at pickup accepted payment options"
        : caregiverPassShape(sharedClauseContext)
          && requestedDetails.includes("specification")
          && /\bhow long\b.{0,50}\b(?:approval|process|response|reply|hear back)\b/i.test(evidenceFocus)
          ? "caregiver pass approval processing time"
        : /\b(?:campers?|motor ?homes?|recreational vehicles?|rvs?)\b/i.test(evidenceFocus)
          && /\b(?:driveway|park|parking|stay)\b/i.test(evidenceFocus)
          ? "recreational vehicle camper driveway temporary parking 72 consecutive hours permission"
        : usedPriorContext
          && /\b(?:permanent|seasonal|holiday)\b.{0,60}\blights?|\blights?\b.{0,60}\b(?:permanent|seasonal|holiday)\b/i.test(request)
          ? "permanent seasonal exterior lighting installed year-round non-holiday settings"
        : /\bpaying guests?\b.{0,50}\b(?:nights?|weekend)\b/i.test(evidenceFocus)
          ? "residential property short-term vacation rental VRBO lodging permission"
        : /\bfence\b/i.test(evidenceFocus)
          && /\b(?:all|every|single|depend(?:s|ing)?\s+on\s+(?:the\s+)?(?:kind|type)|which kind|fence styles?)\b/i.test(evidenceFocus)
          ? "general backyard fence height by fence type DRC approval"
        : /\b(?:credit|debit|card)\b/i.test(evidenceFocus)
          && /\b(?:fee|cost|charge|percent|percentage|how much)\b/i.test(evidenceFocus)
          && /\bwater\b|\bbill(?:ing)?\b/i.test(sharedClauseContext)
          ? "water bill debit credit card processing fee"
        : /\b(?:autopay|automatic withdrawal|bank account|ach)\b/i.test(evidenceFocus)
          && /\b(?:fee|cost|charge|free|how much)\b/i.test(evidenceFocus)
          && /\bwater\b|\bbill(?:ing)?\b/i.test(sharedClauseContext)
          ? "water bill ACH automatic withdrawal fee free of charge"
        : /\b(?:watch|monitor|track)\b.{0,60}\bwater (?:use|usage)\b/i.test(evidenceFocus)
          || /\bwater (?:use|usage)\b.{0,80}\b(?:alert|warn|notif)\w*\b/i.test(evidenceFocus)
          ? "monitor water usage thresholds alerts UtilityHawk"
        : waterPaymentActionRequest
          ? "pay water bill online"
        : foodMenuRequest
          ? `food truck menu${priorClauseDateContext(sharedClauseContext) ? ` on ${priorClauseDateContext(sharedClauseContext)}` : ""}`
        : requestedDetails.includes("date") && /\b(?:food\s*trucks?|trucks?)\b/i.test(sharedClauseContext)
          ? `food truck schedule${priorClauseDateContext(sharedClauseContext) ? ` on ${priorClauseDateContext(sharedClauseContext)}` : ""}`
        : wateringRuleRequest
          ? `outdoor irrigation watering time rules: ${routeRequest}`
        : routeRequest,
      evidenceFocus,
      usedPriorContext,
      task: taskForNeed(goal, requestedDetails),
      evidenceKind: evidenceKindForNeed(goal, requestedDetails, evidenceFocus),
      goal,
      requestedDetails,
      subjectHint: String(plan.subject || ""),
      subjectContext,
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
  if (/^airbnb$/.test(token)) return "rental";
  if (/^(?:motorhomes?|campers?|rvs?)$/.test(token)) return "rv";
  if (/^allow(?:ed|ing|s)?$/.test(token)) return "allow";
  if (/^limit(?:ed|ing|s)?$/.test(token)) return "limit";
  if (/^fenc(?:e|es|ing)$/.test(token)) return "fence";
  if (/^(?:carts?|bins?|containers?)$/.test(token)) return "container";
  if (/^(?:store|stored|stores|storing|storage)$/.test(token)) return "store";
  if (/^payments?$/.test(token)) return "pay";
  if (/^panels?$/.test(token)) return "equipment";
  if (/^billing$/.test(token)) return "bill";
  if (/^book(?:ed|ing)?$/.test(token)) return "book";
  if (/^reserv(?:e|ed|es|ing|ation|ations)$/.test(token)) return "reserve";
  if (/^find(?:ing|ings)?$/.test(token)) return "find";
  if (/^hours?$/.test(token)) return "hour";
  if (/^menus?$/.test(token)) return "menu";
  if (/^reports?$/.test(token)) return "report";
  if (/^establish(?:ed|es|ing|ment)?$/.test(token)) return "establish";
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
  if (/^(?:application|applications|document|documents|form|forms|paperwork|sheet|sheets|submittal|submittals|submission|submissions)$/.test(token)) return "application";
  return token.replace(/(?:'s|s)$/i, "");
}

function distinctiveTokens(value = "") {
  const text = String(value);
  const result = new Set((text.match(/[a-z0-9]+/gi) || []).map(normalizedToken)
    .filter((token) => token.length > 1 && !COMMON_WORDS.has(token)));
  // Add concept identities for ordinary paraphrases without changing the
  // resident request or inventing evidence. These identities are used only to
  // decide whether a source is about the same subject.
  if (/\b(?:recreational vehicles?|motor homes?|motorhomes?|campers?|rvs?)\b/i.test(text)) result.add("rv");
  if (/\b(?:short[- ]term rentals?|vacationers?|vrbo|airbnb|paying guests?)\b/i.test(text)) result.add("rental");
  if (/\b(?:sprinklers?|irrigat(?:e|ed|es|ing|ion))\b/i.test(text)) result.add("irrigation");
  if (/\b(?:holiday|hallowe+en|hallowen|christmas|xmas|thanksgiving|hanukkah|easter|valentine(?:'s)?)\b/i.test(text)
    && /\b(?:decor|decorat(?:e|ed|ing|ions?)|decoratons?|displays?|inflatables?)\b/i.test(text)) {
    result.add("holiday-display");
  }
  return result;
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

function sourceSubjectIdentityText(source = {}, claim = {}, actions = [], claims = []) {
  const id = sourceId(source);
  const reviewedSubjects = (source.facts || []).flatMap((fact) => [fact.subjectKey, fact.scopeKey]);
  const actionLabels = actions.filter((action) => action.sourceId === id).map((action) => action.label);
  const claimText = String(claim.text || "").trim();
  const siblingClaimText = claims
    .filter((candidate) => candidate !== claim && (candidate.evidenceSourceIds || []).includes(id))
    .map((candidate) => String(candidate.text || "").trim())
    .filter((text) => text && text.length <= 1600);
  // Long document excerpts frequently contain an unrelated resident keyword by
  // accident. Subject matching uses reviewed identity fields and concise claims,
  // while the full text remains available for proving the actual detail.
  const conciseClaim = claimText.length <= 1600 ? claimText : "";
  return [source.title, source.sourceTitle, source.sourceName, ...reviewedSubjects, ...actionLabels, conciseClaim, ...siblingClaimText]
    .filter(Boolean).join(" ");
}

function enoughSemanticOverlap(needTokens, evidenceText) {
  const count = overlapCount(needTokens, distinctiveTokens(evidenceText));
  return count >= Math.min(2, Math.max(1, needTokens.size));
}

function routedSubjectOverlap(needTokens, evidenceText) {
  const generic = new Set([
    "action", "allow", "application", "approved", "collection", "community", "contact", "correct", "current", "date", "day", "exact",
    "few", "home", "homeowner", "hour", "information", "limit", "location", "long", "member", "middle", "night", "official", "online", "page",
    "permission", "price", "report", "resident", "rule", "schedule", "several", "specification", "status", "straight", "summer", "time",
    "website", "week", "weekend", "year", "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december",
  ]);
  const evidenceTokens = distinctiveTokens(evidenceText);
  const shared = [...needTokens].filter((token) => evidenceTokens.has(token));
  return shared.some((token) => !generic.has(token));
}

function claimSupportsDetail(detail, text = "", actions = []) {
  if (detail === "information") return true;
  if (detail === "price") return /\$\s*\d|\b\d+(?:\.\d+)?\s*%|\b(?:free|no charge|no additional cost|zero dollars)\b/i.test(text);
  if (detail === "permission") return /\b(?:yes|no|allowed|bars?|forbids?|disallows?|prohibited|required|requires|approval|permission|can|may|must)\b/i.test(text);
  if (detail === "eligibility") return /\b(?:eligible|eligibility|qualif(?:y|ies|ied|ication)|restricted to|available (?:only )?to|open (?:only )?to|(?:non)?residents? can (?:access|book|reserve|use|visit)|reimburs\w*|refund\w*|pay(?:ing)? back)\b/i.test(text);
  if (detail === "reimbursement") return /\b(?:reimburs\w*|refund\w*|pay(?:ing)? back)\b/i.test(text);
  if (detail === "menu") return /\bmenu\b|\$\s*\d/i.test(text);
  if (detail === "action") {
    if (actions.length > 0) return true;
    const directive = String(text).trim();
    return /^(?:(?:please|to)\s+)?(?:access|apply|ask|book|bring|call|check|contact|continue|download|email|exchange|log in|open|pay|register|reserve|select|sign in|submit|use|visit)\b/i.test(directive)
      || /\b(?:you|residents?|customers?|applicants?)\s+(?:can|may|must|should|need to)\s+(?:access|apply|ask|book|bring|call|check|contact|continue|download|email|exchange|log in|open|pay|register|reserve|select|sign in|submit|use|visit)\b/i.test(directive)
      || /\b(?:click|follow|go to)\b.{0,80}\b(?:link|page|portal|website|form|instructions?)\b/i.test(directive);
  }
  if (detail === "contact") return /@|(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/.test(text);
  if (detail === "hours") return /\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/i.test(text)
    || /\bdoes not\b.{0,80}\b(?:give|set|state|specify|provide|publish|list)\b.{0,80}\b(?:time|hour)\b/i.test(text);
  if (detail === "date") return /\b(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)\b|\b\d{4}-\d{2}-\d{2}(?=\b|T)/i.test(text);
  if (detail === "status") return /\b(?:open|closed|available|unavailable|operating|cancelled|canceled|delayed)\b/i.test(text);
  if (detail === "specification") return /#[0-9]{2,}\b|\b(?:(?:\d+(?:[ -]\d+\/\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|forty[- ]eight)\s*(?:\(\s*\d+(?:\.\d+)?\s*\))?)\s*(?:consecutive\s+|business\s+)?(?:"|(?:seconds?|minutes?|hours?|days?|nights?|overnights?|weeks?|months?|years?|feet|foot|inches|inch|ft\.?|in\.?)\b)|\b(?:color|paint|stain|finish|material|height|size|dimension|setback|distance|duration)\b|\b(?:must|required|allowed|prohibited)\b.{0,120}\b(?:location|area|place|screened|visible|inside|behind)\b|\b(?:return|keep|store|place|locate|screen)\w*\b.{0,120}\b(?:location|area|place|screened|visible|inside|behind)\b|\b(?:remain|stay)\w*\b.{0,80}\b(?:installed|up)\b|\b(?:installed|up)\b.{0,80}\b(?:year[- ]round|all year|seasonal period)\b/i.test(text);
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
    const dependentResidentContext = /^Regarding “/i.test(need.request || "") ? need.request : "";
    const needTokens = distinctiveTokens(`${need.evidenceFocus || need.request} ${dependentResidentContext} ${need.subjectContext || ""} ${need.subjectHint || ""}`);
    const explicitSourceIds = new Set(sources.filter((source) => Array.isArray(source.retrievedForNeedIds)
      && source.retrievedForNeedIds.includes(need.id)).map(sourceId));
    const candidateSources = sources.filter((source) => explicitSourceIds.has(sourceId(source))
      || enoughSemanticOverlap(needTokens, sourceEvidenceText(source, claims, actions)));
    const candidateSourceIds = candidateSources.map(sourceId).filter(Boolean);
    const relevantActions = actions.filter((action) => action.sourceId && candidateSourceIds.includes(action.sourceId)
      || (need.requestedDetails.includes("menu") && /\bmenu\b/i.test(`${action.label || ""} ${action.context || ""}`))
      || enoughSemanticOverlap(needTokens, `${action.label || ""} ${action.context || ""}`));
    const verifiedRelevantActions = relevantActions.filter((action) => candidateSources.some((source) => {
      const id = sourceId(source);
      return (action.sourceId && action.sourceId === id)
        || (source.isOfficialResource === true && action.url && action.url === source.sourceUrl)
        || (source.isOfficialResource === true && action.reviewStatus === "approved"
          && action.evidence?.url === action.url && Boolean(action.approvalClaim));
    }));
    const relevantClaimEntries = verifiedClaimEntries.filter(({ claim }) => {
      if (landscapeEstablishmentBillingShape(need.request).matches
        && !/\b(?:45\s+days?|establish(?:ing|ment)?|lawn|landscap(?:e|ing)|plants?|sod|turf)\b/i.test(String(claim.text || ""))) {
        return false;
      }
      const mappedCandidates = candidateSources.filter((source) => (claim.evidenceSourceIds || []).includes(sourceId(source)));
      const fullRequestTokens = distinctiveTokens(`${need.request} ${need.subjectContext || ""}`);
      const mappedSubjectEvidence = mappedCandidates.map((source) => sourceSubjectIdentityText(source, claim, actions, claims)).join(" ");
      if (/\b(?:campers?|motor ?homes?|recreational vehicles?|rvs?)\b/i.test(need.request)
        && !/\b(?:campers?|motor ?homes?|recreational vehicles?|rvs?)\b/i.test(mappedSubjectEvidence)) return false;
      const mappedSubjectMatch = routedSubjectOverlap(fullRequestTokens, mappedSubjectEvidence);
      const explicitlySupportedNeed = Array.isArray(claim.supportedForNeedIds)
        && claim.supportedForNeedIds.includes(need.id)
        && mappedSubjectMatch;
      const explicitlyRoutedVerifiedClaim = answer.confidence?.canAnswer === true
        && answer.answerStatus === "verified"
        && mappedCandidates.some((source) => (source.retrievedForNeedIds || []).includes(need.id)
          && routedSubjectOverlap(fullRequestTokens, sourceSubjectIdentityText(source, claim, actions, claims)));
      const explicitlyRoutedStatus = need.requestedDetails.includes("status")
        && mappedCandidates.some((source) => (source.retrievedForNeedIds || []).includes(need.id)
          && [...(source.capabilities || []), ...(source.authorityFacets || [])].includes("status")
          && routedSubjectOverlap(fullRequestTokens, sourceSubjectIdentityText(source, claim, actions, claims)));
      const explicitlyRoutedDate = need.requestedDetails.includes("date")
        && mappedCandidates.some((source) => (source.retrievedForNeedIds || []).includes(need.id)
          && [...(source.capabilities || []), ...(source.authorityFacets || [])]
            .some((facet) => ["date", "event-date"].includes(facet))
          && routedSubjectOverlap(fullRequestTokens, sourceSubjectIdentityText(source, claim, actions, claims)));
      const explicitlyRoutedHours = need.requestedDetails.includes("hours")
        && mappedCandidates.some((source) => (source.retrievedForNeedIds || []).includes(need.id)
          && [...(source.capabilities || []), ...(source.authorityFacets || []), ...(source.facts || []).map((fact) => fact.type)]
            .some((facet) => ["hours", "schedule"].includes(facet))
          && enoughSemanticOverlap(fullRequestTokens, sourceEvidenceText(source, claims, actions)));
      const explicitlyRoutedMenu = need.requestedDetails.includes("menu")
        && mappedCandidates.some((source) => (source.retrievedForNeedIds || []).includes(need.id)
          && [...(source.capabilities || []), ...(source.authorityFacets || [])].includes("menu"));
      return mappedCandidates.length > 0 && (mappedSubjectMatch || explicitlySupportedNeed || explicitlyRoutedVerifiedClaim
        || explicitlyRoutedStatus || explicitlyRoutedDate || explicitlyRoutedHours || explicitlyRoutedMenu
        || mappedCandidates.some((source) => {
          const facets = new Set([...(source.capabilities || []), ...(source.authorityFacets || []), ...(source.facts || []).map((fact) => fact.type)]
            .flatMap((facet) => [...distinctiveTokens(facet)])
            .filter((facet) => !["action", "date", "hour", "information", "status"].includes(facet)));
          return [...needTokens].some((token) => facets.has(token));
        }));
    });
    const relevantConflicts = conflicts.filter((conflict) => {
      const ids = conflictSourceIds(conflict);
      return !ids.size || candidateSourceIds.some((id) => ids.has(id));
    });
      const claimCoversDetail = (detail, claim) => {
      // Use the clause itself for method qualifiers. The contextual request may
      // mention a different method from the preceding clause.
      const needText = String(need.evidenceFocus || need.request || "");
      const claimText = String(claim.text || "");
      if (detail === "permission"
        && /\b(?:automatic irrigation|irrigat(?:e|ed|es|ing|ion)|sprinklers?)\b/i.test(needText)
        && /\bhand watering\b/i.test(claimText)
        && !/\b(?:automatic irrigation|irrigat(?:e|ed|es|ing|ion)|sprinklers?)\b/i.test(claimText)) return false;
      if (detail === "price" && /\b(?:credit|debit|card)\b/i.test(needText)
        && !/\b(?:credit|debit|card)\b/i.test(claimText)) return false;
      if (detail === "price" && /\b(?:autopay|automatic withdrawal|bank account|ach)\b/i.test(needText)
        && !/\b(?:autopay|automatic withdrawal|bank account|ach)\b/i.test(claimText)) return false;
      const ordinarySupport = claimSupportsDetail(detail, claim.text, ["action", "menu"].includes(detail) ? relevantActions : [])
        && claimIsRendered(responseText, claim.text, answer);
      if (ordinarySupport) return true;
      if (detail === "specification" && claimIsRendered(responseText, claim.text, answer)) {
        return candidateSources.some((source) => (claim.evidenceSourceIds || []).includes(sourceId(source))
          && (source.facts || []).some((fact) => fact.facet === "specification"
            && String(claim.text || "").includes(String(fact.context || fact.value || "").trim())));
      }
      if (detail !== "status" || !claimSupportsDetail("status", responseText)) return false;
      return candidateSources.some((source) => (claim.evidenceSourceIds || []).includes(sourceId(source))
        && ([...(source.capabilities || []), ...(source.authorityFacets || [])].includes("status")));
    };
    const supportingClaimEntries = relevantClaimEntries.filter(({ claim }) =>
      need.requestedDetails.some((detail) => claimCoversDetail(detail, claim)));
    const supportingClaims = supportingClaimEntries.map(({ claim }) => claim);
    const supportedDetails = need.requestedDetails.filter((detail) => (supportingClaims.some((claim) => claimCoversDetail(detail, claim))
      || (detail === "action" && verifiedRelevantActions.length > 0))
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

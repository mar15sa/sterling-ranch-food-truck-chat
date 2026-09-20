const INTENTS = new Set(["rules", "facilities", "forms", "events", "alerts", "status", "services"]);
const GOALS = new Set(["permission", "payment", "booking", "application", "registration", "account-access", "contact", "cost", "schedule", "status", "information"]);
const DETAILS = new Set(["price", "action", "date", "hours", "contact", "permission", "specification", "methods", "examples", "status", "eligibility", "quantity"]);
const SCOPES = new Set(["community", "unrelated", "ambiguous"]);
const FILTER_KEYS = ["audience", "category", "facility", "location"];
const MODES = new Set(["legacy", "shadow", "structured"]);
const GOAL_PRIORITY = ["permission", "payment", "booking", "application", "registration", "account-access", "contact", "cost", "schedule", "status", "information"];
const DETAIL_PRIORITY = ["price", "action", "date", "hours", "contact", "permission", "specification", "methods", "examples", "status", "eligibility", "quantity"];

function clean(value, limit) {
  return String(value || "").normalize("NFKC").replace(/[\u200B-\u200D\u2060\uFEFF<>]/g, "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function localToday(now = new Date(), timeZone = "America/Denver") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function denverToday(now = new Date()) { return localToday(now); }

function validIsoDate(value = "") {
  const match = String(value).match(/^(20\d{2})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : "";
}

function addDays(iso, amount) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function highConfidenceDateRange(question = "", now = new Date(), timeZone = "America/Denver") {
  const text = String(question).toLowerCase();
  const today = localToday(now, timeZone);
  if (/\btomorrow\b/.test(text)) return { kind: "tomorrow", start: addDays(today, 1), end: addDays(today, 1), label: "tomorrow" };
  if (/\btoday\b|\btonight\b/.test(text)) return { kind: "today", start: today, end: today, label: /tonight/.test(text) ? "tonight" : "today" };
  const relativeWeek = text.match(/\b(this|next|last)\s+week\b/)?.[1];
  if (relativeWeek) {
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
    const monday = addDays(today, -((weekday + 6) % 7));
    const start = addDays(monday, relativeWeek === "next" ? 7 : relativeWeek === "last" ? -7 : 0);
    return { kind: "week", start, end: addDays(start, 6), label: `${relativeWeek} week` };
  }
  if (/\bthis weekend\b|\bweekend\b/.test(text)) {
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
    const untilSaturday = weekday === 0 ? -1 : weekday === 6 ? 0 : 6 - weekday;
    const saturday = addDays(today, untilSaturday);
    return { kind: "this-weekend", start: saturday, end: addDays(saturday, 1), label: "this weekend" };
  }
  const isoMatches = [...text.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map((match) => validIsoDate(match[1])).filter(Boolean);
  if (isoMatches.length) {
    const start = isoMatches[0];
    const end = isoMatches[1] && isoMatches[1] >= start ? isoMatches[1] : start;
    return { kind: start === end ? "explicit-date" : "date-range", start, end, label: start === end ? start : `${start} through ${end}` };
  }
  const monthNumbers = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
  const namedDates = [...text.matchAll(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:,?\s+(20\d{2}))?\b/g)]
    .map((match) => {
      let year = Number(match[3]) || Number(today.slice(0, 4));
      const month = monthNumbers[match[1]];
      const candidate = validIsoDate(`${year}-${String(month).padStart(2, "0")}-${String(Number(match[2])).padStart(2, "0")}`);
      if (!match[3] && candidate && candidate < today) year += 1;
      return validIsoDate(`${year}-${String(month).padStart(2, "0")}-${String(Number(match[2])).padStart(2, "0")}`);
    }).filter(Boolean);
  if (namedDates.length) {
    const start = namedDates[0];
    const end = namedDates[1] && namedDates[1] >= start ? namedDates[1] : start;
    return { kind: start === end ? "explicit-date" : "date-range", start, end, label: start === end ? start : `${start} through ${end}` };
  }
  const numericDates = [...text.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}|\d{2}))?\b/g)]
    .map((match) => {
      let year = match[3] ? Number(match[3]) : Number(today.slice(0, 4));
      if (year < 100) year += 2000;
      let candidate = validIsoDate(`${year}-${String(Number(match[1])).padStart(2, "0")}-${String(Number(match[2])).padStart(2, "0")}`);
      if (!match[3] && candidate && candidate < today) candidate = validIsoDate(`${year + 1}-${String(Number(match[1])).padStart(2, "0")}-${String(Number(match[2])).padStart(2, "0")}`);
      return candidate;
    }).filter(Boolean);
  if (numericDates.length) {
    const start = numericDates[0];
    const end = numericDates[1] && numericDates[1] >= start ? numericDates[1] : start;
    return { kind: start === end ? "explicit-date" : "date-range", start, end, label: start === end ? start : `${start} through ${end}` };
  }
  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const weekday = weekdays.findIndex((day) => new RegExp(`\\b(?:next\\s+)?${day}\\b`).test(text));
  if (weekday >= 0) {
    const current = new Date(`${today}T12:00:00Z`).getUTCDay();
    let offset = (weekday - current + 7) % 7;
    if (offset === 0 || new RegExp(`\\bnext\\s+${weekdays[weekday]}\\b`).test(text)) offset += 7;
    const date = addDays(today, offset);
    return { kind: "named-day", start: date, end: date, label: text.match(new RegExp(`(?:next\\s+)?${weekdays[weekday]}`))?.[0] || weekdays[weekday] };
  }
  return null;
}

function validatedModelDateRange(value, question, now = new Date()) {
  const deterministic = highConfidenceDateRange(question, now);
  if (deterministic) return deterministic;
  // A provider's open-ended default is not a resident-requested date filter.
  // Use the connector's stable default instead of arbitrary today/year-end bounds.
  if (/^open(?:-ended)?$/i.test(String(value?.kind || ""))) return null;
  const start = validIsoDate(value?.start);
  const end = validIsoDate(value?.end);
  if (!start || !end || end < start) return null;
  const span = (new Date(`${end}T12:00:00Z`) - new Date(`${start}T12:00:00Z`)) / 86400000;
  if (span > 366) return null;
  return {
    kind: clean(value.kind || (start === end ? "explicit-date" : "date-range"), 40),
    start,
    end,
    label: clean(value.label || (start === end ? start : `${start} through ${end}`), 80),
  };
}

function fallbackDateRange(question, intent, now = new Date()) {
  const explicit = highConfidenceDateRange(question, now);
  if (explicit) return explicit;
  if (intent === "events") {
    const today = denverToday(now);
    return { kind: "next-seven-days", start: today, end: addDays(today, 7), label: "the next seven days" };
  }
  return null;
}

function isWaterUsageAccessRequest(question = "") {
  const text = String(question).toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  const namesWaterUsage = /\bwater\s+(?:usage|use|consumption)\b|\b(?:usage|consumption)\b.{0,24}\bwater\b/.test(text);
  const asksForOnlineAccess = /\b(?:internet|online|web|website|portal|dashboard|account|app|access|log ?in|login|sign ?in|view|see|check|track|monitor)\b/.test(text);
  // A payment portal can contain many of the same words. Keep explicit bill
  // and payment tasks on the billing route even when they also say "online."
  const asksToPayOrManageBill = /\b(?:pay|payment|billing|water bill|utility bill|amount due|balance due|past due|late fee|processing fee|rates?|charges?|cost)\b/.test(text);
  return namesWaterUsage && asksForOnlineAccess && !asksToPayOrManageBill;
}

function instructionalRequestShape(question = "") {
  const text = String(question).toLowerCase();
  // A request for how to inspect a setting is not an observation of the
  // setting. Keep this grammatical distinction independent of device/vendor.
  const check = /\b(?:how|where)\s+(?:(?:do|can|should|could)\s+(?:i|we)\s+|to\s+)(?:check|verify|see|find out|determine|confirm)\b/.test(text);
  const calculation = /\b(?:calculat(?:e|ing|ion)|comput(?:e|ing|ation)|formula)\b/.test(text)
    && /\b(?:how|what|which|explain|show)\b/.test(text);
  const calculationInput = calculation
    && /\b(?:size|area|height|width|length|dimensions?|distance|measurements?)\b.{0,55}\b(?:use|enter|measure|input)\b.{0,55}\b(?:calculat\w*|comput\w*|formula)\b/.test(text)
    && !/\b(?:allowed|permitted|required|must|maximum|minimum|limit|restriction|approval)\b/.test(text);
  const scheduling = /\b(?:how|where)\s+(?:(?:do|can|should|could)\s+(?:i|we)\s+|to\s+)(?:schedule|arrange)\b/.test(text)
    || /\b(?:process|steps|instructions)\s+for\s+(?:scheduling|arranging)\b/.test(text);
  const separateStatus = /(?:[?;]|\band\b)\s*(?:is|are|what is)\b.{0,60}\b(?:running|working|status|right now|currently)\b/.test(text);
  return { check, calculation, calculationInput, scheduling, separateStatus };
}

function isReportedFindingsRequest(question = "") {
  const text = String(question).toLowerCase();
  const reportNarrative = /\bwhat\s+(?:did|does)\b.{0,120}\breport\b.{0,40}\b(?:find|say|identify|show|document)\b/.test(text)
    || /\b(?:findings|results)\b.{0,70}\breport\b|\breport\b.{0,70}\b(?:findings|results)\b/.test(text)
    || /\bwhat\b.{0,60}\b(?:violations|findings|results|failures)\b.{0,40}\b(?:did|were|was)\b.{0,80}\breport(?:ed)?\b/.test(text);
  // A report documents findings; it does not observe today's state or settle
  // a separate request about permission, requirements, or safety.
  const separateAuthorityRequest = /\b(?:allowed|permitted|prohibited|required|must|permission|approval)\b/.test(text)
    || /\b(?:currently|right now|today|tonight|tomorrow|upcoming)\b/.test(text)
    || /\bcurrent\s+(?:status|condition|safety|violations?)\b/.test(text)
    || /\b(?:is|are|can|should|may)\b.{0,80}\bsafe\b|\bsafe to\b/.test(text);
  return reportNarrative && !separateAuthorityRequest;
}

function deterministicRequestedDetails(question = "") {
  const text = String(question).toLowerCase();
  const instruction = instructionalRequestShape(text);
  const processDuration = /\bhow long\b.{0,60}\b(?:be|take|wait|last|process|approval|response|hear back)\b|\bhow many\s+days\b.{0,80}\b(?:last|remain|apply|continue)\b|\bfor how many\s+days\b|\bwhen\b.{0,50}\b(?:expect|should|will)\b.{0,45}\b(?:hear back|respond|response|reply|reach out|contact)\b/.test(text);
  const advanceLimit = /\bhow far (?:ahead|in advance)\b|\bhow many\s+(?:days?|weeks?|months?)\b.{0,30}\b(?:ahead|in advance|before)\b/.test(text);
  const conditionalClosingTime = /\bhow late\b.{0,50}\b(?:stay|remain|open|use)\b|\buntil what time\b/.test(text);
  const operationalSetup = /\bdo (?:i|we) need to\b.{0,40}\b(?:separately\s+)?(?:set ?up|start|activate)\b/.test(text)
    && /\b(?:water|sewer|trash|garbage|electricity|electric|gas|internet|utilities?|services?)\b/.test(text);
  const firstContactStep = /\bwho\s+(?:should|do|can)\s+(?:i|we)\s+(?:try|ask|check with|talk to)\s+first\b/.test(text);
  const reportingAction = /\bwhere\s+(?:should|do|can)\s+(?:i|we)\s+(?:report|file|submit)\b/.test(text);
  const datedOpenBoundary = /\b(?:tomorrow|next\s+(?:week|month|season|summer|winter)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|labor day|memorial day|thanksgiving|christmas|new year(?:'s)? day)\b/.test(text);
  const yesNoOpenState = /^(?:is|are|was|were)\b.{0,120}\b(?:open|closed)\b/.test(text)
    && !datedOpenBoundary;
  const serviceStatus = /\b(?:delay(?:ed)?|late|on time|cancelled|canceled)\b/.test(text)
    && /\b(?:pickup|pick up|collection|service|event|class|meeting)\b/.test(text);
  const holidayServiceChange = /\bholidays?\b/.test(text)
    && /\b(?:change[ds]?|affect(?:ed|s)?|different|delay(?:ed|s)?)\b/.test(text)
    && /\b(?:trash|garbage|recycl(?:e|ing)|waste|pickup|pick up|collection|service)\b/.test(text);
  const resourceViewRequest = /\b(?:see|view|open|get|show me)\b.{0,50}\b(?:guide|tips|visual|pdf|document|directory|list)\b/.test(text)
    || /\b(?:guide|tips|visual|pdf|document|directory|list)\b.{0,50}\b(?:see|view|open|get)\b/.test(text);
  const specificationModal = /\b(?:what|which)\b.{0,40}\b(?:color|colour|paint|stain|finish|material|height|size|dimension|setback|distance)\b.{0,30}\b(?:can|may|allowed|permitted)\b/.test(text)
    || /\b(?:allowed|permitted)\b.{0,40}\b(?:same|maximum|minimum|color|colour|paint|stain|finish|material|height|size|dimension|setback|distance)\b/.test(text);
  const explicitPermissionClause = /(?:^|[?.!]\s*)are\s+(?:fences?|sheds?|structures?|changes?|installations?)\s+(?:allowed|permitted|prohibited)\b/.test(text)
    || /\b(?:can|may) (?:i|we)\s+(?:add|build|construct|install)\b/.test(text);
  // Residents sometimes use a generic second-person question ("Can you park
  // an RV...?" or "Can you cover your car...?") to ask what anyone is
  // allowed to do. Treat those physical/property actions as permission
  // questions while keeping assistant requests such as "Can you find/open..."
  // in the information/action path.
  const secondPersonGovernancePermission = /^(?:can|could|may)\s+you\s+(?:add|build|construct|cover|display|have|host|install|keep|leave|operate|paint|park|place|plant|put|remove|replace|run|store|water)\b/.test(text);
  const operationalChoiceModal = /\b(?:what|which)\b.{0,50}\b(?:methods?|options?|ways?)\b.{0,30}\b(?:can|may) (?:i|we) use\b/.test(text);
  const details = [];
  const asksPrice = /\b(?:cost|price|fees?|deposit|rates?|charges?)\b/.test(text)
    || (/\bhow much\b/.test(text) && !/\bby how much\b/.test(text))
    || /\bwhat\s+(?:would|will|do|does|did)\s+(?:i|we|you|they|he|she|it|a|an|the|my|our)\b.{0,30}\bpay\b/.test(text)
    || /\b(?:pay|charge[sd]?)\b.{0,20}\b(?:to )?park(?:ing)?\b|\bpark(?:ing)?\b.{0,20}\b(?:pay|charge[sd]?)\b/.test(text);
  if (asksPrice) details.push("price");
  const paymentAction = /^(?:please\s+)?pay\b/.test(text)
    || /\bpay\s+(?:my|our|the|this|that|a)\s+(?:bill|fee|charge|balance|invoice)\b/.test(text)
    || /\bpay(?:ing)?\b.{0,24}\b(?:online|portal|website|app)\b|\b(?:online|portal|website|app)\b.{0,24}\bpay(?:ing)?\b/.test(text);
  const action = instruction.check || instruction.scheduling || resourceViewRequest || paymentAction
    || /\b(?:how do|where (?:do|can)|book|reserve|rent|submit|register|sign up|form|payment|settle|settling|log in|login|download)\b/.test(text)
    || /\bapply\b(?!\s+to\b)/.test(text)
    || /\b(?:internet|online|portal) access\b.{0,40}\b(?:water|utility) (?:usage|use|account|bill)\b|\b(?:water|utility) (?:usage|use|account|bill)\b.{0,40}\b(?:internet|online|portal) access\b/.test(text)
    || isWaterUsageAccessRequest(text);
  const consequence = /\b(?:what happens|what if|do not|don't|cannot|can't|fail to|late|past due|delinquent|penalty|consequence|disconnect|shut ?off|collection)\b/.test(text);
  const externalCalculationAction = /\b(?:apply|submit|book|reserve|register|pay|download|sign up|log in)\b/.test(text);
  if (action && !consequence && (!instruction.calculation || externalCalculationAction)) details.push("action");
  // Scheduling as a verb asks for the process; a schedule as a noun asks for
  // an occurrence. Keep explicit timing clauses even in a compound request.
  if (/\b(?:when|date|day|today|tomorrow|weekend|upcoming)\b/.test(text)
    || /\b(?:this|next|last)\s+week\b/.test(text)
    || (!instruction.scheduling && !instruction.check && /\bschedule\b/.test(text))) details.push("date");
  if (/\b(?:hours?|times?)\b/.test(text)
    || (!yesNoOpenState && /\b(?:open|closed)\b/.test(text)
      && (datedOpenBoundary || /\b(?:when|what time|how late|regular|daily|schedule)\b/.test(text)))) details.push("hours");
  if (/\b(?:contact|phone|email|call|who (?:do i|should i|can i|do we|should we|can we|can help))\b/.test(text)) details.push("contact");
  if (/\b(?:permission|approval|need to)\b/.test(text)
    || explicitPermissionClause
    || secondPersonGovernancePermission
    || (!specificationModal && /\b(?:allowed|permitted|prohibited)\b/.test(text))
    || (!resourceViewRequest && !specificationModal && !operationalChoiceModal && /\b(?:can|may) (?:i|we)\b/.test(text) && !/\b(?:where|how|when|what)\s+(?:can|may) (?:i|we)\b/.test(text))
    || /(?:^|[.!?]\s*)(?:is (?:that|this|it)|are (?:those|these|they))\s+(?:okay|ok|allowed|permitted)\b/.test(text)) details.push("permission");
  if ((!instruction.calculationInput && /\b(?:color|colour|stain|material|height|high|tall|size|dimension|setback|distance)\b/.test(text))
    || /\b(?:what|which)\s+(?:specific\s+)?(?:paint|finish)\b|\b(?:paint|finish)\s+(?:color|colour|type|requirement)\b/.test(text)) details.push("specification");
  if (instruction.calculation || /\b(?:payment |delivery |renewal |service )?methods?\b|\bways? (?:can|may|do) (?:i|we)\b/.test(text)) details.push("methods");
  if (/\b(?:examples?|which|what kind|what types?)\b/.test(text)) details.push("examples");
  if (serviceStatus || holidayServiceChange || yesNoOpenState || instruction.separateStatus || (!instruction.check && (/\b(?:status|currently|right now)\b/.test(text)
    || /^(?:is|are)\b.{0,80}\b(?:running|working)\b/.test(text)))) details.push("status");
  if (/\b(?:eligib(?:le|ility)|qualif(?:y|ies|ied|ication|ications))\b/.test(text)
    || /\bwho\s+(?:can|may|is allowed to)\s+(?:use|receive|get|obtain|apply|participate|join|buy|purchase)\b/.test(text)
    || /^(?:can|could|may)\b.{0,100}\b(?:friend|guest|non[- ]?resident)\b.{0,100}\b(?:access|book|reserve|use|visit)\b/.test(text)) details.push('eligibility');
  if (/\bhow many\b|\b(?:number|count|quantity)\s+of\b/.test(text)
    && !/\b(?:phone|telephone|contact|account|confirmation|reservation|document|case|reference)\s+number\b/.test(text)) details.push('quantity');
  if (processDuration || advanceLimit) {
    return ["specification"];
  }
  if (conditionalClosingTime) {
    return [...new Set(details.filter((detail) => !["permission", "action", "date"].includes(detail)).concat("hours"))];
  }
  if (operationalSetup) {
    return ["information"];
  }
  if (/\bholidays?\b/.test(text)
    && /\b(?:move|moves|moved|push|pushes|pushed|shift|shifts|shifted)\b/.test(text)
    && /\b(?:trash|garbage|recycl(?:e|ing)|waste|pickup|collection)\b/.test(text)) {
    return ["information"];
  }
  if (firstContactStep || (reportingAction && !details.includes("permission"))) {
    return ["action"];
  }
  return [...new Set(details)];
}

function normalizeFilters(value = {}, intent = "") {
  const filters = Object.fromEntries(FILTER_KEYS.map((key) => [key, clean(value?.[key], 100)]));
  // Event venue names describe where an event occurs. Reservable-facility
  // filtering is reserved for facility searches so the same explicit place
  // cannot drift between two fields on repeated model calls.
  if (intent === "events" && filters.facility && !filters.location) {
    filters.location = filters.facility;
    filters.facility = "";
  }
  return filters;
}

function isRegularHoursRequest(question = '', options = {}) {
  const details = deterministicRequestedDetails(question);
  const recurringWeekday = /\b(?:normally|regular(?:ly)?|usual(?:ly)?|typically)\b/i.test(question)
    && /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekdays?|weekends?)\b/i.test(question)
    && !/\b(?:this|next|last)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|weekend)\b/i.test(question);
  return details.includes('hours') && !details.includes('status')
    && (recurringWeekday || (!details.includes('date') && !validatedModelDateRange(options.dateRange, question, options.now)))
    // Hours for a holiday, season, opening date, or named period still need
    // that period's evidence. Only an undated recurring-hours request may
    // discard a date facet introduced by the planner or the schedule default.
    && !/\b(?:holidays?|seasons?|spring|summer|autumn|fall|winter|reopen(?:ing)?|begin(?:s|ning)?|start(?:s|ing)?|end(?:s|ing)?|next|last|upcoming|tonight|current(?:ly)?|days?|weeks?|months?|years?|christmas|thanksgiving|easter)\b/i.test(question);
}

// Navigation establishes a destination, not every fact that destination may
// contain. Share this boundary with the answer router so model-added facets
// cannot turn a simple resource lookup into an unsupported factual request.
function isOfficialInformationPageRequest(question = "", routingPlan = null) {
  const text = String(question).toLowerCase();
  const planGoals = new Set([routingPlan?.goal, ...(routingPlan?.goals || [])].filter(Boolean));
  const asksToNavigate = /\bwhere\s+(?:can|could|do|would)\s+(?:i|we)\s+(?:find|look|go)|\bwhere\s+is\b|\b(?:open|show|find)\b.{0,36}\b(?:info(?:rmation)?|page|website|site|resource|details?)\b|\b(?:info(?:rmation)?|page|website|site|resource)\s*(?:link)?\s*[?.!]*$/i.test(text);
  const asksForDifferentFacet = /\b(?:when|today|tomorrow|weeks?|dates?|days?|schedules?|pickup|pick up|collection|delay|late|holidays?|hours?|closed|status|contacts?|phone|email|call|report|complaint|concern|missed|forms?|apply|submit|sign up|subscribe|notification|costs?|prices?|fees?|allowed|permission|approval|required|rules?|regulations?|violation|store|stored|storage|screen|screened|curb|bring|take|put out|outside|enclosure|paint|build|install|methods?|options?|alternatives?|ways?|calculate|compare|versus|without)\b/i.test(text)
    || /\b(?:and|also)\s+(?:how|what|who|can|do|is|are|tell|explain)\b/i.test(text)
    || /\b(?:building|installing|painting)\b/i.test(text)
    || deterministicRequestedDetails(question).some(detail => detail !== 'action'
      && !(['status', 'hours'].includes(detail) && /^\s*open\b/i.test(text)));
  return asksToNavigate && !asksForDifferentFacet
    && (!routingPlan || routingPlan.intent !== 'rules')
    && (!planGoals.size || (planGoals.size === 1 && planGoals.has('information')));
}

// Navigation-only retrieval aid, never an answer or an approval. Correct a
// long word only when exactly one indexed title word is one edit away.
// Ambiguous matches, short words, numbers and exact names remain unchanged.
function correctNavigationSubject(value = '', titles = []) {
  const vocabulary = new Set(titles.flatMap(title => String(title).toLowerCase().match(/[a-z]{6,}/g) || []));
  const oneEditAway = (left, right) => {
    if (Math.abs(left.length - right.length) > 1) return false;
    let i = 0, j = 0, edits = 0;
    while (i < left.length && j < right.length) {
      if (left[i] === right[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (left.length >= right.length) i++;
      if (right.length >= left.length) j++;
    }
    return edits + (i < left.length || j < right.length ? 1 : 0) <= 1;
  };
  return String(value).replace(/\b[a-z]{6,}\b/gi, word => {
    const normalized = word.toLowerCase();
    if (vocabulary.has(normalized)) return word;
    const matches = [...vocabulary].filter(candidate => oneEditAway(normalized, candidate));
    return matches.length === 1 ? matches[0] : word;
  });
}

function normalizeInterpretation(plan = {}, question = "", options = {}) {
  if (!plan || typeof plan !== "object") return null;
  let intent = INTENTS.has(plan.intent) ? plan.intent : "";
  const primaryGoal = GOALS.has(plan.goal) ? plan.goal : "";
  const goalSet = new Set([primaryGoal, ...(Array.isArray(plan.goals) ? plan.goals : [])].filter((goal) => GOALS.has(goal)));
  let goals = GOAL_PRIORITY.filter((goal) => goalSet.has(goal)).slice(0, 4);
  const subject = clean(plan.subject, 120);
  const searchQueries = (Array.isArray(plan.searchQueries) ? plan.searchQueries : [])
    .map((query) => clean(query, 160)).filter(Boolean).slice(0, 3);
  if (!intent || !goals.length || !subject || !searchQueries.length) return null;
  const modelDetails = (Array.isArray(plan.requestedDetails) ? plan.requestedDetails : []).filter((detail) => DETAILS.has(detail));
  // The model interprets meaning; validation enforces the contract. Do not
  // replace its semantic result with a second raw-word classifier. These
  // fields contain no facts and are safe to accept after enum/schema checks.
  const detailSet = new Set(modelDetails);
  const explicitDetails = deterministicRequestedDetails(question);
  if (isOfficialInformationPageRequest(question, { intent, goal: goals[0], goals })) {
    detailSet.clear();
    detailSet.add('action');
  }
  const instruction = instructionalRequestShape(question);
  const processOnly = (instruction.check || instruction.scheduling) && !instruction.separateStatus
    && !explicitDetails.includes('date') && !explicitDetails.includes('hours')
    && !explicitDetails.includes('permission') && !explicitDetails.includes('status')
    && (!instruction.scheduling || (!highConfidenceDateRange(question, options.now)
      && !/\b(?:available|availability|open slots?|next slot)\b/i.test(question)))
    && !/\b(?:required|must|restriction|limit|prohibited)\b/i.test(question);
  const methodOnly = instruction.calculation && !explicitDetails.includes('permission')
    && !explicitDetails.includes('status') && !explicitDetails.includes('date')
    && !/\b(?:required|must|restriction|limit|prohibited)\b/i.test(question);
  const reportedFindings = isReportedFindingsRequest(question);
  const priceOnly = explicitDetails.includes('price')
    && !explicitDetails.some(detail => detail !== 'price')
    && /^(?:how much\b|what(?:\s+is|\s+are|'s)\s+(?:the\s+)?(?:cost|price|fees?)\b)/i.test(question.trim());
  const regularHoursRequest = isRegularHoursRequest(question, { ...options, dateRange: plan.dateRange });
  if (regularHoursRequest) detailSet.delete('date');
  const directActionProcedure = /^\s*(?:how|where)\s+(?:(?:do|can|could|should)\s+(?:i|we)\s+|to\s+)(?:book|reserve|rent|apply|submit|register|sign up|pay|renew|log in|sign in)\b/i.test(question);
  if (directActionProcedure && !instruction.calculation
    && !/\b(?:methods?|options?|alternatives?|ways?|without|instead|otherwise|either|or|versus|vs|compar(?:e|ing|ison))\b/i.test(question)) {
    // How to perform one transaction is an action, not an additional request
    // for alternative methods. Explicit choices and compound facets remain.
    detailSet.delete('methods');
  }
  if (priceOnly) {
    // A price question does not request account access or a transaction just
    // because the named item can be purchased. Retain subject and authority.
    goals = goals.filter(goal => !['account-access', 'payment', 'booking', 'application', 'registration', 'information'].includes(goal));
    if (!goals.includes('cost')) goals.push('cost');
    detailSet.delete('action');
    detailSet.add('price');
  }
  if (processOnly) {
    // Correct only the live-observation interpretation; retain the model's
    // subject and query so no operational fact is supplied by this validator.
    goals = goals.filter(goal => !['permission', 'schedule', 'status', ...(instruction.scheduling ? ['booking'] : [])].includes(goal));
    if (!goals.length) goals = ['information'];
    if (['rules', 'events', 'status', ...(instruction.scheduling ? ['facilities'] : [])].includes(intent)) intent = 'services';
    detailSet.delete('permission');
    detailSet.delete('date');
    detailSet.delete('status');
    detailSet.add('action');
  }
  if (methodOnly) {
    goals = goals.filter(goal => !['permission', 'schedule', 'status'].includes(goal));
    if (!goals.length) goals = ['information'];
    if (['rules', 'events', 'status'].includes(intent)) intent = 'services';
    detailSet.delete('permission');
    detailSet.delete('date');
    detailSet.delete('status');
  }
  if (reportedFindings) {
    // Retain system names and report periods in the original query; a model's
    // live-status/calendar interpretation cannot change the evidence role.
    intent = 'services';
    goals = goals.filter(goal => !['permission', 'schedule', 'status'].includes(goal));
    if (!goals.length) goals = ['information'];
    for (const detail of ['permission', 'date', 'hours', 'status']) {
      if (!explicitDetails.includes(detail)) detailSet.delete(detail);
    }
  }
  // Exact specifications are high-risk facts. The planner may help interpret
  // the topic, but it cannot invent a request for a color, dimension, finish,
  // or material that the resident never asked about.
  if (explicitDetails.includes("specification")) detailSet.add("specification");
  else detailSet.delete("specification");
  if (explicitDetails.includes("methods")) detailSet.add("methods");
  for (const detail of ['eligibility', 'quantity']) {
    if (explicitDetails.includes(detail)) detailSet.add(detail);
    else detailSet.delete(detail);
  }
  // A consequence question is not a request to perform the action it negates.
  if (goals.length === 1 && goals[0] === "information"
    && /\b(?:what happens|what if)\b/i.test(question)
    && /\b(?:not|don't|cannot|can't|unpaid|late|past due|delinquent)\b/i.test(question)
    && !explicitDetails.includes("action")) detailSet.delete("action");
  const requestedDetails = DETAIL_PRIORITY.filter((detail) => detailSet.has(detail));
  const scope = SCOPES.has(plan.scope) ? plan.scope : "community";
  const needsClarification = Boolean(plan.needsClarification) || scope === "ambiguous";
  const clarificationQuestion = clean(plan.clarificationQuestion, 240);
  if (needsClarification && (
    !clarificationQuestion
    || !/\?$/.test(clarificationQuestion)
    || /https?:\/\/|\$\d|system prompt|api key|environment variable|ignore (?:the |all |previous )?instructions/i.test(clarificationQuestion)
  )) return null;
  return {
    intent,
    goal: goals[0],
    goals,
    subject,
    requestedDetails,
    dateRange: processOnly || methodOnly || reportedFindings || regularHoursRequest ? null : validatedModelDateRange(plan.dateRange, question, options.now) || fallbackDateRange(question, intent, options.now),
    filters: normalizeFilters(plan.filters, intent),
    searchQueries,
    scope,
    needsClarification,
    clarificationQuestion,
  };
}

function resolveInterpretationMode(value = process.env.COMMUNITY_INTERPRETATION_MODE) {
  const requested = clean(value, 20).toLowerCase();
  if (MODES.has(requested)) return requested;
  return String(process.env.RAILWAY_ENVIRONMENT_NAME || "").toLowerCase() === "staging" ? "structured" : "legacy";
}

module.exports = {
  DETAILS,
  FILTER_KEYS,
  GOALS,
  INTENTS,
  addDays,
  denverToday,
  correctNavigationSubject,
  deterministicRequestedDetails,
  fallbackDateRange,
  highConfidenceDateRange,
  localToday,
  instructionalRequestShape,
  isOfficialInformationPageRequest,
  isRegularHoursRequest,
  isReportedFindingsRequest,
  isWaterUsageAccessRequest,
  normalizeFilters,
  normalizeInterpretation,
  resolveInterpretationMode,
  validIsoDate,
};

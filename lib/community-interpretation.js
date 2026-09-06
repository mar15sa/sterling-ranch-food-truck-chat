const INTENTS = new Set(["rules", "facilities", "forms", "events", "alerts", "status", "services"]);
const GOALS = new Set(["permission", "payment", "booking", "application", "registration", "account-access", "contact", "cost", "schedule", "status", "information"]);
const DETAILS = new Set(["price", "action", "date", "hours", "contact", "permission", "examples", "status"]);
const SCOPES = new Set(["community", "unrelated", "ambiguous"]);
const FILTER_KEYS = ["audience", "category", "facility", "location"];
const MODES = new Set(["legacy", "shadow", "structured"]);
const GOAL_PRIORITY = ["permission", "payment", "booking", "application", "registration", "account-access", "contact", "cost", "schedule", "status", "information"];
const DETAIL_PRIORITY = ["price", "action", "date", "hours", "contact", "permission", "examples", "status"];

function clean(value, limit) {
  return String(value || "").normalize("NFKC").replace(/[\u200B-\u200D\u2060\uFEFF<>]/g, "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function denverToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

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

function highConfidenceDateRange(question = "", now = new Date()) {
  const text = String(question).toLowerCase();
  const today = denverToday(now);
  if (/\btomorrow\b/.test(text)) return { kind: "tomorrow", start: addDays(today, 1), end: addDays(today, 1), label: "tomorrow" };
  if (/\btoday\b|\btonight\b/.test(text)) return { kind: "today", start: today, end: today, label: /tonight/.test(text) ? "tonight" : "today" };
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

function deterministicRequestedDetails(question = "") {
  const text = String(question).toLowerCase();
  const details = [];
  if (/\b(?:how much|cost|price|fees?|deposit|rates?|charges?)\b/.test(text)) details.push("price");
  const action = /\b(?:how do|where (?:do|can)|book|reserve|rent|apply|submit|register|sign up|form|pay|payment|settle|settling|log in|login|download)\b/.test(text);
  const consequence = /\b(?:what happens|what if|do not|don't|cannot|can't|fail to|late|past due|delinquent|penalty|consequence|disconnect|shut ?off|collection)\b/.test(text);
  if (action && !consequence) details.push("action");
  if (/\b(?:when|date|day|today|tomorrow|weekend|upcoming|schedule)\b/.test(text)) details.push("date");
  if (/\b(?:hours?|open|closed|time)\b/.test(text)) details.push("hours");
  if (/\b(?:contact|phone|email|call|who (?:do i|should i|can i|do we|should we|can we))\b/.test(text)) details.push("contact");
  if (/\b(?:allowed|prohibited|permission|approval|need to)\b/.test(text)
    || (/\bcan (?:i|we)\b/.test(text) && !/\b(?:where|how|when|what)\s+can (?:i|we)\b/.test(text))) details.push("permission");
  if (/\b(?:examples?|which|what kind|what types?)\b/.test(text)) details.push("examples");
  if (/\b(?:status|currently|right now)\b/.test(text)) details.push("status");
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

function normalizeInterpretation(plan = {}, question = "", options = {}) {
  if (!plan || typeof plan !== "object") return null;
  const intent = INTENTS.has(plan.intent) ? plan.intent : "";
  const primaryGoal = GOALS.has(plan.goal) ? plan.goal : "";
  const goalSet = new Set([primaryGoal, ...(Array.isArray(plan.goals) ? plan.goals : [])].filter((goal) => GOALS.has(goal)));
  const goals = GOAL_PRIORITY.filter((goal) => goalSet.has(goal)).slice(0, 4);
  const subject = clean(plan.subject, 120);
  const searchQueries = (Array.isArray(plan.searchQueries) ? plan.searchQueries : [])
    .map((query) => clean(query, 160)).filter(Boolean).slice(0, 3);
  if (!intent || !goals.length || !subject || !searchQueries.length) return null;
  const modelDetails = (Array.isArray(plan.requestedDetails) ? plan.requestedDetails : []).filter((detail) => DETAILS.has(detail));
  // The model interprets meaning; validation enforces the contract. Do not
  // replace its semantic result with a second raw-word classifier. These
  // fields contain no facts and are safe to accept after enum/schema checks.
  const detailSet = new Set(modelDetails);
  // A consequence question is not a request to perform the action it negates.
  if (goals.length === 1 && goals[0] === "information"
    && /\b(?:what happens|what if)\b/i.test(question)
    && /\b(?:not|don't|cannot|can't|unpaid|late|past due|delinquent)\b/i.test(question)
    && !deterministicRequestedDetails(question).includes("action")) detailSet.delete("action");
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
    dateRange: validatedModelDateRange(plan.dateRange, question, options.now) || fallbackDateRange(question, intent, options.now),
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
  deterministicRequestedDetails,
  fallbackDateRange,
  highConfidenceDateRange,
  normalizeFilters,
  normalizeInterpretation,
  resolveInterpretationMode,
  validIsoDate,
};

const fs = require("node:fs");
const path = require("node:path");
const { validateSourceRecord } = require("./community-contracts");
const {
  deterministicRequestedDetails,
  normalizeInterpretation,
} = require("./community-interpretation");

const DEFAULT_INDEX_PATH = path.join(__dirname, "..", "data", "community-index.json");
const STOP_WORDS = new Set(["a", "about", "an", "and", "are", "can", "do", "for", "from", "how", "i", "in", "is", "it", "me", "my", "of", "on", "or", "the", "to", "we", "what", "where", "with"]);
const EXPANSIONS = {
  pay: ["payment", "billing", "account", "online"],
  payment: ["pay", "billing", "account", "online"],
  book: ["reserve", "reservation", "rental", "facility"],
  rent: ["reserve", "reservation", "rental", "facility"],
  park: ["parks", "shelter", "pavilion", "facility"],
  event: ["calendar", "program", "activity", "registration"],
  events: ["calendar", "program", "activities", "registration"],
  apply: ["application", "form", "submit", "request"],
  form: ["application", "submit", "request", "packet"],
  fee: ["cost", "price", "rate", "payment"],
  cost: ["fee", "price", "rate", "payment"],
  open: ["status", "hours", "closure"],
  trash: ["garbage", "recycling", "waste"],
  pool: ["aquatic", "swim", "status"],
  pickle: ["pickleball", "court", "recreation"],
  pickleball: ["court", "recreation", "park"],
  drc: ["design", "review", "architectural", "application"],
  fence: ["fencing"],
  fencing: ["fence"],
  paint: ["color", "stain", "finish"],
  color: ["paint", "stain", "finish"],
  colour: ["color", "paint", "stain", "finish"],
  stain: ["paint", "color", "finish"],
  wood: ["cedar", "lumber"],
};
const CONCEPTS = [
  ["book", "reserve", "reservation", "rent", "rental", "facility", "amenity", "shelter", "pavilion", "clubhouse", "overlook", "venue", "room"],
  ["price", "cost", "fee", "rate", "deposit", "charge", "payment"],
  ["apply", "application", "form", "permit", "submit", "packet", "request"],
  ["trash", "garbage", "recycling", "waste", "cart"],
  ["water", "sewer", "utility", "billing", "bill"],
  ["yard", "landscape", "landscaping", "lawn", "tree", "plant", "garden"],
  ["pickleball", "court", "recreation", "sport"],
];
const GENERIC_QUERY_TERMS = new Set(["apply", "application", "book", "call", "contact", "cost", "fee", "form", "help", "much", "pay", "price", "rent", "reserve", "rule"]);
const REQUESTED_OBJECT_TERMS = new Set([
  "fence", "fencing", "shed", "deck", "patio", "pergola", "gazebo", "tree", "plant", "turf",
  "flagpole", "mailbox", "pool", "clubhouse", "pavilion", "park", "court", "pickleball", "tennis", "trash", "recycling", "water",
]);

function facetAuthorityBoost(source, question, details = []) {
  const text = String(question).toLowerCase();
  const legal = details.includes("permission") || /\b(?:prohibit|violation|fine|drc|approval|build|construct|install|private|backyard|on my (?:lot|property))\b/i.test(text);
  const facilitySubject = /\b(?:court|pickle ?ball|tennis|pool|clubhouse|pavilion|shelter|facility|amenity|recreation)\b/i.test(text);
  const operational = details.some((detail) => ["hours", "price", "action", "date"].includes(detail)) || facilitySubject;
  if (legal && source.sourceType === "rules") return 24;
  if (!legal && operational && source.sourceType === "facilities") return 24;
  if (details.includes("hours") && ["status", "alerts"].includes(source.sourceType)) return 18;
  return 0;
}

const metrics = { searches: 0, noResults: 0, totalDurationMs: 0, byIntent: {} };
let cached = null;
let cachedPath = "";
let cachedMtime = 0;

function tokens(value = "") {
  const base = String(value).toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g) || [];
  const expanded = new Set();
  for (const token of base) {
    if (!STOP_WORDS.has(token)) expanded.add(token);
    for (const item of EXPANSIONS[token] || []) expanded.add(item);
  }
  return [...expanded];
}

function asksForPoolEvents(question = '') {
  return /\bpool\b/i.test(question)
    && /\b(?:events?|giveaways?|activities|classes?)\b/i.test(question)
    && /\b(?:any|what|which|happening|going on|scheduled)\b/i.test(question)
    && !/\b(?:open|closed|capacity|allowed|permit|permission|reserve|rent|host|hold)\b/i.test(question);
}

function classifyCommunityIntent(question = "") {
  const text = String(question).toLowerCase();
  if (asksForPoolEvents(text)) return 'events';
  if (/\bpool\b.{0,30}\b(?:open|closed|status|capacity|today|right now)\b|\b(?:open|closed|status)\b.{0,30}\bpool\b/i.test(text)) return "status";
  if (/\b(?:events?|calendar|classes?|activities|meeting|club|concert|festival|market|happening|this weekend)\b/i.test(text)) return "events";
  if (/\b(?:book|reserve|reservation|rent|rental|facility|amenity|shelter|pavilion|clubhouse|overlook|great hall)\b/i.test(text)) return "facilities";
  if (/\b(?:form|apply|application|permit|submit|packet|document|where do i send)\b/i.test(text)) return "forms";
  if (/\b(?:alert|closure|emergency|notice)\b/i.test(text)) return "alerts";
  if (
    /\b(?:trash|garbage|recycling|waste|bins?|carts?|containers?)\b/i.test(text)
    && /\b(?:store|stored|storage|leave|left|overnight|curb|bring back|take back|taking|put out|outside|exact hour|what time)\b/i.test(text)
    && !/\b(?:pickup|pick up|collection|schedule|which day|what day)\b/i.test(text)
  ) return "rules";
  if (/\b(?:contact|phone|email|billing|bill|trash|recycling|internet|service|utility|water department)\b/i.test(text) || (/\b(?:who|call|contact|phone|email)\b/i.test(text) && /\b(?:water|sewer|trash|recycling)\b/i.test(text))) return "services";
  if (/\b(?:allowed|prohibited|rule|regulation|drc|approval|fine|violation|parking|driveway|commercial|business|fence|shed|yard|tree|mailbox|quiet hours?|helipad|pet|dog|water(?:ing)?)\b/i.test(text)) return "rules";
  return "services";
}

function requestedDetails(question = "") {
  return deterministicRequestedDetails(question);
}

const ACTION_GOALS = new Set(["payment", "booking", "application", "registration", "account-access"]);

function normalizedRoutingPlan(plan = {}, question = "", options = {}) {
  if (!plan || typeof plan !== "object") return null;
  const goals = new Set(["permission", "payment", "booking", "application", "registration", "account-access", "contact", "cost", "schedule", "status", "information"]);
  const intents = new Set(["rules", "facilities", "forms", "events", "alerts", "status", "services"]);
  const modelGoal = goals.has(plan.goal) ? plan.goal : "";
  let proposedIntent = intents.has(plan.intent) ? plan.intent : "";
  const modelGoals = Array.isArray(plan.goals) ? plan.goals.filter((goal) => goals.has(goal)) : [];
  const goalPriority = ["permission", "payment", "booking", "application", "registration", "account-access", "contact", "cost", "schedule", "status", "information"];
  const compoundGoal = modelGoals.length > 1 ? goalPriority.find((candidate) => modelGoals.includes(candidate)) : "";
  // The shared interpreter owns semantic routing. Raw wording is retained only
  // as untrusted retrieval context; it must not override the validated goal.
  let goal = compoundGoal || modelGoal;
  // An explicit search for pool activities asks for calendar entries, not
  // whether the pool is open. Retain genuine status and permission questions.
  const poolEvents = asksForPoolEvents(question) && (!goal || ['status', 'information', 'schedule'].includes(goal));
  if (poolEvents) { proposedIntent = 'events'; goal = 'schedule'; }
  const structuredSubject = String(plan.subject || "");
  // “Holiday lighting season” is a rules schedule, not a calendar event.
  // Validate this domain-specific collision after AI interpretation so live
  // event retrieval cannot replace an official rule with unrelated events.
  if (proposedIntent === "events" && goal === "schedule"
    && /\b(?:holiday|seasonal|christmas)\b/i.test(structuredSubject)
    && /\blight(?:s|ing)?\b/i.test(structuredSubject)) proposedIntent = "rules";
  const fixedIntent = {
    permission: "rules",
    payment: "services",
    booking: "facilities",
    application: "forms",
    registration: "events",
    "account-access": "services",
    status: "status",
  }[goal];
  const intent = fixedIntent || proposedIntent || classifyCommunityIntent(question);
  const normalized = normalizeInterpretation({
    ...plan,
    ...(poolEvents ? { filters: { ...plan.filters, facility: 'pool', location: 'pool' }, needsClarification: false, clarificationQuestion: '' } : {}),
    intent,
    goal,
    goals: poolEvents ? ['schedule'] : [goal, ...(Array.isArray(plan.goals) ? plan.goals : [])],
  }, question, options);
  return normalized;
}

function sourceSupportsGoal(source = {}, goal = "") {
  if (!goal || !ACTION_GOALS.has(goal)) return true;
  if ((source.actions || []).some((action) => actionSupportsGoal(action, goal))) return true;
  const actionLabels = (source.actions || []).map((action) => `${action.label || ""} ${action.url || ""} ${(action.keywords || []).join(" ")} ${action.actionType || ""}`).join(" ");
  const evidence = `${source.title || ""} ${source.text || source.excerpt || ""} ${actionLabels}`.toLowerCase();
  const signals = {
    payment: /\b(?:pay online|payment options?|payment portal|e-?pay|ach|credit card|debit card|pay (?:a |the |your )?bill)\b/i,
    booking: /\b(?:book|booking|reserve|reservation|rental catalog|check availability)\b/i,
    application: /\b(?:apply|application|submit|submission|completed packet|application form)\b/i,
    registration: /\b(?:register|registration|sign up|enroll|subscription)\b/i,
    "account-access": /\b(?:log ?in|sign ?in|account access|password|reset|open a ticket|support)\b/i,
  };
  return signals[goal]?.test(evidence) || false;
}

function actionSupportsGoal(action = {}, goal = "") {
  if (!goal || !ACTION_GOALS.has(goal)) return true;
  const evidence = `${action.label || ""} ${action.url || ""} ${(action.keywords || []).join(" ")} ${action.actionType || ""}`.toLowerCase();
  const signals = {
    payment: /\b(?:pay|payment|billing|bill|utilityhawk|e-?pay|ach)\b/i,
    booking: /\b(?:book|booking|reserve|reservation|rental|availability|catalog)\b/i,
    application: /\b(?:apply|application|submit|submission|form|packet)\b/i,
    registration: /\b(?:register|registration|sign up|enroll|subscribe)\b/i,
    "account-access": /\b(?:log ?in|sign ?in|account|password|ticket|support|access)\b/i,
  };
  return signals[goal]?.test(evidence) || false;
}

function loadCommunityIndex(indexPath = DEFAULT_INDEX_PATH) {
  if (!fs.existsSync(indexPath)) return null;
  const stat = fs.statSync(indexPath);
  if (cached && cachedPath === indexPath && cachedMtime === stat.mtimeMs) return cached;
  const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  if (!Array.isArray(index.sources)) throw new Error("Community index is missing its sources array.");
  index.sources.forEach(validateSourceRecord);
  cached = index;
  cachedPath = indexPath;
  cachedMtime = stat.mtimeMs;
  return index;
}

function occurrenceCount(text, term) {
  if (!term) return 0;
  return String(text).toLowerCase().split(term.toLowerCase()).length - 1;
}

function conceptTerms(queryTokens) {
  const found = new Set();
  for (const concept of CONCEPTS) {
    if (concept.some((term) => queryTokens.includes(term))) concept.forEach((term) => found.add(term));
  }
  return [...found];
}

function scoreSource(source, queryTokens, intent, details, coreTokens = [], question = "") {
  const title = String(source.title || "").toLowerCase();
  const body = String(source.text || "").toLowerCase();
  const meaningfulCore = coreTokens.filter((term) => !GENERIC_QUERY_TERMS.has(term));
  const requestedObjects = meaningfulCore.filter((term) => REQUESTED_OBJECT_TERMS.has(term));
  if (requestedObjects.length && !requestedObjects.every((term) => title.includes(term) || body.includes(term))) return 0;
  if (meaningfulCore.length && !meaningfulCore.some((term) => title.includes(term) || body.includes(term))) return 0;
  let lexical = 0;
  let originalMatches = 0;
  for (const term of queryTokens) {
    const titleHits = occurrenceCount(title, term);
    const bodyHits = Math.min(occurrenceCount(body, term), 5);
    if (titleHits || bodyHits) originalMatches += 1;
    lexical += titleHits * 12 + bodyHits * 2;
  }
  if (!originalMatches) return 0;
  let score = lexical + originalMatches * 3 + Number(source.authorityScore || 0) * 10;
  for (const object of requestedObjects) {
    if (title.includes(object)) score += 36;
    else if (body.includes(object)) score += 14;
  }
  if (source.connectorType === "official-pdf" && requestedObjects.length) score += 18;
  const semanticHits = conceptTerms(queryTokens).filter((term) => title.includes(term) || body.includes(term)).length;
  score += Math.min(semanticHits, 6) * 2.5;
  if (source.sourceType === intent) score += 18;
  score += facetAuthorityBoost(source, question, details);
  if (details.includes("action") && source.actions?.length) score += 9;
  if (details.includes("price") && source.facts?.some((fact) => fact.type === "money")) score += 9;
  if (details.includes("contact") && source.facts?.some((fact) => ["email", "phone"].includes(fact.type))) score += 9;
  if (new Date(source.staleAfter || 0).getTime() < Date.now()) score -= 15;
  return Number(score.toFixed(2));
}

function dedupeSources(results, limit) {
  const seen = new Set();
  const output = [];
  for (const result of results) {
    const key = `${result.sourceUrl}:${result.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(result);
    if (output.length >= limit) break;
  }
  return output;
}

function mergePageChunks(results) {
  const groups = new Map();
  for (const result of results) {
    const key = `${result.sourceUrl}:${result.title}`;
    const group = groups.get(key) || [];
    if (group.length < 3) group.push(result);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => {
    const top = group[0];
    const unique = (items, keyFor) => items.filter((item, index, all) => all.findIndex((candidate) => keyFor(candidate) === keyFor(item)) === index);
    return {
      ...top,
      text: group.map((item) => item.text).join("\n\n"),
      excerpt: group.map((item) => item.excerpt).join(" ").slice(0, 700),
      actions: unique(group.flatMap((item) => item.actions || []), (item) => item.url),
      facts: unique(group.flatMap((item) => item.facts || []), (item) => `${item.type}:${item.value}`),
      chunkIds: group.map((item) => item.id),
    };
  }).sort((a, b) => b.score - a.score || b.authorityScore - a.authorityScore);
}

function searchCommunityIndex(question, options = {}) {
  const started = Date.now();
  const index = options.index || loadCommunityIndex(options.indexPath);
  const intent = options.intent || classifyCommunityIntent(question);
  const details = [...new Set([
    ...requestedDetails(question),
    ...(Array.isArray(options.interpretation?.requestedDetails) ? options.interpretation.requestedDetails : []),
  ])];
  const queryTokens = tokens(question);
  const coreTokens = (String(question).toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g) || []).filter((term) => !STOP_WORDS.has(term));
  metrics.searches += 1;
  metrics.byIntent[intent] = (metrics.byIntent[intent] || 0) + 1;
  if (!index) {
    metrics.noResults += 1;
    return { intent, requestedDetails: details, sources: [], index: null };
  }
  const compatibleTypes = {
    facilities: new Set(["facilities", "forms", "services", "rules"]),
    forms: new Set(["forms", "facilities", "services", "rules"]),
    events: new Set(["events", "facilities", "services"]),
    status: new Set(["status", "alerts", "facilities", "services"]),
    alerts: new Set(["alerts", "status", "services"]),
    rules: new Set(["rules", "forms", "facilities"]),
    services: new Set(["services", "forms", "facilities", "alerts"]),
  };
  const scored = index.sources
    .filter((source) => source.communityId === (options.communityId || index.communityId))
    .filter((source) => compatibleTypes[intent]?.has(source.sourceType) !== false)
    .map((source) => ({ ...source, score: scoreSource(source, queryTokens, intent, details, coreTokens, question) }))
    .filter((source) => source.score > 0)
    .sort((a, b) => b.score - a.score || b.authorityScore - a.authorityScore);
  const sources = dedupeSources(mergePageChunks(scored), options.limit || 5);
  if (!sources.length) metrics.noResults += 1;
  metrics.totalDurationMs += Date.now() - started;
  return { intent, requestedDetails: details, sources, index };
}

function searchCommunityIndexWithQueries(question, alternateQueries = [], options = {}) {
  const searches = [
    searchCommunityIndex(question, options),
    ...alternateQueries.slice(0, 3).filter(Boolean).map((query) => searchCommunityIndex(query, { ...options, intent: options.intent })),
  ];
  const base = searches[0];
  const fused = new Map();
  searches.forEach((result) => result.sources.forEach((source, rank) => {
    const key = `${source.sourceUrl}:${source.title}`;
    const existing = fused.get(key);
    const fusionBonus = 12 / (rank + 1);
    if (!existing) fused.set(key, { ...source, score: source.score + fusionBonus });
    else existing.score = Math.max(existing.score, source.score) + fusionBonus;
  }));
  return { ...base, sources: [...fused.values()].sort((a, b) => b.score - a.score).slice(0, options.limit || 5) };
}

function getCommunitySearchMetrics() {
  return {
    ...metrics,
    averageDurationMs: metrics.searches ? Number((metrics.totalDurationMs / metrics.searches).toFixed(2)) : 0,
  };
}

module.exports = {
  ACTION_GOALS,
  DEFAULT_INDEX_PATH,
  actionSupportsGoal,
  classifyCommunityIntent,
  getCommunitySearchMetrics,
  loadCommunityIndex,
  mergePageChunks,
  normalizedRoutingPlan,
  requestedDetails,
  scoreSource,
  searchCommunityIndex,
  searchCommunityIndexWithQueries,
  sourceSupportsGoal,
  tokens,
};

const fs = require("node:fs");
const path = require("node:path");
const { validateSourceRecord } = require("./community-contracts");
const {
  deterministicRequestedDetails,
  isWaterUsageAccessRequest,
  normalizeInterpretation,
} = require("./community-interpretation");
const { inferFacet, inferScopeKey, normalizeFactValue, normalizeUrl } = require("./community-truth");
const { sourceReviewState } = require('./community-source-answerability');
const { isDynamicSource } = require('./community-source-identity');

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

function requestedFacet(question, details = [], intent = "") {
  if (intent === "status") return "live-status";
  if (details.includes("price")) return "fee";
  if (details.includes("contact")) return "contact";
  if (details.includes("permission")) return "restriction";
  if (details.includes("hours")) return "facility-hours";
  if (details.includes("date") && intent === "events") return "event-date";
  if (details.includes("date") && intent === "facilities") return "facility-hours";
  if (details.includes("action")) return intent === "facilities" ? "reservation-policy" : "submission";
  return "";
}

function facetAuthorityBoost(source, question, details = [], intent = "", policy = {}) {
  const facet = requestedFacet(question, details, intent);
  const order = policy?.[facet] || [];
  if (facet && order.length) {
    const candidates = [source.authorityClass, source.connectorType, source.sourceType].filter(Boolean);
    const ranks = candidates.map((value) => order.indexOf(value)).filter((rank) => rank >= 0);
    return ranks.length ? Math.max(8, 40 - Math.min(...ranks) * 10) : -12;
  }
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
  // "Get access" to the Overlook clubhouse describes account setup, not a
  // request for a binding property-use rule. Models sometimes label this as
  // permission because of the word "access". Normalize this narrow facility
  // phrase before the generic permission -> rules mapping so the request can
  // reach the relevant official access source and, when its exact claim is not
  // approved, produce the deliberate access-withheld answer.
  const facilityAccountAccess = /\b(?:clubhouse|overlook)\b/i.test(`${question} ${structuredSubject}`)
    && /\b(?:access card|amenity card|membership|sign up|get access|request access|account access)\b/i.test(question);
  if (facilityAccountAccess) {
    proposedIntent = "services";
    goal = "account-access";
  }
  // Online water-usage access is an account task even when the planner anchors
  // on the title of the billing page that contains the approved payment
  // action. Normalize the resident's clear request before source selection so
  // billing contact facts cannot replace the requested access path.
  const waterUsageAccountAccess = isWaterUsageAccessRequest(question);
  if (waterUsageAccountAccess) {
    proposedIntent = "services";
    goal = "account-access";
  }
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
    ...(poolEvents ? { filters: { ...plan.filters, facility: '', location: 'pool' }, needsClarification: false, clarificationQuestion: '' } : {}),
    intent,
    goal,
    goals: poolEvents ? ['schedule'] : (facilityAccountAccess || waterUsageAccountAccess) ? ['account-access'] : [goal, ...(Array.isArray(plan.goals) ? plan.goals : [])],
    ...(facilityAccountAccess ? {
      requestedDetails: (Array.isArray(plan.requestedDetails) ? plan.requestedDetails : []).filter((detail) => detail !== "permission"),
    } : {}),
    ...(waterUsageAccountAccess ? {
      subject: "water usage monitoring account access",
      searchQueries: ["water usage monitoring", "water usage account access"],
      requestedDetails: ["action"],
      needsClarification: false,
      clarificationQuestion: "",
    } : {}),
  }, question, options);
  if (!normalized) return null;
  const defaultDetail = {
    permission: "permission",
    payment: "action",
    booking: "action",
    application: "action",
    registration: "action",
    "account-access": "action",
    contact: "contact",
    cost: "price",
    schedule: "date",
    status: "status",
  }[goal];
  return defaultDetail
    ? { ...normalized, requestedDetails: [...new Set([defaultDetail, ...normalized.requestedDetails])] }
    : normalized;
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

function scoreSource(source, queryTokens, intent, details, coreTokens = [], question = "", factAuthority = {}) {
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
  score += facetAuthorityBoost(source, question, details, intent, factAuthority);
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

function factMatchesApprovedEntry(fact = {}, source = {}, entry = {}) {
  return entry.factType === fact.type
    && JSON.stringify(entry.normalizedValue) === JSON.stringify(normalizeFactValue(fact))
    && entry.facet === inferFacet(fact, source)
    && entry.scopeKey === inferScopeKey(fact, source);
}

function actionMatchesApprovedEntry(action = {}, entry = {}) {
  return entry.factType === 'link'
    && normalizeUrl(entry.normalizedValue || entry.displayValue) === normalizeUrl(action.url);
}

function entriesForRequestedDetails(entries = [], details = []) {
  if (!details.length) return entries;
  return entries.filter((entry) => entry.factType === 'link' || details.some((detail) => {
    if (detail === 'price') return entry.facet === 'fee';
    if (detail === 'contact') return entry.facet === 'contact';
    if (detail === 'permission') return entry.facet === 'restriction';
    if (detail === 'hours') return entry.facet === 'facility-hours';
    if (detail === 'date') return ['event-date', 'facility-hours'].includes(entry.facet);
    if (detail === 'specification') return entry.facet === 'specification';
    if (detail === 'methods') return entry.facet === 'method';
    if (detail === 'action') return entry.factType === 'link' || ['information', 'submission', 'reservation-policy'].includes(entry.facet);
    return true;
  }));
}

function approvedClaimProjection(source = {}, entries = [], details = []) {
  const selectedEntries = entriesForRequestedDetails(entries, details);
  const facts = (source.facts || []).filter(fact => selectedEntries.some(entry => factMatchesApprovedEntry(fact, source, entry)));
  const actions = (source.actions || []).filter(action => selectedEntries.some(entry => actionMatchesApprovedEntry(action, entry)));
  const snippets = selectedEntries.map(entry => String(entry.supportingText || '').trim()).filter(Boolean);
  const text = [...new Set(snippets)].join('\n\n');
  return { ...source, text, excerpt: text.slice(0, 700), facts, actions };
}

function withheldClaimProjection(source = {}) {
  return { ...source, text: '', excerpt: '', facts: [], actions: [] };
}

function entriesSupportRequestedDetails(entries = [], details = []) {
  if (!details.length) return true;
  const facets = new Set(entries.map(entry => entry.facet));
  const types = new Set(entries.map(entry => entry.factType));
  if (details.includes('price') && !facets.has('fee')) return false;
  if (details.includes('contact') && !facets.has('contact')) return false;
  if (details.includes('permission') && !facets.has('restriction')) return false;
  if (details.includes('hours') && !facets.has('facility-hours')) return false;
  if (details.includes('date') && !facets.has('event-date') && !facets.has('facility-hours')) return false;
  if (details.includes('action') && !types.has('link') && !facets.has('submission') && !facets.has('reservation-policy')) return false;
  if (details.includes('methods') && !facets.has('method')) return false;
  return true;
}

function sourceCanResolveRequestedDetail(source = {}, detail = "") {
  // A page that describes a season, ordinary hours, or the meaning of a
  // status color is not evidence of its live value. Current-status evidence
  // must come from the dynamic source whose declared role is live status.
  // Keeping this at the source/facet boundary also prevents approved hours on
  // a static page from making a compound hours-and-status request answerable.
  if (detail !== "status") return true;
  return source.connectorType === "live-status"
    && source.sourceType === "status"
    && isDynamicSource(source);
}

function sourceCanResolveRequestedDetails(source = {}, details = []) {
  return details.every((detail) => sourceCanResolveRequestedDetail(source, detail));
}

function entriesSupportAnyRequestedDetail(entries = [], details = []) {
  return !details.length || details.some((detail) => entriesSupportRequestedDetails(entries, [detail]));
}

function searchCommunityIndex(question, options = {}) {
  const started = Date.now();
  const index = options.index || loadCommunityIndex(options.indexPath);
  const intent = options.intent || classifyCommunityIntent(question);
  // A validated shared interpretation owns the request semantics. Adding raw
  // keyword guesses back here can invent an extra facet after interpretation
  // (for example, treating “monthly water charge” as a price request when the
  // resident asks who handles it) and incorrectly withhold approved evidence.
  const interpretedDetails = Array.isArray(options.interpretation?.requestedDetails)
    ? options.interpretation.requestedDetails
    : null;
  const details = [...new Set(interpretedDetails || requestedDetails(question))];
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
    // A rules search can offer a form or facility link as a next step later,
    // but those pages must never be retrieved as evidence for the binding
    // conclusion itself.  Keeping this boundary at retrieval prevents a
    // keyword collision from being promoted by ranking alone.
    // Some adopted rulebook supplements are indexed as PDFs under the forms
    // area. They remain eligible, but ordinary forms do not.
    rules: new Set(["rules", "forms"]),
    services: new Set(["services", "forms", "facilities", "alerts"]),
  };
  const reviewNow = new Date(options.now || Date.now()).getTime();
  const reviewState = sourceReviewState(index, reviewNow);
  const ranked = index.sources
    .filter((source) => source.communityId === (options.communityId || index.communityId))
    .filter((source) => compatibleTypes[intent]?.has(source.sourceType) !== false)
    .filter((source) => intent !== "rules" || ["municode", "adopted-document", "official-pdf"].includes(source.authorityClass || source.connectorType))
    .map((source) => {
      const dynamic = isDynamicSource(source);
      const entries = reviewState.entriesFor(source);
      const hasFactualProjection = entries.some((entry) => entry.factType !== 'link');
      const hasActionProjection = entries.some((entry) => entry.factType === 'link');
      const projectionAllowed = reviewState.canUseProjection(source)
        || (options.includeActionOnlyProjections === true && reviewState.canUseActionProjection(source));
      const answerable = projectionAllowed
        && sourceCanResolveRequestedDetails(source, details)
        && (dynamic || (options.allowPartialRequestedDetails
          ? entriesSupportAnyRequestedDetail(entries, details)
          : entriesSupportRequestedDetails(entries, details)));
      const projected = dynamic ? source : answerable
        ? approvedClaimProjection(source, entries, details)
        : withheldClaimProjection(source);
      return {
        ...projected,
        canonicalScopedProjection: !dynamic && entries.some((entry) => entry.approvalClaim),
        canonicalFactualProjection: !dynamic && hasFactualProjection,
        canonicalActionProjection: !dynamic && hasActionProjection,
        canonicalActionOnlyProjection: !dynamic && hasActionProjection && !hasFactualProjection,
        withheldByFreshness: !answerable,
        score: scoreSource(answerable ? projected : source, queryTokens, intent, details, coreTokens, question, index.factAuthority || {}),
      };
    })
    .filter((source) => source.score > 0)
    .sort((a, b) => b.score - a.score || b.authorityScore - a.authorityScore);
  // An action-only projection is not pending factual evidence. Keep it out of
  // the withheld-source competition so the actual unreviewed facility page
  // remains the controlling explanation when a factual answer is unavailable.
  const withheldSources = ranked.filter((source) => source.withheldByFreshness && !source.canonicalActionOnlyProjection);
  const scored = ranked.filter((source) => !source.withheldByFreshness);
  const sources = dedupeSources(mergePageChunks(scored), options.limit || 5);
  if (!sources.length) metrics.noResults += 1;
  metrics.totalDurationMs += Date.now() - started;
  return { intent, requestedDetails: details, sources, withheldSources, index };
}

function searchCommunityIndexWithQueries(question, alternateQueries = [], options = {}) {
  const searches = [
    searchCommunityIndex(question, options),
    ...alternateQueries.slice(0, 3).filter(Boolean).map((query) => searchCommunityIndex(query, { ...options, intent: options.intent })),
  ];
  const base = searches[0];
  const fuse = (field, keyForSource) => {
    const fused = new Map();
    searches.forEach((result) => (result[field] || []).forEach((source, rank) => {
      const key = keyForSource(source);
      const existing = fused.get(key);
      const fusionBonus = 12 / (rank + 1);
      if (!existing) fused.set(key, { ...source, score: source.score + fusionBonus });
      else existing.score = Math.max(existing.score, source.score) + fusionBonus;
    }));
    return [...fused.values()].sort((a, b) => b.score - a.score);
  };
  return {
    ...base,
    sources: fuse("sources", (source) => `${source.sourceUrl}:${source.title}`).slice(0, options.limit || 5),
    // Alternate queries must carry pending evidence forward too. Otherwise a
    // planner can find the exact unreviewed page but the answer layer sees
    // only an approved, adjacent page and treats it as controlling evidence.
    withheldSources: fuse("withheldSources", (source) => source.id || `${source.sourceUrl}:${source.title}`),
  };
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
  requestedFacet,
  sourceCanResolveRequestedDetail,
  sourceCanResolveRequestedDetails,
  scoreSource,
  searchCommunityIndex,
  searchCommunityIndexWithQueries,
  sourceSupportsGoal,
  tokens,
};

const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const {
  getRulesLlmMode,
  recordRewriteRouting,
  rewriteAnswerWithLLM,
  selectiveRewriteDecision,
} = require("./rules-llm");
const {
  INPUT_CLASSIFICATIONS,
  classifyRulesInput,
} = require("./rules-input");
const {
  answerCoverageIssues,
  isMovableOutdoorBelongingsQuestion,
  isPlantListQuestion,
  isStateParksPassQuestion,
  normalizeResidentQuestion,
} = require("./rules-intent");
const { extractStructuredFacts } = require("./rules-facts");
const { conciseFactContext, readableSourcePassage } = require("./rules-fact-presentation");
const { focusedTopicAnswer, isPrivateSportCourtQuery } = require("./rules-focused-answers");
const { capitalizeFirstLetter, readableList, shortAnswerSummary, structuredHelpfulAnswer } = require("./rules-answer-format");
const {
  dateValue,
  documentEffectiveYear,
  documentEligibleForQuery,
  extractQueryYears,
  sourceLifecycleStatus,
} = require("./rules-source-lifecycle");
const { deriveAnswerVerdict } = require("./rules-verdict");
const {
  buildRetrievalQueries,
  buildRoutingQuery,
  getRulesSearchMode,
  mergeHybridSearchResults,
  planRulesSearch,
  rerankRulesSources,
  sourceEvidenceSupportsScope,
} = require("./rules-search");
const {
  answerFactText,
  dateTimePhrases,
  numericTokens,
  numberWordsToDigits,
} = require("./rules-grounding");
const OFFICIAL_RESOURCES = require("../data/rules-official-resources.json");

const CLIENT_ID = 20324;
const PRODUCT_ID = 15752;
const PUBLICATION_ID = 4303;
const MUNIDOC_HOST = "https://library.municode.com";
const SOURCE_PATH =
  "/co/sterling_ranch_community_authority_board/codes/rules_and_regulations";
const OFFICIAL_SOURCE_URL = `${MUNIDOC_HOST}${SOURCE_PATH}`;
const CAB_SITE_URL = OFFICIAL_RESOURCES.cabSite;
const DESIGN_REVIEW_DOCUMENTS_URL = OFFICIAL_RESOURCES.designReviewDocuments;
const SUBMIT_DRC_APPLICATION_URL = OFFICIAL_RESOURCES.submitDrcApplication;
const AMENITY_RENTALS_URL = OFFICIAL_RESOURCES.amenityRentals;
const PARK_SHELTERS_URL = OFFICIAL_RESOURCES.parkShelters;
const FACILITY_RENTAL_CATALOG_URL = OFFICIAL_RESOURCES.facilityRentalCatalog;
const COMMUNITY_CALENDAR_URL = OFFICIAL_RESOURCES.calendar;
const DEFAULT_INDEX_PATH = path.join(__dirname, "..", "data", "rules-index.json");
const DEFAULT_SUPPLEMENTS_PATH = path.join(__dirname, "..", "data", "rules-supplements.json");
const DEFAULT_SUPPLEMENT_SECTIONS_PATH = path.join(
  __dirname,
  "..",
  "data",
  "rules-supplement-sections.json"
);
const DEFAULT_REFRESH_MAX_AGE_MS = 1000 * 60 * 60 * 24;
const rulesIndexCache = new Map();
const FETCH_TIMEOUT_MS = Number(process.env.RULES_FETCH_TIMEOUT_MS) || 15000;
const FETCH_BATCH_SIZE = Number(process.env.RULES_FETCH_BATCH_SIZE) || 12;
const FETCH_DELAY_MS = Number(process.env.RULES_FETCH_DELAY_MS) || 175;
const MAX_EXCERPT_CHARS = 380;
const PUBLIC_SOURCE_NAME = "Sterling Ranch CAB Rules and Regulations";
const UNOFFICIAL_REMINDER =
  "This is an unofficial helper, not legal advice or an official CAB interpretation.";
const MIN_CLEAR_SCORE = 24;
const MIN_CLEAR_COVERAGE = 0.55;
const MIN_WEAK_COVERAGE_SCORE = 58;

const OFFICIAL_DESIGN_REVIEW_RESOURCES = [
  {
    id: "design-review-documents",
    title: "Official Design Review Documents",
    url: DESIGN_REVIEW_DOCUMENTS_URL,
    excerpt: "Official CAB page for design review applications, forms, and simple submittal one-sheets.",
  },
  {
    id: "submit-drc-application",
    title: "Submit a DRC Application",
    url: SUBMIT_DRC_APPLICATION_URL,
    excerpt: "Official CAB page for starting a design review application.",
  },
  {
    id: "general-architectural-improvement",
    title: "General Architectural Improvement Form",
    url: `${CAB_SITE_URL}/DocumentCenter/View/1574/Attachment-A-3-General-Arch-Improvement-2026`,
    excerpt: "Official CAB form for a general architectural improvement submittal.",
  },
  {
    id: "landscape-submittal",
    title: "Landscape Submittal Packet",
    url: `${CAB_SITE_URL}/DocumentCenter/View/1964/Landscape-Submittal-Packet-2026`,
    excerpt: "Official CAB landscape submittal packet.",
  },
  {
    id: "backyard-utility-sheds",
    title: "Backyard Utility Sheds One-Sheet",
    url: `${CAB_SITE_URL}/DocumentCenter/View/626/Backyard-Utility-Sheds`,
    excerpt: "Official DRC simple submittal one-sheet for backyard utility sheds.",
  },
  {
    id: "landscape-screens",
    title: "Landscape Screens One-Sheet",
    url: `${CAB_SITE_URL}/DocumentCenter/View/624/Landscape-Screens-`,
    excerpt: "Official DRC simple submittal one-sheet for landscape screens.",
  },
  {
    id: "rear-patio-lights",
    title: "Rear Patio Lights One-Sheet",
    url: `${CAB_SITE_URL}/DocumentCenter/View/623/Rear-Patio-Lights-`,
    excerpt: "Official DRC simple submittal one-sheet for rear patio lights.",
  },
  {
    id: "exterior-light-replacement",
    title: "Exterior Light Replacement One-Sheet",
    url: `${CAB_SITE_URL}/DocumentCenter/View/621/Exterior-Light-Replacement`,
    excerpt: "Official DRC simple submittal one-sheet for exterior light replacement.",
  },
  {
    id: "storm-doors",
    title: "Storm Doors One-Sheet",
    url: `${CAB_SITE_URL}/DocumentCenter/View/620/Storm-Doors-`,
    excerpt: "Official DRC simple submittal one-sheet for storm doors.",
  },
  {
    id: "solar-panels",
    title: "Solar Panels One-Sheet",
    url: `${CAB_SITE_URL}/DocumentCenter/View/619/Solar-Panels-`,
    excerpt: "Official DRC simple submittal one-sheet for solar panels.",
  },
  {
    id: "standard-3-rail-fencing",
    title: "Standard 3 Rail Fencing One-Sheet",
    url: `${CAB_SITE_URL}/DocumentCenter/View/618/Standard-3-Rail-Fencing-`,
    excerpt: "Official DRC simple submittal one-sheet for standard 3-rail fencing.",
  },
  {
    id: "roll-off-containers",
    title: "Roll Off Containers One-Sheet",
    url: `${CAB_SITE_URL}/DocumentCenter/View/748/Roll-Off-Containers`,
    excerpt: "Official DRC simple submittal one-sheet for roll-off containers.",
  },
];

const OFFICIAL_AMENITY_RENTAL_RESOURCES = [
  {
    id: "amenity-rentals",
    title: "Official CAB Amenity Rentals",
    url: AMENITY_RENTALS_URL,
    excerpt:
      "Official CAB page for current indoor facility and park-shelter availability, forms, fees, and contact details.",
  },
  {
    id: "park-shelters",
    title: "Official CAB Park Shelters",
    url: PARK_SHELTERS_URL,
    actionType: "booking-information",
    excerpt:
      "Official CAB page for park-shelter pricing, facility-use information, and Recreation team contact details.",
  },
  {
    id: "facility-rental-catalog",
    title: "Official Facility Rentals Catalog",
    url: FACILITY_RENTAL_CATALOG_URL,
    actionType: "booking",
    excerpt:
      "Official Sterling Ranch CivicRec catalog for current facility listings and any online reservation options.",
  },
];

const STOP_WORDS = new Set([
  "a",
  "about",
  "am",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "build",
  "but",
  "by",
  "can",
  "could",
  "do",
  "does",
  "for",
  "from",
  "get",
  "have",
  "how",
  "i",
  "ignore",
  "in",
  "is",
  "it",
  "listed",
  "me",
  "much",
  "my",
  "no",
  "number",
  "of",
  "on",
  "or",
  "please",
  "rule",
  "rulebook",
  "rules",
  "say",
  "says",
  "should",
  "tell",
  "the",
  "there",
  "this",
  "to",
  "under",
  "what",
  "whatever",
  "where",
  "with",
  "want",
  "yes",
]);

const GENERIC_INTENT_TERMS = new Set([
  "add",
  "allowed",
  "allow",
  "apply",
  "applies",
  "approval",
  "approve",
  "cab",
  "contact",
  "email",
  "find",
  "install",
  "installation",
  "installed",
  "list",
  "many",
  "need",
  "needs",
  "park",
  "parking",
  "permit",
  "period",
  "periods",
  "phone",
  "put",
  "run",
  "running",
  "section",
  "sections",
  "season",
  "source",
  "store",
  "stored",
  "timeframe",
  "up",
  "window",
]);

const SYNONYMS = {
  architectural: ["architecture", "design", "exterior", "improvement", "modification"],
  backyard: ["rear", "yard"],
  book: ["reserve", "reservation", "rental", "application", "agreement"],
  booking: ["reserve", "reservation", "rental", "application", "agreement"],
  cancel: ["cancellation", "refund"],
  cancellation: ["cancel", "refund"],
  change: ["alteration", "modification", "improvement", "construction"],
  changes: ["alteration", "modification", "improvement", "construction"],
  design: ["architectural", "exterior", "guidelines", "improvement"],
  exterior: ["architectural", "design", "improvement", "modification"],
  fee: ["fees", "charge", "charges", "assessment", "cost"],
  fees: ["fee", "charge", "charges", "assessment", "cost"],
  fine: ["fines", "penalty", "penalties", "violation", "enforcement"],
  fines: ["fine", "penalty", "penalties", "violation", "enforcement"],
  fence: ["fencing", "screen", "screening"],
  gemstone: ["jellyfish", "under-eave", "eave", "rake", "soffit", "hardwired", "lighting"],
  hardwired: ["soffit", "under-eave", "eave", "rake", "lighting", "gemstone", "jellyfish"],
  jellyfish: ["gemstone", "under-eave", "eave", "rake", "soffit", "hardwired", "lighting"],
  landscaping: ["landscape", "yard", "planting"],
  late: ["delinquent", "past", "due", "collection"],
  light: ["lights", "lighting", "fixture", "fixtures"],
  lighting: ["light", "lights", "fixture", "fixtures"],
  lights: ["light", "lighting", "fixture", "fixtures"],
  parks: ["park", "open", "space", "recreation", "trail"],
  park: ["parks", "facility", "shelter", "recreation"],
  patio: ["patios", "porch", "porches", "deck", "outdoor living space"],
  patios: ["patio", "porch", "porches", "deck", "outdoor living space"],
  pavilion: ["facility", "shelter", "rental"],
  paperwork: ["application", "agreement", "form", "submit"],
  privacy: ["screen", "screens", "screening", "landscape"],
  porch: ["porches", "patio", "patios", "deck", "outdoor living space"],
  porches: ["porch", "patio", "patios", "deck", "outdoor living space"],
  rates: ["rate", "fees", "charges"],
  rent: ["rental", "reserve", "reservation", "application", "agreement"],
  rental: ["rent", "reserve", "reservation", "application", "agreement"],
  reserve: ["reservation", "rental", "application", "agreement"],
  reservation: ["reserve", "rental", "application", "agreement"],
  rake: ["eave", "under-eave", "soffit", "hardwired", "lighting", "gemstone", "jellyfish"],
  permit: ["approval", "application", "review"],
  permits: ["approval", "application", "review"],
  soffit: ["under-eave", "eave", "rake", "hardwired", "lighting", "gemstone", "jellyfish"],
  rv: ["recreational", "vehicle", "vehicles", "motor", "home", "motorhome"],
  rvs: ["recreational", "vehicle", "vehicles", "motor", "home", "motorhome"],
  shed: ["accessory", "outbuilding", "backyard"],
  screen: ["screens", "screening", "landscape", "privacy"],
  screens: ["screen", "screening", "landscape", "privacy"],
  summer: ["june", "july", "seasonal"],
  trash: ["recycling", "waste", "containers", "cans"],
  utility: ["utilities", "water", "sanitation", "wastewater", "service"],
  utilities: ["utility", "water", "sanitation", "wastewater", "service"],
  violation: ["violations", "fine", "fines", "enforcement", "notice"],
  violations: ["violation", "fine", "fines", "enforcement", "notice"],
  water: ["utility", "utilities", "sanitation", "wastewater"],
};

const SEMANTIC_VECTOR_DIMS = 192;
const documentSemanticVectorCache = new WeakMap();
const querySemanticVectorCache = new Map();
const searchIndexStatsCache = new WeakMap();
const SEMANTIC_CONCEPTS = [
  {
    name: "facility-reservations",
    boost: 360,
    collectSources: true,
    groupsCompoundTerms: true,
    queryPatterns: [
      /\b(book|booking|reserve|reservation|rent|rental|sign up|paperwork|application|hold (?:a |an )?(?:party|event)|us(?:e|ing) (?:a |the )?(?:park|shelter|pavilion|clubhouse|facility))\b/i,
      /\b(park|parks|shelter|pavilion|facility|facilities|amenity|amenities|clubhouse|great hall|exhibit hall|pool|party|event)\b/i,
    ],
    sourcePatterns: [
      /\bReservation process\b/i,
      /\bSpecific facility rental rules\b/i,
      /\bFacilities Rental Application and Agreement\b/i,
      /\bavailable for rental\b/i,
      /\bprivate rental requests?\b/i,
    ],
  },
  {
    name: "rental-cancellations",
    boost: 520,
    collectSources: true,
    groupsCompoundTerms: true,
    queryPatterns: [
      /\b(cancel|cancellation|refund)\b/i,
      /\b(book|booking|reserve|reservation|rent|rental|facility|clubhouse|shelter|pavilion)\b/i,
    ],
    sourcePatterns: [/\bCancellation and refund policy\b/i, /\bRefunds for cancellations\b/i],
  },
  {
    name: "short-term-rentals",
    boost: 620,
    collectSources: true,
    queryPatterns: [
      /\b(airbnb|vrbo|vacation rental|short[-\s]?term rental|short[-\s]?term lodging|weekend rental|rent(?:ing)? (?:my|our|a|the) (?:home|house|property|place|room)|lease (?:my|our|a|the) (?:home|house|property|place|room)|book (?:my|our|a|the) (?:home|house|property|place|room).{0,35}\b(?:night|nights|weekend|week))\b/i,
    ],
    sourcePatterns: [
      /\bshort-term lodging, vacation rentals?\b/i,
      /\bshort-term, vacation property commonly referred to as VRBO\b/i,
    ],
  },
  {
    name: "landscape-screens",
    boost: 260,
    queryPatterns: [
      /\b(?:privacy|landscape)\s+screens?\b|\bscreens?\s+(?:privacy|landscape)\b|\bprivacy\s+screening\b/i,
    ],
    sourcePatterns: [
      /\(54\)\s*Landscape screens\b/i,
      /\bLandscape screens\.\s*DRC approval is required\b/i,
    ],
  },
  {
    name: "under-eave-lighting",
    boost: 190,
    queryPatterns: [
      /\b(permanent|programmable|year[-\s]?round|trim|roofline|eave|soffit|jellyfish|gemstone)\b/i,
      /\b(lights?|lighting|fixtures?)\b/i,
    ],
    sourcePatterns: [
      /\bunder[-\s]?eave lighting\b/i,
      /\beave\/rake lighting\b/i,
      /\bhardwired track\b/i,
      /\bGemstone\b/i,
      /\bJellyfish\b/i,
    ],
  },
  {
    name: "outdoor-living-lighting",
    boost: 180,
    groupsCompoundTerms: true,
    queryPatterns: [
      /\b(porch|porches|patio|patios|deck|decks|outdoor living space)\b/i,
      /\b(light|lights|lighting|fixture|fixtures)\b/i,
    ],
    sourcePatterns: [
      /\bUpdated exterior lighting policy\b/i,
      /\boutdoor living space\b/i,
      /\b3,000 Kelvin\b/i,
    ],
  },
  {
    name: "seasonal-lighting",
    boost: 150,
    queryPatterns: [
      /\b(holiday|christmas|seasonal|summer|june|july|october|january)\b/i,
      /\b(lights?|lighting|decorations?)\b/i,
    ],
    sourcePatterns: [
      /\bseasonal decorative lighting\b/i,
      /\bJune 18\b/i,
      /\bOctober 1\b/i,
      /\bJanuary 31\b/i,
    ],
  },
  {
    name: "design-review-approval",
    boost: 80,
    queryPatterns: [
      /\b(approval|approve|application|permit|drc|design review|submit)\b/i,
      /\b(build|install|change|modify|paint|replace|add|put up)\b/i,
    ],
    sourcePatterns: [
      /\bDRC approval\b/i,
      /\bDesign Review Committee\b/i,
      /\bsubmitted to the DRC\b/i,
      /\bapplication\b/i,
    ],
  },
  {
    name: "resident-fees",
    boost: 90,
    groupsCompoundTerms: true,
    queryPatterns: [
      /\b(fee|fees|charge|charges|cost|costs|pay|monthly|bill|bills|assessment)\b/i,
    ],
    sourcePatterns: [
      /\b2026\b/i,
      /\bfees?\b/i,
      /\bmonthly\b/i,
      /\bwater service base rates\b/i,
      /\bCAB Service Fees\b/i,
    ],
  },
  {
    name: "violation-fines",
    boost: 90,
    queryPatterns: [
      /\b(violation|fine|fines|warning|notice|hearing|cure|enforcement|penalty)\b/i,
    ],
    sourcePatterns: [
      /\bNotice of Violation\b/i,
      /\bWarning Letter\b/i,
      /\bfine schedule\b/i,
      /\bCommunity Standards Committee\b/i,
    ],
  },
];

const IMPORTANT_TERM_ALIASES = {
  backyard: ["backyard", "rear yard", "yard"],
  book: ["book", "booking", "reserve", "reservation", "rent", "rental", "application", "agreement"],
  booking: ["book", "booking", "reserve", "reservation", "rent", "rental", "application", "agreement"],
  cans: ["can", "cans", "container", "containers", "receptacle", "receptacles"],
  cat: ["cat", "cats", "pet", "pets"],
  cats: ["cat", "cats", "pet", "pets"],
  dog: ["dog", "dogs", "pet", "pets"],
  dogs: ["dog", "dogs", "pet", "pets"],
  fence: ["fence", "fences", "fencing"],
  home: ["home", "house"],
  house: ["house", "home"],
  lights: ["light", "lights", "lighting"],
  panels: ["panel", "panels"],
  paint: ["paint", "painting", "repaint", "repainting"],
  privacy: ["privacy", "privacy screen", "landscape screen", "landscape screens", "screening"],
  paperwork: ["paperwork", "application", "agreement", "form", "submit"],
  pavilion: ["pavilion", "shelter", "facility"],
  rent: ["rent", "rental", "reserve", "reservation"],
  rental: ["rent", "rental", "reserve", "reservation"],
  reserve: ["reserve", "reservation", "rent", "rental"],
  reservation: ["reserve", "reservation", "rent", "rental"],
  rv: ["rv", "rvs", "recreational vehicle", "recreational vehicles", "motor home", "motor homes", "motorhome", "motorhomes"],
  rvs: ["rv", "rvs", "recreational vehicle", "recreational vehicles", "motor home", "motor homes", "motorhome", "motorhomes"],
  shed: ["shed", "sheds", "backyard utility shed", "accessory building"],
  screen: ["screen", "screens", "privacy screen", "landscape screen", "landscape screens", "screening"],
  summer: ["summer", "june", "july", "seasonal"],
  setback: ["setback", "setbacks", "property line", "property lines", "minimum of"],
  trash: ["trash", "recycling", "waste"],
};

function municodeHeaders() {
  return {
    accept: "application/json, text/plain, */*",
    referer: OFFICIAL_SOURCE_URL,
    "user-agent":
      "Mozilla/5.0 (compatible; SterlingRanchRulesAssistant/1.0; +https://sterlingranchsociety.com/rules-assistant)",
    "X-CSRF": "1",
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  return require('./source-fetch').fetchSourceJson(url, {
    headers: municodeHeaders(), timeoutMs: FETCH_TIMEOUT_MS,
    attempts: Math.max(1, Math.min(5, Number(process.env.RULES_FETCH_RETRY_ATTEMPTS) || 3)),
    delayMs: Math.max(0, Number(process.env.RULES_FETCH_RETRY_DELAY_MS ?? 500) || 0),
  });
}

function decodeHtml(input = "") {
  const named = {
    amp: "&",
    apos: "'",
    bull: "-",
    copy: "(c)",
    ldquo: '"',
    lsquo: "'",
    mdash: "-",
    ndash: "-",
    nbsp: " ",
    quot: '"',
    rdquo: '"',
    rsquo: "'",
    sect: "Section",
  };

  return String(input)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(parseInt(code, 16))
    )
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] || match);
}

function stripHtml(html = "") {
  return cleanText(
    decodeHtml(
      String(html)
        .replace(/<script[\s\S]*?<\/script>/gi, "\n")
        .replace(/<style[\s\S]*?<\/style>/gi, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|tr|h[1-6]|table|section|article)>/gi, "\n")
        .replace(/<li[^>]*>/gi, "\n- ")
        .replace(/<[^>]+>/g, " ")
    )
  );
}

function cleanText(value = "") {
  return String(value)
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function sourceUrlForNode(nodeId) {
  if (!nodeId) return OFFICIAL_SOURCE_URL;
  return `${OFFICIAL_SOURCE_URL}?nodeId=${encodeURIComponent(nodeId)}`;
}

function getChildren(node) {
  return Array.isArray(node?.Children)
    ? node.Children
    : Array.isArray(node?.children)
      ? node.children
      : [];
}

function flattenToc(root) {
  const nodes = [];

  function walk(node, ancestors = []) {
    const id = String(node?.Id || node?.id || node?.NodeId || node?.nodeId || "");
    const heading = cleanText(node?.Heading || node?.Title || node?.title || node?.Name || "");
    const children = getChildren(node);
    const pathParts = [...ancestors.map((item) => item.heading), heading].filter(Boolean);
    const chapter = pathParts.find((part) => /^chapter\s+/i.test(part)) || "";
    const article = pathParts.find((part) => /^article\s+/i.test(part)) || "";

    if (id && heading) {
      nodes.push({
        id,
        heading,
        path: pathParts,
        chapter,
        article,
        depth: Number(node?.NodeDepth ?? node?.depth ?? ancestors.length),
        docOrderId: Number(node?.DocOrderId ?? node?.docOrderId ?? 0),
        hasChildren: children.length > 0,
      });
    }

    children.forEach((child) => walk(child, [...ancestors, { id, heading }]));
  }

  walk(root);
  return nodes;
}

function getLeafContentNodes(nodes) {
  return nodes.filter((node) => {
    if (!node.id || node.id === String(PRODUCT_ID)) return false;
    return !node.hasChildren;
  });
}

async function fetchLatestJob() {
  return fetchJson(`${MUNIDOC_HOST}/api/Jobs/latest/${PRODUCT_ID}`);
}

async function fetchToc() {
  const params = new URLSearchParams({
    productId: String(PRODUCT_ID),
    nodeId: String(PRODUCT_ID),
  });
  return fetchJson(`${MUNIDOC_HOST}/api/codesToc/fullTree/latest?${params.toString()}`);
}

async function fetchContentBatch(nodeIds, jobId) {
  const params = new URLSearchParams({
    productId: String(PRODUCT_ID),
    jobId: String(jobId),
  });
  nodeIds.forEach((nodeId) => params.append("docIds", nodeId));
  const docs = await fetchJson(`${MUNIDOC_HOST}/api/CodesContent/docIds?${params.toString()}`);
  return Array.isArray(docs) ? docs : docs?.Docs || docs?.docs || [];
}

function batchItems(items, size) {
  const batches = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

async function fetchAllSectionDocs(contentNodes, jobId) {
  const docs = [];
  const batches = batchItems(contentNodes, FETCH_BATCH_SIZE);

  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    docs.push(...(await fetchContentBatch(batch.map((node) => node.id), jobId)));
    if (index < batches.length - 1) await sleep(FETCH_DELAY_MS);
  }

  return docs;
}

function parseCodifiedThrough(bannerText = "") {
  const normalized = cleanText(bannerText).replace(/\n/g, " ");
  const match = normalized.match(/Codified through\s+(.+?)(?:\s*\(Supp\.|\s*$)/i);
  return match ? match[1].replace(/\.$/, "").trim() : "";
}

function normalizeJobId(job) {
  return job?.Id || job?.id || job?.JobId || job?.jobId || "";
}

function getDocText(doc) {
  const title = stripHtml(doc?.TitleHtml || doc?.Title || doc?.title || "");
  const content = stripHtml(doc?.Content || doc?.content || doc?.Html || doc?.html || "");
  return {
    title,
    text: cleanText(content || title),
  };
}

function makeTextChunks(text, maxChars = 2600) {
  const paragraphs = cleanText(text).split("\n").filter(Boolean);
  const chunks = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n${paragraph}` : paragraph;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current) chunks.push(current);

    if (paragraph.length <= maxChars) {
      current = paragraph;
      continue;
    }

    const sentences = paragraph.split(/(?<=[.!?])\s+/);
    current = "";
    for (const sentence of sentences) {
      const next = current ? `${current} ${sentence}` : sentence;
      if (next.length > maxChars && current) {
        chunks.push(current);
        current = sentence;
      } else {
        current = next;
      }
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function inlineTopicTitle(heading = "") {
  const clean = cleanText(heading).replace(/\n/g, " ").trim();
  const sentenceEnd = clean.indexOf(".");
  const title = (sentenceEnd >= 0 ? clean.slice(0, sentenceEnd) : clean).trim();
  return title.length >= 3 && title.length <= 120 ? title : "";
}

function buildInlineTopicDocuments(documents = []) {
  const grouped = new Map();

  for (const document of documents) {
    if (!document?.nodeId || document.isSupplemental || document.isInlineTopic) continue;
    const group = grouped.get(document.nodeId) || [];
    group.push(document);
    grouped.set(document.nodeId, group);
  }

  const topicDocuments = [];
  for (const [parentNodeId, group] of grouped) {
    const fullText = group.map((document) => document.text || "").filter(Boolean).join("\n");
    const listMarker = /\(b\)\nList of standards\./i.exec(fullText);
    if (!listMarker) continue;

    const listText = fullText.slice(listMarker.index + listMarker[0].length);
    const matches = [
      ...listText.matchAll(/(?:^|\n)\((\d{1,3})\)\n([^\n]{3,180})/g),
    ];
    if (matches.length < 8) continue;

    const template = group[0];
    for (let index = 0; index < matches.length; index += 1) {
      const match = matches[index];
      const number = match[1];
      const topicTitle = inlineTopicTitle(match[2]);
      if (!topicTitle) continue;

      const start = match.index + (match[0].startsWith("\n") ? 1 : 0);
      const nextMatch = matches[index + 1];
      const end = nextMatch
        ? nextMatch.index + (nextMatch[0].startsWith("\n") ? 1 : 0)
        : listText.length;
      const topicText = cleanText(listText.slice(start, end));
      if (topicText.length < 12) continue;

      const nodeId = parentNodeId + "__SUBSECTION_B_" + number;
      const title = template.title + " (b)(" + number + ") - " + topicTitle;
      makeTextChunks(topicText).forEach((chunk, chunkIndex) => {
        topicDocuments.push({
          ...template,
          id: nodeId + "::" + (chunkIndex + 1),
          nodeId,
          parentNodeId,
          title,
          path: [...(Array.isArray(template.path) ? template.path : []), title],
          text: chunk,
          isInlineTopic: true,
          inlineTopicNumber: number,
          inlineTopicTitle: topicTitle,
          sourcePriority: Math.max(Number(template.sourcePriority) || 0, 35),
        });
      });
    }
  }

  return topicDocuments;
}

function withInlineTopicDocuments(documents = []) {
  if (documents.some((document) => document?.isInlineTopic)) return documents;
  return [...documents, ...buildInlineTopicDocuments(documents)];
}

function buildDocuments(sectionDocs, nodeById, jobId) {
  const documents = [];

  for (const doc of sectionDocs) {
    const nodeId = String(doc?.Id || doc?.id || "");
    const node = nodeById.get(nodeId) || {};
    const { title, text } = getDocText(doc);
    const sectionTitle = title || node.heading || nodeId;

    if (!nodeId || !sectionTitle || !text || text.length < 12) continue;

    makeTextChunks(text).forEach((chunk, chunkIndex) => {
      documents.push({
        id: `${nodeId}::${chunkIndex + 1}`,
        nodeId,
        productId: PRODUCT_ID,
        jobId,
        title: sectionTitle,
        chapter: node.chapter || "",
        article: node.article || "",
        path: Array.isArray(node.path) ? node.path : [sectionTitle],
        sourceUrl: sourceUrlForNode(nodeId),
        text: chunk,
      });
    });
  }

  return documents;
}

async function createManualSourceIndex(sourceFile, indexPath = DEFAULT_INDEX_PATH) {
  const raw = await fs.readFile(sourceFile, "utf8");
  const text = path.extname(sourceFile).toLowerCase() === ".html" ? stripHtml(raw) : cleanText(raw);
  const jobId = "manual-source";
  const documents = makeTextChunks(text, 2600).map((chunk, index) => ({
    id: `manual-source::${index + 1}`,
    nodeId: "manual-source",
    productId: PRODUCT_ID,
    jobId,
    title: "Manually exported Sterling Ranch CAB Rules and Regulations",
    chapter: "",
    article: "",
    path: ["Rules and Regulations", "Manual source file"],
    sourceUrl: OFFICIAL_SOURCE_URL,
    text: chunk,
  }));

  const index = {
    schemaVersion: 1,
    source: {
      clientId: CLIENT_ID,
      productId: PRODUCT_ID,
      publicationId: PUBLICATION_ID,
      publicationName: "Rules and Regulations",
      sourceName: PUBLIC_SOURCE_NAME,
      sourceUrl: OFFICIAL_SOURCE_URL,
      latestJobEndpoint: `${MUNIDOC_HOST}/api/Jobs/latest/${PRODUCT_ID}`,
      tocEndpoint: `${MUNIDOC_HOST}/api/codesToc/fullTree/latest?productId=${PRODUCT_ID}&nodeId=${PRODUCT_ID}`,
      sectionEndpointPattern: `${MUNIDOC_HOST}/api/CodesContent/docIds?productId=${PRODUCT_ID}&jobId={latestJobId}&docIds={nodeId}`,
      latestJobId: jobId,
      codifiedThrough: "",
      onlineUpdateDate: "",
      onlinePostDate: "",
      lastFetchedAt: new Date().toISOString(),
      tocNodeCount: 0,
      sectionCount: documents.length,
      chunkCount: documents.length,
      warnings: [
        `Indexed from manual source file: ${path.basename(sourceFile)}`,
        "Refresh from the official online source when it is available.",
      ],
    },
    documents,
  };

  await writeIndex(index, indexPath);
  return index;
}

async function createRulesIndex(options = {}) {
  const indexPath = options.indexPath || DEFAULT_INDEX_PATH;
  if (options.sourceFile) {
    return createManualSourceIndex(options.sourceFile, indexPath);
  }

  const [job, toc] = await Promise.all([fetchLatestJob(), fetchToc()]);
  const jobId = normalizeJobId(job);
  if (!jobId) throw new Error("The official online source did not return a latest job ID.");

  const tocNodes = flattenToc(toc);
  const contentNodes = getLeafContentNodes(tocNodes);
  const nodeById = new Map(tocNodes.map((node) => [node.id, node]));
  const sectionDocs = await fetchAllSectionDocs(contentNodes, jobId);
  const documents = buildDocuments(sectionDocs, nodeById, jobId);

  const index = {
    schemaVersion: 1,
    source: {
      clientId: CLIENT_ID,
      productId: PRODUCT_ID,
      publicationId: PUBLICATION_ID,
      publicationName: "Rules and Regulations",
      sourceName: PUBLIC_SOURCE_NAME,
      sourceUrl: OFFICIAL_SOURCE_URL,
      latestJobEndpoint: `${MUNIDOC_HOST}/api/Jobs/latest/${PRODUCT_ID}`,
      tocEndpoint: `${MUNIDOC_HOST}/api/codesToc/fullTree/latest?productId=${PRODUCT_ID}&nodeId=${PRODUCT_ID}`,
      sectionEndpointPattern: `${MUNIDOC_HOST}/api/CodesContent/docIds?productId=${PRODUCT_ID}&jobId={latestJobId}&docIds={nodeId}`,
      latestJobId: jobId,
      codifiedThrough: parseCodifiedThrough(job?.BannerText || job?.bannerText || ""),
      onlineUpdateDate: job?.OnlineDate || job?.MaxTrackingDate || "",
      onlinePostDate: job?.OnlinePostDate || "",
      lastFetchedAt: new Date().toISOString(),
      tocNodeCount: tocNodes.length,
      sectionCount: sectionDocs.length,
      chunkCount: documents.length,
      warnings: [],
    },
    documents,
  };

  await writeIndex(index, indexPath);
  return index;
}

async function writeIndex(index, indexPath) {
  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  await fs.writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  rulesIndexCache.delete(path.resolve(indexPath));
}

async function loadRulesIndex(indexPath = DEFAULT_INDEX_PATH) {
  const cacheKey = path.resolve(indexPath);
  if (!rulesIndexCache.has(cacheKey)) {
    rulesIndexCache.set(cacheKey, (async () => {
      try {
        const raw = await fs.readFile(indexPath, "utf8");
        return await withSupplementalDocuments(JSON.parse(raw));
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    })());
  }

  try {
    return await rulesIndexCache.get(cacheKey);
  } catch (error) {
    rulesIndexCache.delete(cacheKey);
    throw error;
  }
}

async function warmRulesIndex(indexPath = DEFAULT_INDEX_PATH) {
  const index = await loadRulesIndex(indexPath);
  return Boolean(index);
}

async function loadRuleSupplements(supplementsPath = DEFAULT_SUPPLEMENTS_PATH) {
  try {
    const raw = await fs.readFile(supplementsPath, "utf8");
    const supplements = JSON.parse(raw);
    return Array.isArray(supplements) ? supplements : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function loadRuleSupplementSections(sectionsPath = DEFAULT_SUPPLEMENT_SECTIONS_PATH) {
  try {
    const raw = await fs.readFile(sectionsPath, "utf8");
    const sections = JSON.parse(raw);
    return Array.isArray(sections) ? sections : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function approvedSupplementDocument(document, parentSupplement = document) {
  const ownerReview = parentSupplement?.ownerReview || document?.ownerReview;
  const approvedText = ownerReview?.approvedAnswerEvidence;
  if (!approvedText) return document;
  return {
    ...document,
    text: approvedText,
    summaryText: approvedText,
    ownerReview,
    ownerReviewApplied: true,
  };
}

async function withSupplementalDocuments(
  index,
  supplementsPath = DEFAULT_SUPPLEMENTS_PATH,
  sectionsPath = DEFAULT_SUPPLEMENT_SECTIONS_PATH
) {
  if (!index) return index;

  const baseDocuments = withInlineTopicDocuments(index.documents || []);

  const [supplements, sections] = await Promise.all([
    loadRuleSupplements(supplementsPath),
    loadRuleSupplementSections(sectionsPath),
  ]);
  if (!supplements.length && !sections.length) {
    return {
      ...index,
      source: {
        ...(index.source || {}),
        inlineTopicCount: new Set(baseDocuments.filter((document) => document.isInlineTopic).map((document) => document.nodeId)).size,
      },
      documents: baseDocuments,
    };
  }

  const existingIds = new Set(baseDocuments.map((document) => document.id));
  const supplementsById = new Map(supplements.map((document) => [document.id, document]));
  const sectionsByParentId = new Set(
    sections
      .filter((document) => document?.parentSupplementId && document.searchable !== false)
      .map((document) => document.parentSupplementId)
  );
  const sectionDocuments = sections
    .filter(
      (document) =>
        document?.id &&
        document?.text &&
        document.searchable !== false &&
        !existingIds.has(document.id)
    )
    .map((document) => ({
      ...approvedSupplementDocument(document, supplementsById.get(document.parentSupplementId)),
      isSupplemental: true,
      isSupplementSection: true,
      sourcePriority: Number(document.sourcePriority) || 120,
    }));

  const summaryDocuments = supplements
    .filter(
      (document) =>
        document?.id &&
        document?.text &&
        document.searchable !== false &&
        !existingIds.has(document.id) &&
        !sectionsByParentId.has(document.id)
    )
    .map((document) => ({
      ...approvedSupplementDocument(document),
      isSupplemental: true,
      isSupplementSummary: true,
      sourcePriority: Number(document.sourcePriority) || 120,
    }));
  const supplementalDocuments = [...sectionDocuments, ...summaryDocuments];

  return {
    ...index,
    source: {
      ...(index.source || {}),
      supplementalDocumentCount: supplementalDocuments.length,
      supplementalSectionCount: sectionDocuments.length,
      supplementalDocuments: supplements.map((document) => ({
        approvedDate: document.approvedDate || "",
        sourceName: document.sourceName || document.title || "",
        sourceUrl: document.sourceUrl || "",
        title: document.title || "",
      })),
      inlineTopicCount: new Set(baseDocuments.filter((document) => document.isInlineTopic).map((document) => document.nodeId)).size,
    },
    documents: [...baseDocuments, ...supplementalDocuments],
  };
}

function hasRulesIndex(indexPath = DEFAULT_INDEX_PATH) {
  return fsSync.existsSync(indexPath);
}

async function getRulesIndexStatus(indexPath = DEFAULT_INDEX_PATH) {
  const index = await loadRulesIndex(indexPath);
  if (!index) {
    return {
      exists: false,
      sourceName: PUBLIC_SOURCE_NAME,
      sourceUrl: OFFICIAL_SOURCE_URL,
      lastFetchedAt: "",
      onlineUpdateDate: "",
      latestJobId: "",
      codifiedThrough: "",
      sectionCount: 0,
      chunkCount: 0,
      inlineTopicCount: 0,
      isStale: true,
      warnings: ["No local rules index has been created yet."],
    };
  }

  const source = index.source || {};
  const lastFetchedMs = source.lastFetchedAt ? Date.parse(source.lastFetchedAt) : 0;
  const maxAgeMs = Number(process.env.RULES_INDEX_MAX_AGE_MS) || DEFAULT_REFRESH_MAX_AGE_MS;
  const isStale = !lastFetchedMs || Date.now() - lastFetchedMs > maxAgeMs;

  return {
    exists: true,
    sourceName: PUBLIC_SOURCE_NAME,
    sourceUrl: source.sourceUrl || OFFICIAL_SOURCE_URL,
    lastFetchedAt: source.lastFetchedAt || "",
    onlineUpdateDate: source.onlineUpdateDate || "",
    onlinePostDate: source.onlinePostDate || "",
    latestJobId: source.latestJobId || "",
    codifiedThrough: source.codifiedThrough || "",
    sectionCount: source.sectionCount || 0,
    chunkCount: source.chunkCount || 0,
    inlineTopicCount: source.inlineTopicCount || 0,
    isStale,
    warnings: Array.isArray(source.warnings) ? source.warnings : [],
  };
}

function tokenize(text = "") {
  return String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^-+|-+$/g, ""))
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function expandQueryTerms(query) {
  const terms = new Set(tokenize(query));
  for (const term of [...terms]) {
    const singular = term.endsWith("s") ? term.slice(0, -1) : "";
    if (singular && !STOP_WORDS.has(singular)) terms.add(singular);
    (SYNONYMS[term] || SYNONYMS[singular] || []).forEach((value) => terms.add(value));
  }
  return [...terms];
}

function importantQueryTerms(query) {
  const terms = tokenize(query).filter((term) => !GENERIC_INTENT_TERMS.has(term));
  const collapsed = new Set();

  for (const term of terms) {
    collapsed.add(term.endsWith("s") && term.length > 3 ? term.slice(0, -1) : term);
  }

  return [...collapsed];
}

// A broad property category is not authority to answer about a project merely
// because the project would sit on that property.  For example, a landscaping
// rule cannot decide whether a resident may build an otherwise unmentioned
// structure.  Keep this deliberately small and lexical: it identifies the
// object a resident names after a construction verb, then requires the cited
// evidence to name that object (or a real synonym) before any positive answer
// path may run.
const PROJECT_ACTION_PATTERN = /\b(?:build|construct|install|erect|create|add|place|set\s+up|put\s+up)\s+(?:a|an|the|my|our)?\s*([\p{L}\p{N}-]+(?:\s+[\p{L}\p{N}-]+){0,4})/iu;
const PROJECT_PHRASE_STOP_WORDS = new Set([
  "in", "on", "at", "for", "from", "with", "to", "near", "by", "behind", "beside", "under", "over", "within", "outside", "of", "that", "which", "and", "or", "what", "where", "when", "why", "how", "does", "do", "is", "are", "need", "needs", "required",
]);
const PROJECT_DESCRIPTOR_WORDS = new Set([
  "new", "small", "large", "big", "my", "our", "the", "a", "an", "existing", "proposed", "permanent", "temporary", "freestanding", "attached", "detached", "outdoor", "indoor", "backyard", "frontyard", "front", "rear", "side", "residential", "privacy", "religious",
]);
const PROJECT_TERM_SYNONYMS = Object.freeze({
  ac: ["air conditioner", "air conditioning"],
  hvac: ["air conditioner", "air conditioning"],
  spa: ["hot tub", "outdoor spa"],
  hottub: ["hot tub", "outdoor spa"],
  light: ["lighting", "light fixture", "exterior lighting"],
  roofline: ["under eaves", "eave", "soffit", "trim", "eave/rake", "permanent lighting"],
  patio: ["outdoor living space"],
  porch: ["outdoor living space"],
  deck: ["outdoor living space"],
});

function namedProjectTerms(query = "") {
  const match = String(query || "").match(PROJECT_ACTION_PATTERN);
  if (!match) return [];
  const terms = [];
  // Stop at a location or purpose preposition before token normalization.
  // tokenize() intentionally discards those ordinary words, which would
  // otherwise make "landscape screens for backyard privacy" look like one
  // three-part object rather than the object "landscape screens."
  const rawTokens = String(match[1]).toLowerCase().match(/[\p{L}\p{N}-]+/gu) || [];
  for (const rawToken of rawTokens) {
    if (PROJECT_PHRASE_STOP_WORDS.has(rawToken)) break;
    const token = rawToken.replace(/^-+|-+$/g, "");
    if (PROJECT_DESCRIPTOR_WORDS.has(token) || token.length < 3) continue;
    terms.push(token.endsWith("s") && token.length > 3 ? token.slice(0, -1) : token);
  }
  return [...new Set(terms)];
}

function sourceSupportsProjectTerm(source, term) {
  const text = `${source.title || ""} ${source.excerpt || ""} ${source.text || ""}`.toLowerCase();
  const candidates = [term, ...(PROJECT_TERM_SYNONYMS[term] || [])];
  return candidates.some((candidate) => {
    const normalized = String(candidate).toLowerCase().trim();
    const pattern = normalized.includes(" ")
      ? new RegExp(`\\b${escapeRegExp(normalized).replace(/ /g, "\\s+")}\\b`, "i")
      : new RegExp(`\\b${escapeRegExp(normalized)}(?:s|es)?\\b`, "i");
    return pattern.test(text);
  });
}

function namedProjectEvidenceGuard(question, sources = []) {
  const terms = namedProjectTerms(question);
  if (!terms.length) return { applies: false, supported: true, terms: [] };
  // Patio, porch, and deck lighting has dedicated retrieval and is evaluated
  // against the current exterior-lighting policy below. Do not classify the
  // ordinary wording as an unsupported construction project before that
  // policy can be checked.
  if (isPorchPatioLightingQuery(question)) {
    return { applies: true, supported: true, terms };
  }
  const unsupportedTerms = terms.filter(
    (term) => !sources.some((source) => sourceSupportsProjectTerm(source, term))
  );
  return {
    applies: true,
    supported: unsupportedTerms.length === 0,
    terms,
    unsupportedTerms,
  };
}

function extractQueryPhrases(query) {
  const terms = tokenize(query).filter((term) => !GENERIC_INTENT_TERMS.has(term));
  const phrases = new Set();

  for (let index = 0; index < terms.length - 1; index += 1) {
    phrases.add(`${terms[index]} ${terms[index + 1]}`);
  }

  for (let index = 0; index < terms.length - 2; index += 1) {
    phrases.add(`${terms[index]} ${terms[index + 1]} ${terms[index + 2]}`);
  }

  return [...phrases].filter((phrase) => phrase.length >= 7);
}

function countTermMatches(text, terms, maxPerTerm = Infinity) {
  const normalized = String(text).toLowerCase();
  let count = 0;
  for (const term of terms) {
    const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, "gi");
    count += Math.min((normalized.match(pattern) || []).length, maxPerTerm);
  }
  return count;
}

function termFrequencyMap(tokens) {
  const map = new Map();
  tokens.forEach((token) => map.set(token, (map.get(token) || 0) + 1));
  return map;
}

function buildSearchStats(documents) {
  const byId = new Map();
  const documentFrequency = new Map();
  let totalLength = 0;

  for (const document of documents || []) {
    const tokens = tokenize(
      `${document.title || ""} ${document.chapter || ""} ${document.article || ""} ${
        document.text || ""
      }`
    );
    const termFrequency = termFrequencyMap(tokens);
    byId.set(document.id, {
      length: tokens.length || 1,
      termFrequency,
    });
    totalLength += tokens.length || 1;

    for (const term of new Set(tokens)) {
      documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
    }
  }

  return {
    averageLength: Math.max(1, totalLength / Math.max(1, byId.size)),
    byId,
    documentCount: Math.max(1, byId.size),
    documentFrequency,
  };
}

function bm25Score(documentStats, searchStats, terms) {
  if (!documentStats || !terms.length) return 0;

  const k1 = 1.35;
  const b = 0.72;
  let score = 0;

  for (const term of terms) {
    const frequency = documentStats.termFrequency.get(term) || 0;
    if (!frequency) continue;

    const documentFrequency = searchStats.documentFrequency.get(term) || 0;
    const idf = Math.log(
      1 + (searchStats.documentCount - documentFrequency + 0.5) / (documentFrequency + 0.5)
    );
    const denominator =
      frequency +
      k1 * (1 - b + b * (documentStats.length / searchStats.averageLength));
    score += idf * ((frequency * (k1 + 1)) / denominator);
  }

  return score;
}

function semanticHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function semanticFeatures(text = "") {
  const tokens = tokenize(text).filter((token) => !GENERIC_INTENT_TERMS.has(token));
  const features = [];

  for (const token of tokens) {
    features.push({ feature: `w:${token}`, weight: 1.4 });
    if (token.length >= 5) {
      for (let index = 0; index <= token.length - 3; index += 1) {
        features.push({ feature: `g:${token.slice(index, index + 3)}`, weight: 0.25 });
      }
    }
  }

  for (let index = 0; index < tokens.length - 1; index += 1) {
    features.push({ feature: `b:${tokens[index]} ${tokens[index + 1]}`, weight: 1.8 });
  }

  return features;
}

function hashedSemanticVector(text = "") {
  const vector = new Array(SEMANTIC_VECTOR_DIMS).fill(0);
  for (const { feature, weight } of semanticFeatures(text)) {
    const hash = semanticHash(feature);
    const slot = hash % SEMANTIC_VECTOR_DIMS;
    const sign = hash % 2 === 0 ? 1 : -1;
    vector[slot] += sign * weight;
  }
  return vector;
}

function cosineSimilarity(left, right) {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  if (!leftNorm || !rightNorm) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function semanticConceptMatchesQuery(name, query) {
  const concept = SEMANTIC_CONCEPTS.find((candidate) => candidate.name === name);
  return Boolean(concept && concept.queryPatterns.every((pattern) => pattern.test(query)));
}

function semanticConceptScore(document, query) {
  const sourceText = `${document.title || ""} ${document.chapter || ""} ${document.article || ""} ${document.text || ""}`;
  let score = 0;

  for (const concept of SEMANTIC_CONCEPTS) {
    const queryMatches = semanticConceptMatchesQuery(concept.name, query);
    if (!queryMatches) continue;
    const sourceMatches = concept.sourcePatterns.some((pattern) => pattern.test(sourceText));
    if (sourceMatches) score += concept.boost;
  }

  return score;
}

function semanticSimilarityScore(document, query) {
  const sourceText = `${document.title || ""} ${document.chapter || ""} ${document.article || ""} ${String(
    document.text || ""
  ).slice(0, 2400)}`;
  const queryKey = cleanText(query).toLowerCase();
  let queryVector = querySemanticVectorCache.get(queryKey);
  if (!queryVector) {
    queryVector = hashedSemanticVector(query);
    if (querySemanticVectorCache.size >= 250) {
      querySemanticVectorCache.delete(querySemanticVectorCache.keys().next().value);
    }
    querySemanticVectorCache.set(queryKey, queryVector);
  }
  let sourceVector = documentSemanticVectorCache.get(document);
  if (!sourceVector) {
    sourceVector = hashedSemanticVector(sourceText);
    documentSemanticVectorCache.set(document, sourceVector);
  }
  const similarity = cosineSimilarity(queryVector, sourceVector);
  const vectorScore = similarity > 0.2 ? similarity * 55 : 0;

  return vectorScore + semanticConceptScore(document, query);
}

function textContainsTerm(text, term) {
  return new RegExp(`\\b${escapeRegExp(term)}s?\\b`, "i").test(String(text || ""));
}

function textMatchesImportantTerm(text, term) {
  const normalized = String(text || "").toLowerCase();
  const aliases = IMPORTANT_TERM_ALIASES[term] || [term];

  return aliases.some((alias) => {
    const value = String(alias || "").toLowerCase();
    if (!value) return false;
    if (value.includes(" ")) return normalized.includes(value);
    return textContainsTerm(normalized, value);
  });
}

function getMatchStats(document, originalTerms, expandedTerms, phrases) {
  const title = `${document.title || ""} ${document.chapter || ""} ${document.article || ""}`;
  const text = document.text || "";
  const combined = `${title} ${text}`;
  const matchedOriginalTerms = originalTerms.filter((term) =>
    textMatchesImportantTerm(combined, term)
  );
  const matchedExpandedTerms = expandedTerms.filter((term) => textContainsTerm(combined, term));
  const titleMatches = originalTerms.filter((term) => textMatchesImportantTerm(title, term))
    .length;
  const bodyMatches = originalTerms.filter((term) => textMatchesImportantTerm(text, term))
    .length;
  const phraseMatches = phrases.filter((phrase) =>
    String(combined).toLowerCase().includes(phrase.toLowerCase())
  );

  return {
    bodyMatches,
    matchedExpandedTerms,
    matchedOriginalTerms,
    phraseMatches,
    titleMatches,
  };
}

function cloneMatchStats(matchStats = {}) {
  return {
    bodyMatches: matchStats.bodyMatches || 0,
    matchedExpandedTerms: [...new Set(matchStats.matchedExpandedTerms || [])],
    matchedOriginalTerms: [...new Set(matchStats.matchedOriginalTerms || [])],
    phraseMatches: [...new Set(matchStats.phraseMatches || [])],
    titleMatches: matchStats.titleMatches || 0,
  };
}

function mergeMatchStats(target, source = {}) {
  const merged = cloneMatchStats(target);
  merged.bodyMatches += source.bodyMatches || 0;
  merged.titleMatches += source.titleMatches || 0;
  merged.matchedExpandedTerms = [
    ...new Set([...merged.matchedExpandedTerms, ...(source.matchedExpandedTerms || [])]),
  ];
  merged.matchedOriginalTerms = [
    ...new Set([...merged.matchedOriginalTerms, ...(source.matchedOriginalTerms || [])]),
  ];
  merged.phraseMatches = [
    ...new Set([...merged.phraseMatches, ...(source.phraseMatches || [])]),
  ];
  return merged;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findChapterQuestion(query) {
  const match = String(query).match(/\bchapter\s+(\d+[a-z]?)\b/i);
  return match ? match[1].toLowerCase() : "";
}

function sectionNumberQuestion(query) {
  const match = String(query).match(/\b(?:sec(?:tion)?\.?\s*)?(\d+-\d+[a-z]?)\b/i);
  return match ? match[1].toLowerCase() : "";
}

function isLandscapeScreenQuery(query) {
  return /\b(?:privacy|landscape)\s+screens?\b|\bscreens?\s+(?:privacy|landscape)\b|\bprivacy\s+screening\b/i.test(
    query
  );
}

function isLandscapeOverviewQuery(query) {
  const text = String(query || "");
  return (
    /\b(landscap(?:e|ing)|yard)\b/i.test(text) &&
    /\b(rule|rules|requirement|requirements|standard|standards|overview|need to know)\b/i.test(text) &&
    !/\b(screen|screens|shed|fence|fences|ornament|yard art|decorative object|statue|tree replacement|dead tree|watering|irrigation schedule)\b/i.test(
      text
    )
  );
}

function isLandscapeCompletionDeadlineQuery(query) {
  const text = String(query || "");
  return (
    /\b(?:back\s*yard|rear(?:\s+yard)?|front\s+yard|landscap(?:e|ing)|yards?)\b/i.test(text) &&
    /\b(?:how long|how many (?:days|weeks|months)|when|deadline|due|finish(?:ed)?|complete(?:d|tion)?)\b/i.test(text) &&
    !/\b(?:yard art|ornaments?|decorative objects?|statues?|screens?|sheds?|fences?|lighting|paint(?:ing)?|stain(?:ing)?)\b/i.test(text)
  );
}

function isParksOpenSpaceOverviewQuery(query) {
  const text = String(query || "");
  return (
    /\b(parks|trails?|open spaces?)\b/i.test(text) &&
    /\b(rule|rules|allowed|prohibited|can|overview|need to know)\b/i.test(text)
  );
}

function isAmenityReservationQuery(query) {
  return (
    semanticConceptMatchesQuery("facility-reservations", query) &&
    !semanticConceptMatchesQuery("rental-cancellations", query) &&
    !isShortTermRentalQuery(query)
  );
}

function isShortTermRentalQuery(query) {
  return semanticConceptMatchesQuery("short-term-rentals", String(query || ""));
}

function isFenceHeightQuery(query) {
  return /\b(fence|fences|fencing)\b/i.test(String(query || "")) &&
    /\b(height|high|tall|maximum|max)\b/i.test(String(query || ""));
}

function isFenceFinishQuery(query) {
  const text = String(query || "");
  return /\bfenc(?:e|es|ing)\b/i.test(text) && /\b(?:paint|stain|color|colour|finish)\b/i.test(text);
}

function isMailboxModificationQuery(query) {
  const text = String(query || "");
  return /\bmailbox(?:es)?\b/i.test(text) && /\b(?:paint|repaint|color|colour|modify|change)\b/i.test(text);
}

function isExteriorPaintQuestion(query) {
  const text = String(query || "");
  if (isMailboxModificationQuery(text)) return false;
  return (
    (/\b(?:paint|painting|repaint|repainting)\b/i.test(text) &&
      /\b(?:house|home|exterior|siding|trim|eaves|garage doors?)\b/i.test(text)) ||
    /\b(?:(?:specific |approved |preapproved |pre-approved )?(?:exterior |house |home |paint |garage door )colors?|paint color|color\b.{0,35}\bgarage door|garage door\b.{0,35}\bcolor)\b/i.test(text)
  );
}

function isTrashStorageQuery(query) {
  return /\b(trash|garbage|recycling|bins?|containers?)\b/i.test(String(query || "")) &&
    /\b(store|stored|storage|leave|left|overnight|night|curb|pickup|collection|bring|put out|outside)\b/i.test(String(query || ""));
}

function isShedQuery(query) {
  return /\bsheds?\b/i.test(String(query || ""));
}

function isExteriorReviewQuery(query) {
  return (
    isLandscapeScreenQuery(query) ||
    /\b(exterior|architectural|architecture|approval|drc|design review|design guidelines|landscap|improvement|modify|modification|change|changes|shed|fence|deck|porch|paint|roof)\b/i.test(
      query
    )
  );
}

function isUtilityQuery(query) {
  return /\b(utility|utilities|water|sanitary|sanitation|sewer|wastewater|meter|tap)\b/i.test(
    query
  );
}

function isFeeQuery(query) {
  return /\b(fee|fees|charge|charges|cost|costs|assessment|payment|rate|rates|bill|bills)\b|\bhow much\b.{0,80}\b(water|sewer|sanitary|stormwater|tap|facility|trash|streetlight|fine|violation)\b/i.test(query) ||
    /\b(pay|owe|charged)\b.*\b(month|monthly|resident|residents|cab)\b/i.test(query) ||
    /\b(month|monthly|resident|residents|cab)\b.*\b(pay|owe|charged)\b/i.test(query);
}

function isSpecificFeeQuery(query) {
  return /\b(water|sewer|sanitary|stormwater|trash|streetlight|driveway|shared driveway|alley|tap|facility|facilities|clubhouse|pool|rental|rent|guest|caregiver|late|delinquent|past due|lien|disconnect|reconnect|violation|fine|fines|resale|status letter|questionnaire|floorplan|design review|landscape review|improvement review)\b/i.test(
    query
  );
}

function isWaterServiceFeeQuery(query) {
  return /\bwater\s+(?:service\s+)?(?:fee|fees|charge|charges|cost|costs|rate|rates)\b/i.test(
    String(query || "")
  );
}

function isResidentFeeOverviewQuery(query) {
  const text = String(query || "");
  const hasFeeLanguage = isFeeQuery(text) || /\b(pay|owe|charged)\b/i.test(text);
  const hasResidentOrRecurringLanguage =
    /\b(resident|residents|owner|owners|homeowner|homeowners|monthly|month|every month|regular|ongoing|bill|bills|pay|owe)\b/i.test(
      text
    );

  return hasFeeLanguage && hasResidentOrRecurringLanguage && !isSpecificFeeQuery(text);
}

function isSeasonalLightingQuery(query) {
  return (
    /\b(lights?|lighting)\b/i.test(query) &&
    /\b(holiday|seasonal|decorative|christmas|summer|june|july|october|january|pride|red white blue|timeframe|season|window)\b/i.test(
      query
    )
  );
}

function isLightingRelatedQuery(query) {
  return /\b(light|lights|lighting|fixture|fixtures|holiday|seasonal|string lights?|gemstone|jellyfish|under[-\s]?eaves?|soffits?|eave\/rake|eave|rake|hardwired|permanent|roofline|trim)\b/i.test(
    String(query || "")
  );
}

function isUnderEaveLightingQuery(query) {
  const text = String(query || "");
  const mentionsLighting =
    /\b(lights?|lighting|fixture|fixtures)\b/i.test(text) ||
    /\b(gemstone|jellyfish)\b/i.test(text);
  const mentionsUnderEaveSystem =
    /\b(gemstone|jellyfish|under[-\s]?eaves?|soffits?|eave\/rake|eave|rake|hardwired|permanent|roofline|trim)\b/i.test(
      text
    );

  return mentionsLighting && mentionsUnderEaveSystem;
}

function isPorchPatioLightingQuery(query) {
  return (
    /\b(lights?|lighting|fixtures?)\b/i.test(String(query || "")) &&
    /\b(porches?|patios?|decks?|outdoor living spaces?)\b/i.test(String(query || ""))
  );
}

function isElectricalPanelPlacementQuery(query) {
  const text = String(query || "");
  return (
    /\b(electrical|electric|xcel|service|load)\b/i.test(text) &&
    /\b(panel|panels|load center|meter)\b/i.test(text) &&
    /\b(place|placed|placement|location|located|inside|outside|gate|gates|builder|builders)\b/i.test(
      text
    )
  );
}

function isHomeAutomationAccessQuery(query) {
  const text = String(query || "");
  return (
    /\b(home\s*seer|homeseer|steward|home automation)\b/i.test(text) &&
    /\b(access|restore|login|log in|sign in|locked out|support|help|account)\b/i.test(text)
  );
}

function isChickenQuery(query) {
  const text = String(query || "");
  return /\bchicken(?:s|a)?\b/i.test(text) && !/\bchicken wire\b/i.test(text);
}

function isPoultryQuery(query) {
  return /\b(chicken(?:s|a)?|poultry|fowl|hen|hens|rooster|roosters)\b/i.test(
    String(query || "")
  );
}

function isPetOrLivestockQuery(query) {
  return /\b(pet|pets|dog|dogs|cat|cats|animal|animals|livestock|poultry|fowl|chicken(?:s|a)?|hen|hens|rooster|roosters|pig|pigs)\b/i.test(
    String(query || "")
  );
}

function isPetKeepingQuery(query) {
  const text = String(query || "");
  if (isPoultryQuery(text)) return true;
  if (!isPetOrLivestockQuery(text)) return false;
  if (/\b(dog run|leash|leashed|barking|waste|poop|damage|nuisance)\b/i.test(text)) return false;
  if (/^\s*(?:dogs?|cats?|pets?)\s*[?!.]*\s*$/i.test(text)) return true;
  return /\b(have|keep|keeping|own|allowed|permit|how many|number|limit|household pets?)\b/i.test(text);
}

function isGreenhouseQuery(query) {
  return /\bgreenhouses?\b/i.test(String(query || ""));
}

function isCarCoverQuery(query) {
  const text = String(query || "");
  return /\b(car|vehicle)\b/i.test(text) && /\b(cover|covers|covered|tarp|tarps)\b/i.test(text);
}

function isStreetParkingQuery(query) {
  return /\b(car|cars|vehicle|vehicles|parking|park|rv|rvs|recreational vehicle|motor home|camper|trailer)\b/i.test(
    String(query || "")
  ) && /\bstreet\b/i.test(String(query || ""));
}

function isRvParkingQuery(query) {
  return /\b(rv|rvs|recreational vehicle|motor home|motorhome|camper|trailer)\b/i.test(
    String(query || "")
  ) && /\b(park|parking|stay|driveway|garage|street|hours?|days?|nights?|overnights?|week|seven-day|seven days?)\b/i.test(
    String(query || "")
  );
}

function isDefensiveSprayQuery(query) {
  return /\b(?:bear|pepper|mace)\s+spray\b|\bspray\s+(?:for|against)\s+(?:bears?|self[-\s]?defense)\b/i.test(
    String(query || "")
  );
}

function isLotDemolitionQuery(query) {
  const text = String(query || "");
  return (
    /\b(lot|property|house|home)\b/i.test(text) &&
    /\b(demolish|demolition|tear down|teardown|combine|merge|bigger yard|larger yard)\b/i.test(text)
  );
}

function isUpdatedExteriorLightingPolicy(document = {}) {
  const combined = `${document.title || ""} ${document.sourceName || ""} ${document.text || ""}`;
  return (
    Boolean(document.isSupplemental || document.isSupplementSection) &&
    /\b(updated exterior lighting policy|resolution no\.?\s*2024-05-04|Gemstone and Jellyfish systems are the approved systems)\b/i.test(
      combined
    )
  );
}

function sourceFreshnessBoost(document, query) {
  if (!document.isSupplemental) return 0;

  const queryYears = extractQueryYears(query);
  const effectiveYear = documentEffectiveYear(document);
  const effectiveDateMs = dateValue(document.effectiveDate || document.approvedDate);
  let boost = 0;

  if (queryYears.length && effectiveYear) {
    if (queryYears.includes(effectiveYear)) boost += 140;
  } else if (effectiveDateMs && effectiveDateMs > Date.now()) {
    boost -= 140;
  } else if (effectiveYear) {
    boost += Math.max(0, Math.min(80, (effectiveYear - 2023) * 22));
  }

  if (document.supersededBy && !queryYears.includes(effectiveYear)) boost -= 130;
  return boost;
}

function replacementReferences(document = {}) {
  const references = [];
  if (Array.isArray(document.replacesSections)) references.push(...document.replacesSections);
  if (document.replacesSection) references.push(document.replacesSection);

  return [
    ...new Set(
      references
        .map((reference) => String(reference || "").trim())
        .filter(Boolean)
    ),
  ];
}

function supersededConflictPhrases(document = {}) {
  if (!Array.isArray(document.supersedesConflictingPhrases)) return [];
  return [
    ...new Set(
      document.supersedesConflictingPhrases
        .map((phrase) => String(phrase || "").trim())
        .filter(Boolean)
    ),
  ];
}

function sectionBaseFromReference(reference = "") {
  const match = String(reference).match(/\b(\d+)\s*[-.]\s*(\d+[a-z]?)\b/i);
  return match ? `${match[1]}-${match[2].toLowerCase()}` : "";
}

function subsectionPartsFromReference(reference = "") {
  return [...String(reference).matchAll(/\(([a-z0-9]+)\)/gi)].map((match) =>
    match[1].toLowerCase()
  );
}

function sectionBasePattern(base = "") {
  const [chapter, section] = String(base).split("-");
  if (!chapter || !section) return null;
  return new RegExp(
    `\\b(?:sec(?:tion)?\\.?\\s*)?${escapeRegExp(chapter)}\\s*[-.]\\s*${escapeRegExp(section)}\\b`,
    "i"
  );
}

function documentMentionsReplacement(document = {}, reference = "") {
  const base = sectionBaseFromReference(reference);
  const pattern = sectionBasePattern(base);
  if (!pattern) return false;

  const combined = `${document.title || ""} ${document.chapter || ""} ${document.article || ""} ${document.text || ""}`;
  if (!pattern.test(combined)) return false;

  const subsectionParts = subsectionPartsFromReference(reference);
  if (!subsectionParts.length) return true;

  const allPartsPresent = subsectionParts.every((part) =>
    new RegExp(`\\(\\s*${escapeRegExp(part)}\\s*\\)`, "i").test(combined)
  );
  return allPartsPresent;
}

function currentReplacementSupplements(documents = []) {
  const now = Date.now();
  return documents
    .filter((document) => {
      if (!document.isSupplemental || document.searchable === false || document.supersededBy) {
        return false;
      }
      if (sourceLifecycleStatus(document, now) !== "current") return false;
      if (!replacementReferences(document).length && !supersededConflictPhrases(document).length) {
        return false;
      }
      const effectiveDateMs = dateValue(document.effectiveDate || document.approvedDate);
      return !effectiveDateMs || effectiveDateMs <= now;
    })
    .map((document) => ({
      document,
      references: document.autoSupersedeSections === false ? [] : replacementReferences(document),
      conflictPhrases: supersededConflictPhrases(document),
    }));
}

function normalizePhraseText(value = "") {
  return String(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function documentMentionsSupersededPhrase(document = {}, phrases = []) {
  if (!phrases.length) return false;
  const combined = normalizePhraseText(
    `${document.title || ""} ${document.chapter || ""} ${document.article || ""} ${document.text || ""}`
  );
  return phrases.some((phrase) => combined.includes(normalizePhraseText(phrase)));
}

function documentIsSupersededByCurrentSupplement(document = {}, replacementSupplements = []) {
  if (document.isSupplemental || !replacementSupplements.length) return 0;

  return replacementSupplements.some((supplement) => {
    if (documentMentionsSupersededPhrase(document, supplement.conflictPhrases)) return true;
    return supplement.references.some((reference) =>
      documentMentionsReplacement(document, reference)
    );
  });
}

function sourceSupersessionPenalty(document = {}, replacementSupplements = []) {
  if (document.isSupplemental || !replacementSupplements.length) return 0;

  let penalty = 0;
  for (const supplement of replacementSupplements) {
    if (documentMentionsSupersededPhrase(document, supplement.conflictPhrases)) {
      penalty -= 560;
      continue;
    }

    const matchedReference = supplement.references.find((reference) =>
      documentMentionsReplacement(document, reference)
    );
    if (!matchedReference) continue;

    penalty -= subsectionPartsFromReference(matchedReference).length ? 360 : 280;
  }

  return Math.max(penalty, -560);
}

function sourceMentionsAny(source, pattern) {
  return pattern.test(`${source.title || ""} ${source.excerpt || ""} ${source.text || ""}`);
}

function isViolationProcessQuery(query) {
  return /\b(violation|violations|fine|fines|warning|notice|hearing|appeal|enforcement|cure|correct|nuisance)\b/i.test(
    query
  );
}

function isDelinquentAccountQuery(query) {
  return (
    /\b(late|delinquent|past due|unpaid|nonpayment|not pay|don't pay|do not pay|disconnect|disconnection|reconnect|reconnection|lien|payment plan|collection)\b/i.test(
      query
    ) && /\b(fee|fees|bill|water|utility|utilities|monthly|payment|account|pay|lien|disconnect|reconnect|collection)\b/i.test(query)
  );
}

function isDeadTreeReplacementQuery(query) {
  const text = String(query || "");
  return (
    /\b(dead|dying|diseased|removed?|remove|replacement|replace|replant|plant)\b/i.test(text) &&
    (/\b(tree|trees|tree lawn)\b/i.test(text) || /\b(dead|dying|diseased)\b.{0,25}\b(plant|plants|material|materials)\b/i.test(text))
  );
}

function isWateringRestrictionQuery(query) {
  const text = String(query || "");
  return /\b(hand water|watering can|drip|trickle|micro[-\s]?spray|deep[-\s]?root)\b/i.test(text) || (
    /\b(water|watering|irrigat\w*|sprinklers?)\b/i.test(text) &&
    /\b(lawn|yard|landscap|garden|outdoor|sprinklers?|restrictions?|schedule|allowed|day|days|noon|midday|morning|afternoon|evening)\b/i.test(text)
  );
}

function isFirePitQuery(query) {
  return /\b(fire pits?|chimeneas?|chimineas?)\b/i.test(query);
}

function isHotTubQuery(query) {
  return /\b(hot tubs?|outdoor spas?|backyard spas?|outdoor saunas?)\b/i.test(query);
}

function isFeeScheduleSupplement(document = {}) {
  const combined = `${document.title || ""} ${document.sourceName || ""} ${document.text || ""}`;
  return (
    Boolean(document.isSupplemental) &&
    /\b(2026|2025|2024)\b/i.test(combined) &&
    /\b(water, sanitary sewer, and stormwater|tap and facility fees|CAB service fees|service fees|facility fees)\b/i.test(
      combined
    )
  );
}

function isUsefulFeeTableChunk(document = {}) {
  const text = `${document.article || ""} ${document.text || ""}`;
  return (
    /\$\s*\d/.test(text) &&
    /\b(Table\s+13[-.]|Monthly Fee|Monthly Charge|Fee per 1,000 gallons|Tap Size|Water Service Base Rates|Water Usage Fee|Sanitary Sewer|Stormwater|Stormwater Tap|Facility Fees|Facilities Fees|Disclosure Fees|Streetlight|Trash)\b/i.test(
      text
    )
  );
}

function isCodeAmendmentSupplement(document = {}) {
  return (
    Boolean(document.isSupplemental) &&
    /\b(cab code amendments|amendments to cab code|trash containers, outdoor decorative objects, signs, and flags)\b/i.test(
      `${document.title || ""} ${document.sourceName || ""}`
    )
  );
}

function hasCurrentFeeScheduleSource(sources) {
  return sources.some((source) =>
    /^2026 (CAB service fees|water, sanitary sewer, and stormwater rates|tap and facility fees)/i.test(
      source.title || ""
    )
  );
}

function isOutdoorDecorativeObjectQuery(query) {
  return /\b(ornament|ornaments|yard art|(?:lawn )?decorations?|decorative object|decorative objects|garden statue|statue|statues)\b/i.test(
    query
  );
}

function isVegetableGardenQuery(query) {
  return /\b(?:vege?table gardens?|garden boxes?|raised (?:vegetable )?(?:gardens?|beds?))\b/i.test(
    query
  );
}

function isFlagQuery(query) {
  return /\b(flag|flags|flagpole|flagpoles|political sign|political signs|political candidate|signage)\b/i.test(
    query
  );
}

function applyIntentBoosts(document, query) {
  const title = document.title || "";
  const chapter = document.chapter || "";
  const combined = `${title} ${chapter} ${document.article || ""} ${document.text || ""}`;
  let score = 0;

  if (isUpdatedExteriorLightingPolicy(document) && !isLightingRelatedQuery(query)) {
    score -= 420;
  }

  if (isExteriorReviewQuery(query)) {
    if (/\b(design review|drc|approval request|exterior of the home|general community standards|design guidelines|landscape review)\b/i.test(combined)) {
      score += 35;
    }
    if (/the design review process/i.test(title)) score += 65;
    if (/any change to the exterior of the home or on the lot must be submitted to the drc/i.test(combined)) {
      score += 90;
    }
    if (/\bChapter 21\b/i.test(chapter)) score += 20;
    if (/\bChapter 5\b/i.test(chapter)) score += 10;
    if (/\bChapter 34\b/i.test(chapter) && !isUtilityQuery(query)) score -= 28;
    if (/\bChapter 13\b/i.test(chapter) && !isFeeQuery(query)) score -= 12;
  }

  if (isFeeQuery(query) && /\bChapter 13\b/i.test(chapter)) score += 25;
  if (isFeeQuery(query) && document.isSupplemental) {
    if (/\b(2026|current|updated)\b/i.test(combined)) score += 45;
    if (/\b(service fees|tap and facility fees|water.*rates|stormwater.*fees|sanitary sewer.*fees)\b/i.test(combined)) {
      score += 55;
    }
    if (isFeeScheduleSupplement(document) && isUsefulFeeTableChunk(document)) score += 300;
    if (isFeeScheduleSupplement(document) && !isUsefulFeeTableChunk(document)) score -= 520;
  } else if (isFeeScheduleSupplement(document)) {
    score -= 260;
    if (/\b(pool rules?|clubhouse rules?|facility rules?|rent|rental)\b/i.test(query)) {
      score -= 220;
    }
  }
  if (/\b(parks?|open spaces?|trails?|recreation|clubhouse|facilities)\b/i.test(query)) {
    if (/\bChapter 17\b/i.test(chapter)) score += 28;
  }
  if (isUtilityQuery(query)) {
    if (/\bChapter (13|34)\b/i.test(chapter)) score += 18;
    if (document.isSupplemental && /\b(2026|water|sanitary sewer|stormwater|tap|facility fees)\b/i.test(combined)) {
      score += 45;
    }
  }

  if (isViolationProcessQuery(query) && document.isSupplemental) {
    if (/\bdue process and imposition of fines\b/i.test(combined)) score += 145;
    if (/\bnotice of violation|hearing|continuous violations|repetitious violations|nuisance violations\b/i.test(combined)) {
      score += 75;
    }
  } else if (document.isSupplemental && /\bdue process and imposition of fines\b/i.test(combined)) {
    score -= 160;
  }

  if (isDelinquentAccountQuery(query) && document.isSupplemental) {
    if (/\bcollection process for delinquent\b/i.test(combined)) score += 160;
    if (/\bdisconnect notice|lien notice|payment plan|reconnect fees|late fee\b/i.test(combined)) {
      score += 80;
    }
    if (/\b(courtesy notice|three\s*\(3\)\s*calendar days|seven\s*\(7\)\s*calendar days|15th calendar day|10th day of the month|last Wednesday of the month)\b/i.test(combined)) {
      score += 180;
    }
  } else if (document.isSupplemental && /\bcollection process for delinquent\b/i.test(combined)) {
    score -= 140;
  }

  if ((isOutdoorDecorativeObjectQuery(query) || isFlagQuery(query)) && document.isSupplemental) {
    if (/\b(cab code amendments|amendments to cab code)\b/i.test(combined)) score += 80;
    if (/\boutdoor decorative objects|yard or lawn ornamentation|flags and flag holders|political signage\b/i.test(combined)) {
      score += 90;
    }
  }

  if (isVegetableGardenQuery(query)) {
    if (/\(42\)\s*Gardens;\s*vegetable\b|\bGardens;\s*vegetable\b|\bVegetable gardens and raised beds\b/i.test(combined)) {
      score += document.isInlineTopic ? 520 : 360;
    }
    if (isCodeAmendmentSupplement(document)) {
      score -= 240;
    }
  }

  if (
    /\b(trash|garbage|recycling).*\b(cans?|containers?|receptacles?|stor(?:e|ed|age|ing))\b|\b(cans?|containers?|receptacles?|stor(?:e|ed|age|ing)).*\b(trash|garbage|recycling)\b/i.test(
      query
    ) &&
    isCodeAmendmentSupplement(document)
  ) {
    if (/\bTrash Containers|properly stored in an enclosed structure|behind the wing fence\b/i.test(combined)) {
      score += 240;
    }
  }

  if (
    /\bfenc(e|es|ing)\b/i.test(query) &&
    document.isSupplemental &&
    /\b(cab code amendments|amendments to cab code)\b/i.test(combined) &&
    !/\b(trash|garbage|container|ornament|flag|political|sign)\b/i.test(query)
  ) {
    score -= 220;
  }

  if (/\bsheds?\b/i.test(query)) {
    if (/\b(backyard utility shed|accessory building|shed footprint)\b/i.test(combined)) {
      score += 50;
    }
    if (/\b(shed dormers?|shed roofs?|flying shed|roof forms?)\b/i.test(combined)) {
      score -= 90;
    }
  }

  if (isHotTubQuery(query)) {
    if (document.isInlineTopic && /\bHot tubs?, outdoor spas?, outdoor saunas?\b/i.test(title)) {
      score += 420;
    }
    if (/\bminimum of five feet from all property lines\b/i.test(combined)) score += 180;
  }

  if (isLandscapeScreenQuery(query)) {
    if (/\(54\)\s*Landscape screens\b|\bLandscape screens\.\s*DRC approval is required\b/i.test(combined)) {
      score += 300;
    }
    if (/\bscreening hedges to protect privacy\b/i.test(combined)) {
      score -= 180;
    }
  }

  if (/\bsolar\b/i.test(query)) {
    if (/\bDRC approval is required for any solar installation or system\b/i.test(combined)) {
      score += 260;
    }
    if (/\bsolar energy devices and systems\b/i.test(combined)) {
      score += document.isInlineTopic ? 260 : 80;
    }
    if (
      /\b(approval|approve|allowed|install|installation|need|panels?)\b/i.test(query) &&
      /\b(solar pre-wire|conduit|builders? will be responsible|builders? shall)\b/i.test(combined)
    ) {
      score -= 35;
    }
  }

  if (/\btrampolines?\b/i.test(query)) {
    if (/\b(?:All\s+)?trampolines?[^.]{0,60}require DRC approval\b/i.test(combined)) {
      score += 260;
    }
    if (document.isInlineTopic && /\bTrampolines?\b/i.test(title)) {
      score += 220;
    }
  }

  if (
    /\bfenc(?:e|es|ing)\b/i.test(query) &&
    /\bSec\.?\s*21-23\b|\bFencing standards\b/i.test(title)
  ) {
    score += 280;
  }

  if (isWateringRestrictionQuery(query)) {
    if (/\bSec\.?\s*13-105\b|\bWater conservation measures\b/i.test(title)) {
      score += 540;
    } else if (/\boutdoor water use\b|\bwatering restrictions?\b/i.test(combined)) {
      score += 120;
    }
    if (/\bChapter 34\b/i.test(chapter)) score -= 180;
  }

  if (isFirePitQuery(query)) {
    if (document.isInlineTopic && /\bFire pits\b/i.test(title)) score += 300;
    if (/\bwood-burning fire pits?|chimeneas?\b/i.test(combined)) score += 180;
    if (isCodeAmendmentSupplement(document)) score -= 220;
  }

  if (/\bpools?\b/i.test(query)) {
    const poolInstallQuery = /\b(aboveground|build|install|installation|in-ground|inground|rear yard|backyard|yard)\b/i.test(
      query
    );
    if (poolInstallQuery && /\bAll in-ground pools require DRC approval\b/i.test(combined)) {
      score += 240;
    }
    if (poolInstallQuery && /\bPool-specific rules and regulations\b/i.test(title)) {
      score -= 80;
    }
  }

  if (isUnderEaveLightingQuery(query)) {
    if (isUpdatedExteriorLightingPolicy(document)) score += 260;
    if (/Gemstone and Jellyfish systems are the approved systems/i.test(combined)) score += 180;
    if (/Under-eave lighting may be installed/i.test(combined)) score += 120;
    if (/Exterior eave\/rake lighting systems such as Gemstone, Jellyfish, or other similar companies\/products are not permitted/i.test(combined)) {
      score -= 180;
    }
  }

  if (isSeasonalLightingQuery(query)) {
    if (/Updated Exterior Lighting Policy|Approved May 17, 2024/i.test(combined)) {
      score += 130;
    }
    if (/Install and energize seasonal decorative lighting/i.test(combined)) {
      score += 90;
    }
    if (/Install and energize holiday lighting from October 15/i.test(combined)) {
      score -= 45;
    }
  }

  return score;
}

function scoreDocument(
  document,
  query,
  originalTerms,
  expandedTerms,
  phrases,
  documentStats,
  searchStats,
  replacementSupplements = []
) {
  const title = `${document.title || ""} ${document.chapter || ""} ${document.article || ""}`;
  const pathText = Array.isArray(document.path) ? document.path.join(" ") : "";
  const text = document.text || "";
  let score = 0;

  score += bm25Score(documentStats, searchStats, originalTerms) * 18;
  score += bm25Score(documentStats, searchStats, expandedTerms) * 5;
  score += countTermMatches(title, originalTerms) * 15;
  score += countTermMatches(pathText, originalTerms) * 9;
  score += countTermMatches(text, originalTerms, 8) * 6;
  score += countTermMatches(title, expandedTerms) * 5;
  score += countTermMatches(pathText, expandedTerms) * 2;
  score += countTermMatches(text, expandedTerms, 6);
  score += semanticSimilarityScore(document, query);

  for (const phrase of phrases) {
    if (title.toLowerCase().includes(phrase.toLowerCase())) score += 35;
    if (text.toLowerCase().includes(phrase.toLowerCase())) score += 26;
  }

  const normalizedQuery = cleanText(query).toLowerCase();
  if (normalizedQuery.length > 8 && text.toLowerCase().includes(normalizedQuery)) score += 40;

  const chapter = findChapterQuestion(query);
  if (chapter && new RegExp(`\\bchapter\\s+${escapeRegExp(chapter)}\\b`, "i").test(document.chapter)) {
    score += 45;
  }

  const sectionNumber = sectionNumberQuestion(query);
  if (sectionNumber && String(document.title).toLowerCase().includes(sectionNumber)) {
    score += 70;
  }

  score += applyIntentBoosts(document, query);
  score += sourceSupersessionPenalty(document, replacementSupplements);

  const specificTerms = originalTerms.filter((term) => !GENERIC_INTENT_TERMS.has(term));
  const hasSpecificTermMatch = specificTerms.some((term) =>
    textMatchesImportantTerm(`${title} ${pathText} ${text}`, term)
  );
  if (score > 0 && hasSpecificTermMatch) {
    score += Number(document.sourcePriority) || 0;
    score += sourceFreshnessBoost(document, query);
  }

  if (
    /\bfenc(e|es|ing)\b/i.test(query) &&
    document.isSupplemental &&
    /\b(cab code amendments|amendments to cab code)\b/i.test(`${title} ${pathText} ${text}`) &&
    !/\b(trash|garbage|container|ornament|flag|political|sign)\b/i.test(query)
  ) {
    score -= 360;
  }

  if (/\b(reserved|repealed)\b/i.test(document.title || "")) score -= 10;
  return score;
}

function searchRulesIndex(index, query, limit = 5) {
  const originalTerms = tokenize(query);
  const expandedTerms = expandQueryTerms(query).filter((term) => !originalTerms.includes(term));
  const excerptTerms = [...new Set([...originalTerms, ...expandedTerms])];
  const phrases = extractQueryPhrases(query);
  if (!excerptTerms.length || !index?.documents?.length) return [];
  let cachedStats = searchIndexStatsCache.get(index);
  if (!cachedStats || cachedStats.documentCount !== index.documents.length) {
    cachedStats = {
      documentCount: index.documents.length,
      searchStats: buildSearchStats(index.documents),
      replacementSupplements: currentReplacementSupplements(index.documents),
    };
    searchIndexStatsCache.set(index, cachedStats);
  }
  const { searchStats, replacementSupplements } = cachedStats;

  const scoredDocuments = index.documents
    .filter((document) => documentEligibleForQuery(document, query))
    .map((document) => ({
      ...document,
      matchStats: getMatchStats(document, originalTerms, expandedTerms, phrases),
      score: scoreDocument(
        document,
        query,
        originalTerms,
        expandedTerms,
        phrases,
        searchStats.byId.get(document.id),
        searchStats,
        replacementSupplements
      ),
      excerpt: makeExcerpt(document.text, excerptTerms),
    }))
    .filter(
      (document) =>
        document.score > 0 &&
        !documentIsSupersededByCurrentSupplement(document, replacementSupplements)
    );

  const bySection = new Map();
  for (const document of scoredDocuments) {
    const existing = bySection.get(document.nodeId);
    if (!existing) {
      bySection.set(document.nodeId, {
        ...document,
        bestChunkScore: document.score,
        matchStats: cloneMatchStats(document.matchStats),
        supportScore: 0,
      });
      continue;
    }

    existing.matchStats = mergeMatchStats(existing.matchStats, document.matchStats);
    existing.supportScore = Math.min(
      40,
      existing.supportScore + Math.min(document.score, 20) * 0.25
    );
    if (document.score > existing.bestChunkScore) {
      existing.bestChunkScore = document.score;
      existing.excerpt = document.excerpt;
      existing.text = document.text;
    }
    existing.score = existing.bestChunkScore + existing.supportScore;
  }

  return [...bySection.values()]
    .sort((a, b) => b.score - a.score || b.bestChunkScore - a.bestChunkScore)
    .slice(0, limit);
}

function makeExcerpt(text, terms, maxChars = MAX_EXCERPT_CHARS) {
  const sentences = cleanText(text)
    .replace(/\n/g, " ")
    .split(/(?<=[.!?])\s+|;\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (!sentences.length) return "";

  const scored = sentences.map((sentence, index) => ({
    sentence,
    index,
    score: countTermMatches(sentence, terms),
  }));
  scored.sort((a, b) => b.score - a.score || a.index - b.index);

  const best = scored[0]?.score > 0 ? scored[0].sentence : sentences[0];
  return shortenText(best, maxChars);
}

function shortenText(text, maxChars) {
  const clean = cleanText(text).replace(/\n/g, " ");
  if (clean.length <= maxChars) return clean;
  const cut = clean.slice(0, maxChars - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 180 ? lastSpace : cut.length).trim()}...`;
}

function uniqueSources(results) {
  const seen = new Set();
  const sources = [];

  for (const result of results) {
    if (seen.has(result.nodeId)) continue;
    seen.add(result.nodeId);
    sources.push({
      title: result.title,
      chapter: result.chapter,
      article: result.article,
      nodeId: result.nodeId,
      parentNodeId: result.parentNodeId,
      isInlineTopic: Boolean(result.isInlineTopic),
      inlineTopicNumber: result.inlineTopicNumber,
      inlineTopicTitle: result.inlineTopicTitle,
      sourceUrl: result.sourceUrl,
      sourceName: result.sourceName,
      approvedDate: result.approvedDate,
      effectiveDate: result.effectiveDate,
      effectiveYear: result.effectiveYear,
      supersededBy: result.supersededBy,
      replacesSections: result.replacesSections,
      expirationDate: result.expirationDate || result.expiresAt,
      isSupplemental: Boolean(result.isSupplemental),
      isSupplementSection: Boolean(result.isSupplementSection),
      extractionStatus: result.extractionStatus,
      ownerReview: result.ownerReview,
      ownerReviewApplied: Boolean(result.ownerReviewApplied),
      summaryText: result.summaryText,
      excerpt: result.excerpt,
      text: result.text,
      matchStats: cloneMatchStats(result.matchStats),
      score: result.score,
    });
  }

  return sources;
}

function sourceFromDocument(document, query, score = 100) {
  const terms = expandQueryTerms(query);
  return {
    title: document.title,
    chapter: document.chapter,
    article: document.article,
    nodeId: document.nodeId,
    parentNodeId: document.parentNodeId,
    isInlineTopic: Boolean(document.isInlineTopic),
    inlineTopicNumber: document.inlineTopicNumber,
    inlineTopicTitle: document.inlineTopicTitle,
    sourceUrl: document.sourceUrl,
    sourceName: document.sourceName,
    approvedDate: document.approvedDate,
    effectiveDate: document.effectiveDate,
    effectiveYear: document.effectiveYear,
    supersededBy: document.supersededBy,
    supersedes: document.supersedes,
    replacesSections: document.replacesSections,
    expirationDate: document.expirationDate || document.expiresAt,
    sourceLifecycle: sourceLifecycleStatus(document),
    isSupplemental: Boolean(document.isSupplemental),
    isSupplementSection: Boolean(document.isSupplementSection),
    extractionStatus: document.extractionStatus,
    ownerReview: document.ownerReview,
    ownerReviewApplied: Boolean(document.ownerReviewApplied),
    summaryText: document.summaryText,
    excerpt: makeExcerpt(document.text, terms),
    text: document.text,
    matchStats: getMatchStats(document, tokenize(query), [], extractQueryPhrases(query)),
    score,
  };
}

function ownerReviewWithholdsQuestion(source, query) {
  const patterns = source?.ownerReview?.withheldQuestionPatterns;
  const question = String(query || ""); const sourceYear = `${source?.title || ""} ${source?.text || ""}`.match(/\b(20\d{2})\b/)?.[1];
  return (Array.isArray(patterns) && patterns.some((pattern) => new RegExp(pattern, "i").test(question))) || Boolean(source?.ownerReviewApplied && sourceYear && [...question.matchAll(/\b(20\d{2})\b/g)].some((match) => match[1] !== sourceYear));
}

function sourceSelectionScore(document, query) {
  const originalTerms = tokenize(query);
  const expandedTerms = expandQueryTerms(query);
  const title = `${document.title || ""} ${document.chapter || ""} ${document.article || ""}`;
  const text = document.text || "";
  const combined = `${title} ${text}`;
  let score = Number(document.sourcePriority) || 0;

  score += sourceFreshnessBoost(document, query);
  score += countTermMatches(title, originalTerms, 10) * 18;
  score += countTermMatches(text, originalTerms, 10) * 10;
  score += countTermMatches(text, expandedTerms, 8) * 3;
  score += semanticSimilarityScore(document, query) * 0.5;

  if (document.isSupplementSection) score += 45;
  if (document.extractionStatus === "official-pdf") score += 25;

  if (isFeeQuery(query) || isUtilityQuery(query)) {
    if (isFeeScheduleSupplement(document) && isUsefulFeeTableChunk(document)) score += 700;
    if (isFeeScheduleSupplement(document) && !isUsefulFeeTableChunk(document)) score -= 700;

    if (/\bwater|sewer|stormwater|rates?\b/i.test(query)) {
      if (/\bWater, Sanitary Sewer, and Stormwater Fees\b|Monthly Fee|Fee per 1,000 gallons|\$50\.20|\$9\.70|\$44\.95/i.test(combined)) {
        score += 260;
      }
    }

    if (/\btap|facility|facilities\b/i.test(query)) {
      if (/\bTap Size|Facilities Fees|\$6,080\.00|\$12,395\.00/i.test(combined)) {
        score += 260;
      }
    }

    if (/\btrash|streetlight|service fees?\b/i.test(query)) {
      if (/\bStreetlight Monthly Charge|Trash Monthly Charge|\$9\.90|\$14\.17/i.test(combined)) {
        score += 220;
      }
    }
  }

  return score;
}

function sourcesByTitle(index, query, titleMatchers, limit = 5) {
  const seen = new Set();
  const sources = [];

  for (const matcher of titleMatchers) {
    const candidates = (index.documents || []).filter(
      (item) => !seen.has(item.nodeId) && matcher.test(item.title || "")
    );
    candidates.sort((a, b) => sourceSelectionScore(b, query) - sourceSelectionScore(a, query));
    const document = candidates[0];
    if (!document) continue;
    seen.add(document.nodeId);
    sources.push(sourceFromDocument(document, query, 150 - sources.length));
    if (sources.length >= limit) break;
  }

  return sources;
}

function combinedSourceByTitle(index, query, titleMatcher) {
  const candidates = (index.documents || [])
    .filter((document) => documentEligibleForQuery(document, query))
    .filter((document) => titleMatcher.test(document.title || ""))
    .sort((a, b) => sourceSelectionScore(b, query) - sourceSelectionScore(a, query));
  if (!candidates.length) return null;

  const primary = candidates[0];
  const related = candidates.filter(
    (document) =>
      document.nodeId === primary.nodeId ||
      (document.title || "") === (primary.title || "")
  );
  const source = sourceFromDocument(primary, query, 180);
  source.text = cleanText(
    related
      .map((document) => document.text || "")
      .filter(Boolean)
      .join("\n")
  );
  source.combinedTitleSource = true;
  source.excerpt = makeExcerpt(source.text, expandQueryTerms(query), 520);
  return source;
}

function vegetableGardenSources(index, query) {
  const documents = (index.documents || [])
    .filter((document) => documentEligibleForQuery(document, query))
    .filter((document) => /^Sec\. 21-22\. - General community standards/i.test(document.title || ""))
    .filter((document) => /Gardens;\s*vegetable|Vegetable gardens and raised beds|Be located a minimum of five feet from all property lines/i.test(document.text || ""));
  const primary = documents.find((document) => /Gardens;\s*vegetable[\s\S]{0,300}?DRC approval is required/i.test(document.text || ""));
  if (!primary) return [];
  const source = sourceFromDocument(primary, query, 180);
  source.text = cleanText(documents.map((document) => document.text || "").join("\n"));
  source.excerpt = makeExcerpt(source.text, expandQueryTerms(query), 520);
  return [source];
}

function sourcesByTitleAndText(index, query, titleMatcher, textMatchers, limit = 5) {
  const sources = [];
  const seen = new Set();
  for (const textMatcher of textMatchers) {
    const candidates = (index.documents || [])
      .filter((document) => documentEligibleForQuery(document, query))
      .filter((document) => titleMatcher.test(document.title || ""))
      .filter((document) => textMatcher.test(document.text || ""))
      .sort((a, b) => sourceSelectionScore(b, query) - sourceSelectionScore(a, query));
    const document = candidates.find((candidate) => !seen.has(candidate.nodeId));
    if (!document) continue;
    seen.add(document.nodeId);
    sources.push(sourceFromDocument(document, query, 180 - sources.length));
    if (sources.length >= limit) break;
  }
  return sources;
}

function residentFeeOverviewSources(index, query) {
  return sourcesByTitle(
    index,
    query,
    [
      /^2026 water, sanitary sewer, and stormwater rates/i,
      /^2026 CAB service fees/i,
      /^Amended collection process for delinquent/i,
      /^2026 tap and facility fees/i,
      /^Sec\. 13-23\. - Design review services/i,
    ],
    5
  );
}

function specialSourcesForQuestion(index, query) {
  const requestedSection = sectionNumberQuestion(query);
  if (requestedSection) {
    return sourcesByTitle(
      index,
      query,
      [new RegExp(`^Sec\\.\\s*${escapeRegExp(requestedSection)}\\b`, "i")],
      5
    );
  }

  if (/\bchicken wire\b/i.test(query) && /\bdogs?\b/i.test(query)) {
    return sourcesByTitleAndText(index, query, /^Sec\. 21-22\. - General community standards/i, [/Dog runs are fenced, open-top areas/i], 1);
  }

  if (isStateParksPassQuestion(query)) {
    return [combinedSourceByTitle(index, query, /^Sec\. 17-273\. - Colorado Parks and Wildlife Parks Pass Program/i)].filter(Boolean);
  }

  if (isMovableOutdoorBelongingsQuestion(query)) {
    return sourcesByTitle(index, query, [/^Sec\. 1-38\. - Household items/i], 1);
  }

  if (/\b(?:leash|leashes|leashed)\b/i.test(query)) {
    return sourcesByTitle(
      index,
      query,
      [/^Sec\. 17-54\. - General rules/i, /^Sec\. 1-33\. - Pets and livestock/i],
      2
    );
  }

  if (/\bprivacy fence\b/i.test(query)) {
    return sourcesByTitleAndText(index, query, /^Sec\. 5-385\. - Ascent Village four-pack/i, [/Nothing may be attached to a fence to increase the height or screening capability/i], 1);
  }

  if (/\bpolitical sign/i.test(query) || /\bsign for (?:a )?political candidate/i.test(query)) {
    return sourcesByTitleAndText(index, query, /^Sec\. 1-34\. - Signs; flags/i, [/political signs promoting or opposing a candidate/i], 1);
  }

  if (/\brain(?:water)?(?:\s+harvesting)?\s*barrels?\b/i.test(query)) {
    return [combinedSourceByTitle(index, query, /^Sec\. 21-22\. - General community standards/i)].filter(Boolean);
  }

  if (/\b(?:artificial|synthetic) turf\b/i.test(query) || (/\bturf\b/i.test(query) && /\bfront (?:yard|lawn)\b/i.test(query))) {
    return [combinedSourceByTitle(index, query, /^Sec\. 5-151\. - Required lot landscape/i)].filter(Boolean);
  }

  if (/\b(?:air conditioner|ac unit|hvac|mini split)\b/i.test(query)) {
    return [
      combinedSourceByTitle(index, query, /^Sec\. 21-22\. - General community standards/i),
      combinedSourceByTitle(index, query, /^Sec\. 1-39\. - Wiring; air conditioning/i),
    ].filter(Boolean);
  }

  if (/\b(?:gazebo|pergola)s?\b/i.test(query)) {
    return sourcesByTitleAndText(index, query, /^Sec\. 21-22\. - General community standards/i, [/Pergolas, gazebos/i], 1);
  }

  if (/\b(?:pickle ?ball|sport court)\b/i.test(query)) {
    if (isPrivateSportCourtQuery(query)) {
      return sourcesByTitleAndText(index, query, /^Sec\. 21-22\. - General community standards/i, [/Sport courts[\s\S]{0,500}?pickleball/i], 1);
    }
    return [
      combinedSourceByTitle(index, query, /^Sec\. 17-54\. - General rules/i),
      combinedSourceByTitle(index, query, /^Sec\. 17-110\. - Hours of operation/i),
      ...sourcesByTitleAndText(index, query, /^Sec\. 21-22\. - General community standards/i, [/Sport courts[\s\S]{0,500}?pickleball/i], 1),
    ].filter(Boolean);
  }

  if (/\bfireworks?\b/i.test(query)) {
    return sourcesByTitle(index, query, [/^Sec\. 1-36\. - Flammable, incendiary or explosive/i], 1);
  }

  if (isPlantListQuestion(query)) {
    return [combinedSourceByTitle(index, query, /^Sec\. 5-131\. - Preapproved plant list/i)].filter(Boolean);
  }

  if (isVegetableGardenQuery(query)) {
    return vegetableGardenSources(index, query);
  }

  if (isWaterServiceFeeQuery(query)) {
    return [combinedSourceByTitle(index, query, /^2026 water, sanitary sewer, and stormwater rates/i)].filter(Boolean);
  }

  if (isLandscapeCompletionDeadlineQuery(query)) {
    return [combinedSourceByTitle(index, query, /^Sec\. 9-145\. - Completion\/installation dates/i)].filter(Boolean);
  }

  if (isDeadTreeReplacementQuery(query)) {
    return sourcesByTitle(
      index,
      query,
      [/^Sec\. 9-146\. - Landscape maintenance standards/i, /^Sec\. 21-22.*\(b\)\(104\).*Tree lawn/i],
      2
    );
  }

  if (/\btree lawn\b/i.test(query)) {
    return sourcesByTitle(index, query, [/^Sec\. 9-1\. - Tree lawn maintenance/i, /^Sec\. 9-252\. - Tree lawn palette/i], 3);
  }

  if (/\b(?:community own|who owns?).{0,40}\b(?:landscaping|tree lawn|sidewalk)\b|\blandscaping\b.{0,30}\bsidewalk\b/i.test(query)) {
    return sourcesByTitle(index, query, [/^Sec\. 9-1\. - Tree lawn maintenance/i, /^Sec\. 9-12\. - Definitions/i], 2);
  }

  if (isFenceFinishQuery(query)) {
    return [combinedSourceByTitle(index, query, /^Sec\. 21-23\. - Fencing standards/i)].filter(Boolean);
  }

  if (/\b(?:hang|attach|mount).{0,30}\bfence\b|\bfence\b.{0,30}\b(?:hang|attach|mount)\b/i.test(query)) {
    return sourcesByTitle(index, query, [/^Sec\. 1-38\. - Household items/i], 1);
  }

  if (/\b(?:utility trailer|trailer for work)\b/i.test(query)) {
    return sourcesByTitle(index, query, [/^Sec\. 1-37\. - Vehicles; parking/i], 2);
  }

  if (/\b(?:privacy film|tint film|window tint|tinted windows?)\b/i.test(query)) {
    return sourcesByTitleAndText(index, query, /^Sec\. 21-22\. - General community standards/i, [/Window coverings and tinting/i], 1);
  }

  if (isMailboxModificationQuery(query)) {
    return sourcesByTitle(index, query, [/^Sec\. 21-22\..*\(b\)\(57\).*Mailboxes/i], 1);
  }

  if (isExteriorPaintQuestion(query)) {
    return sourcesByTitleAndText(index, query, /^Sec\. 21-22\. - General community standards/i, [/Painting, exterior/i], 1);
  }

  if (/\blong[-\s]?term rental\b|\b(?:lease|rent).{0,20}\b(?:30 days|month|months|long term)\b/i.test(query)) {
    return sourcesByTitleAndText(index, query, /^Sec\. 21-22\. - General community standards/i, [/Leasing\/rental of properties/i], 1);
  }

  if (/\b(?:approved landscapers?|list of approved landscapers?|do my own landscaping)\b/i.test(query)) {
    return sourcesByTitle(
      index,
      query,
      [/^Sec\. 9-188\. - Registration required/i, /^Sec\. 9-190\. - Registration process/i, /^Sec\. 9-72\. - Landscape and irrigation plan submittals/i],
      3
    );
  }

  if (/\b(?:continually add|redo backyard|redo (?:my )?backyard|modify|changing?).{0,30}\blandscap/i.test(query) || /\bredo (?:my )?backyard\b/i.test(query)) {
    return sourcesByTitle(index, query, [/^Sec\. 9-72\. - Landscape and irrigation plan submittals/i, /^Sec\. 5-151\. - Required lot landscape/i], 2);
  }

  if (/\b(?:extend|add|build|redo).{0,30}\b(?:concrete|patio)\b|\b(?:concrete|patio)\b.{0,30}\b(?:extend|add|build|redo)\b/i.test(query)) {
    return sourcesByTitle(
      index,
      query,
      [/^Sec\. 21-21\. - The design review process/i, /^Sec\. 21-22.*\(b\)\(65\).*Patios/i],
      2
    );
  }

  if (/\b(?:rear landscaping|rear yard landscaping|plants required in the rear)\b/i.test(query) || /^\s*side yard\s*[?.!]*$/i.test(query)) {
    return [combinedSourceByTitle(index, query, /^Sec\. 5-151\. - Required lot landscape/i)].filter(Boolean);
  }

  if (/\b(?:quantum fiber|fiber internet|internet provider)\b/i.test(query)) {
    return sourcesByTitle(index, query, [/^Sec\. 25-25\. - Internet and networking/i, /^Sec\. 5-260\. - Internet and networking/i], 2);
  }

  if (/\binternet access for water usage\b|\b(?:view|access|see).{0,30}\bwater usage\b/i.test(query)) {
    return sourcesByTitle(index, query, [/^Sec\. 34-102\. - Water meter design criteria/i, /^Sec\. 25-23\. - Home automation/i], 2);
  }

  if (/\b(?:changing|replace).{0,25}\bfront yard tree\b|\bfront yard tree\b.{0,25}\b(?:changing|replace)\b/i.test(query)) {
    return [
      ...sourcesByTitleAndText(index, query, /^Sec\. 21-22\. - General community standards/i, [/Property owners are required to replace dead or dying materials/i], 1),
      ...sourcesByTitle(index, query, [/^Sec\. 5-131\. - Preapproved plant list/i], 2),
    ];
  }

  if (/\bcatio\b/i.test(query)) {
    return [combinedSourceByTitle(index, query, /^Sec\. 21-22\. - General community standards/i)].filter(Boolean);
  }

  if (/\b(?:no plant zone|planting easements?|easements?)\b/i.test(query)) {
    return sourcesByTitle(
      index,
      query,
      [/^Sec\. 1-2\. - Definitions and rules of construction/i, /^Sec\. 9-72\. - Landscape and irrigation plan submittals/i, /^Sec\. 21-22.*Landscape screens/i],
      3
    );
  }

  if (isLandscapeOverviewQuery(query)) {
    return [
      combinedSourceByTitle(index, query, /^Sec\. 5-151\. - Required lot landscape/i),
      combinedSourceByTitle(
        index,
        query,
        /^Sec\. 9-72\. - Landscape and irrigation plan submittals/i
      ),
      combinedSourceByTitle(
        index,
        query,
        /^Sec\. 21-22.*\(b\)\(53\).*Landscape maintenance standards/i
      ),
    ].filter(Boolean);
  }

  if (isParksOpenSpaceOverviewQuery(query)) {
    return [combinedSourceByTitle(index, query, /^Sec\. 17-54\. - General rules/i)].filter(
      Boolean
    );
  }

  if (isShortTermRentalQuery(query)) {
    return [
      combinedSourceByTitle(index, query, /^Sec\. 1-32\. - General use restrictions/i),
      ...sourcesByTitleAndText(
        index,
        query,
        /^Sec\. 21-22\. - General community standards/i,
        [/short-term, vacation property/i, /VRBO/i],
        1
      ),
    ].filter(Boolean);
  }

  if (isFenceHeightQuery(query)) {
    return [
      combinedSourceByTitle(index, query, /^Sec\. 5-384\. - Ascent Village single family/i),
      combinedSourceByTitle(index, query, /^Sec\. 21-23\. - Fencing standards/i),
    ].filter(Boolean);
  }

  if (isTrashStorageQuery(query)) {
    return sourcesByTitleAndText(
      index,
      query,
      /^(?:2024 CAB Code amendments|Sec\. 1-35\.)/i,
      [/trash/i, /properly stored|pickup/i],
      2
    );
  }

  if (isRvParkingQuery(query)) {
    return [combinedSourceByTitle(index, query, /^Sec\. 1-37\. - Vehicles; parking/i)].filter(Boolean);
  }

  if (
    isAmenityReservationQuery(query) &&
    !semanticConceptMatchesQuery("rental-cancellations", query)
  ) {
    const reservationProcess = combinedSourceByTitle(index, query, /^Sec\. 17-188\. - Reservation process/i);
    const rentalFees = combinedSourceByTitle(index, query, /^Sec\. 13-2\. - Community facility use and rental fees/i);
    const rentalLimits = combinedSourceByTitle(index, query, /^Sec\. 17-189\. - Limitations/i);
    const facilityRules = combinedSourceByTitle(index, query, /^Sec\. 17-197\. - Specific facility rental rules/i);
    const namesSpecificFacility = /\b(overlook|clubhouse|great hall|pavilion|park|shelter|pool|exhibit hall)\b/i.test(query);
    return (namesSpecificFacility
      ? [facilityRules, reservationProcess, rentalFees, rentalLimits]
      : [reservationProcess, rentalFees, rentalLimits, facilityRules]
    ).filter(Boolean);
  }

  if (isShedQuery(query)) {
    return sourcesByTitle(
      index,
      query,
      [/^Sec\. 21-22.*\(b\)\(9\).*Backyard utility sheds/i],
      1
    );
  }

  if (isPorchPatioLightingQuery(query)) {
    return sourcesByTitle(
      index,
      query,
      [/^Sec\. 21-22\(b\)\(56\).*Updated exterior lighting policy/i],
      1
    );
  }

  if (
    isUnderEaveLightingQuery(query) ||
    isSeasonalLightingQuery(query) ||
    isPorchPatioLightingQuery(query)
  ) {
    const textMatchers = isPorchPatioLightingQuery(query)
      ? [/outdoor living space/i, /3,000 Kelvin/i]
      : isSeasonalLightingQuery(query)
        ? [/Install and energize seasonal decorative lighting/i, /10:00 p\.m\./i]
        : [/Gemstone and Jellyfish systems are the approved systems/i, /10:00 p\.m\./i];
    const policySources = sourcesByTitleAndText(
      index,
      query,
      /^Sec\. 21-22\(b\)\(56\).*Updated exterior lighting policy/i,
      textMatchers,
      2
    );
    if (policySources.length || !isPorchPatioLightingQuery(query)) return policySources;
    return sourcesByTitle(index, query, [/^Sec\. 21-22\(b\)\(56\).*Updated exterior lighting policy/i], 1);
  }

  if (isDelinquentAccountQuery(query)) {
    return sourcesByTitleAndText(
      index,
      query,
      /^Amended collection process for delinquent/i,
      [/courtesy past[ -]?due notification/i, /last Wednesday of the month/i],
      2
    );
  }

  if (isFlagQuery(query) || isOutdoorDecorativeObjectQuery(query)) {
    const amendments = sourcesByTitleAndText(
      index,
      query,
      /2024 CAB Code amendments/i,
      [isOutdoorDecorativeObjectQuery(query) ? /ornamentation in the front yard/i : /political signage|No flag shall exceed/i],
      1
    );
    if (!isFlagQuery(query)) return amendments;
    if (/\bflag\s*poles?\b/i.test(query)) {
      const selected = [
        ...amendments,
        ...sourcesByTitle(index, query, [/^Sec\. 21-22.*\(b\)\(37\).*Flags/i], 1),
        ...sourcesByTitle(index, query, [/^Sec\. 21-22.*\(b\)\(38\).*Flag holders, flagpoles/i], 1),
      ].filter(Boolean);
      return selected;
    }
    return [
      ...amendments,
      ...sourcesByTitle(index, query, [/^Sec\. 21-22.*\(b\)\(37\).*Flags/i], 1),
    ];
  }

  if (isPorchPatioLightingQuery(query)) {
    return sourcesByTitle(
      index,
      query,
      [/^Sec\. 21-22\(b\)\(56\).*Updated exterior lighting policy/i],
      1
    );
  }

  if (isPetKeepingQuery(query)) {
    return sourcesByTitle(index, query, [/^Sec\. 1-33\. - Pets and livestock/i], 1);
  }

  if (isGreenhouseQuery(query)) {
    return sourcesByTitle(
      index,
      query,
      [
        /^Sec\. 21-22.*\(b\)\(46\).*Greenhouses/i,
        /^Sec\. 21-22.*\(b\)\(1\).*Accessory buildings/i,
      ],
      2
    );
  }

  if (isHomeAutomationAccessQuery(query)) {
    return sourcesByTitle(index, query, [/^Sec\. 25-23\. - Home automation/i], 1);
  }

  if (isCarCoverQuery(query)) {
    return sourcesByTitle(
      index,
      query,
      [
        /^Sec\. 21-22.*\(b\)\(18\).*Car covers/i,
        /^Sec\. 1-37\. - Vehicles; parking/i,
      ],
      2
    );
  }

  if (isDefensiveSprayQuery(query)) {
    return sourcesByTitle(
      index,
      query,
      [
        /^Sec\. 1-36\. - Flammable, incendiary or explosive substances or devices/i,
        /^Sec\. 17-54\. - General rules/i,
        /^Sec\. 17-156\. - Weapons/i,
      ],
      3
    );
  }

  if (isStreetParkingQuery(query)) {
    return sourcesByTitle(index, query, [/^Sec\. 1-37\. - Vehicles; parking/i], 1);
  }

  if (isElectricalPanelPlacementQuery(query)) {
    return sourcesByTitle(
      index,
      query,
      [/^Sec\. 21-22.*\(b\)\(105\).*Utility equipment/i],
      1
    );
  }

  if (isLotDemolitionQuery(query)) {
    return sourcesByTitle(
      index,
      query,
      [
        /^Sec\. 21-22.*\(b\)\(2\).*Additions or expansions of home/i,
        /^Sec\. 21-21\. - The design review process/i,
      ],
      2
    );
  }

  return [];
}

function preferInlineTopicSources(sources = []) {
  const topicParents = new Set(
    sources
      .filter((source) => source.isInlineTopic && source.parentNodeId)
      .map((source) => source.parentNodeId)
  );
  const usedTopicParents = new Set();

  return sources.filter((source) => {
    if (!source.isInlineTopic) return !topicParents.has(source.nodeId);

    const parent = source.parentNodeId || source.nodeId;
    if (usedTopicParents.has(parent)) return false;
    usedTopicParents.add(parent);
    return true;
  });
}

function meaningfulSources(results, limit = 5) {
  const sources = preferInlineTopicSources(uniqueSources(results));
  const topScore = sources[0]?.score || 0;
  const cutoff = Math.max(5, topScore * 0.35);
  const filtered = sources.filter((source) => source.score >= cutoff);
  return (filtered.length ? filtered : sources).slice(0, limit);
}

function sourceCoverageForImportantTerms(source, importantTerms) {
  if (!importantTerms.length) return 1;
  const sourceStats = source.matchStats || {};
  const matched = importantTerms.filter((term) =>
    (sourceStats.matchedOriginalTerms || []).some(
      (value) => value === term || value === `${term}s`
    )
  );
  return matched.length / importantTerms.length;
}

function focusedSourcesForQuestion(query, sources, limit = 5) {
  const importantTerms = importantQueryTerms(query);
  if (importantTerms.length < 2) return sources.slice(0, limit);

  const filtered = sources.filter((source) => {
    const coverage = sourceCoverageForImportantTerms(source, importantTerms);
    return coverage >= 0.66 || (source.matchStats?.phraseMatches || []).length > 0;
  });
  const prioritized = [sources[0], ...filtered].filter(
    (source, index, list) =>
      source && list.findIndex((item) => item.nodeId === source.nodeId) === index
  );

  return (prioritized.length ? prioritized : sources).slice(0, limit);
}

function chapterSources(index, query, limit = 5) {
  const chapter = findChapterQuestion(query);
  if (!chapter) return [];

  const terms = expandQueryTerms(query);
  const seen = new Set();
  const sources = [];
  const chapterDocuments = (index.documents || []).filter((document) =>
    new RegExp(`\\bchapter\\s+${escapeRegExp(chapter)}\\b`, "i").test(
      document.chapter || ""
    )
  );

  const priorityMatchers =
    chapter === "5"
      ? [
          /^Sec\. 5-19\./i,
          /^Sec\. 5-177\./i,
          /^Sec\. 5-180\./i,
          /^Sec\. 5-186\./i,
          /^Sec\. 5-95\./i,
          /^Sec\. 5-151\./i,
        ]
      : [];

  function addSource(document) {
    if (!document || seen.has(document.nodeId) || /\b(reserved|repealed)\b/i.test(document.title || "")) {
      return;
    }

    seen.add(document.nodeId);
    sources.push({
      title: document.title,
      chapter: document.chapter,
      article: document.article,
      nodeId: document.nodeId,
      sourceUrl: document.sourceUrl,
      excerpt: makeExcerpt(document.text, terms),
      text: document.text,
      matchStats: getMatchStats(document, tokenize(query), [], extractQueryPhrases(query)),
      score: 100,
    });
  }

  for (const matcher of priorityMatchers) {
    addSource(chapterDocuments.find((document) => matcher.test(document.title || "")));
    if (sources.length >= limit) break;
  }

  for (const document of chapterDocuments) {
    addSource(document);

    if (sources.length >= limit) break;
  }

  return sources;
}

function cleanSectionTitle(title = "") {
  return String(title).replace(/\.+$/, "").trim();
}

function sentenceContaining(text = "", pattern) {
  return (
    cleanText(text)
      .replace(/\n/g, " ")
      .split(/(?<=[.!?])\s+|;\s+/)
      .map((sentence) => sentence.trim())
      .find((sentence) => pattern.test(sentence)) || ""
  );
}

function subsectionSnippet(text = "", startPattern, endPattern) {
  const clean = cleanText(text).replace(/\n/g, " ");
  const start = clean.search(startPattern);
  if (start < 0) return "";
  const afterStart = clean.slice(start);
  const end = endPattern ? afterStart.slice(1).search(endPattern) : -1;
  return end >= 0 ? afterStart.slice(0, end + 1).trim() : afterStart.trim();
}

function fullTextForSource(index, source) {
  // A combined title source contains every chunk from one official section.
  // Keep that full section instead of narrowing it back to one node here.
  if (source.combinedTitleSource && source.text) return source.text;
  const nodeId = source.nodeId;
  if (!nodeId || !index?.documents?.length) return source.text || "";

  const chunks = index.documents
    .filter((document) => document.nodeId === nodeId)
    .map((document) => document.text)
    .filter(Boolean);

  return chunks.length ? chunks.join(" ") : source.text || "";
}

function specificExcerptForQuestionSource(query, source, fullText = source.text || "") {
  const title = source.title || "";
  const text = fullText || source.text || "";

  if (isMailboxModificationQuery(query) && /mailboxes|21-22/i.test(title)) {
    return shortenText(
      subsectionSnippet(text, /\(57\)\s*Mailboxes/i, /\(58\)\s*Motorcycles/i) ||
        sentenceContaining(text, /All mail is delivered to neighborhood box units/i),
      700
    );
  }

  if (isExteriorPaintQuestion(query) && /painting, exterior|21-22/i.test(title)) {
    return shortenText(
      subsectionSnippet(text, /\(64\)\s*Painting, exterior/i, /\(65\)\s*Patio covers/i) ||
        sentenceContaining(text, /DRC approval is required, even if repainting is being done with the same colors/i),
      2200
    );
  }

  if (isMovableOutdoorBelongingsQuestion(query) && /1-38|household items/i.test(title)) {
    return shortenText(
      subsectionSnippet(text, /\(b\)\s*All roadways and walkways shall be clear/i, /\(c\)\s*The CAB assumes no liability/i) ||
        sentenceContaining(text, /No furniture, electrical cords, bicycles, barbecues, toys/i),
      700
    );
  }

  if (/\b(?:pickle ?ball|sport court)\b/i.test(query) && /sport courts/i.test(title)) {
    return shortenText(
      subsectionSnippet(text, /\(90\)\s*Sport courts/i, /\(91\)\s*Storm and security doors/i) ||
        sentenceContaining(text, /This includes basketball, volleyball, tennis, shuffleboard, pickleball/i),
      2200
    );
  }

  if (/\brain(?:water)?(?:\s+harvesting)?\s*barrels?\b/i.test(query) && /rain barrels|21-22/i.test(title)) {
    return shortenText(
      subsectionSnippet(text, /\(75\)\s*Rain barrels/i, /\(76\)\s*Recreational equipment/i) ||
        sentenceContaining(text, /Residents are allowed two 55-gallon rain barrels/i),
      1800
    );
  }

  if (/\bfireworks?\b/i.test(query) && /1-36|flammable, incendiary or explosive/i.test(title)) {
    return shortenText(
      subsectionSnippet(text, /\(e\)\s*No fireworks or firearms/i, /\(f\)\s+/) ||
        sentenceContaining(text, /No fireworks or firearms may be fired or discharged within the Development/i),
      1600
    );
  }

  if (/\bchicken wire\b/i.test(query) && /\bdogs?\b/i.test(query) && /doghouses and outdoor pet areas|21-22/i.test(title)) {
    return shortenText(
      subsectionSnippet(text, /Dog runs must be constructed of fencing material/i, /Dog houses may not be placed/i) ||
        sentenceContaining(text, /Dog runs must be constructed of fencing material/i),
      1200
    );
  }

  if (/\b(?:air conditioner|ac unit|hvac|mini split)\b/i.test(query) && /house cooling equipment|21-22/i.test(title)) {
    return shortenText(
      subsectionSnippet(text, /\(4\)\s*House cooling equipment/i, /\(5\)\s*Antennas/i) ||
        sentenceContaining(text, /DRC approval is not required before house cooling equipment can be installed/i),
      1200
    );
  }

  if (
    (/\b(?:artificial|synthetic) turf\b/i.test(query) || /\bturf\b.{0,35}\bfront (?:yard|lawn)\b/i.test(query)) &&
    /5-151|required lot landscape/i.test(title)
  ) {
    return shortenText(
      subsectionSnippet(text, /\(a\)\s*Artificial turf will be evaluated/i, /\(b\)\s*The front yard shall/i) ||
        sentenceContaining(text, /Artificial turf will be evaluated on an individual basis for front yards/i),
      520
    );
  }

  if (/\blong[-\s]?term rental\b|\b(?:lease|rent).{0,20}\b(?:30 days|month|months|long term)\b/i.test(query) && /leasing\/rental of properties|21-22/i.test(title)) {
    return shortenText(
      subsectionSnippet(text, /\(55\)\s*Leasing\/rental of properties/i, /\(56\)\s*Lighting/i) ||
        sentenceContaining(text, /less than 30 consecutive days is prohibited/i),
      1100
    );
  }

  if (/\b(?:rear landscaping|rear yard landscaping|plants required in the rear)\b/i.test(query) && /5-151|required lot landscape/i.test(title)) {
    return shortenText(
      subsectionSnippet(text, /\(j\)\s*Backyard landscaping/i, /\(m\)\s*An automatic/i) ||
        sentenceContaining(text, /Backyard landscaping also must include two trees/i),
      1100
    );
  }

  if (isPlantListQuestion(query) && /5-131|preapproved plant list/i.test(title)) {
    const introduction = sentenceContaining(text, /following preapproved plant list organizes acceptable/i);
    const lowerWater = sentenceContaining(text, /use of species with a lower water need is encouraged/i);
    const additionalSpecies = sentenceContaining(text, /additional species will be considered by the Sterling Ranch Design Review Committee/i);
    return shortenText([introduction, lowerWater, additionalSpecies].filter(Boolean).join(" "), 1100);
  }

  if (isOutdoorDecorativeObjectQuery(query) && /2024 CAB Code amendments/i.test(title)) {
    const rear = subsectionSnippet(text, /Outdoor Decorative Objects\s+1\.\s*Rear Yard/i, /2\.\s*Front Yard/i);
    const front = subsectionSnippet(text, /2\.\s*Front Yard/i, /Section 1-34\(b\)/i);
    return shortenText([rear, front].filter(Boolean).join(" "), 3200);
  }

  if (isFlagQuery(query) && /2024 CAB Code amendments/i.test(title)) {
    return shortenText(
      subsectionSnippet(text, /Flags\s+Notwithstanding anything to the contrary/i, /Section 1-34\(b\)\(2\)/i) ||
        sentenceContaining(text, /flags bearing commercial messages are prohibited/i),
      1200
    );
  }

  if (isFlagQuery(query) && /flag holders, flagpoles|21-22/i.test(title)) {
    return shortenText(
      subsectionSnippet(text, /\(38\)\s*Flag holders, flagpoles/i, /\(39\)\s*Garage sales/i) ||
        sentenceContaining(text, /separate nighttime illumination of a flag/i),
      720
    );
  }

  if (isPorchPatioLightingQuery(query) && isUpdatedExteriorLightingPolicy(source)) {
    return shortenText(
      sentenceContaining(text, /outdoor living space.*patio, porch, or deck/i) ||
        sentenceContaining(text, /front porch shall light only the front porch/i) ||
        sentenceContaining(text, /rear deck or rear patio/i),
      520
    );
  }

  if (isChickenQuery(query) && /1-33|pets and livestock/i.test(title)) {
    return shortenText(
      subsectionSnippet(text, /\(6\)\s*No animals, livestock, fowl, or poultry/i, /\(7\)\s+/) ||
        sentenceContaining(text, /No animals, livestock, fowl, or poultry/i),
      520
    );
  }

  if (isPetKeepingQuery(query) && /1-33|pets and livestock/i.test(title)) {
    const leash = subsectionSnippet(text, /\(3\)\s*Pets shall not be allowed outside/i, /\(4\)\s+/);
    const limits = subsectionSnippet(text, /\(6\)\s*No animals, livestock, fowl, or poultry/i, /\(7\)\s+/);
    const waste = subsectionSnippet(text, /\(8\)\s*All pet waste/i, /\(9\)\s+/);
    return shortenText([leash, limits, waste].filter(Boolean).join(" "), 1100);
  }

  if (isHomeAutomationAccessQuery(query) && /25-23|home automation/i.test(title)) {
    return shortenText(
      sentenceContaining(text, /Homeowners can access customer support/i) ||
        sentenceContaining(text, /help@lumierefiber\.com/i),
      420
    );
  }

  if (isCarCoverQuery(query) && /21-22|general community standards/i.test(title)) {
    return shortenText(
      subsectionSnippet(text, /\(18\)\s*Car covers/i, /\(19\)\s*Carports/i) ||
        sentenceContaining(text, /Car covers\. DRC approval is required/i),
      520
    );
  }

  if (isStreetParkingQuery(query) && /1-37|vehicles; parking/i.test(title)) {
    return shortenText(
      sentenceContaining(text, /may not be parked on the street/i) ||
        sentenceContaining(text, /No vehicle may be parked/i),
      520
    );
  }

  if (isElectricalPanelPlacementQuery(query) && /21-22|general community standards/i.test(title)) {
    return shortenText(
      subsectionSnippet(text, /\(105\)\s*Utility equipment/i, /\(106\)\s*Unsightly conditions/i) ||
        sentenceContaining(text, /Exterior pipes, conduits, wires, poles, meters, venting, and other equipment/i),
      520
    );
  }

  if (isLotDemolitionQuery(query) && /21-22|general community standards/i.test(title)) {
    return shortenText(
      subsectionSnippet(text, /\(2\)\s*Additions or expansions of home/i, /\(3\)\s*Address numbers/i) ||
        sentenceContaining(text, /any contemplated improvement not listed here/i),
      520
    );
  }

  if (/\bsheds?\b/i.test(query) && /21-22|general community standards/i.test(title)) {
    return shortenText(
      subsectionSnippet(text, /\(9\)\s*Backyard utility sheds/i, /\(\d+\)\s+/) ||
        sentenceContaining(text, /Backyard utility sheds/i) ||
        sentenceContaining(text, /150 square feet/i),
      420
    );
  }

  if (/\bsheds?\b/i.test(query) && /21-21|design review process/i.test(title)) {
    return sentenceContaining(text, /Any change to the exterior of the home or on the lot must be submitted to the DRC/i) || "";
  }

  if (isLandscapeScreenQuery(query) && /21-22|general community standards/i.test(title)) {
    return shortenText(
      subsectionSnippet(text, /\(54\)\s*Landscape screens/i, /\(55\)\s*Leasing\/rental of properties/i) ||
        sentenceContaining(text, /Landscape screens\. DRC approval is required/i),
      700
    );
  }

  if (/\btrampolines?\b/i.test(query) && /21-22|general community standards/i.test(title)) {
    return shortenText(
      subsectionSnippet(text, /\(99\)\s*Trampolines/i, /\(\d+\)\s+/) ||
        sentenceContaining(text, /All trampolines require DRC approval/i),
      420
    );
  }

  if (/\bpools?\b/i.test(query) && /21-22|general community standards/i.test(title)) {
    return shortenText(
      subsectionSnippet(text, /\(95\)\s*Swimming pools/i, /\(\d+\)\s+/) ||
        sentenceContaining(text, /All in-ground pools require DRC approval/i) ||
        sentenceContaining(text, /Aboveground pools are prohibited/i),
      420
    );
  }

  if (isDeadTreeReplacementQuery(query) && /9-146|landscape maintenance standards/i.test(title)) {
    return shortenText(
      sentenceContaining(text, /dead trees must be replaced/i) ||
        sentenceContaining(text, /dead plants are removed/i),
      420
    );
  }

  if (isDeadTreeReplacementQuery(query) && /21-22|general community standards/i.test(title)) {
    return shortenText(
      subsectionSnippet(text, /\(104\)\s*Tree lawn/i, /\(\d+\)\s+/) ||
        sentenceContaining(text, /Property owners are required to replace dead or dying materials/i),
      520
    );
  }

  if (isUnderEaveLightingQuery(query) && isUpdatedExteriorLightingPolicy(source)) {
    return shortenText(
      subsectionSnippet(text, /Under-eave lighting/i, /Decorative lighting/i) ||
        sentenceContaining(text, /Gemstone and Jellyfish systems are the approved systems/i) ||
        sentenceContaining(text, /Under-eave lighting may be installed/i),
      520
    );
  }

  if ((isResidentFeeOverviewQuery(query) || isFeeQuery(query)) && /^2026 water, sanitary sewer, and stormwater/i.test(title)) {
    return shortenText(
      subsectionSnippet(text, /Table 13-174 Water Service Base Rates/i, /Table 13-179/i) ||
        sentenceContaining(text, /\$50\.20/i),
      420
    );
  }

  if ((isResidentFeeOverviewQuery(query) || isFeeQuery(query)) && /^2026 CAB service fees/i.test(title)) {
    return shortenText(
      subsectionSnippet(text, /Table 13\.179 Streetlight/i, /Table 13-48/i) ||
        sentenceContaining(text, /\$9\.90/i),
      420
    );
  }

  if ((isResidentFeeOverviewQuery(query) || isFeeQuery(query)) && /^Amended collection process for delinquent/i.test(title)) {
    return sentenceContaining(text, /Fees are delinquent when unpaid by their due date/i) || "";
  }

  if ((isResidentFeeOverviewQuery(query) || isFeeQuery(query)) && /^2026 tap and facility fees/i.test(title)) {
    return sentenceContaining(text, /adopts tap and facility fees effective January 1, 2026/i) || "";
  }

  return "";
}

function jumpTextForQuestionSource(query, source, excerpt = "") {
  const title = source.title || "";

  if (/\bsheds?\b/i.test(query) && /21-22|general community standards/i.test(title)) {
    return "Backyard utility sheds. DRC approval is required.";
  }

  if (/\bsheds?\b/i.test(query) && /21-21|design review process/i.test(title)) {
    return "Any change to the exterior of the home or on the lot must be submitted to the DRC";
  }

  if (isLandscapeScreenQuery(query) && /21-22|general community standards/i.test(title)) {
    return "Landscape screens. DRC approval is required.";
  }

  return excerpt;
}

function decorateSourcesForQuestion(query, sources, index) {
  return sources.map((source) => {
    const fullText = fullTextForSource(index, source);
    const specificExcerpt = specificExcerptForQuestionSource(query, source, fullText);
    const excerpt = specificExcerpt || source.excerpt || "";
    const useQuestionSpecificClause = Boolean(specificExcerpt) && (
      isMovableOutdoorBelongingsQuestion(query) ||
      isPlantListQuestion(query) ||
      isOutdoorDecorativeObjectQuery(query) ||
      isExteriorPaintQuestion(query) ||
      /\bturf\b.{0,35}\bfront (?:yard|lawn)\b/i.test(query) ||
      /\b(?:pickle ?ball|sport court|rain(?:water)?(?:\s+harvesting)?\s*barrels?|air conditioner|ac unit|hvac|mini split|artificial turf|synthetic turf|long[-\s]?term rental|fireworks?)\b/i.test(query) ||
      (/\bchicken wire\b/i.test(query) && /\bdogs?\b/i.test(query)) ||
      /\b(?:rear landscaping|rear yard landscaping|plants required in the rear)\b/i.test(query)
    );
    return {
      ...source,
      excerpt,
      questionSpecificExcerpt: useQuestionSpecificClause,
      jumpText: jumpTextForQuestionSource(query, source, excerpt),
      sourceLifecycle: sourceLifecycleStatus(source),
    };
  });
}

function relatedQueryTerms(term) {
  const singular = term.endsWith("s") && term.length > 3 ? term.slice(0, -1) : term;
  return new Set([
    term,
    singular,
    ...(SYNONYMS[term] || []),
    ...(SYNONYMS[singular] || []),
    ...(IMPORTANT_TERM_ALIASES[term] || []),
    ...(IMPORTANT_TERM_ALIASES[singular] || []),
  ]);
}

function queryTermsDescribeSameThing(left, right) {
  const leftTerms = relatedQueryTerms(left);
  const rightTerms = relatedQueryTerms(right);
  return [...leftTerms].some((term) => rightTerms.has(term));
}

const COMPOUND_CONTEXT_TERMS = new Set([
  "approval",
  "approvals",
  "backyard",
  "behind",
  "front",
  "home",
  "house",
  "lot",
  "property",
  "rear",
  "requirement",
  "requirements",
  "setback",
  "setbacks",
  "side",
  "yard",
]);

function compoundQuestionSources(query, results = [], specialSources = [], limit = 5) {
  if (!/\b(and|or|also|plus|both|as well as)\b/i.test(String(query || ""))) return [];
  if (isLandscapeOverviewQuery(query) || isParksOpenSpaceOverviewQuery(query)) return [];
  if (
    SEMANTIC_CONCEPTS.some(
      (concept) =>
        concept.groupsCompoundTerms && semanticConceptMatchesQuery(concept.name, query)
    )
  ) {
    return [];
  }
  const rawTerms = importantQueryTerms(query);
  const specialStats = combinedMatchStats(specialSources);
  if (
    specialSources.length &&
    rawTerms.every((term) =>
      specialStats.matchedOriginalTerms.some(
        (matched) => matched === term || matched === `${term}s`
      )
    )
  ) {
    return [];
  }
  const terms = [];
  for (const term of rawTerms) {
    if (COMPOUND_CONTEXT_TERMS.has(term)) continue;
    if (!terms.some((existing) => queryTermsDescribeSameThing(existing, term))) {
      terms.push(term);
    }
  }
  if (terms.length < 2) return [];

  const selected = [];
  for (const term of terms) {
    const candidates = results
      .filter((source) =>
        (source.matchStats?.matchedOriginalTerms || []).some(
          (matched) => matched === term || matched === `${term}s`
        )
      )
      .sort((left, right) => {
        const leftTitleMatch = textMatchesImportantTerm(left.title || "", term) ? 1 : 0;
        const rightTitleMatch = textMatchesImportantTerm(right.title || "", term) ? 1 : 0;
        return rightTitleMatch - leftTitleMatch || (right.score || 0) - (left.score || 0);
      });
    // Treat terms as separate topics only when each has a clearly named rule
    // section. Body-text matches alone often represent details of one project
    // (for example, "approval and setbacks" for a single backyard spa).
    const source = candidates.find(
      (candidate) =>
        textMatchesImportantTerm(candidate.title || "", term) &&
        !selected.some((item) => item.nodeId === candidate.nodeId)
    );
    if (source) selected.push(source);
    if (selected.length >= limit) break;
  }

  return selected.length >= 2 ? selected : [];
}

function currentSourceConflicts(sources = []) {
  const bySection = new Map();
  for (const source of sources) {
    if (!source.isSupplemental || sourceLifecycleStatus(source) !== "current") continue;
    const sourceDocument = source.sourceUrl || source.parentNodeId || source.nodeId || source.title;
    for (const section of source.replacesSections || []) {
      const normalizedSection = String(section).toLowerCase().replace(/\s+/g, "");
      if (!normalizedSection) continue;
      if (!bySection.has(normalizedSection)) bySection.set(normalizedSection, new Map());
      bySection.get(normalizedSection).set(sourceDocument, source.title || sourceDocument);
    }
  }

  return [...bySection.entries()]
    .filter(([, documents]) => documents.size > 1)
    .map(([section, documents]) => ({ section, sources: [...documents.values()] }));
}

function officialResourceSource(resource) {
  return {
    title: resource.title,
    chapter: "Official CAB forms and resources",
    article: "Design Review",
    nodeId: `OFFICIAL_RESOURCE_${resource.id.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`,
    sourceUrl: resource.url,
    sourceName: "Sterling Ranch CAB Design Review Documents",
    excerpt: resource.excerpt,
    text: resource.excerpt,
    isOfficialResource: true,
    actionType: resource.actionType || "information",
    matchStats: {
      titleMatches: 0,
      bodyMatches: 0,
      matchedOriginalTerms: [],
      matchedExpandedTerms: [],
      phraseMatches: [],
    },
    score: 0,
  };
}

function designReviewResourceSourcesForQuestion(query, answerSources = [], answerText = "") {
  if (
    isAmenityReservationQuery(query) ||
    semanticConceptMatchesQuery("rental-cancellations", query)
  ) {
    return [];
  }
  const questionText = cleanText(query);
  const combined = cleanText(
    [
      questionText,
      answerText,
      ...answerSources.map((source) =>
        [source.title, source.excerpt, source.jumpText].filter(Boolean).join(" ")
      ),
    ].join("\n")
  );
  const resources = [];
  const add = (id) => {
    const resource = OFFICIAL_DESIGN_REVIEW_RESOURCES.find((item) => item.id === id);
    if (resource && !resources.some((item) => item.id === resource.id)) {
      resources.push(resource);
    }
  };
  const questionNeedsDesignReviewResource =
    isExteriorReviewQuery(questionText) ||
    /\b(?:submit|send|complete)\b.{0,100}\b(?:DRC|design review|application|plan|packet)\b/i.test(answerText) ||
    /\b(DRC|design review|approval|architectural improvement|application|submit|solar|storm doors?|patio lights?|light fixture|roll[- ]?off|dumpster|portable storage|pods?)\b/i.test(
      questionText
    );
  const mentionsDesignReview =
    questionNeedsDesignReviewResource ||
    /\b(DRC approval|required to have DRC|submitted to the DRC|design review|architectural improvement)\b/i.test(
      combined
    );

  if (!questionNeedsDesignReviewResource || !mentionsDesignReview || isSeasonalLightingQuery(query)) {
    return [];
  }

  if (/\bsheds?\b/i.test(questionText)) add("backyard-utility-sheds");
  if (/\bsolar\b/i.test(questionText)) add("solar-panels");
  if (/\bfenc(?:e|es|ing)\b/i.test(questionText)) add("standard-3-rail-fencing");
  if (/\bstorm doors?\b/i.test(questionText)) add("storm-doors");
  if (/\b(rear patio lights?|patio lights?)\b/i.test(questionText)) add("rear-patio-lights");
  if (isLandscapeScreenQuery(questionText) || /\b(landscape screens?|screening)\b/i.test(questionText)) {
    add("landscape-screens");
  }
  if (/\b(landscap\w*|turf|irrigation|garden|planting)\b/i.test(questionText)) add("landscape-submittal");
  if (
    /\b(exterior lights?|light replacement|light fixture|lighting fixture|landscape lighting)\b/i.test(
      questionText
    )
  ) {
    add("exterior-light-replacement");
  }
  if (/\b(roll[- ]?off|dumpster|portable storage|pods?)\b/i.test(questionText)) {
    add("roll-off-containers");
  }

  if (!resources.length) add("general-architectural-improvement");
  add("submit-drc-application");
  add("design-review-documents");

  return resources.slice(0, 3).map(officialResourceSource);
}

function sourcesWithOfficialResources(query, answerSources, answerText = "") {
  if (isStateParksPassQuestion(query)) return answerSources;
  const sources = [
    ...answerSources,
    ...amenityRentalResourceSourcesForQuestion(query),
    ...designReviewResourceSourcesForQuestion(query, answerSources, answerText),
  ];
  const seen = new Set();
  return sources.filter((source) => {
    const key =
      source.isSupplementSection || source.isSupplemental
        ? source.nodeId || `${source.sourceUrl || source.title}:${source.article || ""}`
        : source.sourceUrl || source.nodeId || source.title;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isUsefulDetailedExcerpt(excerpt = "") {
  const clean = cleanText(excerpt).replace(/\n/g, " ");
  if (clean.length < 90) return false;
  if (/^\(?[a-z]\)?\s*Generally\.?$/i.test(clean)) return false;
  if (/^Resolution No\.?$/i.test(clean)) return false;

  return /\b(DRC approval|required|must|shall|maximum|minimum|not exceed|fees?|charges?|\$\d|\d+\s*(square feet|feet|inches|days|hours|p\.m\.|per month|monthly))\b/i.test(
    clean
  );
}

function sourceBullets(sources, limit = 3) {
  return sources
    .slice(0, limit)
    .filter((source) => source?.title)
    .map((source) => {
      const title = cleanSectionTitle(source.title);
      let excerpt = source.excerpt || "";
      if (source.isSourceDerivedExcerpt && excerpt) {
        return `- ${title}: ${shortenText(excerpt, 260)}`;
      }
      if ((!excerpt || /^\(?[a-z]\)?\s*Generally\.?$/i.test(excerpt)) && source.text) {
        excerpt = makeExcerpt(source.text, [
          "approval",
          "drc",
          "exterior",
          "change",
          "shed",
          "utility",
          "fee",
          "design",
        ]);
      }
      if (isUsefulDetailedExcerpt(excerpt)) {
        return `- ${title}: ${shortenText(excerpt, 280)}`;
      }
      if (/21-22/.test(title) && /150 square feet/i.test(source.text || "")) {
        excerpt = sentenceContaining(source.text, /150 square feet/i) || excerpt;
      }
      if (/21-22/.test(title) && /All in-ground pools require DRC approval/i.test(source.text || "")) {
        excerpt = sentenceContaining(source.text, /All in-ground pools require DRC approval/i) || excerpt;
      }
      if (/21-22/.test(title) && /All trampolines require DRC approval/i.test(source.text || "")) {
        excerpt = sentenceContaining(source.text, /All trampolines require DRC approval/i) || excerpt;
      }
      if (/21-22/.test(title) && /Install and energize seasonal decorative lighting/i.test(source.text || "")) {
        excerpt = sentenceContaining(source.text, /Install and energize seasonal decorative lighting/i) || excerpt;
      }
      if (/21-22/.test(title) && /Install and energize holiday lighting/i.test(source.text || "")) {
        excerpt = sentenceContaining(source.text, /Install and energize holiday lighting/i) || excerpt;
      }
      if (/1-34/.test(title) && /political signs/i.test(source.text || "")) {
        excerpt = sentenceContaining(source.text, /political signs/i) || excerpt;
      }
      if (/1-37/.test(title) && /72 consecutive hours/i.test(source.text || "")) {
        excerpt = sentenceContaining(source.text, /72 consecutive hours/i) || excerpt;
      }
      return excerpt ? `- ${title}: ${shortenText(excerpt, 230)}` : `- ${title}`;
    });
}

function amenityRentalResourceSourcesForQuestion(query) {
  if (
    !isAmenityReservationQuery(query) &&
    !semanticConceptMatchesQuery("rental-cancellations", query)
  ) {
    return [];
  }
  return OFFICIAL_AMENITY_RENTAL_RESOURCES.map((resource) => ({
    ...officialResourceSource(resource),
    article: "Amenity Rentals",
    sourceName: "Sterling Ranch CAB Amenity Rentals",
  }));
}

function helpfulAnswer(shortAnswer, sources, nextStep = "") {
  const lines = [`Short answer: ${shortAnswer}`];
  const bullets = sourceBullets(sources);

  if (bullets.length) {
    lines.push("", "What I found:", ...bullets);
  }

  if (nextStep) {
    lines.push("", `Before you act: ${capitalizeFirstLetter(nextStep)}`);
  }

  return lines.join("\n");
}

function buildChapterSummary(index, query, sources = []) {
  const chapter = findChapterQuestion(query);
  if (!chapter) return "";

  const chapterDocs = uniqueSources(
    (index.documents || [])
      .filter((document) =>
        new RegExp(`\\bchapter\\s+${escapeRegExp(chapter)}\\b`, "i").test(
          document.chapter || ""
        )
      )
      .filter((document) => !/\b(reserved|repealed)\b/i.test(document.title || ""))
      .slice(0, 14)
  );

  if (!chapterDocs.length) return "";

  const titleBits = chapterDocs
    .slice(0, 7)
    .map((document) => document.title.replace(/^Sec\.\s*[\w-]+\.?\s*-\s*/i, ""))
    .map((title) => title.replace(/\.$/, ""))
    .filter(Boolean);

  const chapterHeading = String(chapterDocs[0]?.chapter || "")
    .replace(/^Chapter\s+[^-]+-\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (chapterHeading) {
    return helpfulAnswer(
      `Chapter ${chapter.toUpperCase()} is the ${chapterHeading.replace(/\s+/g, "-")} chapter. It includes ${readableList(titleBits)}.`,
      sources,
      "Use the linked sections to confirm the exact details in the official rulebook."
    );
  }

  return helpfulAnswer(
    `Chapter ${chapter.toUpperCase()} appears to cover ${readableList(titleBits)}.`,
    sources,
    "Use the linked sections to confirm the exact details in the official rulebook."
  );
}

function needsOfficialConfirmation(query) {
  return /\b(am i allowed|can i|may i|permit|approval|approve|fee|fees|fine|violation|enforcement|architectural|design|build|shed|fence|deck|landscap|utility|water|sanitation)\b/i.test(
    query
  );
}

function isContactInfoQuery(query) {
  return /\b(phone|number|email|contact|address|call|reach)\b/i.test(query);
}

function isFoodTruckDrivewayQuery(query) {
  return /\bfood\s+truck\b/i.test(query) && /\b(driveway|home|house|lot|property)\b/i.test(query);
}

function sourceHasRequestedContactInfo(source, query) {
  const text = `${source.title || ""} ${source.excerpt || ""} ${source.text || ""}`;
  const wantsEmail = /\b(email|e-mail)\b/i.test(query);
  const wantsPhone = /\b(phone|number|call)\b/i.test(query);
  const wantsAddress = /\b(address|mail|reach|contact)\b/i.test(query);
  const hasEmail = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text);
  const hasPhone = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/.test(text);
  const hasAddress = /\b\d{3,6}\s+[A-Z][A-Za-z0-9.'-]*(?:\s+[A-Z][A-Za-z0-9.'-]*){1,6}\b/.test(
    text
  );

  if (wantsEmail) return hasEmail;
  if (wantsPhone) return hasPhone;
  if (wantsAddress) return hasEmail || hasPhone || hasAddress;
  return hasEmail || hasPhone || hasAddress;
}

function extractContactInfo(sources, query) {
  const wantsEmail = /\b(email|e-mail)\b/i.test(query);
  const wantsPhone = /\b(phone|number|call)\b/i.test(query);
  const wantsAddress = /\b(address|mail|reach|contact)\b/i.test(query);
  const found = [];

  for (const source of sources.slice(0, 3)) {
    const text = `${source.excerpt || ""}\n${source.text || ""}`;
    const emails = [...text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map(
      (match) => match[0]
    );
    const phones = [
      ...text.matchAll(/(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/g),
    ].map((match) => match[0]);
    const addresses = [
      ...text.matchAll(/\b\d{3,6}\s+[A-Z][A-Za-z0-9.'-]*(?:\s+[A-Z][A-Za-z0-9.'-]*){1,6}\b/g),
    ].map((match) => match[0]);

    if (wantsEmail || (!wantsPhone && !wantsAddress)) {
      emails.forEach((value) => found.push({ type: "email", value, source }));
      if (wantsEmail) continue;
    }
    if (wantsPhone) phones.forEach((value) => found.push({ type: "phone", value, source }));
    if (wantsAddress) {
      addresses.forEach((value) => found.push({ type: "address", value, source }));
    }
  }

  const seen = new Set();
  return found.filter((item) => {
    const key = `${item.type}:${item.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function contactAnswer(query, sources) {
  const contacts = extractContactInfo(sources, query);
  if (!contacts.length) return "";

  const values = contacts
    .slice(0, 3)
    .map((contact) => `${contact.type}: ${contact.value}`)
    .join(", ");

  return helpfulAnswer(
    `I found this contact detail in the rulebook: ${values}.`,
    sources,
    "Use the linked section to confirm the contact detail is current before relying on it."
  );
}

function isVaguePermissionQuestion(query, importantTerms) {
  return (
    /^\s*(ignore\b.*)?(can i|may i|am i allowed|is it allowed)\b/i.test(query) &&
    importantTerms.length === 0
  );
}

function combinedMatchStats(sources) {
  return sources.reduce((merged, source) => mergeMatchStats(merged, source.matchStats), {
    bodyMatches: 0,
    matchedExpandedTerms: [],
    matchedOriginalTerms: [],
    phraseMatches: [],
    titleMatches: 0,
  });
}

function assessAnswerConfidence(query, results, sources) {
  const chapter = findChapterQuestion(query);
  const sectionNumber = sectionNumberQuestion(query);
  const importantTerms = importantQueryTerms(query);
  const top = results[0];

  if (chapter && sources.length) {
    return { canAnswer: true, confidence: "high", reason: "chapter-request" };
  }

  if (sectionNumber && sources.length) {
    return { canAnswer: true, confidence: "high", reason: "section-request" };
  }

  if (!top || !sources.length) {
    return { canAnswer: false, confidence: "none", reason: "no-sources" };
  }

  if (isMailboxModificationQuery(query)) {
    return {
      canAnswer: false,
      confidence: "low",
      reason: "mailbox-source-does-not-establish-modification-permission",
    };
  }

  const semanticSupport = supportedSemanticConcept(query, sources);
  if (semanticSupport) {
    return {
      canAnswer: true,
      confidence: "high",
      reason: `semantic-concept-supported:${semanticSupport.name}`,
    };
  }

  const questionSpecificSources = sources.filter(
    (source) => source.questionSpecificExcerpt && cleanText(source.excerpt || "").length >= 45
  );
  const questionSpecificText = combinedSourceText(questionSpecificSources);
  if (
    questionSpecificSources.length &&
    (
      /\b(?:must|shall|may|allowed|permitted|prohibited|required|not required|not permitted|evaluated|preapproved|acceptable)\b/i.test(questionSpecificText) ||
      (isPlantListQuestion(query) && /preapproved plant list/i.test(`${questionSpecificSources[0]?.title || ""} ${questionSpecificText}`))
    )
  ) {
    return { canAnswer: true, confidence: "high", reason: "question-specific-official-clause" };
  }

  const groundedText = combinedSourceText(sources.slice(0, 3));
  if (
    isMovableOutdoorBelongingsQuestion(query) &&
    sources.slice(0, 3).some((source) => /^Sec\. 1-38\./i.test(source.title || ""))
  ) {
    return { canAnswer: true, confidence: "high", reason: "household-items-placement-rule" };
  }
  if (
    isShortTermRentalQuery(query) &&
    /short-term\s+lodging|short-term,\s+vacation\s+property/i.test(groundedText)
  ) {
    return { canAnswer: true, confidence: "high", reason: "short-term-rental-rule" };
  }
  if (isTrashStorageQuery(query) && /enclosed structure|garage|wing fence/i.test(groundedText)) {
    return { canAnswer: true, confidence: "high", reason: "current-trash-storage-rule" };
  }
  if (
    isLandscapeCompletionDeadlineQuery(query) &&
    sources.slice(0, 3).some((source) =>
      /^Sec\. 9-145\. - Completion\/installation dates/i.test(source.title || "") &&
      /Front yard landscaping must be completed[\s\S]*Rear yard landscaping must be completed/i.test(source.text || source.excerpt || "")
    )
  ) {
    return { canAnswer: true, confidence: "high", reason: "current-landscape-completion-rule" };
  }

  if (
    (isPorchPatioLightingQuery(query) && sources.slice(0, 3).some(isUpdatedExteriorLightingPolicy)) ||
    (isPetKeepingQuery(query) && sources.slice(0, 3).some((source) => /1-33|pets and livestock/i.test(source.title || ""))) ||
    (isGreenhouseQuery(query) && sources.slice(0, 3).some((source) => /21-22|greenhouses/i.test(source.title || ""))) ||
    (isHomeAutomationAccessQuery(query) && sources.slice(0, 3).some((source) => /25-23|home automation/i.test(source.title || ""))) ||
    (isCarCoverQuery(query) && sources.slice(0, 3).some((source) => /21-22|car covers/i.test(source.title || ""))) ||
    ((isStreetParkingQuery(query) || isRvParkingQuery(query)) &&
      sources.slice(0, 3).some((source) => /1-37|vehicles; parking/i.test(source.title || ""))) ||
    (isElectricalPanelPlacementQuery(query) && sources.slice(0, 3).some((source) => /21-22|general community standards/i.test(source.title || ""))) ||
    (isLotDemolitionQuery(query) && sources.slice(0, 3).some((source) => /21-22|general community standards/i.test(source.title || "")))
  ) {
    return { canAnswer: true, confidence: "high", reason: "review-alert-regression" };
  }

  if (isVaguePermissionQuestion(query, importantTerms)) {
    return { canAnswer: false, confidence: "low", reason: "vague-permission-question" };
  }

  if (!importantTerms.length) {
    return { canAnswer: false, confidence: "low", reason: "no-important-query-terms" };
  }

  const stats = combinedMatchStats(sources.slice(0, 3));
  const matchedImportantTerms = importantTerms.filter((term) =>
    stats.matchedOriginalTerms.some((matched) => matched === term || matched === `${term}s`)
  );
  const coverage = matchedImportantTerms.length / importantTerms.length;
  const maxSingleSourceCoverage = Math.max(
    ...sources.slice(0, 3).map((source) => {
      const sourceStats = source.matchStats || {};
      const matched = importantTerms.filter((term) =>
        (sourceStats.matchedOriginalTerms || []).some(
          (value) => value === term || value === `${term}s`
        )
      );
      return matched.length / importantTerms.length;
    }),
    0
  );
  const hasPhraseMatch = stats.phraseMatches.length > 0;
  const hasBodyMatch = stats.bodyMatches > 0;
  const topScore = top.score || 0;

  if (
    isContactInfoQuery(query) &&
    !sources.slice(0, 3).some((source) => sourceHasRequestedContactInfo(source, query))
  ) {
    return {
      canAnswer: false,
      confidence: "low",
      coverage,
      reason: "missing-requested-contact-info",
    };
  }

  if (
    isFoodTruckDrivewayQuery(query) &&
    !sources.slice(0, 3).some((source) =>
      /\bfood\s+truck\b/i.test(`${source.title || ""} ${source.excerpt || ""} ${source.text || ""}`)
    )
  ) {
    return {
      canAnswer: false,
      confidence: "low",
      coverage,
      reason: "no-food-truck-specific-rule",
    };
  }

  if (
    isViolationProcessQuery(query) &&
    sources.slice(0, 3).some((source) =>
      /due process and imposition of fines|policy governing due process/i.test(source.title || "")
    )
  ) {
    return { canAnswer: true, confidence: "high", reason: "current-violation-policy" };
  }

  if (
    isDelinquentAccountQuery(query) &&
    sources.slice(0, 3).some((source) =>
      /collection process for delinquent|delinquent utility/i.test(source.title || "")
    )
  ) {
    return { canAnswer: true, confidence: "high", reason: "current-delinquent-fee-policy" };
  }

  if (isResidentFeeOverviewQuery(query) && hasCurrentFeeScheduleSource(sources)) {
    return { canAnswer: true, confidence: "high", reason: "current-resident-fee-overview" };
  }

  if (isFeeQuery(query) && hasCurrentFeeScheduleSource(sources.slice(0, 3))) {
    return { canAnswer: true, confidence: "high", reason: "current-fee-schedule" };
  }

  if (
    (isFlagQuery(query) || isOutdoorDecorativeObjectQuery(query)) &&
    sources.slice(0, 3).some((source) =>
      /cab code amendments|trash containers, outdoor decorative objects, signs, and flags/i.test(
        source.title || ""
      )
    )
  ) {
    return { canAnswer: true, confidence: "high", reason: "current-code-amendment" };
  }

  if (isUnderEaveLightingQuery(query) && sources.slice(0, 3).some(isUpdatedExteriorLightingPolicy)) {
    return { canAnswer: true, confidence: "high", reason: "current-exterior-lighting-policy" };
  }

  if (isSeasonalLightingQuery(query) && sources.slice(0, 3).some(isUpdatedExteriorLightingPolicy)) {
    return { canAnswer: true, confidence: "high", reason: "current-seasonal-lighting-policy" };
  }

  if (
    isLandscapeScreenQuery(query) &&
    sources.slice(0, 3).some((source) =>
      /Landscape screens\.\s*DRC approval is required|\(54\)\s*Landscape screens/i.test(
        [source.excerpt || "", source.text || ""].join(" ")
      )
    )
  ) {
    return { canAnswer: true, confidence: "high", reason: "landscape-screen-rule" };
  }

  if (
    /\bfenc(?:e|es|ing)\b/i.test(query) &&
    sources.slice(0, 3).some((source) => /21-23|fencing standards/i.test(source.title || ""))
  ) {
    return { canAnswer: true, confidence: "high", reason: "fencing-standards" };
  }

  if (
    isWateringRestrictionQuery(query) &&
    sources.slice(0, 3).some((source) => /13-105|water conservation measures/i.test(source.title || ""))
  ) {
    return { canAnswer: true, confidence: "high", reason: "watering-restrictions" };
  }

  if (
    /\bsheds?\b/i.test(query) &&
    sources.slice(0, 3).some((source) => /Backyard utility sheds|21-22.*\(b\)\(9\)/i.test(source.title || ""))
  ) {
    return { canAnswer: true, confidence: "high", reason: "backyard-utility-shed-rule" };
  }

  if (
    isHotTubQuery(query) &&
    sources.slice(0, 3).some((source) => /Hot tubs?, outdoor spas?|21-22.*\(b\)\(48\)/i.test(source.title || ""))
  ) {
    return { canAnswer: true, confidence: "high", reason: "hot-tub-rule" };
  }

  if (
    top?.isInlineTopic &&
    maxSingleSourceCoverage >= 0.67 &&
    topScore >= MIN_CLEAR_SCORE
  ) {
    return { canAnswer: true, confidence: "high", coverage, reason: "inline-topic-match" };
  }

  // A resident question can legitimately span two sections of the same
  // controlling rulebook. Do not reject an answer merely because neither
  // section repeats every word in the question. The combined path is allowed
  // only when all cited sources are governing Municode sections, the sections
  // do not conflict, and together they contain a clear rule conclusion.
  const governingSources = sources.slice(0, 3);
  const compatibleGoverningClaims = governingSources.length >= 2
    && governingSources.every((source) => /library\.municode\.com/i.test(source.sourceUrl || ""))
    && currentSourceConflicts(governingSources).length === 0
    && matchedImportantTerms.length >= 2
    && coverage >= 0.5
    && topScore >= MIN_CLEAR_SCORE
    && /\b(?:must|may|allowed|not allowed|prohibited|required|shall)\b/i.test(groundedText);
  if (compatibleGoverningClaims) {
    return { canAnswer: true, confidence: "high", coverage, reason: "compatible-governing-rule-claims" };
  }

  if (importantTerms.length >= 3 && maxSingleSourceCoverage < 0.67 && !hasPhraseMatch) {
    return {
      canAnswer: false,
      confidence: "low",
      coverage,
      reason: "no-single-source-support",
    };
  }

  if (importantTerms.length >= 2 && maxSingleSourceCoverage < 1 && !hasPhraseMatch) {
    return {
      canAnswer: false,
      confidence: "low",
      coverage,
      reason: "no-single-source-support",
    };
  }

  if (coverage < MIN_CLEAR_COVERAGE && topScore < MIN_WEAK_COVERAGE_SCORE) {
    return {
      canAnswer: false,
      confidence: "low",
      coverage,
      reason: "weak-query-coverage",
    };
  }

  if (topScore < MIN_CLEAR_SCORE) {
    return {
      canAnswer: false,
      confidence: "low",
      coverage,
      reason: "low-score",
    };
  }

  if (!hasBodyMatch && !hasPhraseMatch && topScore < MIN_WEAK_COVERAGE_SCORE) {
    return {
      canAnswer: false,
      confidence: "low",
      coverage,
      reason: "title-only-weak-match",
    };
  }

  return {
    canAnswer: true,
    confidence: hasPhraseMatch || coverage >= 0.8 ? "high" : "medium",
    coverage,
    reason: "supported",
  };
}

function unclearAnswer(sources) {
  if (!sources.length) {
    return helpfulAnswer(
      "I don't have enough rulebook evidence to answer that confidently.",
      [],
      "Try asking with a more specific object or action, or check the official rulebook for an answer."
    );
  }

  return helpfulAnswer(
    "I don't have enough rulebook evidence to give a definite answer. These sections look like the closest starting points.",
    sources.slice(0, 3),
    "Try rephrasing with more detail, open the linked sections, or confirm through the official process before acting."
  );
}

function thirdPartyOwnershipBoundaryAnswer(query, sources = []) {
  if (!/\b(?:paint|repaint|color|colour|modify|change|alter|attach|remove)\b/i.test(String(query || ""))) {
    return "";
  }
  const sourceText = combinedSourceText(sources);
  const owner = sourceText.match(/owned and maintained\s+by\s+((?:the\s+)?[A-Z][^.]{2,100}?)(?:\.|$)/i)?.[1]?.trim();
  if (!owner) return "";
  return structuredHelpfulAnswer(
    sources[0]?.excerpt || "",
    [],
    "Open the linked official section and confirm the current detail before acting."
  );
}

function unsupportedResourceAbsenceAnswer(sources) {
  return helpfulAnswer(
    "The official material I found does not explicitly confirm whether the requested list exists, so I won't treat a search miss as proof that it is unavailable.",
    sources.slice(0, 3),
    "Open the linked official source to confirm the current resource."
  );
}

function buildPlainAnswer(query, results, index, sourcesForAnswer = []) {
  const topSources = sourcesForAnswer.length ? sourcesForAnswer.slice(0, 3) : meaningfulSources(results, 3);
  const chapterSummary = buildChapterSummary(index, query, topSources);
  if (chapterSummary) return chapterSummary;

  if (isContactInfoQuery(query)) {
    const answer = contactAnswer(query, topSources);
    if (answer) return answer;
  }

  if (isPorchPatioLightingQuery(query) && topSources.some(isUpdatedExteriorLightingPolicy)) {
    return questionSpecificSourceAnswer(query, topSources) || sourceGroundedRuleAnswer(query, topSources, index);
  }

  if (isPoultryQuery(query) && topSources.some((source) => /1-33|pets and livestock/i.test(source.title || ""))) {
    return questionSpecificSourceAnswer(query, topSources) || sourceGroundedRuleAnswer(query, topSources, index);
  }

  if (isPetKeepingQuery(query) && topSources.some((source) => /1-33|pets and livestock/i.test(source.title || ""))) {
    return questionSpecificSourceAnswer(query, topSources) || sourceGroundedRuleAnswer(query, topSources, index);
  }

  if (isGreenhouseQuery(query) && topSources.some((source) => /21-22|greenhouses/i.test(source.title || ""))) {
    return questionSpecificSourceAnswer(query, topSources) || sourceGroundedRuleAnswer(query, topSources, index);
  }

  if (isHomeAutomationAccessQuery(query) && topSources.some((source) => /25-23|home automation/i.test(source.title || ""))) {
    return questionSpecificSourceAnswer(query, topSources) || sourceGroundedRuleAnswer(query, topSources, index);
  }

  if (isCarCoverQuery(query) && topSources.some((source) => /21-22|car covers/i.test(source.title || ""))) {
    return helpfulAnswer(
      "A general tarp does not meet the rulebook's car-cover standard. Car covers require DRC approval and, in general, must be neutral-colored, well maintained, and specifically manufactured for the vehicle. Covering a vehicle does not override the separate street-parking rules.",
      topSources,
      "Check the linked car-cover and parking sections before covering or parking the vehicle."
    );
  }

  if (isStreetParkingQuery(query) && /\b(rv|rvs|recreational vehicle|motor home|camper|trailer)\b/i.test(query) && topSources.some((source) => /1-37|vehicles; parking/i.test(source.title || ""))) {
    return helpfulAnswer(
      "No. RVs, motor homes, campers, and trailers may not be parked on the street. The 72-hour exception applies only to temporary driveway parking, for no more than three overnights during a seven-day period. Otherwise, the vehicle must fit entirely inside an enclosed garage, and moving it around does not reset the limit.",
      topSources,
      "Use the linked vehicle-parking section for the complete list of covered vehicle types and exceptions."
    );
  }

  if (isStreetParkingQuery(query) && topSources.some((source) => /1-37|vehicles; parking/i.test(source.title || ""))) {
    return helpfulAnswer(
      "The street-parking rules still apply. The rulebook bars commercial vehicles, RVs, trailers, campers, boats, golf carts, and similar vehicles from street parking. It also prohibits parking that blocks an entrance, exit, parking space, garbage-truck access, fire lane, or no-parking area, and it does not allow inoperative, abandoned, unlicensed, or stored vehicles on the street.",
      topSources,
      "Use the linked vehicle-parking section to match the exact type and condition of the vehicle."
    );
  }

  if (isElectricalPanelPlacementQuery(query) && topSources.some((source) => /21-22|general community standards/i.test(source.title || ""))) {
    return helpfulAnswer(
      "The rulebook does not set a specific inside-versus-outside-the-gate location for an electrical panel installed with the original home. It says new or changed exterior utility equipment requires DRC approval and may need screening, but utility equipment installed as part of the home's initial construction is excluded from that DRC requirement.",
      topSources,
      "For an original builder-installed panel, confirm the required placement with the builder, electric utility, and county building officials. For a later exterior change, confirm with the DRC before work starts."
    );
  }

  if (isLotDemolitionQuery(query) && topSources.some((source) => /21-22|general community standards/i.test(source.title || ""))) {
    return helpfulAnswer(
      "The rulebook does not grant permission to buy a neighboring lot, demolish its house, and combine the land into a larger yard. It requires DRC review for additions, alterations, renovations, and other unlisted property improvements before work begins, with plans, the revised footprint, and property-line setbacks.",
      topSources,
      "Before buying or demolishing anything, get written direction from the DRC and county officials about demolition permits, lot or plat consolidation, zoning, utilities, drainage, and any restrictions tied to either property."
    );
  }

  if (/\bdogs?\b/i.test(query) && /\bleash/i.test(query) && topSources.some((source) => /17-54|general rules/i.test(source.title))) {
    return helpfulAnswer(
      "The rulebook says dog owners must keep their dog leashed and under physical control.",
      topSources,
      "Open the linked park/open-space section for the exact wording and any related animal rules."
    );
  }

  if (/\bsolar\b/i.test(query) && topSources.some((source) => /21-22|general community standards/i.test(source.title))) {
    return helpfulAnswer(
      "Solar installations on the exterior of the home or lot appear to require DRC approval.",
      topSources,
      "Confirm the submittal requirements and current DRC process before installing solar panels."
    );
  }

  if (
    isWateringRestrictionQuery(query) &&
    topSources.some((source) => /13-105|water conservation measures/i.test(source.title || ""))
  ) {
    return helpfulAnswer(
      "Outdoor irrigation is prohibited between 10:00 a.m. and 6:00 p.m. from May 1 through September 30 unless there is an approved daytime-watering permit. Hand watering and water-conserving methods such as drip, trickle, micro-spray, deep-root devices, or watering cans are allowed at any time. The CAB may change the restrictions when needed.",
      topSources,
      "Use the linked water-conservation section for the current restrictions before scheduling irrigation."
    );
  }

  if (
    isHotTubQuery(query) &&
    topSources.some((source) => /Hot tubs?, outdoor spas?|21-22.*\(b\)\(48\)/i.test(source.title || ""))
  ) {
    return helpfulAnswer(
      "Hot tubs, outdoor spas, and outdoor saunas require DRC approval. They are permitted only in rear yards, must be outside utility easements and at least five feet from every property line, and must be screened from adjacent properties when installed.",
      topSources,
      "Use the linked hot-tub and outdoor-spa subsection and get DRC approval before installation."
    );
  }

  if (
    isFirePitQuery(query) &&
    topSources.some((source) => /Fire pits|21-22.*\(b\)\(36\)/i.test(source.title || ""))
  ) {
    return helpfulAnswer(
      "Permanent outdoor fireplaces and fire pits require DRC approval. A portable, commercially available fire pit or chimenea does not require DRC approval when it is in the rear yard and at least five feet from every property line. Gas installations must also follow safety rules, and natural-gas lines require the applicable permits and permissions.",
      topSources,
      "Use the linked fire-pit subsection and confirm any county, utility, and safety requirements before installation."
    );
  }

  if (/\bsheds?\b/i.test(query) && topSources.some((source) => /21-22|general community standards/i.test(source.title))) {
    return helpfulAnswer(
      "Yes, but a backyard utility shed requires DRC approval. The shed is reviewed for size, height, color, relationship to the lot, landscaping, and setbacks. Utilities must be underground, and landscape screening is required.",
      topSources,
      "Confirm with the DRC/CAB before building or installing one, because exterior or lot changes can require approval before work starts."
    );
  }

  if (
    isLandscapeScreenQuery(query) &&
    topSources.some((source) => /21-22|general community standards/i.test(source.title))
  ) {
    return helpfulAnswer(
      "Backyard privacy screens are treated as landscape screens and require DRC approval. They must be freestanding in a rear or side yard and outside easements. Each screen may be no more than eight feet wide and five feet high, or six feet high when plantings are installed around its base. The rule requires 30 percent transparency, allows no more than three screens if the lot can accommodate them, and says screens cannot be attached to one another, a shed, or the house. Vinyl is not allowed; approved materials and colors must match or complement the home.",
      topSources,
      "Use the linked Section 21-22(b)(54) and Landscape Screens One-Sheet, and get DRC approval before installing a screen."
    );
  }

  if (
    /\b(rv|rvs|recreational vehicle|motor home|camper|trailer)\b/i.test(query) &&
    topSources.some((source) => /1-37|vehicles; parking/i.test(source.title))
  ) {
    return helpfulAnswer(
      "RVs and motor homes may be temporarily parked in a driveway for up to 72 consecutive hours, but otherwise must fit entirely within an enclosed garage.",
      topSources,
      "Check the linked vehicle section before parking, because the rule also covers trailers, campers, boats, ATVs, and similar vehicles."
    );
  }

  if (
    /\b(trash|garbage|recycling).*\b(cans?|containers?|receptacles?|stor(?:e|ed|age|ing))\b|\b(cans?|containers?|receptacles?|stor(?:e|ed|age|ing)).*\b(trash|garbage|recycling)\b/i.test(
      query
    ) &&
    topSources.some((source) => /1-35|trash|trash containers|cab code amendments|amendments to cab code/i.test(source.title))
  ) {
    const hasUpdatedTrashRule = topSources.some((source) =>
      /properly stored in an enclosed structure, the garage, or appropriately screened from view behind the wing fence/i.test(
        source.text || ""
      )
    );
    if (hasUpdatedTrashRule) {
      return helpfulAnswer(
        "The updated rule says trash must be kept in appropriate containers and stored in an enclosed structure, in the garage, or screened from view behind the wing fence.",
        topSources,
        "Use the linked updated CAB code amendment with the trash section for the current storage wording."
      );
    }

    return helpfulAnswer(
      "Trash cans should be kept in a garage, suitable enclosure, or DRC-approved location except for pickup. They should not be placed outside earlier than 4:00 a.m. on pickup day and should be put back the same day.",
      topSources,
      "Use the linked trash sections for the exact storage and screening wording."
    );
  }

  if (
    /\bfenc(e|es|ing)\b/i.test(query) &&
    topSources.some((source) => /21-23|fencing standards/i.test(source.title))
  ) {
    return helpfulAnswer(
      "Fence questions are covered by the fencing standards, and some new or changed fencing needs DRC approval before work starts.",
      topSources,
      "Confirm the exact fence style, gate, height, material, color, and approval requirements before installing or modifying fencing."
    );
  }

  if (
    isDeadTreeReplacementQuery(query) &&
    topSources.some((source) => /9-146|landscape maintenance|21-22|general community standards/i.test(source.title))
  ) {
    return helpfulAnswer(
      "The rules I found say dead trees must be replaced. For a tree lawn, owners must replace dead or dying materials with like materials unless the DRC approves something else, and replacement trees must be at least two-inch caliper measured six inches above grade. The rules call for DRC approval when the tree-lawn change is a design change or a change from the required like-for-like replacement.",
      topSources,
      "If you are replacing the same kind of tree in the same tree-lawn setup, use the linked sections as your starting point; if you are changing the type, location, layout, or design, confirm with the DRC before planting."
    );
  }

  if (
    /\bpolitical\b.*\bsigns?\b|\bsigns?\b.*\bpolitical\b/i.test(query) &&
    topSources.some((source) => /1-34|signs; flags|cab code amendments|amendments to cab code/i.test(source.title))
  ) {
    const hasUpdatedSignRule = topSources.some((source) =>
      /political signage.*commercial messages are prohibited|commercial messages are prohibited.*political signage/i.test(
        source.text || ""
      )
    );
    if (hasUpdatedSignRule) {
      return helpfulAnswer(
        "The updated CAB code amendment says owners may display flags or political signage, but commercial-message flags are prohibited and a flag may not exceed four feet by six feet.",
        topSources,
        "Check the linked updated sign and flag amendment for placement, size, and any related front-of-home flag rules."
      );
    }

    return helpfulAnswer(
      "Political signs are allowed within limits: the rulebook says they may be displayed no earlier than 45 days before the election and removed within seven days after the election.",
      topSources,
      "Check the linked sign section for limits on number, placement, and size."
    );
  }

  if (
    isFlagQuery(query) &&
    topSources.some((source) => /flags|flag holders|signs; flags|cab code amendments|amendments to cab code/i.test(source.title))
  ) {
    return helpfulAnswer(
      "The updated flag language allows flags subject to limits, says commercial-message flags are prohibited, and caps flags at four feet by six feet. For flags on the front of the home, the updated community-standards section still lists the United States flag, Colorado flag, and certain military service flags; freestanding flagpoles or separate nighttime flag illumination require DRC approval.",
      topSources,
      "Use the linked sign/flag amendment for the exact wording before installing a flagpole or lighting."
    );
  }

  if (
    isOutdoorDecorativeObjectQuery(query) &&
    topSources.some((source) => /outdoor decorative objects|cab code amendments|amendments to cab code/i.test(source.title))
  ) {
    return helpfulAnswer(
      "The updated rule allows rear-yard lawn or yard ornamentation without DRC approval if it is three feet tall or less. Front-yard ornaments do not need DRC approval only if there are no more than three, they are on the ground, each is no more than 12 inches tall or wide, and they are integrated into the landscape design.",
      topSources,
      "If the object is larger or does not meet those limits, use the linked CAB code amendment and confirm whether DRC approval is required."
    );
  }

  if (isUnderEaveLightingQuery(query) && topSources.some(isUpdatedExteriorLightingPolicy)) {
    return helpfulAnswer(
      "Gemstone and Jellyfish under-eave/eave-rake lighting systems are listed as approved systems in the 2024 exterior lighting update, but adding or modifying exterior lighting still requires DRC approval. Other similar brands are not automatically permitted unless they are added to the CAB-approved list. The rule also limits placement, glare, color temperature, non-holiday settings, and says under-eave lighting must be turned off by 10:00 p.m.",
      topSources,
      "Use the linked updated exterior lighting policy and submit or confirm through the DRC before installing or changing exterior lighting."
    );
  }

  if (isSeasonalLightingQuery(query) && topSources.some((source) => /21-22|general community standards/i.test(source.title))) {
    const hasUpdatedSeasonalPolicy = topSources.some((source) =>
      /June 18 to July 7 and from October 1 through January 31/i.test(source.text || "")
    );
    if (hasUpdatedSeasonalPolicy) {
      return helpfulAnswer(
        "The updated CAB exterior lighting policy allows seasonal decorative lighting from June 18 to July 7 and from October 1 through January 31. Outside those windows, temporary string lights and clips must be removed, and hardwired soffit/eave lighting must return to the approved non-seasonal settings.",
        topSources,
        "Use the linked updated CAB lighting policy for the exact current wording."
      );
    }

    return helpfulAnswer(
      "Holiday lighting may be installed and energized from October 15 through January 25, and the rulebook says holiday lighting must be turned off by 10:00 p.m.",
      topSources,
      "Use the linked community standards section for the exact seasonal-lighting wording."
    );
  }

  if (
    /\btrampolines?\b/i.test(query) &&
    topSources.some((source) => /21-22|general community standards/i.test(source.title))
  ) {
    return helpfulAnswer(
      "Trampolines require DRC approval. Tall plant material is required for screening.",
      topSources,
      "Check the linked community standards section before installing a trampoline, especially for placement, screening, and anchoring requirements."
    );
  }

  if (
    /\bpools?\b/i.test(query) &&
    /\b(aboveground|build|install|installation|in-ground|inground|rear yard|backyard|yard)\b/i.test(query) &&
    topSources.some((source) => /21-22|general community standards/i.test(source.title))
  ) {
    return helpfulAnswer(
      "In-ground pools require DRC approval. Aboveground pools are generally prohibited, except for a small splash pool under the limits listed in the rulebook.",
      topSources,
      "Check the linked sections for the exact pool, setback, fencing, material, and possible tap-fee requirements before planning the project."
    );
  }

  if (isExteriorReviewQuery(query) && topSources.some((source) => /21-21|design review process/i.test(source.title))) {
    return helpfulAnswer(
      "Exterior changes to a home or lot appear to need DRC submission and approval before work starts.",
      topSources,
      "If your project changes the outside of your home, your lot, grading, drainage, landscaping, or visible materials, check the linked sections and confirm the official process before starting."
    );
  }

  if (isFeeQuery(query)) {
    return unclearAnswer([]);
  }

  if (isUtilityQuery(query)) {
    return unclearAnswer([]);
  }

  if (/^\s*(am i allowed|can i|may i|is it allowed)\b/i.test(query)) {
    return unclearAnswer([]);
  }

  if (needsOfficialConfirmation(query)) {
    return unclearAnswer([]);
  }

  return unclearAnswer([]);
}

const VOLATILE_FACT_PATTERN = new RegExp(
  [
    "\\$?\\d[\\d,]*(?:\\.\\d+)?%?",
    "(?:january|february|march|april|may|june|july|august|september|october|november|december)\\s+\\d{1,2}",
    "(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[-\\s](?:one|two|three|four|five|six|seven|eight|nine))?\\s+(?:domestic\\s+)?(?:animals?|days?|feet|foot|hours?|inches?|minutes?|nights?|notices?|overnights?|screens?|signs?|vehicles?|yards?)",
  ].join("|"),
  "gi"
);

function summaryHasVolatileFacts(answer) {
  const facts = answerFactText(answer)
    .replace(/\bchapter\s+\d+[a-z]?\b/gi, " ")
    .replace(/\b(?:sec(?:tion|\.)?\s*)\d+[a-z]?[.-]\d+[a-z]?\b/gi, " ")
    .replace(/\b\d+[a-z]?[-]\d+[a-z]?\b/gi, " ");
  VOLATILE_FACT_PATTERN.lastIndex = 0;
  return (
    numericTokens(facts).length > 0 ||
    numberWordsToDigits(facts).length > 0 ||
    dateTimePhrases(facts).length > 0 ||
    VOLATILE_FACT_PATTERN.test(facts)
  );
}

function sourceWindow(text, index, radius = 420) {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);
  return cleanText(text.slice(start, end));
}

function sourceFactWindowScore(query, source, excerpt) {
  const lower = String(excerpt || "").toLowerCase();
  const title = String(source.title || "").toLowerCase();
  const terms = importantQueryTerms(query);
  let score = terms.reduce(
    (total, term) => total + (lower.includes(term) ? 18 : 0) + (title.includes(term) ? 6 : 0),
    0
  );

  if (isFeeQuery(query) && /\$\s*\d/.test(excerpt)) score += 70;
  if (isLightingRelatedQuery(query) && /\b(?:a\.?m\.?|p\.?m\.?|kelvin|january|june|july|october)\b/i.test(excerpt)) score += 55;
  if (isSeasonalLightingQuery(query) && /\b(?:january|june|july|october)\s+\d{1,2}\b/i.test(excerpt)) score += 120;
  if (/\bwater\b/i.test(query) && /\b(?:water service base rates?|indoor water consumption|outdoor water|per 1,000 gallons)\b/i.test(excerpt)) score += 120;
  if (/\btap\b/i.test(query) && /\b(?:stormwater tap|facility fees?|single-family detached|townhomes?|multifamily)\b/i.test(excerpt)) score += 120;
  if (isDelinquentAccountQuery(query) && /\b(?:courtesy notice|late fee|last Wednesday|disconnect|lien notice)\b/i.test(excerpt)) score += 120;
  if (isStreetParkingQuery(query) && /\b(?:hours?|overnights?|seven-day|garage|street|driveway)\b/i.test(excerpt)) score += 55;
  if (isPetKeepingQuery(query) && /\b(?:animals?|cats?|dogs?|fowl|poultry)\b/i.test(excerpt)) score += 55;
  if (/\b(?:feet|foot|inches|percent|days?|hours?|minutes?|months?|years?)\b/i.test(excerpt)) score += 20;
  return score;
}

function supportedSemanticConcept(query, sources = []) {
  const sourceText = sources
    .slice(0, 3)
    .map((source) => `${source.title || ""} ${source.text || ""} ${source.excerpt || ""}`)
    .join(" ");
  return SEMANTIC_CONCEPTS
    .filter(
      (concept) =>
        semanticConceptMatchesQuery(concept.name, query) &&
        concept.sourcePatterns.some((pattern) => pattern.test(sourceText))
    )
    .sort((left, right) => right.boost - left.boost)[0];
}

function semanticConceptSources(query, results = [], limit = 5) {
  const concepts = SEMANTIC_CONCEPTS.filter(
    (concept) => concept.collectSources && semanticConceptMatchesQuery(concept.name, query)
  );
  if (!concepts.length) return [];

  const sourcePatterns = concepts.flatMap((concept) => concept.sourcePatterns);
  return results
    .filter((source) =>
      sourcePatterns.some((pattern) =>
        pattern.test(`${source.title || ""} ${source.text || ""} ${source.excerpt || ""}`)
      )
    )
    .slice(0, limit);
}

function structuredFactScore(query, source, fact) {
  const context = fact._displayContext || fact.context;
  let score = sourceFactWindowScore(query, source, context);
  if (isFeeQuery(query) && fact.kind === "money") score += 500;
  if (/\bwater\b/i.test(query) && /\b(?:water service base rates?|indoor water consumption fee)\b/i.test(context)) score += 700;
  if (/\btap\b/i.test(query) && /\b(?:stormwater tap|facilit(?:y|ies) fees?)\b/i.test(context)) score += 700;
  if (/\btrash\b/i.test(query) && /\btrash monthly charge\b/i.test(context)) score += 700;
  if (/\bstreetlight\b/i.test(query) && /\bstreetlight monthly charge\b/i.test(context)) score += 700;
  if (/\b(?:ornament|decorative object)\b/i.test(query) && /\b(?:ornament|decorative object)\b/i.test(context)) score += 700;
  if (isSeasonalLightingQuery(query) && ["date", "time"].includes(fact.kind)) score += 400;
  if (isLightingRelatedQuery(query) && ["date", "time", "measurement"].includes(fact.kind)) score += 220;
  if (isPetKeepingQuery(query) && fact.kind === "count") score += 300;
  if (isStreetParkingQuery(query) && ["duration", "count"].includes(fact.kind)) score += 300;
  if (isDelinquentAccountQuery(query) && ["date", "duration", "money", "percentage"].includes(fact.kind)) score += 300;
  // Later consolidated tables/operative text in resolutions are usually more
  // useful than cover pages and certification pages when relevance ties.
  score += Math.min(Number(fact.sourceOffset) || 0, 100000) / 100000;
  return score;
}

function dynamicFactPassages(query, source) {
  const text = String(source.text || source.excerpt || "");
  if (!text) return [];
  const patterns = [];
  const residentOverview = isResidentFeeOverviewQuery(query); if (/\btap\b/i.test(query) && !/\btap and facility fees\b/i.test(source.title || "")) return [];
  if (/\bwater\b/i.test(query) || (residentOverview && /^2026 water/i.test(source.title || ""))) {
    patterns.push(/Monthly Fee Residential \(per Unit\) Single Family Detached/i);
    if (residentOverview) {
      patterns.push(/Monthly Base Fee Residential \(per Unit\) Single Family Detached/i);
    }
    patterns.push(/Tier residential and non-residential Fee per 1,000 gallons Tier 1/i);
  }
  if (/\b(?:tap|facility|facilities)\b/i.test(query)) {
    patterns.push(/(?:CAB Fees Dominion Fees Total Fees Residential \(per Unit\)|Residential stormwater tap|Residential facilities fees)/i);
    patterns.push(/Stormwater Tap for Public Schools Fee per Unit Residential/i);
  }
  if (/\btrash\b/i.test(query) || (residentOverview && /^2026 CAB service fees/i.test(source.title || ""))) {
    patterns.push(/Trash Monthly Charge Residential/i);
  }
  if (/\bstreetlight\b/i.test(query) || (residentOverview && /^2026 CAB service fees/i.test(source.title || ""))) {
    patterns.push(/Streetlight Monthly Charge Residential/i);
  }
  if (isLightingRelatedQuery(query)) {
    patterns.push(/Gemstone and Jellyfish systems are the approved systems/i);
    patterns.push(/under-eave lighting must be turned off by 10:00 p\.m\./i);
  }
  if (isSeasonalLightingQuery(query)) {
    patterns.unshift(/Install and energize seasonal decorative lighting/i);
  }
  if (isPorchPatioLightingQuery(query)) {
    patterns.unshift(/outdoor living space \(such as a patio, porch, or deck\)/i);
    patterns.push(/warm white light with a color temperature of 3,000 Kelvin or less/i);
  }
  if (isLandscapeScreenQuery(query)) patterns.unshift(/Five-foot maximum overall height/i);
  if (isLandscapeCompletionDeadlineQuery(query)) {
    const asksFront = /\bfront\s+(?:yard|landscap)/i.test(query);
    const asksRear = /\b(?:back\s*yard|rear(?:\s+yard|\s+landscap)|back\s+landscap)/i.test(query);
    if (!asksFront || asksRear) patterns.push(/Rear yard landscaping must be completed within 120 days after closing/i);
    if (!asksRear) patterns.push(/Front yard landscaping must be completed by the Builder no later than 30 days/i);
  }
  if (/\b(rv|rvs|recreational vehicle|motor home|camper|trailer)\b/i.test(query)) {
    patterns.unshift(/maximum amount of time a Recreational Vehicle/i);
  }
  if (/\bsheds?\b/i.test(query)) patterns.unshift(/shed footprint maximum/i);
  if (/\btrampolines?\b/i.test(query)) patterns.unshift(/minimum of five feet from all property lines/i);
  if (/\b(?:ornament|decorative object)\b/i.test(query)) patterns.push(/ornamentation in the front yard/i);
  if (isDelinquentAccountQuery(query)) {
    patterns.push(/Courtesy past due notification/i);
    patterns.push(/Disconnect Notice or Lien Notice/i);
  }

  return patterns.flatMap((pattern) => {
    const match = pattern.exec(text);
    if (!match) return [];
    const start = match.index;
    const passageLength = isLandscapeScreenQuery(query) ? 850 : 360;
    const end = Math.min(text.length, match.index + passageLength + 100);
    return [shortenText(readableSourcePassage(text.slice(start, end)), passageLength)];
  });
}

function currentFactExcerpt(query, source) {
  if (source.isInlineTopic && source.text) {
    VOLATILE_FACT_PATTERN.lastIndex = 0;
    if (VOLATILE_FACT_PATTERN.test(source.text)) {
      return shortenText(source.text, 6500);
    }
  }

  const decoratedExcerpt = String(source.excerpt || "");
  VOLATILE_FACT_PATTERN.lastIndex = 0;
  if (
    !isSeasonalLightingQuery(query) &&
    decoratedExcerpt.length >= 180 &&
    VOLATILE_FACT_PATTERN.test(decoratedExcerpt)
  ) {
    return shortenText(decoratedExcerpt, 2400);
  }

  const text = String(source.text || source.excerpt || "");
  if (!text) return "";

  const candidates = [];
  VOLATILE_FACT_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(VOLATILE_FACT_PATTERN)) {
    const excerpt = sourceWindow(text, match.index || 0);
    if (!excerpt) continue;
    candidates.push({
      excerpt,
      score: sourceFactWindowScore(query, source, excerpt),
    });
  }

  const existingExcerpt = String(source.excerpt || "");
  VOLATILE_FACT_PATTERN.lastIndex = 0;
  if (existingExcerpt && VOLATILE_FACT_PATTERN.test(existingExcerpt)) {
    candidates.push({
      excerpt: cleanText(existingExcerpt),
      score: sourceFactWindowScore(query, source, existingExcerpt) + 25,
    });
  }

  candidates.sort((a, b) => b.score - a.score || a.excerpt.length - b.excerpt.length);
  if (!candidates.length || candidates[0].score < 35) return "";
  const selected = [];
  for (const candidate of candidates) {
    const normalized = candidate.excerpt.toLowerCase();
    if (selected.some((item) => item.toLowerCase().includes(normalized) || normalized.includes(item.toLowerCase()))) {
      continue;
    }
    selected.push(candidate.excerpt);
    if (selected.length >= 4) break;
  }

  return shortenText(selected.join(" "), 2400);
}

function sourceDerivedFactSources(query, sources = []) {
  return sources.flatMap((source) => {
    const excerpt = /\btap\b/i.test(query) && !/\btap and facility fees\b/i.test(source.title || "") ? "" : currentFactExcerpt(query, source);
    if (!excerpt) return [];
    // Read facts from raw official text. The excerpt is presentation-only and
    // may omit a value that appears later in a long fee table or resolution.
    const structuredFacts = extractStructuredFacts(source.text || excerpt, source);
    const rankedFacts = structuredFacts
      .map((fact) => ({ ...fact, _displayContext: conciseFactContext(fact, source.text || excerpt) }))
      .sort((a, b) => structuredFactScore(query, source, b) - structuredFactScore(query, source, a));
    const selectedFacts = [];
    for (const fact of rankedFacts) {
      if (!fact._displayContext) continue;
      if (selectedFacts.some((selected) => Math.abs(selected.sourceOffset - fact.sourceOffset) < 360)) continue;
      selectedFacts.push(fact);
      if (selectedFacts.length >= 6) break;
    }
    const selectedPassages = dynamicFactPassages(query, source);
    const factContexts = (
      selectedPassages.length
        ? selectedPassages
        : selectedFacts.map((fact) => fact._displayContext)
    ).map(readableSourcePassage);
    return structuredFacts.length
      ? [{
          ...source,
          excerpt: shortenText(factContexts.join(" ") || excerpt, 1800),
          structuredFacts,
          isSourceDerivedExcerpt: true,
        }]
      : [];
  }).filter((source, index, all) => {
    const key = `${source.title || ""}\n${source.excerpt || ""}`;
    return all.findIndex((candidate) => `${candidate.title || ""}\n${candidate.excerpt || ""}` === key) === index;
  });
}

function stableLeadFromAnswer(answer) {
  const firstParagraph = answerFactText(answer)
    .replace(/^Short answer:\s*/i, "")
    .split(/\bBefore you act:/i)[0]
    .trim();
  const sentences = firstParagraph
    .split(/(?<=[.!?])\s+/)
    .map((sentence) =>
      sentence
        .replace(/\bin the 20\d{2}\s+/gi, "in the current ")
        .replace(/\bcurrent 20\d{2}\b/gi, "current")
        .trim()
    )
    .filter(Boolean)
    .filter((sentence) => !summaryHasVolatileFacts(`Short answer: ${sentence}`));
  return sentences.slice(0, 3).join(" ");
}

function combinedSourceText(sources = []) {
  return cleanText(sources.map((source) => source.text || source.excerpt || "").join("\n"));
}

function sourceClauseCandidates(query, sources = [], options = {}) {
  const terms = expandQueryTerms(query);
  const clauses = [];
  const questionSpecificOnly = options.questionSpecificOnly !== false;
  const selectedSources = sources.filter((item) => !questionSpecificOnly || item.questionSpecificExcerpt);
  for (const [sourceIndex, source] of selectedSources.entries()) {
    const sourceText = questionSpecificOnly
      ? source.excerpt || ""
      : (options.index ? fullTextForSource(options.index, source) : "") || source.text || source.excerpt || "";
    const rawPieces = cleanText(sourceText)
      .replace(/\n/g, " ")
      .split(/(?<=[.!?])\s+|;\s+/)
      .map((piece) => piece.replace(/^(?:\([a-z0-9ivx]+\)|\d+[.)])\s*/i, "").trim())
      .filter(Boolean);
    const pieces = [];
    let heading = "";
    for (const piece of rawPieces) {
      if (/^(?:rules of|resolution no\.|adopted and approved|whereas)\b/i.test(piece)) continue;
      const containsRule = /\b(?:must|shall|may|allowed|permitted|prohibited|required|not required|not permitted|evaluated|preapproved|acceptable|no more than|minimum|maximum)\b/i.test(piece);
      if (piece.length < 60 && !containsRule) {
        heading = heading ? `${heading} ${piece}` : piece;
        continue;
      }
      const combined = heading ? `${heading} ${piece}` : piece;
      heading = "";
      if (combined.length >= 20) pieces.push(combined);
    }
    for (const piece of pieces) {
      const normalized = piece.toLowerCase();
      if (clauses.some((entry) => entry.normalized === normalized)) continue;
      const termScore = countTermMatches(piece, terms) * 12;
      const titleScore = questionSpecificOnly ? 0 : countTermMatches(source.title || "", terms) * 8;
      const sourcePriorityScore = questionSpecificOnly ? 0 : (selectedSources.length - sourceIndex) * 10;
      const ruleScore = /\b(?:must|shall|may|allowed|permitted|prohibited|required|not required|not permitted|evaluated|preapproved|acceptable|no more than|minimum|maximum)\b/i.test(piece) ? 24 : 0;
      const detailScore = /\b(?:drc|front yard|rear yard|side yard|property|screen|feet|inches|days|list)\b|\d/i.test(piece) ? 8 : 0;
      const rearLandscapeScore = /\b(?:rear|back)\s*yard|rear landscaping/i.test(query) && /\b(?:rear|back)\s*yard|backyard landscaping/i.test(piece)
        ? 35
        : 0;
      const locationMismatchPenalty =
        (/\b(?:rear|back)\s*yard|backyard/i.test(query) && /\bfront yard\b/i.test(piece) && !/\b(?:rear|back)\s*yard|backyard/i.test(piece)) ||
        (/\bside yard\b/i.test(query) && /\bfront yard\b/i.test(piece) && !/\bside yard\b/i.test(piece)) ||
        (/\bfront (?:yard|lawn)\b/i.test(query) && /\b(?:rear|back)\s*yard|backyard/i.test(piece) && !/\bfront (?:yard|lawn)\b/i.test(piece))
          ? -60
          : 0;
      const requestedPlantScore = /\b(?:plants?|landscap)/i.test(query) && /\b(?:must include|minimum|live plant|trees? as specified)\b/i.test(piece)
        ? 35
        : 0;
      const unrelatedTurfPenalty = !/\bturf\b/i.test(query) && /\bartificial turf\b/i.test(piece) ? -35 : 0;
      const namedTopicScore = /\bpickle ?ball\b/i.test(query) && /\bpickleball\b/i.test(piece) ? 55 : 0;
      const ornamentConditionScore = isOutdoorDecorativeObjectQuery(query) && /\b(?:ornaments?|12 inches|three \(3\))\b/i.test(piece) ? 55 : 0;
      const courtConditionScore = /\b(?:pickle ?ball|sport court)\b/i.test(query) && /\b(?:court|lighted)\b/i.test(piece) ? 45 : 0;
      const supportDestinationScore = isHomeAutomationAccessQuery(query)
        && /https?:\/\/|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\bcustomer support\b/i.test(piece)
        ? 70
        : 0;
      const crossReferencePenalty = /^See also\b/i.test(piece) ? -50 : 0;
      clauses.push({
        text: piece,
        normalized,
        sourceIndex,
        score: termScore + titleScore + sourcePriorityScore + ruleScore + detailScore + rearLandscapeScore + locationMismatchPenalty + requestedPlantScore + unrelatedTurfPenalty + namedTopicScore + ornamentConditionScore + courtConditionScore + supportDestinationScore + crossReferencePenalty,
        order: clauses.length,
      });
    }
  }
  return clauses.sort((left, right) => right.score - left.score || left.order - right.order);
}

function sourceGroundedRuleAnswer(query, sources = [], index = null) {
  const allClauses = sourceClauseCandidates(query, sources, { questionSpecificOnly: false, index });
  const clauses = allClauses.filter((entry) => entry.score >= 20);
  if (!clauses.length) return "";

  const locationTerms = new Set(["back", "backyard", "front", "lawn", "rear", "side", "yard"]);
  const anchors = importantQueryTerms(query).filter((term) => !locationTerms.has(term));
  const anchoredClauses = anchors.length
    ? allClauses.filter((entry) => anchors.some((term) => textMatchesImportantTerm(entry.text, term)))
    : [];
  const rankedClauses = anchoredClauses.length ? anchoredClauses : clauses;
  const projectRequest = /\b(?:add|apply|build|change|extend|install|modify|put up|replace|redo|submit)\b/i.test(query);
  const unmatchedProject = projectRequest
    ? anchors.find((term) => !allClauses.some((entry) => textMatchesImportantTerm(entry.text, term)))
    : "";
  const classifiedAccessoryClauses = unmatchedProject
    ? allClauses.filter((entry) =>
        /Accessory buildings.*DRC approval is required|outdoor pet areas.*DRC approval is required/i.test(entry.text)
      ).slice(0, 3)
    : [];
  if (unmatchedProject && classifiedAccessoryClauses.length) {
    const lead = `The selected official rules do not name ${unmatchedProject} specifically.`;
    return structuredHelpfulAnswer(
      lead,
      classifiedAccessoryClauses.map((entry) => entry.text),
      "Open the linked official section and confirm the current detail before acting."
    );
  }

  const completeSentence = (value) => {
    const text = String(value || "").trim();
    return !text || /[.!?]["')\]]?$/.test(text) ? text : `${text}.`;
  };
  const primaryEntry = rankedClauses[0];
  const primary = completeSentence(primaryEntry.text);
  const illustrativeOnly = projectRequest && anchoredClauses.length && anchoredClauses.every((entry) => {
    const lower = entry.text.toLowerCase();
    return anchors.some((term) => {
      const index = lower.search(new RegExp(`\\b${escapeRegExp(term)}s?\\b`, "i"));
      return index >= 0 && /\b(?:such as|including|includes)\b/i.test(lower.slice(Math.max(0, index - 80), index));
    });
  });
  if (illustrativeOnly) {
    const requestedProject = anchors.find((term) =>
      anchoredClauses.some((entry) => textMatchesImportantTerm(entry.text, term))
    ) || "project";
    const lead = `The official passage I found mentions ${requestedProject} only as an example in a different rule, so it does not establish whether the project itself is allowed.`;
    return structuredHelpfulAnswer(
      lead,
      [primary],
      "Open the linked official section and confirm the current detail before acting."
    );
  }

  if (/\b(?:list|directory)\b/i.test(query) || /\bapproved\s+[a-z]+s\b/i.test(query)) {
    const hasRequestedEntries = allClauses.some((entry) => /\b(?:directory|approved (?:companies|contractors|landscapers|providers))\b/i.test(entry.text));
    if (!hasRequestedEntries) {
      const registrationClauses = allClauses
        .filter((entry) => /\b(?:registration with|registered with|registration process)\b/i.test(entry.text))
        .slice(0, 3);
      if (registrationClauses.length) {
        return structuredHelpfulAnswer(
          "I could not verify whether the requested detail is covered by the selected official source.",
          registrationClauses.map((entry) => completeSentence(entry.text)),
          "Open the linked official section and confirm the current detail before acting."
        );
      }
    }
  }

  if (/\b(?:access|log in|login|portal|restore)\b/i.test(query) && !(isHomeAutomationAccessQuery(query) && allClauses.some((entry) =>
    /\b(?:log in|login|portal|username|password|account access|customer support)\b|https?:\/\/|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(entry.text)
  ))) {
    return structuredHelpfulAnswer(
      "I could not verify whether the requested detail is covered by the selected official source.",
      [primary],
      "Open the linked official section and confirm the current detail before acting."
    );
  }

  if (isHomeAutomationAccessQuery(query)) {
    const supportDetails = [
      ...allClauses
      .filter((entry) => /https?:\/\/|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(entry.text))
      .map((entry) => completeSentence(entry.text)),
      ...[/https?:\/\//i, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i]
        .map((pattern) => sentenceContaining(combinedSourceText(sources), pattern))
        .filter(Boolean)
        .map(completeSentence),
    ].filter((detail, position, values) => values.indexOf(detail) === position);
    if (supportDetails.length) {
      return structuredHelpfulAnswer(
        supportDetails[0],
        supportDetails.slice(1),
        "Open the linked official section if you need the complete wording."
      );
    }
  }

  const fenceFinishClause = allClauses.find((entry) =>
    /stained in the approved color to match the concrete perimeter fence/i.test(entry.text)
  );
  const exactFenceFinishClause = allClauses.find((entry) =>
    /interior lot line fencing/i.test(entry.text)
      && /approved stain color/i.test(entry.text)
      && /\b(?:Sherwin|#[0-9]{3,}|product (?:name|number))\b/i.test(entry.text)
  ) || allClauses.find((entry) =>
    /approved stain color/i.test(entry.text)
      && /\b(?:Sherwin|#[0-9]{3,}|product (?:name|number))\b/i.test(entry.text)
  );
  const concreteFenceColorClause = allClauses.find((entry) =>
    /color selected for concrete fencing/i.test(entry.text)
      && /\b(?:Solomon|#[0-9]{3,}|product (?:name|number))\b/i.test(entry.text)
  );
  const fencePermissionClause = allClauses.find((entry) =>
    /approval must be obtained from the DRC prior to any construction or landscaping/i.test(entry.text)
  );
  if (
    isFenceFinishQuery(query) &&
    (exactFenceFinishClause || concreteFenceColorClause)
  ) {
    const asksPermission = /\b(?:build|install|permitted|allowed|can i|may i)\b/i.test(query);
    const asksConcrete = /\bconcrete\b/i.test(query);
    const asksWood = /\b(?:wood|wooden|cedar|three[- ]rail|3[- ]rail|interior lot(?: line)?|gate)\b/i.test(query);
    const asksSpecificFenceType = asksConcrete || asksWood;
    const primaryFinish = (asksConcrete ? concreteFenceColorClause : exactFenceFinishClause) || concreteFenceColorClause;
    const otherFinish = asksConcrete ? exactFenceFinishClause : concreteFenceColorClause;
    const directEntry = asksPermission && fencePermissionClause ? fencePermissionClause : primaryFinish;
    const supportingFinishes = asksPermission
      ? [primaryFinish?.text, asksSpecificFenceType ? "" : otherFinish?.text]
      : asksSpecificFenceType
        ? []
        : [otherFinish?.text];
    return structuredHelpfulAnswer(
      completeSentence(directEntry.text),
      supportingFinishes
        .filter(Boolean)
        .map(completeSentence)
        .filter((item, index, all) => item !== completeSentence(directEntry.text) && all.indexOf(item) === index),
      asksSpecificFenceType
        ? "Open the linked official section if you need the complete wording."
        : "Confirm which cited fence type applies before using the matching finish."
    );
  }

  if (/\b(?:who owns?|ownership|belongs to)\b/i.test(query) || /^\s*does\b.{0,70}\bown\b/i.test(query)) {
    const ownershipClause = allClauses.find((entry) => /\b(?:(?:is|are) owned by|belongs to|ownership (?:belongs|rests|is))\b/i.test(entry.text));
    const responsibilityClauses = allClauses
      .filter((entry) => /\b(?:responsible for|responsibility|required to maintain|shall maintain)\b/i.test(entry.text))
      .slice(0, 3);
    if (!ownershipClause && responsibilityClauses.length) {
      const ownershipSubject = String(query).match(/\b(?:landscaping|tree lawn|sidewalk)\b/i)?.[0] || "the area";
      return structuredHelpfulAnswer(
        `The selected official passages establish maintenance responsibility, but they do not state who owns ${ownershipSubject}.`,
        responsibilityClauses.map((entry) => completeSentence(entry.text)),
        "Open the linked official section and confirm the current detail before acting."
      );
    }
  }

  if (/\b(?:required|allowed)\b/i.test(query)
    && /\b(?:quantum fiber|fiber internet|internet service)\b/i.test(query)
    && allClauses.some((entry) => /\b(?:fiber network|internet and networking|gigabit service)\b/i.test(entry.text))) {
    const requestedChoice = String(query).match(/\b(?:quantum fiber|fiber internet|internet service)\b/i)?.[0] || "the service";
    return structuredHelpfulAnswer(
      `The selected official passages describe ${requestedChoice}, but they do not state whether the resident choice in the question is required or allowed.`,
      [primary],
      "Open the linked official section and confirm the current detail before acting."
    );
  }

  const removalRequest = query.match(/\b(?:remove|demolish|tear down|cut down)\b\s+(?:(?:an?|the|my|our)\s+)?([a-z][\w-]*)/i);
  if (removalRequest) {
    const requestedObject = removalRequest[1].replace(/s$/i, "");
    const directRemovalClause = allClauses.find((entry) =>
      /\b(?:remove|removal|demolish|tear down|cut down)\b/i.test(entry.text)
        && new RegExp(`\\b${escapeRegExp(requestedObject)}s?\\b`, "i").test(entry.text)
    );
    if (!directRemovalClause) {
      const lead = `The selected official passages do not state whether ${requestedObject} removal is allowed.`;
      return structuredHelpfulAnswer(
        lead,
        [primary],
        "Open the linked official section and confirm the current detail before acting."
      );
    }
  }

  const remaining = [
    ...rankedClauses.slice(1),
    ...clauses.filter((entry) => !rankedClauses.includes(entry)),
  ];
  const firstOtherSource = remaining.find((entry) => entry.sourceIndex !== primaryEntry.sourceIndex);
  const orderedFindings = [
    firstOtherSource,
    ...remaining.filter((entry) => entry !== firstOtherSource),
  ].filter(Boolean);
  const findings = orderedFindings
    .slice(0, 3)
    .map((entry) => completeSentence(entry.text))
    .filter((text, index, all) => text && text !== primary && all.indexOf(text) === index);
  const lead = /\b(?:may not|must not|not permitted|prohibited|no [a-z])\b/i.test(primary)
    ? `The cited official rule restricts this: ${primary}`
    : /\b(?:approval is required|must be submitted|shall be submitted|required to)\b/i.test(primary)
      ? `The cited official rule requires a specific step: ${primary}`
      : `The cited official rule says: ${primary}`;

  const answer = structuredHelpfulAnswer(
    lead,
    findings,
    "Open the linked official section and confirm the current detail before acting."
  );
  if (answerCoverageIssues(query, answer, sources).includes("direct-permission-answer-missing")) {
    return structuredHelpfulAnswer(
      "I could not verify whether the requested detail is covered by the selected official source.",
      [primary, ...findings].slice(0, 4),
      "Open the linked official section and confirm the current detail before acting."
    );
  }
  return answer;
}

function isSourceEvidenceBoundaryAnswer(answer = "") {
  return /Short answer:\s*(?:I don't have enough rulebook evidence to answer that confidently\.|I could not verify whether|The official passage I found mentions|The selected (?:official passages|rules|official passage).*(?:do not|does not|but))/i.test(
    String(answer || "")
  );
}

// Some official rules deliberately regulate a class of improvements without
// naming every resident term for a member of that class.  Those answers may
// explain the cited class and its limit, but must remain a boundary rather
// than becoming a verified yes/no for the resident's named project.
function isClassifiedProjectEvidenceBoundary(answer = "") {
  return /\b(?:rulebook|official (?:rule|passage|source)).{0,90}\bdoes not name\b.{0,70}\bspecifically\b/i.test(
    String(answer || "")
  );
}

function questionSpecificSourceAnswer(query, sources = []) {
  const clauses = sourceClauseCandidates(query, sources);
  if (!clauses.length) return "";
  const completeSentence = (value) => {
    const text = String(value || "").trim();
    return !text || /[.!?]["')\]]?$/.test(text) ? text : `${text}.`;
  };
  let primary = clauses[0].text;
  let findings = clauses
    .slice(1)
    .filter((entry) => entry.text !== primary)
    .slice(0, 3)
    .map((entry) => entry.text);
  if (isPlantListQuestion(query)) {
    const text = combinedSourceText(sources);
    const plantExamples = (startPattern, endPattern) => {
      const clean = cleanText(text);
      const start = clean.search(startPattern);
      if (start < 0) return [];
      const afterStart = clean.slice(start);
      const end = afterStart.slice(1).search(endPattern);
      const section = end >= 0 ? afterStart.slice(0, end + 1) : afterStart;
      const lines = section.split("\n").map((line) => line.trim()).filter(Boolean);
      const header = lines.findIndex((line) => /Bird Friendly/i.test(line));
      const examples = [];
      let pending = [];
      for (const line of lines.slice(header >= 0 ? header + 1 : 1)) {
        if (/^(?:Evergreen|Deciduous|Ornamental|Shrub|Perennial|Grass|Vine|Rose|✓)$/i.test(line)) {
          pending = [];
          continue;
        }
        if (/^\d+(?:\.\d+)?['"]\s*x\s*\d/i.test(line)) {
          const common = pending.slice(1).join(" ").replace(/\s+/g, " ").trim();
          if (common) {
            examples.push(common.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase()));
          }
          pending = [];
          if (examples.length >= 2) break;
          continue;
        }
        if (!/^(?:Botanical|Common|Ht x Spd|Type|Bird Friendly|\(\d+\))$/i.test(line)) pending.push(line);
      }
      return examples;
    };
    const low = plantExamples(/\(1\)\s*Low water need trees/i, /\(2\)\s*Low water need shrubs/i);
    const moderate = plantExamples(/\(3\)\s*Moderate water need trees/i, /\(4\)\s*Moderate water need shrubs/i);
    findings = [
      low.length ? `Low-water tree examples: ${low.join(" and ")}.` : "",
      moderate.length ? `Moderate-water tree examples: ${moderate.join(" and ")}.` : "",
      ...findings,
    ].filter(Boolean).slice(0, 3);
  }
  if (isOutdoorDecorativeObjectQuery(query)) {
    const frontRule = clauses.find((entry) => /front yard/i.test(entry.text) && /DRC approval is not required/i.test(entry.text));
    const rearRule = clauses.find((entry) => /rear yard/i.test(entry.text) && /DRC approval is not required/i.test(entry.text));
    const countLimit = clauses.find((entry) => /no more than three(?: \(3\))? ornaments/i.test(entry.text));
    const sizeLimit = clauses.find((entry) => /12 inches in height or width/i.test(entry.text));
    primary = (/\bfront yard\b/i.test(query) ? frontRule : rearRule)?.text || frontRule?.text || primary;
    findings = [countLimit, sizeLimit, rearRule, frontRule]
      .filter(Boolean)
      .map((entry) => entry.text)
      .filter((text, index, all) => text !== primary && all.indexOf(text) === index)
      .slice(0, 3);
  }
  const lead = isPlantListQuestion(query)
    ? `Allowed choices from the selected source: ${capitalizeFirstLetter(completeSentence(primary))}`
    : capitalizeFirstLetter(completeSentence(primary));
  return structuredHelpfulAnswer(
    lead,
    findings.map(completeSentence),
    "Open the linked official section if you need the complete wording."
  );
}

function seasonalLightingOverviewAnswer(sources = []) {
  const clauses = sourceClauseCandidates("seasonal decorative lighting", sources, { questionSpecificOnly: false });
  const periodClause = clauses.find((entry) =>
    /approved seasonal lighting periods/i.test(entry.text) && /\bfrom\b/i.test(entry.text)
  );
  if (!periodClause) return "";
  const removalClause = clauses.find((entry) =>
    /outside of these approved seasonal lighting periods|temporary string lighting.*required to be removed/i.test(entry.text)
  );
  const cutoffClause = clauses.find((entry) => /holiday lighting must be turned off by/i.test(entry.text)) ||
    clauses.find((entry) => /turned off by\s+\d{1,2}:\d{2}\s*p\.?m\.?/i.test(entry.text));
  const lead = `Allowed: ${capitalizeFirstLetter(periodClause.text)}`;
  const removalFinding = removalClause?.text.match(
    /all temporary string lighting and light installation clips are required to be removed/i
  )?.[0];
  return structuredHelpfulAnswer(
    lead,
    [removalFinding ? `${capitalizeFirstLetter(removalFinding)}.` : "", cutoffClause?.text]
      .filter(Boolean)
      .map((item) => capitalizeFirstLetter(item)),
    "Open the linked official section if you need the complete wording."
  );
}

function shedOverviewAnswer(sources = []) {
  const clauses = sourceClauseCandidates("backyard utility shed", sources, { questionSpecificOnly: false });
  const approvalClause = clauses.find((entry) => /shed.*approval is required|approval is required.*shed/i.test(entry.text));
  if (!approvalClause) return "";
  const approvalLead = approvalClause.text
    .split(/(?<=[.!?])\s+/)
    .find((sentence) => /DRC approval is required/i.test(sentence));
  const sourceText = combinedSourceText(sources).replace(/\n/g, " ");
  const heightClause = sourceText.match(/In general, backyard utility sheds should not exceed an overall height of [^.]+\./i)?.[0];
  const footprintClause = sourceText.match(/The shed footprint maximum is [^.]+\./i)?.[0];
  const utilitiesClause = sourceText.match(/Utilities to a backyard utility shed must be underground\./i)?.[0];
  const screeningClause = sourceText.match(/Backyard utility sheds must be screened with landscape plantings[^.]+\.(?:\s*Evergreen plantings[^.]+screening[^.]+\.)?/i)?.[0];
  const lead = capitalizeFirstLetter(approvalLead || approvalClause.text);
  return structuredHelpfulAnswer(
    lead,
    [
      [heightClause, footprintClause].filter(Boolean).join(" "),
      utilitiesClause,
      screeningClause,
    ].filter(Boolean),
    "Open the linked official section if you need the complete wording."
  );
}

function facilityRentalOverviewAnswer(query, sources = []) {
  const text = combinedSourceText(sources);
  if (!/Facilities Rental Application\s+and Agreement/i.test(text)) return "";

  const effectiveDate = text.match(/Effective\s+(January\s+1,\s+20\d{2})/i)?.[1] || "";
  const greatHall = text.match(
    /The Overlook Great Hall\s+\$([\d,.]+)\s+\$([\d,.]+)/i
  );
  const pavilion = text.match(
    /The Overlook Pavilion Nos?\.\s*1\s*&\s*2\s+\$([\d,.]+)\s*-\s*(\d+\s*hour minimum)\s+None required/i
  );
  const parks = text.match(
    /CAB Parks\s+\$([\d,.]+)\s*-\s*(\d+\s*hour minimum)\s+None required/i
  );
  if (!greatHall && !pavilion && !parks) return "";

  const reservationClause = text.match(/To make a reservation,[\s\S]*?Rental Agreement\./i)?.[0]
    ?.replace(/\s+/g, " ").trim();
  const paymentClause = text.match(/All fees and charges are due at the time of submission of the Rental Agreement\./i)?.[0];
  const priorityClause = text.match(/CAB programming, meetings and community events[\s\S]*?priority over private rental requests\./i)?.[0]
    ?.replace(/\s+/g, " ").trim();
  const reviewClause = text.match(/Rental requests are reviewed on a [\"“]first-come, first-served[\"”] basis[,.]?/i)?.[0];

  const asksGreatHall = /\bgreat hall\b/i.test(query);
  const asksPavilion = /\bpavilion\b/i.test(query);
  const asksPark = /\bparks?\b|\bpark shelters?\b/i.test(query);
  const priceDetails = [];
  if ((asksGreatHall || (!asksPavilion && !asksPark)) && greatHall) {
    priceDetails.push(
      `Great Hall: $${greatHall[1]} per hour with a $${greatHall[2]} security deposit.`
    );
  }
  if ((asksPavilion || (!asksGreatHall && !asksPark)) && pavilion) {
    priceDetails.push(
      `Pavilions 1 and 2: $${pavilion[1]} per hour with a ${pavilion[2]}; no security deposit is listed.`
    );
  }
  if (asksPark && parks) {
    priceDetails.push(
      `CAB parks: $${parks[1]} per hour with a ${parks[2]}; no security deposit is listed.`
    );
  }

  const pricingLead = priceDetails.length
    ? `The published fee section lists ${priceDetails.join(" ")}`
    : "";

  const parkResource = sources.find((source) => /park shelters/i.test(source.title || "")) ||
    OFFICIAL_AMENITY_RENTAL_RESOURCES.find((source) => source.id === "park-shelters");
  const catalogResource = sources.find((source) => /facility rentals catalog/i.test(source.title || "")) ||
    OFFICIAL_AMENITY_RENTAL_RESOURCES.find((source) => source.id === "facility-rental-catalog");
  const reservationLead = asksPark
    ? `Open the linked ${parkResource?.title || "official booking resource"} and ${catalogResource?.title || "official rental catalog"}. ${pricingLead}`
    : reservationClause
      ? `${capitalizeFirstLetter(reservationClause)} ${pricingLead}`
      : pricingLead;
  const nextStep = asksPark
    ? `${effectiveDate ? `These published amounts are labeled effective ${effectiveDate}. ` : ""}Open the linked ${parkResource?.title || "official booking resource"} and ${catalogResource?.title || "official rental catalog"}.`
    : `${effectiveDate ? `These published amounts are labeled effective ${effectiveDate}. ` : ""}Open the linked official source to confirm the current resource.`;

  return structuredHelpfulAnswer(
    reservationLead,
    [
      priceDetails.length ? `Published rates: ${priceDetails.join(" ")}` : "",
      paymentClause,
      [priorityClause, reviewClause].filter(Boolean).join(" "),
    ],
    nextStep
  );
}

function fenceAndShedOverviewAnswer(query, sources = [], index) {
  if (!/\bfenc(?:e|es|ing)\b/i.test(query) || !/\bsheds?\b/i.test(query)) return null;
  const fenceSource = sources.find((source) => /^Sec\. 21-23\. - Fencing standards/i.test(source.title || "")) ||
    combinedSourceByTitle(index, query, /^Sec\. 21-23\. - Fencing standards/i);
  const shedSource = sources.find((source) => /^Sec\. 21-22.*Backyard utility sheds/i.test(source.title || "")) ||
    combinedSourceByTitle(index, query, /^Sec\. 21-22.*Backyard utility sheds/i);
  if (!fenceSource || !shedSource) return null;

  const detailedSources = [fenceSource, shedSource, ...sources].filter(
    (source, position, all) =>
      source &&
      all.findIndex((candidate) => (candidate.nodeId || candidate.title) === (source.nodeId || source.title)) === position
  );

  const sourceClauses = (source) => sourceClauseCandidates(query, [source], {
    questionSpecificOnly: false,
    index,
  });
  const approvalClause = (source) => {
    const clauses = sourceClauses(source);
    return clauses.find((entry) => /(?:DRC|design review).{0,80}(?:approval|required)|approval.{0,80}(?:DRC|design review)/i.test(entry.text)) || clauses[0];
  };
  const fenceClause = approvalClause(fenceSource);
  const shedClause = approvalClause(shedSource);
  if (fenceClause && shedClause) {
    const fenceLabel = capitalizeFirstLetter((String(query).match(/\bfenc(?:e|es|ing)\b/i) || [fenceSource.title])[0]);
    const shedLabel = capitalizeFirstLetter((String(query).match(/\bsheds?\b/i) || [shedSource.title])[0]);
    const fenceText = String(fenceClause.text || "").trim();
    const shedText = String(shedClause.text || "").trim();
    const fenceConstruction = sourceClauseCandidates("fence three concrete rails", [fenceSource], { questionSpecificOnly: false, index })
      .find((entry) => /open-rail fence consisting of three concrete rails/i.test(entry.text))?.text;
    const shedRawText = shedSource.text || fullTextForSource(index, shedSource);
    const shedLimits = shedRawText.match(/In general, backyard utility sheds should not exceed[\s\S]*?case-by-case basis for approval\./i)?.[0]
      .replace(/\s+/g, " ").trim();
    const shedUtilities = shedRawText.match(/Utilities to a backyard utility shed must be underground\./i)?.[0];
    return {
      available: true,
      answer: structuredHelpfulAnswer(
        `${fenceLabel}: ${[fenceText, fenceConstruction].filter(Boolean).join(" ")}`,
        [
          `${shedLabel}: ${shedText}`,
          shedLimits,
          shedUtilities,
        ].filter(Boolean),
        ""
      ),
      sources: detailedSources.slice(0, 5),
      strategy: "official-clause-compound",
    };
  }

  return {
    available: true,
    answer: questionSpecificSourceAnswer(query, detailedSources) || sourceGroundedRuleAnswer(query, detailedSources, index),
    sources: detailedSources.slice(0, 5),
    strategy: "official-clause-compound",
  };
}

// Overview routing remains useful for broad resident questions, but the
// wording must always come from the currently retrieved official clauses.
function sourceClauseOverviewAnswer(query, sources = []) {
  return questionSpecificSourceAnswer(query, sources) || sourceGroundedRuleAnswer(query, sources);
}

function landscapeOverviewAnswer(sources = []) {
  const clauses = sourceClauseCandidates("landscape plan must be submitted for DRC approval", sources, {
    questionSpecificOnly: false,
  });
  const planClause = clauses.find((entry) => /Landscape and irrigation plans[\s\S]{0,120}must be submitted[\s\S]{0,120}(?:review and approval|DRC)/i.test(entry.text));
  if (!planClause) return sourceClauseOverviewAnswer("landscaping", sources);
  const maintenanceClause = clauses.find((entry) => /Landscaping is to be kept healthy/i.test(entry.text));
  const requirementLabel = sources.map((source) => source.title || "").join(" ").match(/\brequired\b/i)?.[0] || "";
  return structuredHelpfulAnswer(
    `${capitalizeFirstLetter(requirementLabel)}: ${String(planClause.text || "").trim()}`,
    [maintenanceClause?.text],
    ""
  );
}

function parksOpenSpaceOverviewAnswer(sources = []) {
  return sourceClauseOverviewAnswer("parks trails open space", sources);
}

function landscapeScreenOverviewAnswer(sources = []) {
  const text = combinedSourceText(sources).replace(/\n/g, " ");
  const approval = text.match(/Landscape screens\.\s*DRC approval is required\./i)?.[0];
  const height = text.match(/Five-foot maximum overall height[^.]+\.[^.]*six-foot maximum overall height[^.]+\./i)?.[0];
  const width = text.match(/Eight-foot maximum overall width[^.]+\./i)?.[0];
  const freestanding = text.match(/Must be freestanding in the rear or side yard\./i)?.[0];
  const locationAndCount = text.match(/Landscape screens are only allowed in rear or side yards and are not allowed in easements\.[^.]*maximum of three screens[^.]+\./i)?.[0];
  const transparency = text.match(/Landscape screens must have 30 percent required transparency\./i)?.[0];
  const vinyl = text.match(/Vinyl is not permitted\./i)?.[0];
  if (!approval) return sourceClauseOverviewAnswer("landscape screens", sources);
  const size = [height, width].filter(Boolean).join(" ");
  const placement = [freestanding, locationAndCount]
    .filter(Boolean)
    .join(" ")
    .replace(/are not allowed in easements/i, "must remain outside easements");
  const materials = [transparency, vinyl ? `Vinyl is not allowed under the cited material rule: ${vinyl}` : ""]
    .filter(Boolean)
    .join(" ");
  return structuredHelpfulAnswer(
    capitalizeFirstLetter(approval),
    [size, placement, materials],
    "Open the linked official section if you need the complete wording."
  );
}

function underEaveLightingOverviewAnswer(sources = []) {
  const clauses = sourceClauseCandidates("under-eave lighting application approval", sources, { questionSpecificOnly: false });
  const systemsClause = clauses.find((entry) => /systems are the approved systems/i.test(entry.text));
  const approvalClause = clauses.find((entry) => /subject to DRC approval/i.test(entry.text));
  const cutoffClause = clauses.find((entry) => /under-eave lighting must be turned off by/i.test(entry.text));
  const applicationClause = clauses.find((entry) => /must be submitted with the application/i.test(entry.text));
  if (!systemsClause || !approvalClause) return sourceClauseOverviewAnswer("under-eave lighting", sources);
  const lead = `${capitalizeFirstLetter(systemsClause.text)} ${capitalizeFirstLetter(approvalClause.text)}`;
  return structuredHelpfulAnswer(
    lead,
    [applicationClause, cutoffClause]
      .filter(Boolean)
      .map((entry) => capitalizeFirstLetter(entry.text)),
    "Open the linked official section if you need the complete wording."
  );
}

function trampolineOverviewAnswer(sources = []) {
  const text = combinedSourceText(sources).replace(/\n/g, " ");
  const approval = text.match(/Trampolines\.\s*DRC approval is required\./i)?.[0];
  const setback = text.match(/Trampolines should be installed[^.]+minimum of five feet from all property lines\./i)?.[0];
  const screening = text.match(/Tall plant material is required between the trampoline and all property lines[^.]+adjoining property\./i)?.[0];
  if (!approval) return sourceClauseOverviewAnswer("trampoline", sources);
  const approvalParts = approval.match(/^(Trampolines)\.\s*(DRC approval is required\.)$/i);
  return structuredHelpfulAnswer(
    approvalParts ? `${approvalParts[1]}: ${approvalParts[2]}` : capitalizeFirstLetter(approval),
    [setback, screening].filter(Boolean),
    "Open the linked official section if you need the complete wording."
  );
}

function requestedDuration(query) {
  const text = String(query || "").toLowerCase();
  const numberWords = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
    eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  };
  if (/\b(?:a|one) week\b/.test(text)) return { hours: 168, requestedText: "a week" };
  const match = text.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)[-\s]?(hours?|days?|nights?|overnights?)\b/);
  if (!match) return null;
  const amount = Number(match[1]) || numberWords[match[1]];
  const unit = match[2];
  const explicitlyMoreThan = new RegExp(`\\b(?:longer than|more than|over)\\s+${escapeRegExp(match[0])}`, "i").test(text);
  const baseHours = /^hour/.test(unit) ? amount : amount * 24;
  return {
    hours: explicitlyMoreThan ? baseHours + 0.01 : baseHours,
    nights: /night/.test(unit) ? amount : null,
    requestedText: `${explicitlyMoreThan ? "longer than " : ""}${amount} ${unit}`,
    label: `${explicitlyMoreThan ? "longer than " : ""}${amount} ${unit}`,
  };
}

function shortTermRentalOverviewAnswer(sources = []) {
  const clauses = sourceClauseCandidates("short-term rental", sources, { questionSpecificOnly: false });
  const restriction = clauses.find((entry) =>
    /Under no circumstance may .*short-term lodging|No residential property is allowed to be used for short-term/i.test(entry.text)
  );
  if (!restriction) return sourceClauseOverviewAnswer("short-term rental", sources);
  const related = clauses.find((entry) =>
    entry !== restriction && /short-term lodging|short-term, vacation property/i.test(entry.text)
  );
  const lead = `No. ${capitalizeFirstLetter(restriction.text)}`;
  return structuredHelpfulAnswer(
    lead,
    related ? [capitalizeFirstLetter(related.text)] : [],
    "Open the linked official section and confirm the current detail before acting."
  );
}

function wateringRestrictionOverviewAnswer(query, sources = []) {
  const sourceText = combinedSourceText(sources).replace(/\n/g, " ");
  const restriction = sourceText.match(/Outdoor irrigation is prohibited between the hours of \d{1,2}:\d{2}\s*a\.m\. and \d{1,2}:\d{2}\s*p\.m\. from [A-Z][a-z]+ \d{1,2} (?:to|through) [A-Z][a-z]+ \d{1,2}[^.]*\./i)?.[0];
  if (!restriction) return sourceClauseOverviewAnswer(query || "watering restriction", sources);
  const handWatering = sourceText.match(/Hand watering of landscape materials is allowed at any time\./i)?.[0];
  const residentText = String(query || "");
  const asksHandWatering = /\bhand water|watering can|drip|trickle|micro[-\s]?spray|deep[-\s]?root\b/i.test(residentText);
  const asksRestrictedTime = /\b(?:noon|midday|12(?::\d{2})?\s*p\.?m\.?|[1-5](?::\d{2})?\s*p\.?m\.?)\b/i.test(residentText);
  const asksRestrictedSeason = /\b(?:may|june|july|august|september|summer)\b/i.test(residentText);
  const lead = asksHandWatering && handWatering
    ? `Yes. ${handWatering}`
    : asksRestrictedTime && asksRestrictedSeason
      ? `No. ${restriction}`
      : capitalizeFirstLetter(restriction);
  return structuredHelpfulAnswer(
    lead,
    [restriction, handWatering].filter((item, index, all) => item && item !== lead && all.indexOf(item) === index),
    "Open the linked official section and confirm the current detail before acting."
  );
}

function fenceHeightOverviewAnswer(sources = []) {
  const heightSource = sources.find((source) => /Height:\s*[^\n.]+/i.test(source.text || source.excerpt || ""));
  const heightClause = (heightSource?.text || heightSource?.excerpt || "").match(/Height:\s*[^\n.]+/i)?.[0];
  if (!heightSource || !heightClause) return sourceClauseOverviewAnswer("fence height", sources);
  const clauses = sourceClauseCandidates("fence height style approval", sources, { questionSpecificOnly: false });
  const styleClause = clauses.find((entry) => /fenc(?:e|ing).*(?:three-rail|three concrete rails)|(?:three-rail|three concrete rails).*fenc/i.test(entry.text));
  const approvalClause = clauses.find((entry) => /Approval must be obtained from the DRC|DRC approval is required/i.test(entry.text));
  const sourcedHeightSentence = `${capitalizeFirstLetter(heightClause)}.`;
  const lead = styleClause
    ? `Fence height depends on the fence type and lot. The selected standard says ${capitalizeFirstLetter(styleClause.text)} ${sourcedHeightSentence}`
    : `Fence height depends on the fence type and lot. The selected standard says ${sourcedHeightSentence}`;
  return structuredHelpfulAnswer(
    lead,
    [approvalClause?.text].filter(Boolean),
    "Open the linked official section and confirm the current detail before acting."
  );
}

function trashStorageOverviewAnswer(query, sources = []) {
  const controllingSource = sources.find((source) => /2024 CAB Code amendments/i.test(source.title || "")) || sources[0];
  const sourceText = cleanText(controllingSource?.text || controllingSource?.excerpt || "").replace(/\n/g, " ");
  const storageClause = sourceText.match(/Trash shall not be stored or allowed to accumulate[^.]+(?:wing fence|garage)\./i)?.[0];
  if (!storageClause) return sourceClauseOverviewAnswer(query || "trash recycling storage", sources);
  const asksTiming = /\b(?:overnight|night|curb|pickup|collection|when|what time|tomorrow)\b/i.test(String(query || ""));
  const lead = asksTiming
    ? `The selected controlling source does not give a specific curb-placement or removal time. ${storageClause}`
    : capitalizeFirstLetter(storageClause);
  return structuredHelpfulAnswer(
    lead,
    [],
    "Open the linked official section and confirm the current detail before acting."
  );
}

function rvParkingOverviewAnswer(query, sources = []) {
  const clauses = sourceClauseCandidates(query || "recreational vehicle parking", sources, { questionSpecificOnly: false });
  const temporaryClause = clauses.find((entry) => /temporarily parked for a maximum of \d+ consecutive hours/i.test(entry.text));
  if (!temporaryClause) return sourceClauseOverviewAnswer(query || "recreational vehicle parking", sources);
  const hourLimit = Number(temporaryClause.text.match(/maximum of (\d+) consecutive hours/i)?.[1]);
  const duration = requestedDuration(query);
  const streetClause = clauses.find((entry) => /may not be parked on the street/i.test(entry.text));
  const overnightClause = clauses.find((entry) => /maximum amount of time.*three overnights|three overnights.*seven-day period/i.test(entry.text));
  const garageClause = clauses.find((entry) => /fit entirely within an enclosed garage|parked only in enclosed garages/i.test(entry.text));
  const circumventionClause = clauses.find((entry) => /movement of the vehicle.*circumventing|moving of the vehicle.*shall not relieve/i.test(entry.text));
  const lead = /\bstreet\b/i.test(query) && streetClause
    ? `No. ${capitalizeFirstLetter(streetClause.text)}`
    : duration && hourLimit && duration.hours > hourLimit
      ? `No. The requested stay of ${duration.requestedText} exceeds the source-derived ${hourLimit}-hour limit. ${capitalizeFirstLetter(temporaryClause.text)}`
      : `Yes, temporarily. ${capitalizeFirstLetter(temporaryClause.text)}`;
  return structuredHelpfulAnswer(
    lead,
    [temporaryClause, overnightClause, garageClause, circumventionClause]
      .filter(Boolean)
      .map((entry) => capitalizeFirstLetter(entry.text)),
    "Open the linked official section and confirm the current detail before acting."
  );
}

function vegetableGardenOverviewAnswer(sources = []) {
  const sourceText = combinedSourceText(sources).replace(/\n/g, " ");
  const approvalClause = sourceText.match(/DRC approval is required and will be reviewed on a case-by-case basis[^.]*\./i)?.[0];
  const placementClause = sourceText.match(/Vegetable gardens and raised beds[^.]*must be located in the rear or side yards\./i)?.[0];
  const boxesClause = sourceText.match(/Vegetable garden boxes shall:/i)?.[0];
  const setbackClause = sourceText.match(/Be located a minimum of five feet from all property lines\./i)?.[0];
  if (!approvalClause || !placementClause) return sourceClauseOverviewAnswer("vegetable gardens raised beds", sources);
  return structuredHelpfulAnswer(
    capitalizeFirstLetter(approvalClause),
    [placementClause, boxesClause && setbackClause ? `${boxesClause} ${setbackClause.toLowerCase()}` : setbackClause]
      .filter(Boolean)
      .map(capitalizeFirstLetter),
    "Open the linked official section and confirm the current detail before acting."
  );
}

function flagAndPoliticalSignOverviewAnswer(query, sources = []) {
  const clauses = sourceClauseCandidates(query || "flags political signage", sources, { questionSpecificOnly: false });
  const text = combinedSourceText(sources).replace(/\n/g, " ");
  const poleClause = clauses.find((entry) => /DRC approval is required for freestanding flagpoles/i.test(entry.text))
    || clauses.find((entry) => /DRC approved flagpole/i.test(entry.text));
  const sizeClause = clauses.find((entry) => /flag shall not exceed .* in size|maximum size of any one flag/i.test(entry.text));
  const commercialClause = clauses.find((entry) => /flags bearing commercial messages are prohibited/i.test(entry.text));
  const illuminationClause = clauses.find((entry) => /DRC approval.*separate nighttime illumination of a flag|separate nighttime illumination of a flag.*DRC approval/i.test(entry.text));
  const displayPoleClause = text.match(/An Owner or Occupant may display a flag on a unit owner's property[^.]+DRC approved flagpole\./i)?.[0];
  const politicalClause = text.match(/An Owner or Occupant may place political signs promoting or opposing a candidate for office or a ballot issue[^.]+such election\./i)?.[0];
  const politicalSizeClause = text.match(/no such sign shall exceed 36 inches by 48 inches in size\./i)?.[0];
  const allowedFrontFlags = clauses.find((entry) => /United States flag.*Colorado flag/i.test(entry.text));
  const asksHeight = /\bflag\s*poles?\b/i.test(query) && /\b(?:height|high|tall|maximum|max)\b/i.test(query);
  if (asksHeight && poleClause) {
    const poleLabel = poleClause.text.match(/freestanding flagpoles?/i)?.[0] || "requested item";
    const lead = `The current cited rule does not set a numeric maximum height for the ${poleLabel}. ${capitalizeFirstLetter(poleClause.text)}`;
    const flagSizeFinding = sizeClause
      ? `${capitalizeFirstLetter(sizeClause.text)} This limit applies to the flag itself, not the height of the pole.`
      : "";
    return structuredHelpfulAnswer(
      lead,
      [flagSizeFinding, illuminationClause?.text, commercialClause?.text].filter(Boolean),
      "Open the linked official section and confirm the current detail before acting."
    );
  }
  if (/\bpolitical sign/i.test(query) && politicalClause) {
    return structuredHelpfulAnswer(
      capitalizeFirstLetter(politicalClause),
      [politicalSizeClause].filter(Boolean),
      "Open the linked official section if you need the complete wording."
    );
  }
  if (allowedFrontFlags) {
    return structuredHelpfulAnswer(
      [allowedFrontFlags.text, displayPoleClause || poleClause?.text].filter(Boolean).map(capitalizeFirstLetter).join(" "),
      [sizeClause?.text, commercialClause?.text].filter(Boolean),
      "Open the linked official section if you need the complete wording."
    );
  }
  return sourceClauseOverviewAnswer(query || "flags political signage", sources);
}

function porchPatioLightingOverviewAnswer(sources = []) {
  const clauses = sourceClauseCandidates("exterior lighting outdoor living space 3000 Kelvin DRC approval", sources, { questionSpecificOnly: false });
  const approval = clauses.find((entry) => /DRC approval is required to modify or add exterior lighting/i.test(entry.text));
  const livingSpace = clauses.find((entry) => /outdoor living space \(such as a patio, porch, or deck\)/i.test(entry.text));
  const temperature = clauses.find((entry) => /color temperature of 3,000 Kelvin or less/i.test(entry.text));
  if (!approval || !livingSpace) return sourceClauseOverviewAnswer("outdoor living space lighting", sources);
  return structuredHelpfulAnswer(
    capitalizeFirstLetter(approval.text),
    [livingSpace.text, temperature?.text].filter(Boolean),
    "Open the linked official section if you need the complete wording."
  );
}

function petKeepingOverviewAnswer(query, sources = []) {
  const text = combinedSourceText(sources).replace(/\n/g, " ");
  const keepingClause = text.match(/No animals, livestock, fowl, or poultry of any kind shall be raised, bred or kept[\s\S]+?commercial purpose\./i)?.[0];
  if (!keepingClause) return "";
  const leashClause = text.match(/Pets shall not be allowed outside of an Owner's Residential Unit unless:[\s\S]{0,220}?direct control of the pet's owner or his representative/i)?.[0];
  const wasteClause = text.match(/All pet waste must be removed from any property immediately and disposed of properly\./i)?.[0];
  const nuisanceClause = text.match(/No animal shall be permitted to make an unreasonable amount of noise[^.]+\./i)?.[0];
  if (isPoultryQuery(query)) {
    return structuredHelpfulAnswer(
      `Prohibited under the cited rule: ${capitalizeFirstLetter(keepingClause)}`,
      [nuisanceClause].filter(Boolean),
      "Open the linked official section if you need the complete wording."
    );
  }
  return structuredHelpfulAnswer(
    `Allowed under the cited exception: ${capitalizeFirstLetter(keepingClause)}`,
    [leashClause ? `Outside the unit, pets must be leashed and under direct control: ${leashClause}` : "", wasteClause, nuisanceClause].filter(Boolean),
    "Open the linked official section if you need the complete wording."
  );
}

function greenhouseOverviewAnswer(sources = []) {
  const text = combinedSourceText(sources).replace(/\n/g, " ");
  const greenhouse = text.match(/Greenhouses\.\s*DRC approval is required\.[^.]*Accessory buildings\./i)?.[0];
  if (!greenhouse) return sourceClauseOverviewAnswer("greenhouse", sources);
  const greenhouseParts = greenhouse.match(/^(Greenhouses)\.\s*(DRC approval is required)\.\s*(See [^.]+Accessory buildings)\.$/i);
  return structuredHelpfulAnswer(
    greenhouseParts
      ? `${greenhouseParts[1]}: ${greenhouseParts[2]}. ${greenhouseParts[3]}.`
      : capitalizeFirstLetter(greenhouse),
    [],
    "Open the linked official section if you need the complete wording."
  );
}

function simpleTopicOverviewAnswer(query, sources = [], residentQuestion = query) {
  const text = combinedSourceText(sources);
  const inlineText = text.replace(/\n/g, " ");

  if (
    isStateParksPassQuestion(query) &&
    /Parks Pass Program Agreement/i.test(text) &&
    /Each Qualified Residence is allowed one Annual Pass per year/i.test(text)
  ) {
    const entitlement = inlineText.match(/Each Qualified Residence is allowed one Annual Pass per year\./i)?.[0];
    const voucher = inlineText.match(/The Voucher must be brought to the Sterling Ranch Information Center and exchanged for an Annual Pass\./i)?.[0];
    const ownershipTransfer = inlineText.match(/The property owner of record must submit an Application \(on file in the offices of the CAB\) and submit it to the CAB at the Sterling Ranch Information Center\. Once the Application is approved, the CAB will provide an Annual Pass to the Qualified Residence\./i)?.[0];
    const renewal = inlineText.match(/Owners of Qualified Residences may submit an Application for a new Annual Pass upon expiration of the initial or immediately preceding Annual Pass\. Once the Application is approved, the CAB will provide an Annual Pass to the Qualified Residence\./i)?.[0]
      || inlineText.match(/Owners of Qualified Residences may submit an Application for a new Annual Pass upon expiration of the initial or immediately preceding Annual Pass\./i)?.[0];
    const identification = inlineText.match(/Before the CAB provides an annual pass \(whether in exchange for a voucher or following an approved application\), the CAB will require presentation of government-issued photo identification and documentation of ownership \(discussed below\)\./i)?.[0];
    const asksReimbursement = /\b(?:reimburs\w*|refund\w*|pay(?:ing)? me back|bought|purchased)\b/i.test(query);
    const asksHowToGet = /\b(?:how|where)\b.{0,30}\b(?:get|obtain|renew|exchange|apply)\b|\b(?:get|obtain|renew|exchange|apply)\b.{0,30}\b(?:how|where)\b/i.test(query);
    const asksRenewal = /\b(?:renew\w*|expir\w*)\b/i.test(query);
    const asksOwnershipTransfer = /\b(?:resale|subsequent owner|transfer(?:red)? ownership|not (?:the )?(?:first|initial|original) owner)\b/i.test(query);
    const asksVoucher = /\b(?:voucher|first owner|initial owner|original owner|new homeowner|closing)\b/i.test(query);
    const lead = asksReimbursement
      ? `The selected source does not address reimbursement. ${entitlement}`
      : asksHowToGet
        ? "Use the applicable source path below for your situation."
        : capitalizeFirstLetter(entitlement);
    const allProcessPaths = [
      voucher ? `Voucher path: ${voucher}` : "",
      ownershipTransfer ? `Ownership-transfer path: ${ownershipTransfer}` : "",
      renewal ? `Renewal path: ${renewal}` : "",
    ].filter(Boolean);
    const processPaths = asksHowToGet
      ? asksRenewal
        ? allProcessPaths.filter((item) => /^Renewal path:/i.test(item))
        : asksOwnershipTransfer
          ? allProcessPaths.filter((item) => /^Ownership-transfer path:/i.test(item))
          : asksVoucher
            ? allProcessPaths.filter((item) => /^Voucher path:/i.test(item))
            : allProcessPaths
      : [voucher, renewal].filter(Boolean);
    return structuredHelpfulAnswer(
      lead,
      processPaths.filter((item, index, all) => item && !lead.includes(item) && all.indexOf(item) === index),
      asksHowToGet && identification
        ? capitalizeFirstLetter(identification)
        : "Open the linked official section if you need the complete wording."
    );
  }

  if (isPetKeepingQuery(query) && !isPoultryQuery(query) && /aggregate of not more than ([a-z0-9]+) domestic animals/i.test(text)) {
    return petKeepingOverviewAnswer(query, sources);
  }

  return "";
}

function conditionalRuleSourceAnswer(query, sources = []) {
  if (!/\bbasketball\b/i.test(query)) return "";
  const clauses = sourceClauseCandidates(query, sources, { questionSpecificOnly: false });
  const controlling = clauses.find((entry) => /approval is not required provided the following conditions are met/i.test(entry.text));
  const exception = clauses.find((entry) => /rear yard basketball courts require DRC approval/i.test(entry.text));
  if (!controlling || !exception) return "";
  const lead = exception.text.replace(/^Exception\.\s*/i, "");
  return structuredHelpfulAnswer(lead, [controlling.text]);
}

function projectionSourceText(source = {}) {
  if (source.ownerReviewApplied && source.ownerReview?.approvedAnswerEvidence) {
    return cleanText(source.ownerReview.approvedAnswerEvidence);
  }
  return cleanText(source.text || source.excerpt || "");
}

function projectionTitleTerms(source = {}) {
  const generic = new Set([
    "and", "charge", "charges", "current", "fee", "fees", "official", "policy",
    "rate", "rates", "resolution", "schedule", "service", "the",
  ]);
  return (String(source.title || "").toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter((term) => term.length > 2 && !/^20\d{2}$/.test(term) && !generic.has(term));
}

function parsedSourceFactRows(source = {}) {
  const text = projectionSourceText(source);
  if (!text) return [];
  const sourceYear = String(
    source.effectiveYear
      || source.title?.match(/\b(20\d{2})\b/)?.[1]
      || ""
  );
  let inheritedScope = cleanText(source.ownerReview?.approvedScope || source.title || "");

  return text
    .split(/(?<=[.!?])\s+|;\s+/)
    .map((piece) => cleanText(piece))
    .filter(Boolean)
    .flatMap((rowText, order) => {
      const facts = extractStructuredFacts(rowText, source);
      const firstFactOffset = facts.length
        ? Math.min(...facts.map((fact) => Number(fact.sourceOffset) || 0))
        : -1;
      const label = firstFactOffset >= 0
        ? cleanText(rowText.slice(0, firstFactOffset).replace(/[:,-]\s*$/, ""))
        : "";
      const statedScope = label.match(/^(.{2,120}?):/)?.[1] || label;
      if (statedScope && /:\s*/.test(rowText.slice(0, Math.max(firstFactOffset, 0)))) {
        inheritedScope = statedScope;
      }
      if (!facts.length) return [];
      return [{
        text: capitalizeFirstLetter(rowText),
        label,
        values: facts.map((fact) => fact.value),
        units: facts.map((fact) => fact.normalizedValue?.unit || fact.normalizedValue?.currency || "").filter(Boolean),
        year: sourceYear || facts.find((fact) => fact.kind === "year")?.value || "",
        scope: inheritedScope,
        facts,
        order,
      }];
    });
}

function sourceFactProjectionRowScore(query, source, row) {
  const queryTerms = expandQueryTerms(query);
  const titleTerms = projectionTitleTerms(source);
  const asksWhen = /\b(?:after|before|day|days|how long|start|when)\b/i.test(query);
  const asksAmount = /\b(?:amount|charge|cost|fee|fees|how much|rate|rates)\b/i.test(query);
  const broadQuestion = /^\s*(?:what|which)\s+are\b|\b(?:all|overview)\b/i.test(query);
  const scoringFacts = asksWhen
    ? row.facts.filter((fact) => ["date", "duration", "time", "year"].includes(fact.kind))
    : row.facts;
  const factScore = Math.max(
    0,
    ...scoringFacts.map((fact) => structuredFactScore(query, source, { ...fact, _displayContext: row.text }))
  );
  const queryScore = countTermMatches(`${row.label} ${row.text}`, queryTerms) * 55;
  const titleScopeScore = titleTerms.reduce(
    (score, term) => score + (textMatchesImportantTerm(`${row.label} ${row.text}`, term) ? 180 : 0),
    0
  );
  const requestedTitleTerms = titleTerms.filter((term) => textMatchesImportantTerm(query, term));
  const mismatchedTitleScopePenalty = !broadQuestion
    && requestedTitleTerms.length
    && !requestedTitleTerms.some((term) => textMatchesImportantTerm(`${row.label} ${row.text}`, term))
    && titleTerms.some((term) => textMatchesImportantTerm(`${row.label} ${row.text}`, term))
      ? 540
      : 0;
  const queryWords = String(query || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((term) => term.length > 2 && !["and", "are", "does", "for", "the", "what", "when"].includes(term));
  const normalizedRowText = row.text.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  const exactPhraseScore = asksWhen && queryWords.some((term, index) =>
    index < queryWords.length - 1 && normalizedRowText.includes(`${term} ${queryWords[index + 1]}`)
  ) ? 700 : 0;
  const kindScore = (
    asksWhen && row.facts.some((fact) => ["date", "duration", "time", "year"].includes(fact.kind))
      ? 220
      : 0
  ) + (
    asksAmount && row.facts.some((fact) => ["money", "percentage"].includes(fact.kind))
      ? 180
      : 0
  );
  const yearOnlyPenalty = row.facts.every((fact) => fact.kind === "year")
    && !extractQueryYears(query).length
      ? 900
      : 0;
  const missingTimePenalty = asksWhen
    && !row.facts.some((fact) => ["date", "duration", "time", "year"].includes(fact.kind))
      ? 900
      : 0;
  return factScore + queryScore + titleScopeScore + exactPhraseScore + kindScore
    - yearOnlyPenalty - missingTimePenalty - mismatchedTitleScopePenalty - (row.text.length / 20);
}

function sourceFactProjectionAnswer(query, sources = []) {
  const source = sources.find((candidate) => parsedSourceFactRows(candidate).length);
  if (!source) return null;
  const rows = parsedSourceFactRows(source)
    .map((row) => ({ ...row, score: sourceFactProjectionRowScore(query, source, row) }))
    .sort((left, right) => right.score - left.score || left.order - right.order);
  if (!rows.length || rows[0].score < 20) return null;

  const selectedRows = [];
  const asksConnectionAndFacility = /\b(?:connection|tap)\b/i.test(query) && /\bfacilit(?:y|ies)\b/i.test(query);
  if (asksConnectionAndFacility && /\btap and facility fees\b/i.test(source.title || "")) {
    const requestedFacetRows = [
      rows.find((row) => /\bResidential stormwater tap\b/i.test(row.text)),
      rows.find((row) => /\bResidential facilities fees\b/i.test(row.text)),
    ].filter(Boolean);
    selectedRows.push(...requestedFacetRows);
  }
  const asksAmount = /\b(?:amount|charge|cost|fee|fees|how much|rate|rates)\b/i.test(query);
  const timelineRows = isDelinquentAccountQuery(query) && !asksAmount
    ? rows.filter((row) =>
        row.facts.some((fact) => ["date", "duration", "time"].includes(fact.kind))
          && !row.facts.some((fact) => ["money", "percentage"].includes(fact.kind))
      )
    : [];
  const rankedRows = timelineRows.length
    ? [timelineRows[0], ...timelineRows.slice().sort((left, right) => left.order - right.order)]
    : rows;
  for (const row of rankedRows) {
    if (selectedRows.includes(row)) continue;
    const factKeys = new Set(row.facts.map((fact) => `${fact.kind}:${fact.value}:${fact.context}`));
    if (selectedRows.some((selected) => selected.facts.some((fact) => factKeys.has(`${fact.kind}:${fact.value}:${fact.context}`)))) {
      continue;
    }
    selectedRows.push(row);
    if (selectedRows.length >= (timelineRows.length ? 3 : 4)) break;
  }

  const title = cleanText(source.title || selectedRows[0].scope).replace(/[.:]\s*$/, "");
  const lead = title
    ? `${title}: ${selectedRows[0].text}`
    : selectedRows[0].text;
  return {
    answer: structuredHelpfulAnswer(
      lead,
      selectedRows.slice(1).map((row) => row.text),
      "Open the linked official section if you need the complete wording."
    ),
    sources: [source],
  };
}




function needsReadableTopicAnswer(query) {
  return (
    isAmenityReservationQuery(query) ||
    semanticConceptMatchesQuery("rental-cancellations", query) ||
    isShortTermRentalQuery(query) ||
    isWateringRestrictionQuery(query) ||
    isFenceHeightQuery(query) ||
    isTrashStorageQuery(query) ||
    isLandscapeScreenQuery(query) ||
    isLandscapeCompletionDeadlineQuery(query) ||
    isUnderEaveLightingQuery(query) ||
    isSeasonalLightingQuery(query) ||
    isShedQuery(query) ||
    isFlagQuery(query) ||
    isViolationProcessQuery(query) ||
    isDelinquentAccountQuery(query) ||
    isLandscapeOverviewQuery(query) ||
    isParksOpenSpaceOverviewQuery(query) ||
    isStateParksPassQuestion(query) ||
    isPoultryQuery(query) ||
    isPetKeepingQuery(query) ||
    isGreenhouseQuery(query) ||
    isPorchPatioLightingQuery(query) ||
    isFeeQuery(query) ||
    Boolean(sectionNumberQuestion(query)) ||
    /\b(trampolines?|rv|rvs|recreational vehicle|motor home|motorhome|camper|trailer|basketball|dog run|clubhouse|pool rules?|landscape lighting|commercial vehicle)\b/i.test(
      String(query || "")
    ) ||
    isVegetableGardenQuery(query)
  );
}

function answerAdmitsInsufficientEvidence(answer) {
  return /\b(?:I (?:do not|don't) have enough|I could not find|I couldn't find|not enough (?:information|evidence)|cannot give a (?:confident|definite)|can't give a (?:confident|definite))\b/i.test(
    String(answer || "")
  );
}

function moneyAfter(text, labelPattern, maxGap = 160) {
  const source = String(text || "");
  const match = new RegExp(
    `${labelPattern.source}[^$]{0,${maxGap}}\\$\\s*([\\d,]+(?:\\.\\d{1,2})?)`,
    labelPattern.flags.includes("i") ? "i" : ""
  ).exec(source);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : null;
}

function formatMoney(amount) {
  return `$${Number(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// This overview is assembled from the current official tables at response
// time. Keeping the extraction here means a future source refresh changes the
// answer automatically instead of leaving a hand-written fee summary stale.
function residentFeeOverviewAnswer(sources = []) {
  const waterSource = sources.find((source) =>
    /^20\d{2} water, sanitary sewer, and stormwater/i.test(source.title || "")
  );
  const serviceSource = sources.find((source) =>
    /^20\d{2} CAB service fees/i.test(source.title || "")
  );
  if (!waterSource || !serviceSource) return null;

  const waterText = waterSource.text || "";
  const serviceText = serviceSource.text || "";
  const amounts = {
    waterBase: moneyAfter(
      waterText,
      /Monthly Fee Residential \(per Unit\) Single Family Detached \(5\/8"\)/i
    ) || moneyAfter(waterText, /residential water base-rate rows: single-family detached/i),
    sewerBase: moneyAfter(
      waterText,
      /Monthly Base Fee Residential \(per Unit\) Single Family Detached/i
    ) || moneyAfter(waterText, /residential sanitary-sewer base-fee rows are/i),
    stormwater: moneyAfter(
      waterText,
      /Monthly Charge Residential \(per Unit\) Single Family Detached/i
    ) || moneyAfter(waterText, /residential stormwater rows are/i),
    indoorWater: moneyAfter(
      waterText,
      /Tier residential and non-residential Fee per 1,000 gallons Tier 1 < 100% of AWC/i
    ) || moneyAfter(waterText, /residential indoor-water tiers are/i),
    sewerUsage: moneyAfter(
      waterText,
      /Fee per 1,000 gallons of Indoor Water Use Residential \(per Unit\) Single Family Detached/i
    ) || moneyAfter(waterText, /residential indoor-water use is/i),
    streetlight: moneyAfter(
      serviceText,
      /Streetlight Monthly Charge Residential \(per unit\) Single Family/i
    ) || moneyAfter(serviceText, /Residential streetlight charge is/i),
    trash: moneyAfter(
      serviceText,
      /Trash Monthly Charge Residential \(per unit\) Single Family/i
    ) || moneyAfter(serviceText, /Residential trash charge is/i),
    sharedDriveway: moneyAfter(
      serviceText,
      /Driveway Maintenance Monthly Charge Shared Driveways/i
    ) || moneyAfter(serviceText, /Shared-driveway maintenance is/i),
    alleyLoad: moneyAfter(serviceText, /Alley Load Homes/i) || moneyAfter(serviceText, /alley-load-home maintenance is/i),
  };

  if (Object.values(amounts).some((amount) => amount === null)) return null;

  const fixedTotal =
    amounts.waterBase +
    amounts.sewerBase +
    amounts.stormwater +
    amounts.streetlight +
    amounts.trash;
  const optionalCharges = [
    amounts.sharedDriveway !== null && `shared-driveway maintenance ${formatMoney(amounts.sharedDriveway)}`,
    amounts.alleyLoad !== null && `alley-load-home maintenance ${formatMoney(amounts.alleyLoad)}`,
  ].filter(Boolean);

  return [
    `Short answer: For a typical single-family detached home with a standard individual meter, the fixed charges in the current schedules add up to ${formatMoney(fixedTotal)} each month, before water and sewer usage.`,
    "",
    "What I found:",
    `- Typical fixed monthly charges: water ${formatMoney(amounts.waterBase)}, sewer ${formatMoney(amounts.sewerBase)}, stormwater ${formatMoney(amounts.stormwater)}, streetlight ${formatMoney(amounts.streetlight)}, and trash ${formatMoney(amounts.trash)}.`,
    `- Charges that depend on usage: indoor water starts at ${formatMoney(amounts.indoorWater)} per 1,000 gallons, and sewer usage is ${formatMoney(amounts.sewerUsage)} per 1,000 gallons of indoor water use.`,
    ...(optionalCharges.length ? [`- Charges that apply only to some homes: ${optionalCharges.join(", ")}.`] : []),
    "",
    "Before you act: Your actual bill can differ based on your home type, meter setup, water use, and whether a lot-specific charge applies. Use the official schedules below to match your exact category.",
  ].join("\n");
}

function sourceDerivedAnswerParts(query, sources, originalAnswer = "", residentQuestion = query) {
  if (isStateParksPassQuestion(residentQuestion) || isStateParksPassQuestion(query)) {
    const answer = simpleTopicOverviewAnswer(query, sources, residentQuestion);
    if (answer) return { available: true, answer, sources, strategy: "structured" };
  }

  if (isShortTermRentalQuery(residentQuestion) || isShortTermRentalQuery(query)) {
    const answer = shortTermRentalOverviewAnswer(sources);
    if (answer) return { available: true, answer, sources, strategy: "structured" };
  }

  if (isPoultryQuery(query) || isPetKeepingQuery(query)) {
    const answer = petKeepingOverviewAnswer(query, sources);
    if (answer) return { available: true, answer, sources, strategy: "structured" };
  }

  if (isGreenhouseQuery(query)) {
    const answer = greenhouseOverviewAnswer(sources);
    if (answer) return { available: true, answer, sources, strategy: "structured" };
  }

  if (isPorchPatioLightingQuery(query)) {
    const answer = porchPatioLightingOverviewAnswer(sources);
    if (answer) return { available: true, answer, sources, strategy: "structured" };
  }

  if (isWateringRestrictionQuery(residentQuestion) || isWateringRestrictionQuery(query)) {
    const answer = wateringRestrictionOverviewAnswer(residentQuestion, sources);
    if (answer) return { available: true, answer, sources, strategy: "structured" };
  }

  if (isFenceHeightQuery(residentQuestion) || isFenceHeightQuery(query)) {
    const answer = fenceHeightOverviewAnswer(sources);
    if (answer) return { available: true, answer, sources, strategy: "structured" };
  }

  if (isTrashStorageQuery(residentQuestion) || isTrashStorageQuery(query)) {
    const answer = trashStorageOverviewAnswer(residentQuestion, sources);
    if (answer) return { available: true, answer, sources, strategy: "structured" };
  }

  if (isVegetableGardenQuery(residentQuestion) || isVegetableGardenQuery(query)) {
    const answer = vegetableGardenOverviewAnswer(sources);
    if (answer) return { available: true, answer, sources, strategy: "structured" };
  }

  if (isLandscapeScreenQuery(query)) {
    const answer = landscapeScreenOverviewAnswer(sources);
    if (answer) return { available: true, answer, sources, strategy: "structured" };
  }

  if (isUnderEaveLightingQuery(query)) {
    const answer = underEaveLightingOverviewAnswer(sources);
    if (answer) return { available: true, answer, sources, strategy: "structured" };
  }

  if (isSeasonalLightingQuery(query)) {
    const answer = seasonalLightingOverviewAnswer(sources);
    if (answer) return { available: true, answer, sources, strategy: "structured" };
  }

  if (isShedQuery(query)) {
    const answer = shedOverviewAnswer(sources);
    if (answer) return { available: true, answer, sources, strategy: "structured" };
  }

  if (/\btrampolines?\b/i.test(query)) {
    const answer = trampolineOverviewAnswer(sources);
    if (answer) return { available: true, answer, sources, strategy: "structured" };
  }

  if (/\b(rv|rvs|recreational vehicle|motor home|motorhome|camper|trailer)\b/i.test(query)) {
    const answer = rvParkingOverviewAnswer(residentQuestion, sources);
    if (answer) return { available: true, answer, sources, strategy: "structured" };
  }

  if (isFlagQuery(query)) {
    const answer = flagAndPoliticalSignOverviewAnswer(query, sources);
    if (answer) return { available: true, answer, sources, strategy: "structured" };
  }

  if (isAmenityReservationQuery(query)) {
    const answer = facilityRentalOverviewAnswer(residentQuestion, sources);
    if (answer) return { available: true, answer, sources, strategy: "structured" };
  }

  if (isResidentFeeOverviewQuery(query)) {
    const overviewAnswer = residentFeeOverviewAnswer(sources);
    if (overviewAnswer) {
      const fixedTotalMatch = overviewAnswer.match(/add up to (\$[\d,.]+) each month/i);
      const overviewSources = sources
        .filter((source) => /^20\d{2} (?:water, sanitary sewer, and stormwater|CAB service fees)/i.test(source.title || ""))
        .map((source, index) => ({
          ...source,
          derivedFacts: index === 0 && fixedTotalMatch
            ? [`Calculated fixed-charge subtotal: ${fixedTotalMatch[1]}.`]
            : [],
        }));
      return { available: true, answer: overviewAnswer, sources: overviewSources, strategy: "structured" };
    }
  }

  if (isLandscapeOverviewQuery(query)) {
    const answer = landscapeOverviewAnswer(sources);
    if (answer) return { available: true, answer, sources, strategy: "structured" };
  }

  if (semanticConceptMatchesQuery("rental-cancellations", query)) {
    const cancellationClause = sourceClauseCandidates(query, sources, { questionSpecificOnly: false })
      .find((entry) => /Refunds for cancellations of facility rentals/i.test(entry.text));
    const agreement = cancellationClause?.text.match(/Rental Agreement/i)?.[0];
    if (cancellationClause && agreement) {
      return {
        available: true,
        answer: structuredHelpfulAnswer(
          capitalizeFirstLetter(cancellationClause.text),
          [],
          "Open the linked official section and confirm the current detail before acting."
        ),
        sources,
        strategy: "official-clause",
      };
    }
  }

  if (isHotTubQuery(query)) {
    const clauses = sourceClauseCandidates(query, sources, { questionSpecificOnly: false });
    const approvalClause = clauses.find((entry) => /(?:hot tubs?|outdoor spas?|outdoor saunas?).{0,120}DRC approval|required.{0,120}(?:hot tubs?|outdoor spas?)/i.test(entry.text));
    const placementClause = clauses.find((entry) => /(?:rear yards?|utility easements?|property lines?)/i.test(entry.text));
    if (approvalClause) {
      return {
        available: true,
        answer: structuredHelpfulAnswer(capitalizeFirstLetter(approvalClause.text), [placementClause?.text].filter(Boolean), "Open the linked official section and confirm the current detail before acting."),
        sources,
        strategy: "official-clause",
      };
    }
  }

  if (/\bcatio\b/i.test(query)) {
    const clauses = sourceClauseCandidates(query, sources, { questionSpecificOnly: false });
    const accessoryClause = clauses.find((entry) => /Accessory buildings\.\s*DRC approval is required/i.test(entry.text));
    const petAreaClause = clauses.find((entry) => /Doghouses and outdoor pet areas/i.test(entry.text));
    const requestedProject = String(query).match(/\bcatio\b/i)?.[0] || "project";
    if (accessoryClause || petAreaClause) {
      return {
        available: true,
        answer: structuredHelpfulAnswer(
          `The selected official rules do not name ${requestedProject} specifically.`,
          [accessoryClause?.text, petAreaClause?.text].filter(Boolean),
          "Open the linked official section and confirm the current detail before acting."
        ),
        sources,
        strategy: "official-clause",
      };
    }
  }

  const questionSpecificAnswer = questionSpecificSourceAnswer(query, sources);
  if (questionSpecificAnswer) {
    return { available: true, answer: questionSpecificAnswer, sources, strategy: "official-clause" };
  }

  const conditionalAnswer = conditionalRuleSourceAnswer(query, sources);
  if (conditionalAnswer) return { available: true, answer: conditionalAnswer, sources, strategy: "official-clause" };

  if ((isFeeQuery(query) && !isResidentFeeOverviewQuery(query)) || isViolationProcessQuery(query) || isDelinquentAccountQuery(query)) {
    const projection = sourceFactProjectionAnswer(query, sources);
    if (projection) {
      return {
        available: true,
        answer: projection.answer,
        sources: projection.sources,
        strategy: "source-projection",
      };
    }
  }

  // Fee amounts need the source-derived path instead of a general clause
  // with a short, non-factual display excerpt.
  const sourceAnswer = isFeeQuery(query) ? "" : sourceGroundedRuleAnswer(query, sources);
  if (sourceAnswer) {
    if (summaryHasVolatileFacts(originalAnswer)) {
      const refreshedSources = sourceDerivedFactSources(query, sources);
      if (refreshedSources.length) {
        const stableLead = stableLeadFromAnswer(originalAnswer);
        return {
          available: true,
          answer: stableLead
            ? helpfulAnswer(stableLead, refreshedSources, "Open the linked official section and confirm the current detail before acting.")
            : sourceAnswer,
          sources: refreshedSources,
          strategy: "official-clause",
        };
      }
    }
    return { available: true, answer: sourceAnswer, sources, strategy: "official-clause" };
  }

  const topicAnswer = simpleTopicOverviewAnswer(query, sources, residentQuestion);
  if (topicAnswer) return { available: true, answer: topicAnswer, sources, strategy: "structured" };

  if (isResidentFeeOverviewQuery(query)) {
    const overviewAnswer = residentFeeOverviewAnswer(sources);
    if (overviewAnswer) {
      const fixedTotalMatch = overviewAnswer.match(/add up to (\$[\d,.]+) each month/i);
      const overviewSources = sources
        .filter((source) =>
          /^20\d{2} (?:water, sanitary sewer, and stormwater|CAB service fees)/i.test(
            source.title || ""
          )
        )
        .map((source, index) => ({
          ...source,
          derivedFacts:
            index === 0 && fixedTotalMatch
              ? [`Calculated fixed-charge subtotal: ${fixedTotalMatch[1]}.`]
              : [],
        }));
      return {
        available: true,
        answer: overviewAnswer,
        sources: overviewSources,
        strategy: "structured",
      };
    }
  }

  if (isParksOpenSpaceOverviewQuery(query)) {
    const answer = parksOpenSpaceOverviewAnswer(sources);
    if (answer) return { available: true, answer, sources, strategy: "structured" };
  }

  const factSources = sourceDerivedFactSources(query, sources);
  const hasCurrentFacts = factSources.some(
    (source) => Array.isArray(source.structuredFacts) && source.structuredFacts.length
  );

  const stableLead = stableLeadFromAnswer(originalAnswer);

  if (!hasCurrentFacts && !stableLead) {
    return {
      available: false,
      answer: helpfulAnswer(
        "I found a relevant official section, but I could not extract its current date, amount, or limit safely.",
        factSources,
        "Open the linked official section and confirm the current detail before acting."
      ),
      sources: factSources,
      strategy: "unavailable",
    };
  }

  if (!hasCurrentFacts) {
    return {
      available: true,
      answer: helpfulAnswer(
        stableLead,
        sources,
        "Open the linked official section if you need the complete wording."
      ),
      sources,
      strategy: "extractive",
    };
  }

  const requestedMoneyLead = isFeeQuery(query)
    ? factSources
      .flatMap((source) => String(source.excerpt || "").split(/(?<=[.!?])\s+/))
      .filter((sentence) => /\$\s*\d/.test(sentence))
      .slice(0, 2)
      .join(" ")
    : "";

  return {
    available: true,
    answer: helpfulAnswer(
      requestedMoneyLead
        ? requestedMoneyLead
        : stableLead
        ? `${stableLead} I pulled the changing dates, amounts, and limits from the current controlling source below.`
        : "I pulled the controlling dates, amounts, and limits from the current official source below.",
      factSources,
      "Use these current source details for planning, and open the linked section if you need the complete wording."
    ),
    sources: factSources,
    strategy: "extractive",
  };
}

function compoundSourceDerivedAnswer(query, sources, index) {
  if (!Array.isArray(sources) || sources.length < 2) return null;

  const detailedProjectAnswer = fenceAndShedOverviewAnswer(query, sources, index);
  if (detailedProjectAnswer) return detailedProjectAnswer;

  const terms = [];
  for (const term of importantQueryTerms(query)) {
    if (COMPOUND_CONTEXT_TERMS.has(term)) continue;
    if (!terms.some((existing) => queryTermsDescribeSameThing(existing, term))) {
      terms.push(term);
    }
  }

  const findings = [];
  const usedTerms = new Set();
  for (const source of sources) {
    const matchedTerms = source.matchStats?.matchedOriginalTerms || [];
    const term = terms.find((candidate) =>
      matchedTerms.some((matched) => matched === candidate || matched === `${candidate}s`)
    );
    if (!term || usedTerms.has(term)) continue;

    const plain = buildPlainAnswer(term, [source], index, [source]);
    const needsDerived = summaryHasVolatileFacts(plain) || needsReadableTopicAnswer(term);
    const part = needsDerived
      ? sourceDerivedAnswerParts(term, [source], plain)
      : { available: true, answer: plain };
    const summary = part.available ? shortAnswerSummary(part.answer) : "";
    if (!summary) continue;

    findings.push(`${capitalizeFirstLetter(term)}: ${summary}`);
    usedTerms.add(term);
  }

  if (findings.length < 2) return null;
  return {
    available: true,
    answer: findings.join(String.fromCharCode(10)),
    sources,
    strategy: "structured-compound",
  };
}

async function answerRulesQuestion(query, options = {}) {
  const input = classifyRulesInput(query);
  const question = cleanText(normalizeResidentQuestion(input.normalized));
  const indexPath = options.indexPath || DEFAULT_INDEX_PATH;
  const searchMode = options.searchMode || getRulesSearchMode();
  const questionWordCount = (question.match(/[a-z0-9']+/gi) || []).length;
  const aiSearchCanInterpretUnclear =
    searchMode === "ai-hybrid" &&
    input.classification === INPUT_CLASSIFICATIONS.UNCLEAR &&
    input.reason === "missing-topic" &&
    questionWordCount >= 4 &&
    !/^what about (?:that|this|it|them|those)[?.!\s]*$/i.test(question);

  if (input.classification === INPUT_CLASSIFICATIONS.PROMPT_INJECTION) {
    return {
      answer: unclearAnswer([]),
      answerMode: "safety",
      answerVerdict: "unverified",
      inputClassification: input.classification,
      confidence: {
        canAnswer: false,
        confidence: "high",
        reason: "prompt-injection-rejected",
      },
      reviewNeeded: false,
      sources: [],
    };
  }

  if (input.classification === INPUT_CLASSIFICATIONS.CONVERSATION) {
    return {
      answer: unclearAnswer([]),
      answerMode: "conversation",
      answerVerdict: "informational",
      inputClassification: input.classification,
      confidence: {
        canAnswer: false,
        confidence: "high",
        reason: "conversation-not-rule-question",
      },
      reviewNeeded: false,
      sources: [],
    };
  }

  if (input.classification === INPUT_CLASSIFICATIONS.UNCLEAR && input.reason === "incomplete-statement") {
    return {
      answer: structuredHelpfulAnswer(
        "What would you like to know or do?",
        [],
        "Tell me the question, task, or problem you want help with."
      ),
      answerMode: "targeted-clarification",
      answerVerdict: "informational",
      inputClassification: input.classification,
      confidence: { canAnswer: false, confidence: "high", reason: "incomplete-statement" },
      reviewNeeded: false,
      sources: [],
    };
  }

  if (
    input.classification === INPUT_CLASSIFICATIONS.UNRELATED &&
    (searchMode !== "ai-hybrid" || input.reason === "known-unrelated-topic")
  ) {
    return {
      answer: unclearAnswer([]),
      answerMode: "conversation",
      answerVerdict: "informational",
      inputClassification: input.classification,
      confidence: {
        canAnswer: false,
        confidence: "high",
        reason: "unrelated-not-rule-question",
      },
      reviewNeeded: false,
      sources: [],
    };
  }

  if (/^pickle\s*ball[?.!]*$/i.test(question)) {
    return {
      answer: structuredHelpfulAnswer(
        "Do you mean using a community court or building a private court at a home?",
        [],
        "Tell me which court you mean so I can use the matching official source."
      ),
      answerMode: "targeted-clarification",
      answerVerdict: "unverified",
      inputClassification: INPUT_CLASSIFICATIONS.UNCLEAR,
      confidence: { canAnswer: false, confidence: "high", reason: "public-private-court-clarification" },
      reviewNeeded: false,
      sources: [],
    };
  }

  if (/\b(?:atlas coffee wifi|atlas wifi)\b/i.test(question)) {
    const requestedService = question.match(/\batlas\s+(?:coffee\s+)?wi-?fi\b/i)?.[0] || "the requested service";
    const resource = officialResourceSource({
      id: "cab-website",
      title: "Official Sterling Ranch CAB website",
      url: CAB_SITE_URL,
      excerpt: `Requested topic: ${requestedService}.`,
    });
    return {
      answer: structuredHelpfulAnswer(
        `The rulebook search does not define ${requestedService} or publish current access details.`,
        [],
        "Open the linked official CAB website to confirm the current service details."
      ),
      answerMode: "official-resource",
      answerVerdict: "informational",
      inputClassification: INPUT_CLASSIFICATIONS.RULES_QUESTION,
      confidence: { canAnswer: true, confidence: "high", reason: "official-resource-boundary" },
      reviewNeeded: false,
      sources: [resource],
    };
  }

  if (input.classification === INPUT_CLASSIFICATIONS.UNCLEAR && !aiSearchCanInterpretUnclear) {
    return {
      answer: unclearAnswer([]),
      answerMode: "conversation",
      answerVerdict: "informational",
      inputClassification: input.classification,
      confidence: {
        canAnswer: false,
        confidence: "high",
        reason: "unclear-input",
      },
      reviewNeeded: false,
      sources: [],
    };
  }

  const index = await loadRulesIndex(indexPath);
  const status = await getRulesIndexStatus(indexPath);

  if (!index) {
    return {
      answer:
        "I could not find a local rulebook index yet. Please refresh the source index, then try the question again.",
      sources: [],
      inputClassification: input.classification,
      sourceStatus: status,
    };
  }

  if (/\bcatio\b/i.test(question)) {
    const accessoryDocument = (index.documents || []).find((document) =>
      /^Sec\. 21-22\. - General community standards/i.test(document.title || "") &&
      /Accessory buildings\.\s*DRC approval is required/i.test(document.text || "")
    );
    const petAreaDocument = (index.documents || []).find((document) =>
      /^Sec\. 21-22\. - General community standards/i.test(document.title || "") &&
      /Doghouses and outdoor pet areas/i.test(document.text || "")
    );
    const catioSources = [accessoryDocument, petAreaDocument]
      .filter(Boolean)
      .map((document) => sourceFromDocument(document, question, 1200));
    if (catioSources.length) {
      const clauses = sourceClauseCandidates(question, catioSources, { questionSpecificOnly: false });
      const accessoryClause = clauses.find((entry) => /Accessory buildings\.\s*DRC approval is required/i.test(entry.text));
      const petAreaClause = clauses.find((entry) => /Doghouses and outdoor pet areas/i.test(entry.text));
      if (accessoryClause || petAreaClause) {
        return {
          answer: structuredHelpfulAnswer(
            `The selected official rules do not name ${String(question).match(/\bcatio\b/i)?.[0] || "project"} specifically.`,
            [accessoryClause?.text, petAreaClause?.text].filter(Boolean),
            "Open the linked official section and confirm the current detail before acting."
          ),
          answerMode: "source-evidence-boundary",
          answerVerdict: "unverified",
          inputClassification: input.classification,
          confidence: { canAnswer: false, confidence: "high", reason: "named-project-not-supported-by-cited-evidence" },
          reviewNeeded: false,
          sources: catioSources,
          sourceStatus: status,
        };
      }
    }
  }

  let searchPlan = null;
  let routingQuery = question;
  let results;
  if (searchMode === "ai-hybrid") {
    // The shared interpreter has already selected rules. Try the complete,
    // source-grounded answer before making a second interpretation request.
    // Ambiguous and incomplete answers still use the full hybrid search.
    if (options.interpretation?.intent === "rules"
      && !options.interpretation.needsClarification
      && input.classification === INPUT_CLASSIFICATIONS.RULES_QUESTION) {
      const groundedAnswer = await answerRulesQuestion(question, {
        ...options, searchMode: "legacy", llmMode: "off",
      });
      if (groundedAnswer.confidence?.canAnswer === true
        && groundedAnswer.answerVerdict !== "unverified"
        && groundedAnswer.answerMode !== "source-conflict"
        && answerCoverageIssues(question, groundedAnswer.answer, groundedAnswer.sources).length === 0) {
        return { ...groundedAnswer, searchMode, searchStrategy: "shared-interpretation-strong-match" };
      }
    }
    const planner = options.planRulesSearch || planRulesSearch;
    searchPlan = await planner(question);

    // Residential short-term rentals and facility rentals share words such as
    // "rent" and "booking," but they are governed by entirely different rules.
    // Keep a bad planner label from sending Airbnb/VRBO questions to amenity fees.
    if (isShortTermRentalQuery(question)) {
      searchPlan = {
        ...(searchPlan || {}),
        inScope: "yes",
        intent: "residential_rental",
        normalizedQuestion: question,
        searchQueries: ["short-term lodging vacation rental residence Airbnb VRBO"],
        entities: [],
      };
    }

    // The AI layer is a fallback/expansion layer, not a replacement for an
    // answer the proven deterministic system already handles well. Facility
    // searches are the exception because named amenities and cancellation
    // language are exactly the gaps this layer is designed to interpret.
    const sharedInterpretationIntent = String(options.interpretation?.intent || "");
    const plannerMayUseFacilityRouting = !sharedInterpretationIntent
      || sharedInterpretationIntent === "facilities";
    if (
      input.classification === INPUT_CLASSIFICATIONS.RULES_QUESTION &&
      (
        !["facility_reservation", "rental_cancellation", "residential_rental"].includes(searchPlan?.intent)
        || !plannerMayUseFacilityRouting
      )
    ) {
      const legacyAnswer = await answerRulesQuestion(question, {
        ...options,
        searchMode: "legacy",
      });
      if (
        legacyAnswer.confidence?.canAnswer === true &&
        legacyAnswer.answerVerdict !== "unverified" &&
        legacyAnswer.answerMode !== "source-conflict" &&
        answerCoverageIssues(question, legacyAnswer.answer, legacyAnswer.sources).length === 0
      ) {
        return {
          ...legacyAnswer,
          searchMode,
          searchStrategy: "legacy-strong-match-preserved",
        };
      }
    }

    const retrievalQueries = buildRetrievalQueries(question, searchPlan);
    results = mergeHybridSearchResults(index, retrievalQueries, searchRulesIndex, 12);
    const reranker = options.rerankRulesSources || rerankRulesSources;
    results = await reranker(question, results, searchPlan);
    routingQuery = buildRoutingQuery(question, searchPlan) || question;

    if (
      input.classification !== INPUT_CLASSIFICATIONS.RULES_QUESTION &&
      !sourceEvidenceSupportsScope(results, searchPlan)
    ) {
      return {
        answer: unclearAnswer([]),
        answerMode: "conversation",
        answerVerdict: "informational",
        inputClassification: input.classification,
        confidence: {
          canAnswer: false,
          confidence: "high",
          reason: "ai-search-no-source-evidence",
        },
        reviewNeeded: false,
        searchMode,
        sources: [],
      };
    }
  } else {
    results = searchRulesIndex(index, question, 6);
  }

  const effectiveInputClassification =
    input.classification !== INPUT_CLASSIFICATIONS.RULES_QUESTION && searchMode === "ai-hybrid"
      ? INPUT_CLASSIFICATIONS.RULES_QUESTION
      : input.classification;
  const topScore = Math.max(...results.map((result) => Number(result.score) || 0), 0);
  let directSpecialSources = specialSourcesForQuestion(index, question);
  if (!directSpecialSources.length && isPorchPatioLightingQuery(question)) {
    const policyDocument = (index.documents || []).find((document) =>
      /^Sec\. 21-22\(b\)\(56\).*Updated exterior lighting policy/i.test(document.title || "")
    );
    directSpecialSources = policyDocument ? [sourceFromDocument(policyDocument, question, 180)] : [];
  }
  if (directSpecialSources.length) routingQuery = question;
  const sources = chapterSources(index, routingQuery, 5);
  let specialSources = directSpecialSources.length
    ? directSpecialSources
    : specialSourcesForQuestion(index, routingQuery);
  if (isPorchPatioLightingQuery(routingQuery)) {
    const policyDocument = (index.documents || []).find((document) =>
      /^Sec\. 21-22\(b\)\(56\).*Updated exterior lighting policy/i.test(document.title || "")
    );
    if (policyDocument) specialSources = [sourceFromDocument(policyDocument, routingQuery, 180)];
  }
  let fallbackSources = focusedSourcesForQuestion(routingQuery, meaningfulSources(results, 5), 5);
  if (isWateringRestrictionQuery(routingQuery)) {
    fallbackSources = fallbackSources
      .filter((source) => /13-105|water conservation measures/i.test(source.title || ""))
      .slice(0, 1);
  }
  if (isFlagQuery(routingQuery)) {
    const flagTopic = sourcesByTitle(
      index,
      routingQuery,
      [/21-22.*\(b\)\(37\).*Flags/i],
      1
    )[0];
    if (flagTopic && !fallbackSources.some((source) => source.nodeId === flagTopic.nodeId)) {
      fallbackSources = [...fallbackSources, flagTopic].slice(0, 5);
    }
  }
  const overviewSources = isResidentFeeOverviewQuery(routingQuery)
    ? residentFeeOverviewSources(index, routingQuery)
    : [];
  const conceptSources = semanticConceptSources(routingQuery, results, 5);
  const compoundSources = compoundQuestionSources(routingQuery, results, specialSources, 5);
  const preferSpecialSources = Boolean(specialSources.length) && (
    Boolean(sectionNumberQuestion(routingQuery)) ||
    isDelinquentAccountQuery(routingQuery) ||
    isPlantListQuestion(routingQuery) ||
    isVegetableGardenQuery(routingQuery) ||
    isWaterServiceFeeQuery(routingQuery) ||
    isLandscapeCompletionDeadlineQuery(routingQuery) ||
    isStateParksPassQuestion(routingQuery) ||
    isMovableOutdoorBelongingsQuestion(routingQuery) ||
    isPorchPatioLightingQuery(routingQuery) ||
    /\b(?:chicken wire|pickle ?ball|sport court|rain(?:water)?(?: harvesting)? barrels?|artificial turf|synthetic turf|turf|air conditioner|ac unit|hvac|mini split|gazebo|pergola|fireworks?|yard art|ornaments?|decorative objects?|garden statues?|tree lawn|fence stain|stain color|utility trailer|privacy film|tint film|window tint|long[-\s]?term rental|approved landscaper|own landscaping|redo backyard|concrete patio|extend concrete|rear landscaping|side yard|quantum fiber|internet provider|water usage|front yard tree|catio|easement)\b/i.test(routingQuery) ||
    isExteriorPaintQuestion(routingQuery) ||
    isMailboxModificationQuery(routingQuery) ||
    isFenceFinishQuery(routingQuery) ||
    /\b(?:hang|attach|mount).{0,30}\bfence\b|\bfence\b.{0,30}\b(?:hang|attach|mount)\b/i.test(routingQuery)
  );
  const candidateAnswerSources =
    preferSpecialSources
      ? specialSources
      : compoundSources.length
      ? compoundSources
      : specialSources.length
        ? specialSources
        : overviewSources.length
        ? overviewSources
        : conceptSources.length
          ? conceptSources
          : sources.length
            ? sources
            : fallbackSources;
  const withheldSources = candidateAnswerSources.filter((source) => ownerReviewWithholdsQuestion(source, routingQuery));
  const answerSources = decorateSourcesForQuestion(
    routingQuery,
    candidateAnswerSources.filter((source) => !ownerReviewWithholdsQuestion(source, routingQuery)),
    index
  );
  if (withheldSources.length && (!answerSources.length || (isFeeQuery(routingQuery) && isSpecificFeeQuery(routingQuery)))) {
    const withheldAnswer = withheldSources.find((source) => source.ownerReview?.withheldAnswer)?.ownerReview?.withheldAnswer
      || "The approved evidence for this source does not cover that request.";
    return {
      answer: withheldAnswer,
      answerMode: "owner-review-scope-unavailable",
      answerVerdict: "unverified",
      inputClassification: effectiveInputClassification,
      confidence: { canAnswer: false, confidence: "high", reason: "owner-review-withheld-scope" },
      reviewNeeded: false,
      sources: [],
      sourceStatus: status,
    };
  }
  const groundedSpecialAnswer = directSpecialSources.length &&
    !answerSources.some((source) => source.questionSpecificExcerpt) &&
    !isDefensiveSprayQuery(routingQuery)
    ? sourceGroundedRuleAnswer(routingQuery, answerSources, index)
    : "";
  const groundedSpecialIsBoundary = isSourceEvidenceBoundaryAnswer(groundedSpecialAnswer)
    || isClassifiedProjectEvidenceBoundary(groundedSpecialAnswer);
  const projectEvidence = namedProjectEvidenceGuard(question, answerSources);
  // Let the source-derived composer retain a cautious classification answer
  // only when it explicitly says that the resident's term is not named by the
  // rulebook. That preserves useful, bounded class evidence without allowing
  // a broad category to become permission for an unsupported project.
  let classifiedProjectAnswer = "";
  if (projectEvidence.applies && !projectEvidence.supported) {
    classifiedProjectAnswer = sourceDerivedAnswerParts(routingQuery, answerSources, "", question).answer;
  }
  const hasClassifiedProjectBoundary = isClassifiedProjectEvidenceBoundary(classifiedProjectAnswer);
  if (projectEvidence.applies && !projectEvidence.supported && !groundedSpecialIsBoundary && !hasClassifiedProjectBoundary) {
    return {
      answer: unclearAnswer([]),
      answerMode: "source-evidence-boundary",
      answerVerdict: "unverified",
      inputClassification: effectiveInputClassification,
      confidence: {
        canAnswer: false,
        confidence: "high",
        reason: "named-project-not-supported-by-cited-evidence",
      },
      reviewNeeded: false,
      sources: [],
      sourceStatus: status,
      qualityChecks: { requestedFacetCoverage: false, issues: ["named-project-not-supported-by-cited-evidence"] },
    };
  }
  const confidence = assessAnswerConfidence(routingQuery, results, answerSources);

  const exactSection = sectionNumberQuestion(routingQuery);
  const hasExactSectionSource = exactSection && answerSources.some((source) =>
    new RegExp(`^Sec\\.\\s*${escapeRegExp(exactSection)}\\b`, "i").test(source.title || "")
  );
  if (exactSection && !hasExactSectionSource) {
    return {
      answer: structuredHelpfulAnswer(
        `I could not confirm Sec. ${exactSection} from the current official source, so I won't substitute a different section.`,
        [],
        "Check the official source for the current section wording or try the section title."
      ),
      answerMode: "exact-section-not-found",
      answerVerdict: "unverified",
      confidence: { canAnswer: false, confidence: "high", reason: "exact-section-not-found" },
      inputClassification: effectiveInputClassification,
      reviewNeeded: false,
      sources: [],
      sourceStatus: status,
    };
  }

  const sourceConflicts = currentSourceConflicts(answerSources);
  if (sourceConflicts.length) {
    return {
      answer: helpfulAnswer(
        "I found conflicting values in the connected official sources, so I can’t safely choose one for you.",
        answerSources,
        "Check the controlling official page below while its information is being reconfirmed."
      ),
      answerMode: "source-conflict",
      answerVerdict: "unverified",
      confidence: {
        canAnswer: false,
        confidence: "low",
        reason: "conflicting-current-sources",
      },
      inputClassification: effectiveInputClassification,
      reviewNeeded: true,
      sourceConflicts,
      sources: answerSources.slice(0, 3),
      sourceStatus: status,
    };
  }


  if (!answerSources.length || topScore < 2 || !confidence.canAnswer) {
    const ownershipBoundaryAnswer = thirdPartyOwnershipBoundaryAnswer(routingQuery, answerSources);
    if (ownershipBoundaryAnswer) {
      return {
        answer: ownershipBoundaryAnswer,
        answerMode: "source-ownership-boundary",
        answerVerdict: "unverified",
        confidence,
        inputClassification: effectiveInputClassification,
        searchMode,
        sources: answerSources.slice(0, 3),
        sourceStatus: status,
      };
    }
    if (groundedSpecialAnswer) {
      const displaySources = sourcesWithOfficialResources(routingQuery, answerSources, groundedSpecialAnswer);
      const coverageIssues = answerCoverageIssues(question, groundedSpecialAnswer, displaySources);
      if (!coverageIssues.includes("unsupported-resource-absence-claim")) {
        return {
          answer: groundedSpecialAnswer,
          answerMode: groundedSpecialIsBoundary ? "source-evidence-boundary" : "source-derived-extractive",
          answerVerdict: groundedSpecialIsBoundary
            ? "unverified"
            : deriveAnswerVerdict(groundedSpecialAnswer, { canAnswer: true, confidence: "medium" }),
          confidence: groundedSpecialIsBoundary
            ? {
                canAnswer: isFenceFinishQuery(routingQuery),
                confidence: "high",
                reason: "selected-sources-do-not-resolve-request",
              }
            : { canAnswer: true, confidence: "medium", reason: "source-grounded-clause-composition" },
          inputClassification: effectiveInputClassification,
          searchMode,
          sources: displaySources,
          sourceStatus: status,
          qualityChecks: {
            requestedFacetCoverage: coverageIssues.length === 0,
            issues: coverageIssues,
          },
        };
      }
    }
    if (
      searchMode === "ai-hybrid" &&
      answerSources.length &&
      topScore >= 2 &&
      effectiveInputClassification === INPUT_CLASSIFICATIONS.RULES_QUESTION
    ) {
      const groundedDraft = buildPlainAnswer(routingQuery, results, index, answerSources);
      const synthesize = options.rewriteAnswerWithLLM || rewriteAnswerWithLLM;
      const groundedSynthesis = await synthesize(question, groundedDraft, answerSources);
      const synthesisIssues = groundedSynthesis
        ? answerCoverageIssues(question, groundedSynthesis, answerSources)
        : ["grounded-synthesis-unavailable"];
      if (
        groundedSynthesis &&
        !answerAdmitsInsufficientEvidence(groundedSynthesis) &&
        synthesisIssues.length === 0
      ) {
        const displaySources = sourcesWithOfficialResources(routingQuery, answerSources, groundedSynthesis);
        return {
          answer: groundedSynthesis,
          answerMode: "grounded-ai-fallback",
          answerVerdict: deriveAnswerVerdict(groundedSynthesis, { canAnswer: true, confidence: "medium" }),
          confidence: { canAnswer: true, confidence: "medium", reason: "grounded-ai-source-synthesis" },
          inputClassification: effectiveInputClassification,
          searchMode,
          sources: displaySources,
          sourceStatus: status,
          qualityChecks: { requestedFacetCoverage: true, issues: [] },
        };
      }
    }
    return {
      answer: unclearAnswer(answerSources),
      answerVerdict: "unverified",
      confidence,
      inputClassification: effectiveInputClassification,
      sources: answerSources.slice(0, 3),
      sourceStatus: status,
    };
  }

  const plainAnswer = buildPlainAnswer(routingQuery, results, index, answerSources);
  const needsStructuredOverview = needsReadableTopicAnswer(routingQuery);
  const hasQuestionSpecificExcerpt = answerSources.some((source) => source.questionSpecificExcerpt);
  let needsSourceDerivedFacts = summaryHasVolatileFacts(plainAnswer)
    || needsStructuredOverview
    || hasQuestionSpecificExcerpt
    || isFenceFinishQuery(routingQuery);
  const compoundDerived = fenceAndShedOverviewAnswer(routingQuery, answerSources, index) ||
    (compoundSources.length
      ? compoundSourceDerivedAnswer(routingQuery, answerSources, index)
      : null);
  let derived = compoundDerived || (needsSourceDerivedFacts
    ? sourceDerivedAnswerParts(
        routingQuery,
        answerSources,
        isLandscapeCompletionDeadlineQuery(routingQuery) ? "" : plainAnswer,
        question
      )
    : { available: true, answer: plainAnswer, sources: answerSources, strategy: "deterministic" });
  if (groundedSpecialAnswer && (groundedSpecialIsBoundary || !derived.available || answerAdmitsInsufficientEvidence(derived.answer))) {
    needsSourceDerivedFacts = true;
    derived = { available: true, answer: groundedSpecialAnswer, sources: answerSources, strategy: "official-clause" };
  }

  if (needsSourceDerivedFacts && !derived.available) {
    return {
      answer: derived.answer,
      answerMode: "source-derived-unavailable",
      answerVerdict: "unverified",
      confidence: {
        canAnswer: false,
        confidence: "low",
        reason: "current-source-facts-unavailable",
      },
      inputClassification: effectiveInputClassification,
      sources: sourcesWithOfficialResources(routingQuery, derived.sources, derived.answer),
      sourceStatus: status,
    };
  }

  // AI may interpret the question, expand the search, and improve presentation,
  // but it is never the source of truth. Safety and confidence failures return
  // before rewriting, and the final answer is still checked against citations.
  const llmMode = options.llmMode || getRulesLlmMode();
  const rewriteDecision = selectiveRewriteDecision({
    mode: llmMode,
    question,
    draftAnswer: derived.answer,
    sources: derived.sources,
    confidence,
    inputClassification: effectiveInputClassification,
    // Search may use AI to locate the controlling source, but a completed
    // source composer still owns the answer shape. Preserve that strategy so
    // readable multi-clause answers are not collapsed by a second rewrite.
    answerStrategy: searchMode === "ai-hybrid" ? "ai-search" : derived.strategy,
  });
  recordRewriteRouting(rewriteDecision);
  const rewrite = options.rewriteAnswerWithLLM || rewriteAnswerWithLLM;
  const rewrittenAnswer = rewriteDecision.eligible
    ? await rewrite(question, derived.answer, derived.sources)
    : null;
  const answer = rewrittenAnswer || derived.answer;
  const displaySources = sourcesWithOfficialResources(routingQuery, derived.sources, answer);
  const coverageIssues = answerCoverageIssues(question, answer, displaySources);
  if (coverageIssues.includes("unsupported-resource-absence-claim")) {
    return {
      answer: unsupportedResourceAbsenceAnswer(displaySources),
      answerMode: "unsupported-resource-absence-blocked",
      answerVerdict: "unverified",
      confidence: { canAnswer: false, confidence: "low", reason: "unsupported-resource-absence-claim" },
      inputClassification: effectiveInputClassification,
      searchMode,
      sources: displaySources,
      sourceStatus: status,
      qualityChecks: { requestedFacetCoverage: false, issues: coverageIssues },
    };
  }
  const finalEvidenceBoundary = isSourceEvidenceBoundaryAnswer(answer);
  const finalConfidence = finalEvidenceBoundary
    ? {
        ...confidence,
        // A fence-finish boundary still provides the controlling rulebook
        // requirement and must stay attached to that citation. The community
        // completion layer will mark the exact missing specification as
        // unavailable rather than replacing this with an unapproved one-sheet.
        canAnswer: isFenceFinishQuery(routingQuery),
        confidence: "high",
        reason: "selected-sources-do-not-resolve-request",
      }
    : answerAdmitsInsufficientEvidence(answer)
    ? {
        ...confidence,
        canAnswer: false,
        confidence: "low",
        reason: "answer-admits-insufficient-evidence",
      }
    : confidence;

  return {
    answer,
    answerVerdict: deriveAnswerVerdict(answer, finalConfidence),
    answerMode: finalEvidenceBoundary
      ? "source-evidence-boundary"
      : needsSourceDerivedFacts
      ? rewrittenAnswer
        ? `source-derived-llm-${llmMode}`
        : derived.strategy === "structured"
          ? "source-derived-structured"
          : "source-derived-extractive"
      : rewrittenAnswer
        ? `llm-${llmMode}`
        : "deterministic",
    confidence: finalConfidence,
    inputClassification: effectiveInputClassification,
    searchMode,
    sources: displaySources,
    sourceStatus: status,
    qualityChecks: {
      requestedFacetCoverage: coverageIssues.length === 0,
      issues: coverageIssues,
    },
  };
}

module.exports = {
  CLIENT_ID,
  DEFAULT_INDEX_PATH,
  OFFICIAL_SOURCE_URL,
  PRODUCT_ID,
  PUBLICATION_ID,
  UNOFFICIAL_REMINDER,
  answerRulesQuestion,
  createRulesIndex,
  currentSourceConflicts,
  getRulesIndexStatus,
  hasRulesIndex,
  loadRulesIndex,
  searchRulesIndex,
  sourceDerivedAnswerParts,
  sourceLifecycleStatus,
  summaryHasVolatileFacts,
  warmRulesIndex,
};

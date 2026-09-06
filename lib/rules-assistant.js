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
    url: `${CAB_SITE_URL}/DocumentCenter/View/1574/Attachment-A-3-General-Arch-Improvment-2023`,
    excerpt: "Official CAB form for a general architectural improvement submittal.",
  },
  {
    id: "landscape-submittal",
    title: "Landscape Submittal Packet",
    url: `${CAB_SITE_URL}/DocumentCenter/View/1964/Landscape-Submittal-Packet_2024`,
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: municodeHeaders(),
    });
    const text = await response.text();

    if (!response.ok) {
      throw new Error(`The official online source returned HTTP ${response.status} for ${url}`);
    }

    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error(`The official online source returned non-JSON content for ${url}: ${error.message}`);
    }
  } finally {
    clearTimeout(timeout);
  }
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
      ...document,
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
      ...document,
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
  return /\b(fee|fees|charge|charges|cost|costs|assessment|payment|rate|rates|bill|bills)\b/i.test(query) ||
    /\b(pay|owe|charged)\b.*\b(month|monthly|resident|residents|cab)\b/i.test(query) ||
    /\b(month|monthly|resident|residents|cab)\b.*\b(pay|owe|charged)\b/i.test(query);
}

function isSpecificFeeQuery(query) {
  return /\b(water|sewer|sanitary|stormwater|trash|streetlight|driveway|shared driveway|alley|tap|facility|facilities|clubhouse|pool|rental|rent|guest|caregiver|late|delinquent|past due|lien|disconnect|reconnect|violation|fine|fines|resale|status letter|questionnaire|floorplan|design review|landscape review|improvement review)\b/i.test(
    query
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
    /\b(late|delinquent|past due|unpaid|nonpayment|not pay|don't pay|do not pay|water bill|disconnect|disconnection|reconnect|reconnection|lien|payment plan|collection)\b/i.test(
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
  return /\b(ornament|ornaments|yard art|lawn decoration|decorative object|decorative objects|garden statue|statue|statues)\b/i.test(
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
    summaryText: document.summaryText,
    excerpt: makeExcerpt(document.text, terms),
    text: document.text,
    matchStats: getMatchStats(document, tokenize(query), [], extractQueryPhrases(query)),
    score,
  };
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
  source.excerpt = makeExcerpt(source.text, expandQueryTerms(query), 520);
  return source;
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

  if (/\b(?:(?:specific |approved |preapproved |pre-approved )?(?:exterior |house |home |paint |garage door )colors?|paint color|color\b.{0,35}\bgarage door|garage door\b.{0,35}\bcolor)\b/i.test(query)) {
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
    return sourcesByTitleAndText(index, query, /^Sec\. 21-22\. - General community standards/i, [/Accessory buildings\. DRC approval is required/i, /Doghouses and outdoor pet areas/i], 2);
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
    return sourcesByTitleAndText(
      index,
      query,
      /^Sec\. 21-22\(b\)\(56\).*Updated exterior lighting policy/i,
      textMatchers,
      2
    );
  }

  if (isDelinquentAccountQuery(query)) {
    return sourcesByTitleAndText(
      index,
      query,
      /^Amended collection process for delinquent/i,
      [/Courtesy Past Due Notification/i, /last Wednesday of the month/i],
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

  if (isMovableOutdoorBelongingsQuestion(query) && /1-38|household items/i.test(title)) {
    return shortenText(
      subsectionSnippet(text, /\(b\)\s*All roadways and walkways shall be clear/i, /\(c\)\s*The CAB assumes no liability/i) ||
        sentenceContaining(text, /No furniture, electrical cords, bicycles, barbecues, toys/i),
      700
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
    return {
      ...source,
      excerpt,
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

  if (chapter === "5") {
    return helpfulAnswer(
      "Chapter 5 is the design-guidelines chapter. It covers design principles, landscaping and irrigation, design submittals, review checklists, architectural styles, and conservation standards.",
      sources,
      "Use the linked sections to find the exact rule language, especially if you are planning a project or submitting something for review."
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

  const semanticSupport = supportedSemanticConcept(query, sources);
  if (semanticSupport) {
    return {
      canAnswer: true,
      confidence: "high",
      reason: `semantic-concept-supported:${semanticSupport.name}`,
    };
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

function unsupportedResourceAbsenceAnswer(sources) {
  return helpfulAnswer(
    "The official material I found does not explicitly confirm whether the requested list exists, so I won't treat a search miss as proof that it is unavailable.",
    sources.slice(0, 3),
    "Open the linked official sources or contact the CAB to confirm the current resource."
  );
}

function buildPlainAnswer(query, results, index, sourcesForAnswer = []) {
  const topSources = sourcesForAnswer.length ? sourcesForAnswer.slice(0, 3) : meaningfulSources(results, 3);
  const chapterSummary = buildChapterSummary(index, query, topSources);
  if (chapterSummary) return chapterSummary;

  const sectionNames = readableList(topSources.map((source) => cleanSectionTitle(source.title)));

  if (isContactInfoQuery(query)) {
    const answer = contactAnswer(query, topSources);
    if (answer) return answer;
  }

  if (isPorchPatioLightingQuery(query) && topSources.some(isUpdatedExteriorLightingPolicy)) {
    return helpfulAnswer(
      "Porch, patio, and deck lighting is allowed within the exterior-lighting rules. Adding or modifying exterior lighting generally requires DRC approval. The light must stay within the outdoor living space, be fully shielded and directed downward, use warm white light of 3,000 Kelvin or less, and avoid glare onto neighboring properties or the street. Hardwired lighting under a covered rear deck or patio requires DRC approval and case-by-case review. Rear decorative cafe, globe, or rope lighting under a roofed cover does not require DRC approval when it meets the warm-light and no-glare conditions.",
      topSources,
      "Use the linked updated exterior-lighting policy before adding or changing porch or patio lights; under-eave lighting must also be turned off by 10:00 p.m."
    );
  }

  if (isPoultryQuery(query) && topSources.some((source) => /1-33|pets and livestock/i.test(source.title || ""))) {
    return helpfulAnswer(
      "Backyard chickens are not allowed. The rule prohibits animals, livestock, fowl, or poultry from being raised, bred, or kept. Its exception is for domesticated birds, fish, and other small domestic animals confined indoors, plus no more than four domestic animals such as cats and dogs.",
      topSources,
      "Use the linked pets-and-livestock section for the exact wording."
    );
  }

  if (isPetKeepingQuery(query) && topSources.some((source) => /1-33|pets and livestock/i.test(source.title || ""))) {
    return helpfulAnswer(
      "Yes, household pets such as cats and dogs are allowed. The rule has an aggregate limit of four domestic animals. They cannot be kept for a commercial purpose, must be leashed and under control outside the home unless they are in an approved enclosure, and cannot create unreasonable noise, odor, damage, or another nuisance. Pet waste must be removed immediately.",
      topSources,
      "Use the linked pets-and-livestock section for the exact requirements and any animal-specific restrictions."
    );
  }

  if (isGreenhouseQuery(query) && topSources.some((source) => /21-22|greenhouses/i.test(source.title || ""))) {
    return helpfulAnswer(
      "Yes, a backyard greenhouse may be considered, but DRC approval is required before installation. The greenhouse is reviewed under the accessory-building requirements, so its location, size, materials, setbacks, and visibility may affect approval.",
      topSources,
      "Use the linked greenhouse and accessory-building rules, then submit the project to the DRC before buying or installing it."
    );
  }

  if (isHomeAutomationAccessQuery(query) && topSources.some((source) => /25-23|home automation/i.test(source.title || ""))) {
    return helpfulAnswer(
      "For lost HomeSeer or Steward access, use the home-automation support channel listed in the rulebook: https://Lumiere.technology/help or help@lumierefiber.com. The rulebook says homeowners receive support through Siemens and Lumiere after move-in.",
      topSources,
      "Include your home address and say that you need HomeSeer or Steward account access restored, but do not send a password by email."
    );
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
    /\b(paint|painting|repaint|repainting)\b/i.test(query) &&
    topSources.some((source) => /Painting, exterior|21-22.*\(b\)\(64\)/i.test(source.title || ""))
  ) {
    return helpfulAnswer(
      "Exterior painting changes require DRC approval, even when repainting with the same colors. Small touch-ups on limited areas such as railings, shutters, or columns do not require approval. The DRC may limit paint colors to certain preapproved colors and combinations for a specific area or village.",
      topSources,
      "Use the linked exterior-painting subsection and confirm the required paint chips, photos, colors, and finish before repainting the home."
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

  if (
    isViolationProcessQuery(query) &&
    topSources.some((source) => /due process and imposition of fines|policy governing due process/i.test(source.title))
  ) {
    return helpfulAnswer(
      "The current fines policy starts with a $0 warning letter. For continuous or repeated violations, the listed fines are $100 for the first notice, $250 for the second notice, $500 for the third notice, and then $10 per day until cured. Nuisance violations use a lower schedule: $25, $50, $100, then $10 per day until cured. The notice process also includes a right to request a hearing.",
      topSources,
      "Use the linked due-process policy for the exact notice, hearing, cure-period, appeal, and fine language."
    );
  }

  if (
    isDelinquentAccountQuery(query) &&
    topSources.some((source) => /collection process for delinquent|delinquent utility/i.test(source.title))
  ) {
    return helpfulAnswer(
      "The current delinquent-fee policy says a past-due account may get a courtesy notice after 3 days, a late fee after 7 days, a late notice on the 15th day, and then a disconnect or lien notice on the 10th day of the month after the invoice due date. Utility-fee delinquency can lead to water disconnection on the last Wednesday of the month; monthly or enforcement-fee delinquency can lead to a lien notice.",
      topSources,
      "Use the linked collection policy for the exact timeline, hearing rights, payment-plan rules, and fee amounts before acting."
    );
  }

  if (isResidentFeeOverviewQuery(query) && hasCurrentFeeScheduleSource(topSources)) {
    return helpfulAnswer(
      "For regular resident bills, the current schedules point to a few main buckets: water, sewer, and stormwater charges; CAB service fees like streetlight and trash; lot-specific maintenance fees for some shared-driveway or alley-load homes; and late or collection fees if a bill goes unpaid. For 2026, common listed monthly amounts include a $50.20 residential water base rate, a $44.95 residential sewer base fee, stormwater at $18.80 for single-family detached homes or $17.50 for attached/townhome/multifamily homes, streetlight at $9.90, trash at $14.17 for single-family and townhome units, shared-driveway maintenance at $33.25, and alley-load-home maintenance at $26.25.",
      topSources,
      "Use the linked current 2026 fee schedules to match your property type, because fees can differ by meter, home type, and whether your lot has shared-driveway or alley service."
    );
  }

  if (
    isFeeQuery(query) &&
    topSources.some((source) => /2026 cab service fees/i.test(source.title)) &&
    /\b(trash|streetlight|driveway|alley|disclosure|resale|status letter|questionnaire|floorplan)\b/i.test(query)
  ) {
    return helpfulAnswer(
      "The current 2026 CAB service-fee supplement lists monthly streetlight charges of $9.90 for residential units, monthly trash charges of $14.17 for single-family and townhome units, shared-driveway maintenance at $33.25 per month, and alley-load-home maintenance at $26.25 per month. It also updates resale/status-letter and questionnaire fees.",
      topSources,
      "Use the linked 2026 CAB service-fee supplement for the full table and any property-type details."
    );
  }

  if (
    isFeeQuery(query) &&
    topSources.some((source) => /2026 water, sanitary sewer, and stormwater/i.test(source.title)) &&
    /\b(water|sewer|sanitary|stormwater|rate|rates|monthly|consumption)\b/i.test(query)
  ) {
    return helpfulAnswer(
      "The current 2026 water-rate supplement lists a $50.20 monthly base rate for individually metered residential water, indoor water consumption tiers of $9.70, $11.70, and $18.55 per 1,000 gallons, outdoor water tiers of $11.65, $18.25, $24.80, and $30.55 per 1,000 gallons, sanitary sewer base fees of $44.95 for residential units, and stormwater monthly charges of $18.80 for single-family detached homes and $17.50 for attached, townhome, and individually metered multifamily units.",
      topSources,
      "Use the linked 2026 water, sewer, and stormwater supplement for the full table and billing category."
    );
  }

  if (
    isFeeQuery(query) &&
    topSources.some((source) => /2026 tap and facility fees/i.test(source.title))
  ) {
    return helpfulAnswer(
      "The current 2026 tap-and-facility supplement lists residential stormwater tap fees at $6,080 per unit, residential facility fees at $12,395 for single-family detached and duplex homes, and $10,880 for townhomes and multifamily. It also updates water and sewer tap tables, including single-family detached total water infrastructure fees of $27,430 and total sewer tap fees of $12,485.",
      topSources,
      "Use the linked 2026 tap-and-facility supplement for the full table, because exact amounts depend on property type, lot size, meter size, and use."
    );
  }

  if (isFeeQuery(query)) {
    return helpfulAnswer(
      `I don't have enough detail to name the exact fee confidently. These fee sections look relevant: ${sectionNames}.`,
      topSources,
      "Check the linked fee tables for the exact wording and confirm current amounts with the CAB before paying or budgeting."
    );
  }

  if (isUtilityQuery(query)) {
    return helpfulAnswer(
      `I don't have enough detail to give a definite utility answer. These sections look relevant: ${sectionNames}.`,
      topSources,
      "For a home project or service question, confirm details with the CAB or the appropriate utility contact before acting."
    );
  }

  if (/^\s*(am i allowed|can i|may i|is it allowed)\b/i.test(query)) {
    return helpfulAnswer(
      `I don't have enough rulebook evidence to give a confident yes or no. These sections look relevant: ${sectionNames}.`,
      topSources,
      "Treat this as a check-before-acting question, especially if approvals, fees, permits, enforcement, or design review could be involved."
    );
  }

  if (needsOfficialConfirmation(query)) {
    return helpfulAnswer(
      `I don't have enough rulebook evidence to give a definite answer. These sections look like the closest starting points: ${sectionNames}.`,
      topSources,
      "Use these sections as a starting point, then confirm through the official process before making decisions."
    );
  }

  return helpfulAnswer(
    `I don't have enough information to give a confident answer. These sections look like the closest matches: ${sectionNames}.`,
    topSources,
    "Open the linked sections if you need the exact official wording."
  );
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
  const residentOverview = isResidentFeeOverviewQuery(query);
  if (/\bwater\b/i.test(query) || (residentOverview && /^2026 water/i.test(source.title || ""))) {
    patterns.push(/Monthly Fee Residential \(per Unit\) Single Family Detached/i);
    if (residentOverview) {
      patterns.push(/Monthly Base Fee Residential \(per Unit\) Single Family Detached/i);
    }
    patterns.push(/Tier residential and non-residential Fee per 1,000 gallons Tier 1/i);
  }
  if (/\btap\b/i.test(query)) {
    patterns.push(/CAB Fees Dominion Fees Total Fees Residential \(per Unit\)/i);
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

function seasonalLightingOverviewAnswer(sources = []) {
  const text = combinedSourceText(sources);
  const windowMatch = text.match(
    /((?:June)\s+\d{1,2})\s+to\s+((?:July)\s+\d{1,2})\s+and\s+from\s+((?:October)\s+\d{1,2})\s+through\s+((?:January)\s+\d{1,2})/i
  );
  if (!windowMatch) return "";

  const dates = `${windowMatch[1]} to ${windowMatch[2]}, and ${windowMatch[3]} through ${windowMatch[4]}`;
  const cutoffMatch = text.match(/(?:turned|turn) off by\s+(\d{1,2}:\d{2}\s*p\.?m\.?)\b/i);
  const cutoff = cutoffMatch ? cutoffMatch[1].replace(/\.+$/, "") : "";
  const findings = [
    `Allowed dates: ${dates}.`,
    /Outside (?:of )?these (?:approved seasonal lighting periods|dates|windows)|Outside those windows|temporary string lighting and light installation clips are required to be removed/i.test(
      text
    )
      ? "Outside those dates, temporary string lights and clips must be removed, and permanent systems must return to their approved non-seasonal settings."
      : "Outside those dates, use the permanent system's approved non-seasonal settings.",
    cutoff ? `Nightly cutoff: lights must be off by ${cutoff}.` : "",
  ];
  return structuredHelpfulAnswer(
    `Seasonal decorative lighting is allowed from ${dates}.`,
    findings,
    "Use the linked current lighting policy if you have a permanent roofline system or another setup that needs DRC approval."
  );
}

function shedOverviewAnswer(sources = []) {
  const text = combinedSourceText(sources);
  if (!/Backyard utility sheds.*DRC approval is required/i.test(text)) return "";

  const heightMatch = text.match(/should not exceed an overall height of\s+([^.]+)\./i);
  const footprintMatch = text.match(/shed footprint maximum is\s+([^.]+)\./i);
  const limitParts = [];
  if (heightMatch) {
    limitParts.push(`generally no taller than ${heightMatch[1].replace(/\s+/g, " ").trim()}`);
  }
  if (footprintMatch) {
    limitParts.push(`a maximum footprint of ${footprintMatch[1].replace(/\s+/g, " ").trim()}`);
  }

  return structuredHelpfulAnswer(
    "Yes, but you need DRC approval before building a backyard shed.",
    [
      "The DRC reviews the shed's size, height, color, fit with the home and lot, landscaping, and distance from property lines.",
      limitParts.length ? `The current size guideline is ${limitParts.join(", with ")}.` : "",
      /Utilities to a backyard utility shed must be underground/i.test(text) &&
      /must be screened with landscape plantings/i.test(text)
        ? "Utilities must run underground, and landscape screening is required around the shed."
        : "",
    ],
    "Review the linked shed one-sheet and submit the DRC application before buying or installing the shed."
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

  const facilityLabel = asksGreatHall
    ? "the Overlook Great Hall"
    : asksPavilion
      ? "an Overlook pavilion"
      : asksPark
        ? "a CAB park space"
        : "an Overlook space";
  const pricingLead = priceDetails.length
    ? `The published fee section lists ${priceDetails.join(" ")}`
    : "The published fee section contains separate rates for the Great Hall, pavilions, and CAB parks.";

  const reservationLead = asksPark
    ? `To reserve ${facilityLabel}, start with the official Park Shelters page and Facility Rentals catalog below. Online booking may not be available for every shelter. ${pricingLead}`
    : `To reserve ${facilityLabel}, submit the Facilities Rental Application and Agreement with the required payment. ${pricingLead}`;
  const nextStep = asksPark
    ? `${effectiveDate ? `These published amounts are labeled effective ${effectiveDate}. ` : ""}Check the live catalog first. If the shelter cannot be reserved online, contact Recreation at recreation@sterlingranchcab.com or 720-728-7257.`
    : `${effectiveDate ? `These published amounts are labeled effective ${effectiveDate}. ` : ""}The Rental Agreement carries the current rates, so confirm the latest agreement and availability on the official Amenity Rentals page before paying.`;

  return structuredHelpfulAnswer(
    reservationLead,
    [
      priceDetails.length ? `Published rates: ${priceDetails.join(" ")}` : "",
      "All applicable rental fees, deposits, and other charges are due when the Rental Agreement is submitted.",
      /first-come, first-served/i.test(text)
        ? "Requests are reviewed first-come, first-served, with CAB programs and community events receiving scheduling priority."
        : "CAB staff reviews the request and confirms availability.",
    ],
    nextStep
  );
}

function fenceAndShedOverviewAnswer(query, sources = [], index) {
  if (!/\bfenc(?:e|es|ing)\b/i.test(query) || !/\bsheds?\b/i.test(query)) return null;
  const fenceSource = combinedSourceByTitle(index, query, /^Sec\. 21-23\. - Fencing standards/i);
  const shedSource = combinedSourceByTitle(
    index,
    query,
    /^Sec\. 21-22.*Backyard utility sheds/i
  );
  if (!fenceSource || !shedSource) return null;

  const fenceText = cleanText(fenceSource.text || "");
  const shedText = cleanText(shedSource.text || "");
  const fenceApprovalRequired = /Approval must be obtained from the DRC prior to any construction|additional fencing[\s\S]{0,80}requires DRC approval|proposed fence type[\s\S]{0,80}requires DRC approval/i.test(fenceText);
  const shedApprovalRequired = /Backyard utility sheds[\s\S]{0,80}DRC approval is required/i.test(shedText);
  const bothRequireApproval = fenceApprovalRequired && shedApprovalRequired;
  const height = shedText
    .match(/overall height of\s+([^.]+)\./i)?.[1]
    ?.replace(/\s+/g, " ")
    .trim();
  const footprint = shedText
    .match(/shed footprint maximum is\s+([^.]+)\./i)?.[1]
    ?.replace(/\s+/g, " ")
    .trim();
  const detailedSources = [fenceSource, shedSource, ...sources].filter(
    (source, position, all) =>
      source &&
      all.findIndex((candidate) => (candidate.nodeId || candidate.title) === (source.nodeId || source.title)) === position
  );

  return {
    available: true,
    answer: structuredHelpfulAnswer(
      bothRequireApproval
        ? "Yes, but treat the fence and shed as two separate DRC projects and get approval before starting either one."
        : "Fence and shed plans are reviewed as two separate projects, and each must follow its current project-specific standard.",
      [
        `${/Style 1, Perimeter fencing/i.test(fenceText) && /Style 2, Wing fencing/i.test(fenceText) && /Style 3, Interior lot line fencing/i.test(fenceText) ? "Fence: perimeter, wing, and interior lot-line fences have different approved designs, so the correct style depends on where the fence will go." : "Fence: use the current fencing standard to match the design to its location."}${/three concrete rails/i.test(fenceText) ? " The current perimeter design is three-rail concrete fencing." : ""}${fenceApprovalRequired ? " The current source requires DRC approval before construction and for additions that vary from the approved standard." : " Confirm the current approval requirement in the linked fencing standard."}`,
        `Shed: it must match the home's materials, style, color, and roofing. The current guideline is ${height ? `generally no taller than ${height}` : "subject to the height limit in the shed rule"}${footprint ? ` with a maximum footprint of ${footprint}` : ""}.`,
        /Utilities to a backyard utility shed must be underground/i.test(shedText) &&
        /must be screened with landscape plantings/i.test(shedText)
          ? "Shed utilities must be underground, and landscaping must screen the shed to at least half its wall height at full growth."
          : "The DRC also reviews setbacks, landscaping, utilities, and how the shed fits the lot.",
      ],
      "Submit each project's plans through the current DRC process before buying materials or beginning installation."
    ),
    sources: detailedSources.slice(0, 5),
    strategy: "structured-compound-detailed",
  };
}

function landscapeOverviewAnswer(sources = []) {
  const text = combinedSourceText(sources);
  const requiresReview = /Landscape and irrigation plans[\s\S]{0,180}submitted[\s\S]{0,80}(?:review and approval|DRC)/i.test(
    text
  );
  const hasDesignRules = /front yard shall consist of a combination of trees, sodded turf, and shrubs/i.test(
    text
  );
  const hasMaintenanceRules = /Landscaping is to be kept healthy/i.test(text);
  if (!requiresReview || (!hasDesignRules && !hasMaintenanceRules)) return "";

  return structuredHelpfulAnswer(
    "Most landscaping is allowed, but landscape and irrigation plans need DRC review and the finished yard must follow the community's planting and maintenance standards.",
    [
      "Before installation: submit the landscape and irrigation plan, required checklist, and any current review materials to the DRC.",
      hasDesignRules
        ? "Yard design: front yards use a mix of trees, turf, shrubs, and other approved plants. Exact planting requirements can vary by lot and neighborhood."
        : "",
      hasMaintenanceRules
        ? "Ongoing care: keep landscaping healthy and weed-free, mow turf regularly, prune dead branches, remove dead plants, and replace required dead trees."
        : "",
    ],
    "Start with the linked landscape packet and the rules for your specific lot before hiring a contractor or changing the yard."
  );
}

function parksOpenSpaceOverviewAnswer(sources = []) {
  const text = combinedSourceText(sources);
  if (!/Dog owners must leash and have physical control/i.test(text)) return "";

  return structuredHelpfulAnswer(
    "Parks, trails, and open spaces are for responsible recreation. Keep dogs leashed and under control, clean up after them, and avoid activities that damage the land or create safety problems.",
    [
      "Dogs: keep them leashed and physically controlled, and dispose of their waste.",
      /Motorized vehicles are prohibited/i.test(text)
        ? "Vehicles and property care: motorized vehicles are prohibited, as are glass containers, littering, dumping, and misuse of public property."
        : "",
      /fishing permit shall be required/i.test(text)
        ? "Fishing: follow Colorado and posted site rules, and obtain a CAB fishing permit for CAB ponds."
        : /Harassment of wildlife/i.test(text)
          ? "Wildlife: do not harass wildlife or damage habitat."
          : "",
    ],
    "Check posted signs and the linked general rules because individual parks, ponds, and trails may have additional site-specific restrictions."
  );
}

function landscapeScreenOverviewAnswer(sources = []) {
  const text = combinedSourceText(sources);
  const height = text.match(/(Five-foot) maximum overall height[\s\S]{0,180}?(six-foot) maximum/i);
  const width = text.match(/(Eight-foot) maximum overall width/i);
  const transparency = text.match(/(\d+ percent) required transparency/i);
  const count = text.match(/maximum of ([a-z]+) screens/i);
  if (!/Landscape screens.*DRC approval is required/i.test(text)) return "";
  return structuredHelpfulAnswer(
    "Backyard privacy screens are treated as landscape screens and require DRC approval.",
    [
      `Placement: screens must be freestanding in a rear or side yard and outside easements${count ? `; the current limit is a maximum of ${count[1]} screens when the lot allows` : ""}.`,
      height && width
        ? `Size: ${height[1]} maximum height, or ${height[2]} with plantings around the base, and ${width[1]} maximum width.`
        : "",
      `${transparency ? `Design: ${transparency[1]} transparency is required. ` : ""}Vinyl is not allowed; approved materials and colors must complement the home.`,
    ],
    "Use the linked Landscape Screens One-Sheet and obtain DRC approval before installation."
  );
}

function underEaveLightingOverviewAnswer(sources = []) {
  const text = combinedSourceText(sources);
  if (!/Gemstone and Jellyfish systems are the approved systems/i.test(text)) return "";
  const cutoff = text.match(/under-eave lighting must be turned off by\s+(\d{1,2}:\d{2}\s*p\.?m\.?)/i);
  return structuredHelpfulAnswer(
    "Permanent under-eave lighting can be allowed, but adding or modifying exterior lighting requires DRC approval.",
    [
      "Approved systems: the current policy names Gemstone and Jellyfish. Other brands must be added to the CAB-approved list before use.",
      "Everyday settings: use static warm-white light directed downward without glare; flashing, chasing, and color patterns are limited to approved seasonal periods.",
      cutoff ? `Nightly cutoff: under-eave lighting must be off by ${cutoff[1].replace(/\.+$/, "")}.` : "",
    ],
    "Submit the proposed system and layout to the DRC before installation."
  );
}

function trampolineOverviewAnswer(sources = []) {
  const text = combinedSourceText(sources);
  if (!/Trampolines.*DRC approval is required/i.test(text)) return "";
  const setback = text.match(/minimum of ([a-z]+ feet) from all property lines/i);
  return structuredHelpfulAnswer(
    "Trampolines require DRC approval before installation.",
    [
      setback ? `Placement: keep it at least ${setback[1]} from every property line.` : "",
      "Screening: tall plant material is required between the trampoline and property lines.",
      "Neighbor impact: placement is reviewed to avoid undue disturbance and reduce visibility from adjacent properties.",
    ],
    "Submit the location and screening plan to the DRC before installing the trampoline."
  );
}

function requestedDuration(query) {
  const text = String(query || "").toLowerCase();
  const numberWords = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
    eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  };
  if (/\b(?:a|one) week\b/.test(text)) return { hours: 168, label: "a week" };
  const match = text.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)[-\s]?(hours?|days?|nights?|overnights?)\b/);
  if (!match) return null;
  const amount = Number(match[1]) || numberWords[match[1]];
  const unit = match[2];
  const explicitlyMoreThan = new RegExp(`\\b(?:longer than|more than|over)\\s+${escapeRegExp(match[0])}`, "i").test(text);
  const baseHours = /^hour/.test(unit) ? amount : amount * 24;
  return {
    hours: explicitlyMoreThan ? baseHours + 0.01 : baseHours,
    nights: /night/.test(unit) ? amount : null,
    label: `${explicitlyMoreThan ? "longer than " : ""}${amount} ${unit}`,
  };
}

function shortTermRentalOverviewAnswer(sources = []) {
  const text = combinedSourceText(sources);
  if (!/short-term\s+lodging,\s+vacation rentals|short-term,\s+vacation\s+property/i.test(text)) return "";
  return structuredHelpfulAnswer(
    "No. Sterling Ranch homes may not be used for Airbnb, VRBO, weekend rentals, or similar short-term lodging.",
    [
      "The rule specifically prohibits day-to-day and week-to-week vacation or hotel-style use of a residence.",
      "This is different from a longer residential lease; the short-term lodging restriction is the issue here.",
    ],
    "Review the linked residential-use sections before advertising or accepting a short-term booking."
  );
}

function wateringRestrictionOverviewAnswer(query, sources = []) {
  const text = combinedSourceText(sources);
  const window = text.match(/between(?:\s+the\s+hours\s+of)?\s+(10:00 a\.m\.)\s+and\s+(6:00 p\.m\.)/i);
  const season = text.match(/from\s+(May 1)\s+(?:to|through)\s+(September 30)/i);
  if (!window || !season) return "";

  const residentText = String(query || "");
  const conservingMethod = /\b(hand water|watering can|drip|trickle|micro[-\s]?spray|deep[-\s]?root)\b/i.test(residentText);
  const ordinaryIrrigation = /\b(lawn|sprinkler|sprinklers|irrigation system|irrigate)\b/i.test(residentText);
  const restrictedTime = /\b(noon|midday|1[0-7](?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?|10(?::\d{2})?\s*a\.?m\.?|[1-5](?::\d{2})?\s*p\.?m\.?)\b/i.test(residentText);
  const restrictedSeason = /\b(may|june|july|august|september|summer)\b/i.test(residentText);

  let lead = `Ordinary outdoor irrigation must run before ${window[1]} or after ${window[2]} from ${season[1]} through ${season[2]}.`;
  if (conservingMethod) {
    lead = "Yes. Hand watering and the listed water-conserving methods are allowed at any time under this rule.";
  } else if (ordinaryIrrigation && restrictedTime && restrictedSeason) {
    lead = `No. That time falls inside the ${window[1]}–${window[2]} irrigation ban that applies ${season[1]} through ${season[2]}.`;
  }

  return structuredHelpfulAnswer(
    lead,
    [
      `Regular sprinklers and outdoor irrigation are prohibited between ${window[1]} and ${window[2]} during that seasonal window unless an approved daytime-watering permit applies.`,
      "Hand watering, drip, trickle, micro-spray, deep-root devices, and watering cans are allowed at any time.",
    ],
    "The CAB may change watering restrictions when needed, so check the linked water-conservation section before setting a schedule."
  );
}

function fenceHeightOverviewAnswer(sources = []) {
  const text = combinedSourceText(sources);
  const standardHeight = text.match(/Height:\s*(54 inches)/i);
  if (!/Fencing standards|All on-lot fencing/i.test(text)) return "";
  return structuredHelpfulAnswer(
    standardHeight
      ? `It depends on the fence type and lot, but the standard Ascent Village single-family fence is ${standardHeight[1]} high.`
      : "There is not one universal fence-height limit; the allowed height depends on the approved fence style and lot.",
    [
      "Sterling Ranch uses specific perimeter, wing, and interior lot-line fence designs rather than one blanket height for every fence.",
      "Interior or replacement fencing must match the applicable community specification, and a different design needs DRC review.",
    ],
    "Confirm your village, lot location, and fence style with the DRC before ordering materials."
  );
}

function trashStorageOverviewAnswer(query, sources = []) {
  const text = combinedSourceText(sources);
  if (!/trash|recycling/i.test(text) || !/enclosed structure|garage|wing fence/i.test(text)) return "";
  const asksTiming = /\b(overnight|night|curb|pickup|collection|when|what time|tomorrow)\b/i.test(String(query || ""));
  return structuredHelpfulAnswer(
    asksTiming
      ? "The current storage rule does not give a specific curb-placement or removal time. It says containers must be properly stored when they are not out for collection."
      : "Trash and recycling containers must be kept in appropriate containers and properly stored when they are not out for collection.",
    [
      "Allowed storage locations are an enclosed structure, the garage, or an appropriately screened area behind the wing fence.",
      asksTiming ? "Because the current wording does not state an overnight exception, do not treat overnight curb storage as automatically approved." : "Containers should not remain visible as everyday outdoor storage.",
    ],
    asksTiming
      ? "Use the waste provider’s pickup instructions for collection timing, and confirm with CAB staff if you need a definitive overnight answer."
      : "Use the linked current amendment for the controlling storage wording."
  );
}

function rvParkingOverviewAnswer(query, sources = []) {
  const text = combinedSourceText(sources);
  if (!/maximum amount of time a Recreational Vehicle/i.test(text)) return "";
  const hours = text.match(/(?:e\.g\.,\s*|maximum of\s*)([0-9]+)(?: consecutive)? hours/i);
  const overnights = text.match(/parked is ([a-z]+) overnights[\s\S]{0,40}?during any seven-day period/i);
  const street = /\bstreet\b/i.test(query);
  const utilityTrailer = /\butility trailer|trailer for work\b/i.test(query);
  const duration = requestedDuration(query);
  const hourLimit = hours ? Number(hours[1]) : null;
  const overnightWords = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
  const overnightLimit = overnights ? overnightWords[overnights[1].toLowerCase()] : null;
  const exceedsLimit = !street && duration && (
    (hourLimit && duration.hours > hourLimit) ||
    (overnightLimit && duration.nights && duration.nights > overnightLimit)
  );
  return structuredHelpfulAnswer(
    utilityTrailer
      ? "A utility trailer normally must be stored entirely inside an enclosed garage. Temporary driveway parking is limited to loading, delivery, maintenance, or an emergency and cannot exceed the current temporary-parking limit."
      : street
      ? "No. RVs, motor homes, campers, and trailers may not be parked on the street."
      : exceedsLimit
        ? `No. ${duration.label.charAt(0).toUpperCase()}${duration.label.slice(1)} exceeds the current temporary driveway-parking limit${hourLimit ? ` of ${hourLimit} hours` : ""}.`
      : `Yes, temporarily. A recreational vehicle may stay in your driveway for up to ${hours ? `${hours[1]} hours` : "the temporary period in the current rule"}.`,
    [
      hours
        ? `Temporary driveway parking: no more than ${hours[1]} hours${overnights ? ` and no more than ${overnights[1]} overnights during a seven-day period` : ""}.`
        : "",
      "Long-term storage: the vehicle must fit entirely inside an enclosed garage.",
      "Moving the vehicle to another nearby location does not restart the temporary-parking limit.",
    ],
    "Check the linked vehicle rule because it also covers trailers, campers, boats, ATVs, and similar vehicles."
  );
}

function flagAndPoliticalSignOverviewAnswer(query, sources = []) {
  const text = combinedSourceText(sources);
  if (!/may display flags or political signage/i.test(text)) return "";
  const size = text.match(/No flag shall exceed ([^.]+) in size/i);
  const isPoliticalSign = /political sign|sign for (?:a )?political candidate/i.test(query);
  const asksPoleHeight = /\bflagpoles?\b/i.test(query) && /\b(?:height|high|tall|maximum|max)\b/i.test(query);
  if (asksPoleHeight && /(?:DRC approval is required for freestanding flagpoles|DRC approved flagpole|flagpole requires DRC approval)/i.test(text)) {
    return structuredHelpfulAnswer(
      "The current cited rule does not set a numeric maximum height for a freestanding flagpole. It requires DRC approval.",
      [size ? `The ${size[1].trim()} limit applies to the flag itself, not the height of the pole.` : "The flag-size rule is separate from the pole-height question."],
      "Ask the DRC to confirm the allowable pole height for your lot before choosing or installing one."
    );
  }
  if (isPoliticalSign) {
    const beforeElection = text.match(/not earlier than ([0-9]+) days prior to the applicable election day/i);
    const afterElection = text.match(/remove any such signs within ([a-z0-9]+) days after such election/i);
    const signSize = text.match(/no such sign shall exceed ([0-9]+ inches by [0-9]+ inches) in size/i);
    return structuredHelpfulAnswer(
      "Yes. An owner or occupant may display a political sign for a candidate or ballot issue within the home’s lot or in a window, subject to the election-period limits.",
      [
        beforeElection && afterElection ? `Timing: no earlier than ${beforeElection[1]} days before the election, and remove it within ${afterElection[1]} days afterward.` : "The current rule sets a display window before and after the election.",
        "Quantity: no more than 1 sign for each candidate, office, or ballot issue.",
        signSize ? `Size: no larger than ${signSize[1]}.` : "The current rule includes a maximum sign size.",
      ],
      "Use the linked current signs-and-flags section for the controlling election timing and size before displaying the sign."
    );
  }
  return structuredHelpfulAnswer(
    isPoliticalSign
      ? "Yes. Owners may display political signage, subject to the current signs-and-flags restrictions."
      : "Yes. Owners may display flags in the locations allowed by the current rule.",
    [
      /DRC approved flagpole/i.test(text)
        ? "Flags may be displayed on the property, in a window, or on an adjoining balcony or patio; a flagpole requires DRC approval."
        : "Flags may be displayed in the locations listed by the current rule.",
      !isPoliticalSign && /United States\s+flag[\s\S]{0,240}?Colorado\s+flag/i.test(text)
        ? "For flags mounted on the front of a home, the community standard specifically lists the United States flag, Colorado flag, and certain military service flags."
        : "",
      "Flags cannot be restricted based on their subject or message, except that flags bearing commercial messages are prohibited.",
      isPoliticalSign && size ? `Current flag size limit: ${size[1].trim()}.` : "",
    ],
    "Use the linked amendment and sign/flag section for placement details before installing a flagpole or related lighting."
  );
}

function simpleTopicOverviewAnswer(query, sources = [], residentQuestion = query) {
  const text = combinedSourceText(sources);

  if (
    isStateParksPassQuestion(query) &&
    /Parks Pass Program Agreement/i.test(text) &&
    /Each Qualified Residence is allowed one Annual Pass per year/i.test(text)
  ) {
    const asksReimbursement = /\b(?:reimburs\w*|refund\w*|pay(?:ing)? me back|bought|purchased)\b/i.test(query);
    const asksHowToGet = /\b(?:how|where)\b.{0,30}\b(?:get|obtain|renew|exchange|apply)\b|\b(?:get|obtain|renew|exchange|apply)\b.{0,30}\b(?:how|where)\b/i.test(query);
    return structuredHelpfulAnswer(
      asksReimbursement
        ? "The cited Parks Pass Program section does not describe reimbursing a state parks pass bought separately. It describes the CAB providing one annual Colorado Parks and Wildlife pass to each qualified residence through a voucher or approved application."
        : asksHowToGet
          ? "To get a Colorado Parks and Wildlife state parks pass, an initial owner should bring the CAB voucher to the Sterling Ranch Information Center; a later purchaser or renewing owner should submit the CAB application there."
          : "The Parks Pass Program provides one annual Colorado Parks and Wildlife state parks pass per qualified residence.",
      [
        "Initial owners receive a voucher to exchange at the Sterling Ranch Information Center; a later purchaser submits the CAB application there.",
        "When the pass expires, the owner may apply for a new annual pass. The CAB requires government-issued photo identification and proof of ownership.",
        "The pass and voucher are not transferable, and the CAB rule says lost, stolen, or misplaced passes and vouchers will not be replaced.",
      ],
      asksReimbursement
        ? "Before buying another pass or expecting repayment, ask the CAB for the current Parks Pass Program application and confirm how your situation is handled."
        : "Ask the Sterling Ranch Information Center for the current voucher or Parks Pass Program application that matches your ownership situation."
    );
  }

  if (isPetKeepingQuery(query) && !isPoultryQuery(query) && /aggregate of not more than ([a-z0-9]+) domestic animals/i.test(text)) {
    const limit = text.match(/aggregate of not more than ([a-z0-9]+) domestic animals/i)?.[1];
    return structuredHelpfulAnswer(
      "Yes. Household cats and dogs are allowed under the domestic-animal exception in the pets rule.",
      [
        `The rule allows an aggregate of not more than ${limit || "the number stated in the linked rule"} domestic animals, such as cats and dogs.`,
        "Pets cannot be kept for a commercial purpose or create unreasonable noise, odor, damage, or another nuisance.",
        "Outside the home, pets must be leashed and controlled unless they are in an approved enclosure. Pet waste must be removed promptly.",
      ],
      "Review the linked pets-and-livestock section if you have another type of animal or more than the household limit."
    );
  }

  if (/\bprivacy fence\b/i.test(query) && /Nothing may be attached to a fence to increase the height or screening capability/i.test(text)) {
    return structuredHelpfulAnswer(
      "You cannot turn an existing fence into a privacy fence by adding lattice, extra pickets, chain link, temporary fencing, or another height or screening extension.",
      ["Approved fence styles control the fence itself. A separate freestanding landscape screen may be an option in a rear or side yard, but it requires DRC approval and has its own size, transparency, material, and placement rules."],
      "Ask the DRC whether an approved landscape screen fits your lot before buying privacy materials."
    );
  }

  if (/\b(?:specific )?paint color\b/i.test(query) && /manufacturer's paint chips indicating color number/i.test(text)) {
    return structuredHelpfulAnswer(
      "There is no single community-wide exterior paint color in the cited rule. The approved color depends on your home’s palette and the DRC-approved application.",
      ["A paint submittal must identify the manufacturer, color number, and where each color will be used on the body, trim, eaves, and other exterior areas."],
      "Use your home’s approved scheme and submit the manufacturer paint chips to the DRC before repainting; do not choose a color from another home or fence rule."
    );
  }

  if (/\b(?:leash|leashes|leashed)\b/i.test(query) && /must leash and have physical control/i.test(text)) {
    return structuredHelpfulAnswer(
      "Yes. Dogs must be leashed and under physical control.",
      [
        "The park and open-space rule requires a leash and physical control at all times.",
        "Owners must also pick up and properly dispose of dog waste.",
      ],
      "Follow posted site rules too, because individual parks and facilities may have additional restrictions."
    );
  }

  if (/\brain(?:water)?(?:\s+harvesting)?\s*barrels?\b/i.test(query) && /Residents are allowed two 55-gallon rain barrels/i.test(text)) {
    const count = text.match(/allowed\s+([a-z]+)\s+([0-9]+)-gallon rain barrels/i);
    const asksSubmit = /\b(?:submit|application|approval|permission)\b/i.test(query);
    return structuredHelpfulAnswer(
      `${asksSubmit ? "You may not need DRC approval" : "Yes, rain barrels are allowed"} when the installation meets every condition in the current rule.`,
      [
        count ? `Limit: ${count[1]} barrels, each no larger than ${count[2]} gallons.` : "The current rule limits the number and size of barrels.",
        "No approval is required behind the wing fence when the barrels are screened from view, collect only rooftop water through a downspout, stay outside easements, and meet the required property-line setback.",
        "Front-yard installations and installations that miss any no-approval condition require DRC review.",
      ],
      "Compare your proposed location with the linked rain-barrel subsection before deciding whether to submit a DRC application."
    );
  }

  if ((/\b(?:artificial|synthetic) turf\b/i.test(query) || (/\bturf\b/i.test(query) && /\bfront (?:yard|lawn)\b/i.test(query))) && /Artificial turf will be evaluated on an individual basis for front yards/i.test(text)) {
    return structuredHelpfulAnswer(
      /\b(?:artificial|synthetic) turf\b/i.test(query)
        ? "Artificial turf is not automatically approved for a front yard. The DRC evaluates each front-yard proposal individually."
        : "If you mean artificial turf, the DRC evaluates each front-yard proposal individually. If you mean living turf, front-yard turf must be installed as sod and still fit the approved landscape plan.",
      [
        "The front-yard standard otherwise calls for a combination of trees, living turf, and shrubs.",
        "Your lot, neighborhood standards, water budget, design, and the rest of the planting plan can affect the decision.",
      ],
      "Submit the proposed turf area and the complete landscape and irrigation plan to the DRC before installation."
    );
  }

  if (/\b(?:air conditioner|ac unit|hvac|mini split)\b/i.test(query) && /air conditioning/i.test(text)) {
    return structuredHelpfulAnswer(
      /DRC approval is not required before house cooling equipment can be installed/i.test(text)
        ? "DRC approval is not required before installing house-cooling equipment, but the placement and screening rules still apply."
        : "The general exterior-installation rule calls for DRC review of exterior air-conditioning equipment, wiring, or vents.",
      [
        "Ground-level units must be screened from neighboring properties and street view; a unit behind the front wing fence in a side yard counts as screened.",
        "Equipment above street level is not permitted unless it is completely concealed from view.",
      ],
      "Compare the proposed location with the linked current cooling-equipment subsection before installation, especially for a mini split with exterior lines or wall penetrations."
    );
  }

  if (/\bchicken wire\b/i.test(query) && /\bdogs?\b/i.test(query) && /Dog runs are fenced, open-top areas/i.test(text)) {
    return structuredHelpfulAnswer(
      "Chicken wire is not an approved dog-run enclosure material under the current rule.",
      [
        "Dog runs require DRC approval and must use the approved enclosure materials and screening.",
        "Chain-link fencing, makeshift covers, and similar temporary-looking solutions are not allowed.",
      ],
      "Submit a dog-run plan with the location, dimensions, materials, and landscape screening before reinforcing or replacing the enclosure."
    );
  }

  if (/\b(?:gazebo|pergola)s?\b/i.test(query) && /Pergolas, gazebos/i.test(text)) {
    return structuredHelpfulAnswer(
      "A gazebo or pergola can be considered, but it requires DRC approval before construction.",
      [
        "The review covers placement, size, height, materials, color, property-line setbacks, and how the structure fits the home and lot.",
        "An attached structure may also be treated as an addition to the home.",
      ],
      "Submit a site plan and structure details to the DRC before buying materials or starting work."
    );
  }

  if (/\b(?:privacy film|tint film|window tint|tinted windows?)\b/i.test(query) && /Window coverings and tinting/i.test(text)) {
    return structuredHelpfulAnswer(
      "Dark or highly reflective window tint is not allowed. Frosted, etched, or colored glass may be considered under the current window rule.",
      ["Normal interior coverings such as curtains, blinds, draperies, and interior shutters are allowed; temporary-looking materials such as foil, cardboard, sheets, or blankets are not acceptable coverings."],
      "Confirm the exact film's darkness, reflectivity, color, and exterior appearance with the DRC before installation."
    );
  }

  if ((/\blong[-\s]?term rental\b|\b(?:lease|rent).{0,20}\b(?:30 days|month|months|long term)\b/i.test(query)) && /less than 30 consecutive days is prohibited/i.test(text)) {
    return structuredHelpfulAnswer(
      "Long-term residential leasing is allowed when the rental lasts at least 30 consecutive days and follows the written-lease requirements.",
      [
        "Rentals shorter than 30 consecutive days are prohibited.",
        "The lease must be written, the renter must be told the home is subject to community rules, and a nonresident owner must give the CAB a current mailing address.",
      ],
      "Use a written lease and review the linked current leasing subsection before advertising the home or signing a tenant."
    );
  }

  if (/\b(?:approved landscapers?|list of approved landscapers?)\b/i.test(query) && /Registration with the CAB is required/i.test(text)) {
    return structuredHelpfulAnswer(
      "Yes. CAB maintains an official approved-landscapers directory. The rulebook also requires the individual who designs or supervises residential landscaping or irrigation work to be registered with the CAB.",
      ["Registration belongs to an individual, not just the landscaping company, and the registered person is responsible for work performed under their supervision."],
      "Confirm the individual’s current CAB registration, then compare qualifications, references, insurance, and pricing before hiring a landscaper."
    );
  }

  if (/\bdo my own landscaping\b/i.test(query) && /Registration with the CAB is required/i.test(text)) {
    return structuredHelpfulAnswer(
      "You may do physical landscaping work yourself, but the rule requires a CAB-registered professional for landscape design, irrigation design, and supervision of landscape or irrigation installation.",
      ["The landscape and irrigation plan also needs DRC approval, and the application and checklist must be updated when 15 percent or more of the irrigated area is modified."],
      "Confirm who will serve as the registered professional and obtain plan approval before starting the work."
    );
  }

  if ((/\b(?:continually add|redo backyard|redo (?:my )?backyard|modify|changing?).{0,30}\blandscap/i.test(query) || /\bredo (?:my )?backyard\b/i.test(query)) && /15 percent or more of the irrigated area is being modified/i.test(text)) {
    return structuredHelpfulAnswer(
      "Small maintenance changes are different from changing the approved landscape plan. When 15 percent or more of the irrigated area is modified, the Landscape and Irrigation Application and checklist must be updated and approved by the DRC.",
      ["New plant choices still need to come from the recommended plant list or receive DRC approval, and the water budget continues to apply."],
      "Measure the total area being changed and ask the DRC before work if the cumulative changes may reach the 15 percent threshold."
    );
  }

  if (/\bcatio\b/i.test(query) && /Accessory buildings\. DRC approval is required|outdoor pet areas.*DRC approval is required/i.test(text)) {
    return structuredHelpfulAnswer(
      "A freestanding catio should be submitted to the DRC before installation.",
      [
        "The rulebook does not name catios specifically, but it requires approval for freestanding accessory buildings and most outdoor pet areas.",
        "The DRC can determine which category applies based on the catio's size, height, materials, location, screening, and whether it is attached to the home.",
      ],
      "Submit a site plan, dimensions, photos or product details, materials, and screening plan before buying or installing it."
    );
  }

  if (/\b(?:changing|replace).{0,25}\bfront yard tree\b|\bfront yard tree\b.{0,25}\b(?:changing|replace)\b/i.test(query) && /replace dead or dying materials with like materials/i.test(text)) {
    return structuredHelpfulAnswer(
      "Replacing a tree with the same type does not require approval, but changing from one species to another is a design change and needs DRC approval.",
      ["Choose the replacement from the current preapproved plant list or ask the DRC to approve another species, and keep the required tree size and tree-lawn layout."],
      "For a locust-to-maple change, submit the proposed maple species, size, and location before planting."
    );
  }

  if (/\b(?:no plant zone|planting easements?|easements?)\b/i.test(query) && /easement/i.test(text)) {
    return structuredHelpfulAnswer(
      "There is not one universal planting rule for every easement. The easements recorded for your lot and the rule for the specific project control what can be planted or installed there.",
      [
        "The DRC landscape plan must show easements and setbacks, and some improvements, including landscape screens and rain barrels, are expressly kept out of easements.",
        "Utility, drainage, access, and sight-triangle areas can have different restrictions and must remain usable for their intended purpose.",
      ],
      "Check your recorded plat or survey and mark the easement on the DRC plan before planting or installing a structure."
    );
  }

  if (/\b(?:extend|add|build|redo).{0,30}\b(?:concrete|patio)\b|\b(?:concrete|patio)\b.{0,30}\b(?:extend|add|build|redo)\b/i.test(query) && /Any change to the exterior of the home or on the lot must be submitted to the DRC/i.test(text)) {
    return structuredHelpfulAnswer(
      "A new or extended concrete patio changes the lot and must be submitted to the DRC for approval before work starts.",
      ["The review can cover the site plan, property lines, drainage, setbacks, materials, and any patio-cover dimensions."],
      "Submit the proposed dimensions and site plan through the current DRC process before hiring the concrete contractor."
    );
  }

  if (/\bplants required in the rear landscaping|\brear (?:yard )?landscaping\b/i.test(query) && /Backyard landscaping also must include two trees/i.test(text)) {
    const live = text.match(/backyard must contain a minimum of ([0-9]+ percent) live plant material/i);
    return structuredHelpfulAnswer(
      "The standard rear-yard plan requires 2 trees: 1 deciduous tree and 1 evergreen tree.",
      [
        "The deciduous tree must meet the current caliper requirement, and the evergreen must meet the current minimum-height requirement shown in the source.",
        live ? `The backyard must also contain at least ${live[1]} live plant material; tree canopies alone do not count toward that coverage.` : "Additional live-plant coverage and irrigation requirements also apply.",
      ],
      "Use the linked required-lot-landscape section and your village standards when preparing the DRC plan."
    );
  }

  if (/^\s*side yard\s*[?.!]*$/i.test(query) && /Side yard visible from the street shall include/i.test(text)) {
    return structuredHelpfulAnswer(
      "Side-yard requirements depend on whether the area is visible from the street and what project you want to add.",
      [
        "A street-visible side yard has minimum variety and live-coverage planting requirements in the current landscape standard.",
        "Projects such as screens, sheds, patios, fencing, and equipment have their own placement, setback, screening, and approval rules.",
      ],
      "Tell me what you want to change in the side yard, or open the linked lot-landscape standard for the planting requirements."
    );
  }

  if (/\b(?:quantum fiber|fiber internet|internet provider)\b/i.test(query) && /Internet and networking/i.test(`${sources[0]?.title || ""} ${text}`)) {
    return structuredHelpfulAnswer(
      "The current rulebook describes the community's fiber infrastructure and builder installation requirements, but it does not say that a homeowner must subscribe to Quantum Fiber.",
      ["The provider names in the codified technology sections may reflect the network arrangements in effect when those sections were adopted, so they do not prove which retail providers are available at an address today."],
      "Check current service availability for your address and confirm any community-network question with CAB technology support before changing providers."
    );
  }

  if (/\binternet access for water usage\b|\b(?:view|access|see).{0,30}\bwater usage\b/i.test(query) && /remotely shut off water|water meter/i.test(text)) {
    return structuredHelpfulAnswer(
      "Sterling Ranch homes use connected water-metering equipment that can report indoor and outdoor usage, but the rulebook does not provide a resident login link or current app instructions.",
      ["The technology sections describe the installed metering and home-automation system, not the current account-recovery or portal process."],
      "Use the official home-automation support contact or CAB resident support to restore access to your water-usage view."
    );
  }

  if (/\b(?:pickle ?ball|sport court)\b/i.test(query) && /Sport courts[\s\S]{0,500}?pickleball/i.test(text)) {
    return structuredHelpfulAnswer(
      "A private pickleball or other sport court requires DRC approval, and the court may not be lighted.",
      [
        "The submittal must show the court on the lot, setbacks, proposed safety fencing, colors, and materials.",
        "The rule covers pickleball along with basketball, volleyball, tennis, shuffleboard, and similar sport surfaces.",
      ],
      "Submit the complete court plan to the DRC before construction."
    );
  }

  if (/\bfireworks?\b/i.test(query) && /No fireworks or firearms may be fired or discharged within the Development/i.test(text)) {
    return structuredHelpfulAnswer(
      "No. Residents may not fire or discharge fireworks in Sterling Ranch.",
      [
        "The limited exceptions require a specifically designated area, compliance with applicable law, CAB permission, and an approved professional fireworks company.",
      ],
      "Do not treat a county or state allowance as CAB permission for a private display."
    );
  }

  if (/\b(?:hang|attach|mount).{0,30}\bfence\b|\bfence\b.{0,30}\b(?:hang|attach|mount)\b/i.test(query) && /household items[^.]{0,80}may not be hung from any window, balcony, fence/i.test(text)) {
    return structuredHelpfulAnswer(
      "Household items may not be hung from a fence.",
      ["The same rule also covers items hung from windows, balconies, and building facades."],
      "If you mean a permanent fence feature rather than a household item, confirm the proposed attachment with the DRC before installing it."
    );
  }

  if (isPlantListQuestion(query) && /preapproved plant list/i.test(`${sources[0]?.title || ""} ${text}`)) {
    return structuredHelpfulAnswer(
      "Yes. The current rulebook includes a preapproved list of trees, shrubs, grasses, and perennials.",
      [
        "The list groups plants by water need and encourages lower-water species.",
        "Plants outside the preapproved list can still be considered by the DRC.",
      ],
      "Open the linked Sec. 5-131 source for the current list and use the standards for your specific village and yard location before planting."
    );
  }

  if (/\bwhat is (?:a )?tree lawn\b/i.test(query) && /between their property edge and the street/i.test(text)) {
    return structuredHelpfulAnswer(
      "A tree lawn is the landscaped strip between your property edge and the street along your lot.",
      ["The homeowner is responsible for irrigating and maintaining that strip, including grass and required plant material."],
      "Check the linked tree-lawn rules before changing its approved layout or plantings."
    );
  }

  if (/\b(?:community own|who owns?).{0,40}\b(?:landscaping|tree lawn|sidewalk)\b|\blandscaping\b.{0,30}\bsidewalk\b/i.test(query) && /between (?:their property edge and the street|the street and sidewalk)/i.test(text)) {
    return structuredHelpfulAnswer(
      "The rulebook does not establish ownership of that strip. It calls the landscaped area between the street and sidewalk the tree lawn and makes the adjoining owner responsible for irrigating and maintaining it.",
      ["Maintenance responsibility does not by itself prove legal ownership; the recorded plat, right-of-way, and easements determine that boundary."],
      "Check your lot plat or survey before treating the tree lawn as private property or installing anything there."
    );
  }

  if (isFenceFinishQuery(query) && /stained in the approved color to match the concrete perimeter fence/i.test(text)) {
    const concreteColor = text.match(/color selected for concrete fencing is\s+Solomon\s+#?(\d+)\s*[\"“]?([A-Za-z ]+)/i);
    return structuredHelpfulAnswer(
      "The fencing standard says cedar fencing must use the approved stain color that matches the concrete perimeter fence. It does not expose a reliable neighborhood-specific stain product name in the searchable text.",
      [
        concreteColor ? `The concrete-fence specification names Solomon #${concreteColor[1]} “${concreteColor[2].trim()},” but that is not automatically the stain product name.` : "The concrete-fence color and wood-stain product are separate specifications.",
        "Fence styles and finishes can vary by location, so a color listed for a trash screen or another fence type should not be reused as the answer.",
      ],
      "Open the linked fencing standard and confirm your village and fence type with the DRC before buying stain."
    );
  }

  if (/\bflagpoles?\b/i.test(query) && /DRC approval is required for freestanding flagpoles/i.test(text) && /\b(?:height|high|tall|maximum|max)\b/i.test(query)) {
    return structuredHelpfulAnswer(
      "The current cited rule does not set a numeric maximum height for a freestanding flagpole. It requires DRC approval.",
      ["The 4-foot-by-6-foot limit in the same rule applies to the flag itself, not the height of the pole."],
      "Ask the DRC to confirm the allowable pole height for your lot before choosing or installing one."
    );
  }

  if (
    semanticConceptMatchesQuery("rental-cancellations", query) &&
    /Refunds for cancellations of facility rentals/i.test(text)
  ) {
    return structuredHelpfulAnswer(
      "Facility-rental refunds follow the cancellation terms in the current Rental Agreement.",
      [
        "Open the Rental Agreement used for the reservation and check its cancellation deadline and refund terms.",
        "The codified rule does not promise one universal refund amount or deadline; the agreement controls those details.",
        "Use the linked official Amenity Rentals page for the current agreement and CAB contact information.",
      ],
      "Contact CAB staff before canceling if the event is close, because the current agreement determines what can be refunded."
    );
  }

  if (isAmenityReservationQuery(query)) {
    const answer = facilityRentalOverviewAnswer(residentQuestion, sources);
    if (answer) return answer;
  }

  if (
    isAmenityReservationQuery(query) &&
    /Submit the Sterling Ranch Community Authority Board Facilities Rental Application/i.test(text)
  ) {
    const asksAboutPark = /\bparks?\b|\bpark shelters?\b/i.test(query);
    return structuredHelpfulAnswer(
      asksAboutPark
        ? "To reserve a CAB park space, start with the official Park Shelters page and Facility Rentals catalog. Park shelters and benches can be rented; playgrounds and grassy areas are not included."
        : "To reserve a CAB facility, start with the Facilities Rental Application and Agreement.",
      [
        "Submit the completed rental agreement with the required rental fee, security deposit, and any other current charges.",
        /first-come, first-served/i.test(text)
          ? "Requests are reviewed first-come, first-served, and CAB programs and events receive scheduling priority."
          : "CAB staff reviews the request and confirms availability.",
        asksAboutPark
          ? "If the shelter is not available for online reservation, contact Recreation at recreation@sterlingranchcab.com or 720-728-7257."
          : "Use the linked official Amenity Rentals page and current application for today’s availability, fees, and submission instructions.",
      ],
      "The booking is not confirmed until CAB staff approves it; some rentals may also require additional approval."
    );
  }

  if (/\bbasketball\b/i.test(query) && /Basketball backboards/i.test(text)) {
    return structuredHelpfulAnswer(
      "Basketball hoops do not require DRC approval when the listed conditions are met; rear-yard courts do require approval.",
      [
        "Portable hoops cannot block streets, sidewalks, alleys, garages, driveways, vehicles, or pedestrians.",
        "Keep portable and permanent hoops in good repair.",
        "Rear-yard courts require DRC approval, and lighted rear-yard courts are not permitted.",
      ],
      "Review the linked basketball section before choosing the location or building a court."
    );
  }

  if (/\bdog run\b/i.test(query) && /Dog runs are fenced, open-top areas/i.test(text)) {
    const area = text.match(/may not exceed ([0-9]+\s+square feet) or ([0-9]+\s+percent)\s+of the rear yard/i);
    return structuredHelpfulAnswer(
      "Yes, but a dog run is an outdoor pet area and requires DRC approval.",
      [
        "Location: place it beside or behind the home, behind yard fencing, and screen it with evergreen plantings and grasses.",
        area ? `Size: no more than ${area[1]} or ${area[2]} of the rear yard, whichever is less.` : "",
        "Materials must follow the pet-area rule; chain-link enclosures and makeshift covers are not allowed.",
      ],
      "Submit the location, size, materials, and screening plan to the DRC before construction."
    );
  }

  if (/\b(?:rent|rental).*\bclubhouse\b|\bclubhouse\b.*\b(?:rent|rental)\b/i.test(query) && /Clubhouse.*may be rented by any Member/i.test(text)) {
    return structuredHelpfulAnswer(
      "Yes. Members may rent the available portions of the Clubhouse.",
      [
        "Available areas include the Great Hall, its kitchen, balcony and outside fireplace patio, plus Pavilion 1 and Pavilion 2.",
        "Capacity and scheduling limits apply, and larger or special events may have additional conditions.",
        "The pool and pool deck are not normally rentable unless the CAB explicitly authorizes a written request.",
      ],
      "Use the current facility reservation process to confirm availability, pricing, deposit, and event requirements."
    );
  }

  if (/\bpool rules?\b/i.test(query) && /pool-specific rules and regulations/i.test(`${sources[0]?.title || ""} ${text}`)) {
    return structuredHelpfulAnswer(
      "The pool is open for responsible use, with safety, hygiene, swimwear, and staff-direction rules.",
      [
        "Safety: non-swimmers need a swimmer within arm's reach; running, horseplay, unsafe diving, and misuse of pool equipment are prohibited.",
        "Health: shower first, use proper swimwear, stay out when ill or with open sores, and use approved swim diapers when needed.",
        "Pool deck: glass containers are prohibited, walkways must stay clear, and staff may restrict toys or activities for safety and crowding.",
      ],
      "Read the linked pool-specific rules and follow posted signs and lifeguard instructions during your visit."
    );
  }

  if (sectionNumberQuestion(query) === "21-21" && /Any change to the exterior of the home or on the lot/i.test(text)) {
    return structuredHelpfulAnswer(
      "Section 21-21 explains the design review process for changes to a home's exterior or lot.",
      [
        "Submit exterior or lot changes to the DRC and receive approval before work begins.",
        "The section explains what to submit, how review works, and how to check an application's status.",
        "Starting without approval can lead to fines, removal of unapproved work, or legal action.",
      ],
      "Use the linked section and current DRC application materials before starting an exterior project."
    );
  }

  if (/\blandscape lighting\b/i.test(query) && /DRC approval is required to modify or add exterior lighting/i.test(text)) {
    const kelvin = text.match(/color temperature of ([0-9,]+ Kelvin) or less/i);
    return structuredHelpfulAnswer(
      "Yes, but adding or changing landscape lighting requires DRC approval.",
      [
        "Use fully shielded fixtures with light directed downward and kept within the property.",
        kelvin ? `Color: use warm white light at ${kelvin[1]} or less.` : "Use warm white light.",
        "Up-lighting trees, shrubs, buildings, or the sky is not permitted.",
      ],
      "Submit fixture cut sheets and the proposed layout to the DRC before installation."
    );
  }

  if (/\bcommercial vehicle\b/i.test(query) && /Commercial vehicles, oversized vehicles/i.test(text)) {
    const count = text.match(/Only ([a-z]+) such vehicle is permitted/i);
    const weight = text.match(/gross weight of ([0-9,]+ pounds) or less/i);
    return structuredHelpfulAnswer(
      "Some work vehicles may be parked at a residence, but only when they meet the commercial-vehicle conditions.",
      [
        `${count ? `Limit: ${count[1]} qualifying vehicle per residence` : "A per-residence limit applies"}${weight ? `, weighing ${weight[1]} or less` : ""}.`,
        "Exposed tools, racks, ladders, and equipment must be removed daily when the vehicle is outside the garage.",
        "Oversized or disallowed configurations cannot be stored at the residence; emergency-access and neighbor-access rules also apply.",
      ],
      "Compare the vehicle's size, weight, markings, equipment, and axle configuration with the linked section before parking it at home."
    );
  }

  if (isVegetableGardenQuery(query) && /Gardens; vegetable.*DRC approval is required/i.test(text)) {
    const coverage = text.match(/Not cover more than ([0-9]+ percent) of the rear or side yard/i);
    const setback = text.match(/minimum of ([a-z]+ feet) from all property lines/i);
    return structuredHelpfulAnswer(
      "Yes, vegetable gardens and raised beds may go in a rear or side yard, but DRC approval is required.",
      [
        "The DRC reviews location, lot conditions, size, materials, and views from neighboring properties.",
        `${coverage ? `Coverage: no more than ${coverage[1]} of the rear or side yard. ` : ""}${setback ? `Setback: at least ${setback[1]} from property lines.` : ""}`.trim(),
        "Boxes must complement the home, be screened from adjacent homes and public areas, and be maintained after the growing season.",
      ],
      "Submit the bed location, size, materials, and screening plan to the DRC before installation."
    );
  }

  return "";
}

function specificCurrentFeeAnswer(query, sources = []) {
  const text = combinedSourceText(sources);
  const year = sources
    .map((source) => String(source.title || "").match(/\b(20\d{2})\b/)?.[1])
    .find(Boolean);
  const amount = (match) => (match ? `$${match[1]}` : "");

  if (/\b(?:tap|facility|facilities)\b/i.test(query) && /Tap and Facility Fees/i.test(text)) {
    const stormwater = amount(
      text.match(/Single Family Detached\s+\$\s*([\d,]+(?:\.\d{2})?)\s+N\/A\s+\$\s*\1/i)
    );
    const facility = amount(
      text.match(/Fee per Unit Residential Single Family Detached[^$]{0,100}\$\s*([\d,]+(?:\.\d{2})?)/i)
    );
    if (!stormwater || !facility) return "";
    return structuredHelpfulAnswer(
      `The current ${year || ""} tap-and-facility schedule has several one-time charges, and the exact total depends on the property and utility setup.`.replace(/current\s+\s+/, "current "),
      [
        `Residential stormwater tap: ${stormwater} per unit.`,
        `Residential facility fee: ${facility} for a single-family detached home or duplex; other housing types have separate amounts.`,
        "Water and sewer tap totals vary by home type, lot size, meter size, and intended use.",
      ],
      "Use the linked current schedule to match the exact property category before budgeting or paying."
    );
  }

  if (/\b(?:water rates?|water fee|water charge)\b/i.test(query) && /Monthly Fee Residential/i.test(text)) {
    const base = amount(
      text.match(/Monthly Fee Residential[\s\S]{0,180}?Single Family Detached[^$]{0,80}\$\s*([\d,]+(?:\.\d{2})?)/i)
    );
    const tierOne = amount(
      text.match(/Tier residential and non-residential Fee per 1,000 gallons Tier 1[^$]{0,100}\$\s*([\d,]+(?:\.\d{2})?)/i)
    );
    if (!base || !tierOne) return "";
    return structuredHelpfulAnswer(
      `For a standard individually metered home, the current ${year || ""} schedule lists a ${base} monthly water base charge, plus usage.`.replace(/current\s+\s+/, "current "),
      [
        `Monthly base charge: ${base} for the standard residential category.`,
        `Indoor water usage starts at ${tierOne} per 1,000 gallons, with higher tiers for higher use.`,
        "Outdoor water, larger meters, master meters, and nonresidential accounts use different tiers or base charges.",
      ],
      "Match your meter and property category in the linked current schedule before estimating a bill."
    );
  }

  if (/\b(?:trash|streetlight)\b/i.test(query) && /Streetlight Monthly Charge/i.test(text)) {
    const streetlight = moneyAfter(text, /Streetlight Monthly Charge Residential \(per unit\) Single Family/i, 60);
    const trash = moneyAfter(text, /Trash Monthly Charge Residential \(per unit\) Single Family/i, 60);
    if (streetlight == null || trash == null) return "";
    return structuredHelpfulAnswer(
      `The current ${year || ""} schedule lists separate monthly streetlight and trash charges.`.replace(/current\s+\s+/, "current "),
      [
        `Streetlight: ${formatMoney(streetlight)} per residential unit each month.`,
        `Trash: ${formatMoney(trash)} per single-family or townhome unit each month.`,
        "Multifamily trash service may be handled under a separate contract.",
      ],
      "Confirm your property category in the linked current CAB service-fee schedule."
    );
  }

  return "";
}

function currentEnforcementOverviewAnswer(query, sources = []) {
  const text = combinedSourceText(sources);

  if (isViolationProcessQuery(query) && /Continuous Violations Fine Amount/i.test(text)) {
    const first = text.match(/First Notice of Violation[^$]{0,80}\$\s*([\d,]+(?:\.\d{2})?)/i);
    const second = text.match(/Second Notice of Violation[^$]{0,80}\$\s*([\d,]+(?:\.\d{2})?)/i);
    const third = text.match(/Third Notice of Violation[^$]{0,80}\$\s*([\d,]+(?:\.\d{2})?)/i);
    if (!first || !second || !third) return "";
    return structuredHelpfulAnswer(
      "The process generally starts with a warning and can escalate to fines if the violation continues or repeats.",
      [
        `Continuous or repeated violations: the current first three notice amounts are ${formatMoney(Number(first[1].replace(/,/g, "")))}, ${formatMoney(Number(second[1].replace(/,/g, "")))}, and ${formatMoney(Number(third[1].replace(/,/g, "")))}.`,
        "A continuing daily fine may apply after the listed notices until the problem is corrected.",
        "The notice process includes an opportunity to request a hearing and follow the appeal process.",
      ],
      "Read the linked enforcement policy for notice dates, cure periods, nuisance violations, hearings, appeals, and daily fines."
    );
  }

  if (isDelinquentAccountQuery(query) && /Courtesy Past Due Notification/i.test(text)) {
    const courtesy = text.match(/Courtesy Past Due Notification\.\s*([A-Za-z]+)(?:\s*\(\d+\))?\s+days after/i);
    const late = text.match(/within\s+([A-Za-z]+)(?:\s*\(\d+\))?\s+calendar days after the invoice due date/i);
    if (!courtesy || !late || !/last Wednesday of the month/i.test(text)) return "";
    return structuredHelpfulAnswer(
      "An unpaid water bill moves through reminders, late-fee notices, and eventually a possible disconnection process.",
      [
        `A courtesy past-due notice may be sent ${courtesy[1].toLowerCase()} days after the due date, and a late fee may be assessed after ${late[1].toLowerCase()} calendar days.`,
        "Later notices explain the outstanding balance, hearing rights, and available payment-plan options.",
        "Utility-fee delinquency can lead to water disconnection on the last Wednesday of the month under the policy timeline.",
      ],
      "Use the linked collection policy and contact the CAB promptly if you need to dispute the balance or request a payment plan."
    );
  }

  return "";
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
    ),
    sewerBase: moneyAfter(
      waterText,
      /Monthly Base Fee Residential \(per Unit\) Single Family Detached/i
    ),
    stormwater: moneyAfter(
      waterText,
      /Monthly Charge Residential \(per Unit\) Single Family Detached/i
    ),
    indoorWater: moneyAfter(
      waterText,
      /Tier residential and non-residential Fee per 1,000 gallons Tier 1 < 100% of AWC/i
    ),
    sewerUsage: moneyAfter(
      waterText,
      /Fee per 1,000 gallons of Indoor Water Use Residential \(per Unit\) Single Family Detached/i
    ),
    streetlight: moneyAfter(
      serviceText,
      /Streetlight Monthly Charge Residential \(per unit\) Single Family/i
    ),
    trash: moneyAfter(
      serviceText,
      /Trash Monthly Charge Residential \(per unit\) Single Family/i
    ),
    sharedDriveway: moneyAfter(
      serviceText,
      /Driveway Maintenance Monthly Charge Shared Driveways/i
    ),
    alleyLoad: moneyAfter(serviceText, /Alley Load Homes/i),
  };

  if (Object.values(amounts).some((amount) => amount === null)) return null;

  const fixedTotal =
    amounts.waterBase +
    amounts.sewerBase +
    amounts.stormwater +
    amounts.streetlight +
    amounts.trash;

  return [
    `Short answer: For a typical single-family detached home with a standard individual meter, the fixed charges in the current schedules add up to ${formatMoney(fixedTotal)} each month, before water and sewer usage.`,
    "",
    "What I found:",
    `- Typical fixed monthly charges: water ${formatMoney(amounts.waterBase)}, sewer ${formatMoney(amounts.sewerBase)}, stormwater ${formatMoney(amounts.stormwater)}, streetlight ${formatMoney(amounts.streetlight)}, and trash ${formatMoney(amounts.trash)}.`,
    `- Charges that depend on usage: indoor water starts at ${formatMoney(amounts.indoorWater)} per 1,000 gallons, and sewer usage is ${formatMoney(amounts.sewerUsage)} per 1,000 gallons of indoor water use.`,
    `- Charges that apply only to some homes: ${formatMoney(amounts.sharedDriveway)} for shared-driveway maintenance or ${formatMoney(amounts.alleyLoad)} for alley-load maintenance.`,
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

  const currentFeeAnswer = specificCurrentFeeAnswer(query, sources);
  if (currentFeeAnswer) return { available: true, answer: currentFeeAnswer, sources, strategy: "structured" };

  const enforcementAnswer = currentEnforcementOverviewAnswer(query, sources);
  if (enforcementAnswer) return { available: true, answer: enforcementAnswer, sources, strategy: "structured" };

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

  if (isLandscapeOverviewQuery(query)) {
    const answer = landscapeOverviewAnswer(sources);
    if (answer) return { available: true, answer, sources, strategy: "structured" };
  }

  if (isParksOpenSpaceOverviewQuery(query)) {
    const answer = parksOpenSpaceOverviewAnswer(sources);
    if (answer) return { available: true, answer, sources, strategy: "structured" };
  }

  const factSources = sources.flatMap((source) => {
    const excerpt = currentFactExcerpt(query, source);
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

  return {
    available: true,
    answer: helpfulAnswer(
      stableLead
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
  const labels = findings.map((finding) => finding.split(":", 1)[0].toLowerCase());
  return {
    available: true,
    answer: structuredHelpfulAnswer(
      `${capitalizeFirstLetter(readableList(labels))} are separate projects with separate requirements. Review each one below before starting work.`,
      findings,
      "Use the linked official section for each project and obtain any required DRC approval before buying materials or starting installation."
    ),
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
      answer:
        "I can help with Sterling Ranch rules questions, but I can't follow instructions that try to change how I answer, ignore the rulebook, or reveal private instructions. Ask me about a community rule instead.",
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
      answer:
        "Hi! Ask me a question about Sterling Ranch community rules, and I'll look for the official source.",
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

  if (
    input.classification === INPUT_CLASSIFICATIONS.UNRELATED &&
    (searchMode !== "ai-hybrid" || input.reason === "known-unrelated-topic")
  ) {
    return {
      answer:
        input.reason === "person-identity"
          ? "I can verify Sterling Ranch rules and official community resources, but the rulebook is not a reliable source for identifying or describing a person. Please use the official CAB staff or board directory for that question."
          : "I’m only set up to answer questions about Sterling Ranch community rules. Try asking about parking, pets, design approval, lighting, fees, or another rulebook topic.",
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

  if (/\b(?:atlas coffee wifi|atlas wifi)\b/i.test(question)) {
    return {
      answer: structuredHelpfulAnswer(
        "Sterling Ranch's rulebook does not define Atlas Coffee Wi-Fi or publish current Wi-Fi access details.",
        ["Wi-Fi names, passwords, and guest-access instructions can change and should not be inferred from old technology rules."],
        "Ask staff at the Atlas Coffee location or use the official CAB website below for current resident support."
      ),
      answerMode: "official-resource",
      answerVerdict: "informational",
      inputClassification: INPUT_CLASSIFICATIONS.RULES_QUESTION,
      confidence: { canAnswer: true, confidence: "high", reason: "official-resource-boundary" },
      reviewNeeded: false,
      sources: [{ title: "Official Sterling Ranch CAB website", sourceUrl: CAB_SITE_URL, excerpt: "Official Sterling Ranch CAB website for current resident information, including support for questions about Atlas Coffee Wi-Fi.", isOfficialResource: true }],
    };
  }

  if (/\bi need to submit (?:something )?to the drc\b|\bhow do i (?:submit|apply).{0,30}\bdrc\b/i.test(question)) {
    return {
      answer: structuredHelpfulAnswer(
        "Start with the official DRC application page and choose the form for your project.",
        ["Include the site plan, dimensions, materials, colors, product information, photos, and any project-specific checklist requested for the improvement."],
        "Open the official application and Design Review Documents links below, and wait for written approval before starting work."
      ),
      answerMode: "official-resource",
      answerVerdict: "informational",
      inputClassification: INPUT_CLASSIFICATIONS.RULES_QUESTION,
      confidence: { canAnswer: true, confidence: "high", reason: "official-design-review-resource" },
      reviewNeeded: false,
      sources: OFFICIAL_DESIGN_REVIEW_RESOURCES.slice(0, 2).map(officialResourceSource),
    };
  }

  if (/^i have an alto v[?.!]*$/i.test(question)) {
    return {
      answer: "What would you like to know about your Alto home? For example, you can ask whether a patio, fence, shed, landscaping change, or exterior improvement needs approval.",
      answerMode: "targeted-clarification",
      answerVerdict: "informational",
      inputClassification: INPUT_CLASSIFICATIONS.UNCLEAR,
      confidence: { canAnswer: false, confidence: "high", reason: "incomplete-home-model-question" },
      reviewNeeded: false,
      sources: [],
    };
  }

  if (/\b(?:sterling ranch )?(?:clubs?|resident clubs?) calendar\b|\bcalendar\b.*\b(?:clubs?|events?)\b/i.test(question)) {
    return {
      answer: structuredHelpfulAnswer(
        "Yes. You can use the official Sterling Ranch calendar and filter it to Resident Clubs.",
        ["The calendar also offers filters for community events, meetings, youth events, adult events, and other categories."],
        "Open the official calendar below, choose “Resident Clubs,” and use its Notify Me option if you want updates."
      ),
      answerMode: "official-resource",
      answerVerdict: "informational",
      inputClassification: INPUT_CLASSIFICATIONS.RULES_QUESTION,
      confidence: { canAnswer: true, confidence: "high", reason: "official-community-resource" },
      reviewNeeded: false,
      sources: [{
        title: "Official Sterling Ranch Calendar",
        sourceUrl: COMMUNITY_CALENDAR_URL,
        excerpt: "Official CAB calendar with a Resident Clubs category and notification options.",
        isOfficialResource: true,
      }],
    };
  }

  if (input.classification === INPUT_CLASSIFICATIONS.UNCLEAR && !aiSearchCanInterpretUnclear) {
    return {
      answer:
        "I’m not sure which community rule you mean. Please include the thing or activity you’re asking about—for example, “street parking,” “backyard chickens,” or “shed approval.”",
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

  let searchPlan = null;
  let routingQuery = question;
  let results;
  if (searchMode === "ai-hybrid") {
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
        answer:
          "I’m only set up to answer questions about Sterling Ranch community rules and facilities. Try asking about parking, pets, design approval, amenities, fees, or another community topic.",
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
  const sources = chapterSources(index, routingQuery, 5);
  const specialSources = specialSourcesForQuestion(index, routingQuery);
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
    isPlantListQuestion(routingQuery) ||
    isLandscapeCompletionDeadlineQuery(routingQuery) ||
    isStateParksPassQuestion(routingQuery) ||
    isMovableOutdoorBelongingsQuestion(routingQuery) ||
    /\b(?:chicken wire|pickle ?ball|sport court|rain(?:water)?(?: harvesting)? barrels?|artificial turf|synthetic turf|turf|air conditioner|ac unit|hvac|mini split|gazebo|pergola|fireworks?|yard art|ornaments?|decorative objects?|garden statues?|tree lawn|fence stain|stain color|(?:specific |approved |preapproved |pre-approved )?(?:exterior |house |home |paint |garage door )colors?|paint color|color\b.{0,35}\bgarage door|garage door\b.{0,35}\bcolor|utility trailer|privacy film|tint film|window tint|long[-\s]?term rental|approved landscaper|own landscaping|redo backyard|concrete patio|extend concrete|rear landscaping|side yard|quantum fiber|internet provider|water usage|front yard tree|catio|easement)\b/i.test(routingQuery) ||
    isFenceFinishQuery(routingQuery) ||
    /\b(?:hang|attach|mount).{0,30}\bfence\b|\bfence\b.{0,30}\b(?:hang|attach|mount)\b/i.test(routingQuery)
  );
  const answerSources = decorateSourcesForQuestion(
    routingQuery,
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
            : fallbackSources,
    index
  );
  const confidence = assessAnswerConfidence(routingQuery, results, answerSources);

  const exactSection = sectionNumberQuestion(routingQuery);
  const hasExactSectionSource = exactSection && answerSources.some((source) =>
    new RegExp(`^Sec\\.\\s*${escapeRegExp(exactSection)}\\b`, "i").test(source.title || "")
  );
  if (exactSection && !hasExactSectionSource) {
    return {
      answer: structuredHelpfulAnswer(
        `I could not find Sec. ${exactSection} as a current section heading in the indexed Sterling Ranch rulebook, so I won't substitute a different section.`,
        ["A number can appear inside another section as a cross-reference or an older numbering reference without being a current searchable section heading."],
        "Check the number on the official Municode page or share the section title or topic so I can locate the intended current rule."
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
        "I found more than one current official policy claiming to replace the same rule section, so I won't guess which one controls.",
        answerSources,
        "Confirm the controlling version with the CAB before acting. This conflict has been flagged for review."
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

  let earlyStructuredAnswer = "";
  if (isMovableOutdoorBelongingsQuestion(routingQuery) && answerSources.some((source) => /^Sec\. 1-38\./i.test(source.title || ""))) {
    earlyStructuredAnswer = structuredHelpfulAnswer(
      "For movable belongings, the rule does not use a set distance from the porch. Your items must stay on your lot and cannot be stored, left, or parked on a roadway or walkway.",
      [
        "The rule specifically includes furniture, electrical cords, bicycles, barbecues, and toys, plus other personal property.",
        "A porch edge and a lot boundary are not necessarily the same line, so an item being just beyond the porch does not by itself decide whether it is allowed.",
      ],
      "If the item is a decoration, planter, light, or a permanent porch or patio change, name the item because a different rule may apply. If the lot line is unclear, check your plat or survey before placing it there."
    );
  }
  if (!isFenceFinishQuery(routingQuery) && /\b(?:(?:specific |approved |preapproved |pre-approved )?(?:exterior |house |home |paint |garage door )colors?|paint color|color\b.{0,35}\bgarage door|garage door\b.{0,35}\bcolor)\b/i.test(routingQuery) && answerSources.some((source) => /21-22|Painting, exterior/i.test(source.title || ""))) {
    earlyStructuredAnswer = structuredHelpfulAnswer(
      "The cited exterior-painting rule explains the approval process without identifying a single community-wide garage-door color list. Exterior painting still requires DRC approval, even when repainting with the same colors.",
      [
        "A paint submittal must identify the manufacturer, color number, and where each color will be used on the body, trim, eaves, and other exterior areas.",
        "The rule says the DRC may limit paint colors to certain preapproved colors and combinations for a specific area or village.",
      ],
      "Use your home's approved scheme and submit the manufacturer paint chips to the DRC before repainting; do not choose a color from another home or fence rule."
    );
  }
  if (!earlyStructuredAnswer && isFenceFinishQuery(routingQuery) && answerSources.some((source) => /^Sec\. 21-23\./i.test(source.title || ""))) {
    const sourceText = combinedSourceText(answerSources);
    const concreteColor = sourceText.match(/color selected for concrete fencing is\s+Solomon\s+#?(\d+)\s*[\"“]?([A-Za-z ]+)/i);
    earlyStructuredAnswer = structuredHelpfulAnswer(
      "The fencing standard requires cedar fencing to use the approved stain that matches the concrete perimeter fence. The searchable rule text does not provide a reliable neighborhood-specific wood-stain product name.",
      [
        concreteColor ? `The concrete-fence specification names Solomon #${concreteColor[1]} “${concreteColor[2].trim()},” but that is not automatically the wood-stain product name.` : "The concrete-fence color and the wood-stain product are separate specifications.",
        "Do not reuse the Belvedere Tan color listed for a trash enclosure as a general fence-stain answer.",
      ],
      "Open the linked fencing standard and confirm your village and fence type with the DRC before buying stain."
    );
  }
  if (!earlyStructuredAnswer && /\b(?:hang|attach|mount).{0,30}\bfence\b|\bfence\b.{0,30}\b(?:hang|attach|mount)\b/i.test(routingQuery) && answerSources.some((source) => /^Sec\. 1-38\./i.test(source.title || ""))) {
    earlyStructuredAnswer = structuredHelpfulAnswer(
      "Household items may not be hung from a fence.",
      ["The same rule also covers rugs, clothing, and household items hung from windows, balconies, and building facades."],
      "If you mean a permanent fence feature rather than a household item, confirm the proposed attachment with the DRC before installing it."
    );
  }
  if (!earlyStructuredAnswer) {
    earlyStructuredAnswer = focusedTopicAnswer(routingQuery, answerSources, structuredHelpfulAnswer);
  }
  if (!earlyStructuredAnswer) {
    earlyStructuredAnswer = simpleTopicOverviewAnswer(routingQuery, answerSources, question);
  }
  if (!earlyStructuredAnswer && isRvParkingQuery(routingQuery)) {
    earlyStructuredAnswer = rvParkingOverviewAnswer(question, answerSources);
  }
  if (!earlyStructuredAnswer && isFlagQuery(routingQuery)) {
    earlyStructuredAnswer = flagAndPoliticalSignOverviewAnswer(routingQuery, answerSources);
  }
  if (earlyStructuredAnswer && answerSources.length) {
    const displaySources = sourcesWithOfficialResources(routingQuery, answerSources, earlyStructuredAnswer);
    const coverageIssues = answerCoverageIssues(question, earlyStructuredAnswer, displaySources);
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
    return {
      answer: earlyStructuredAnswer,
      answerMode: "source-derived-structured",
      answerVerdict: deriveAnswerVerdict(earlyStructuredAnswer, { canAnswer: true, confidence: "high" }),
      confidence: confidence.canAnswer
        ? confidence
        : { canAnswer: true, confidence: "high", reason: "source-validated-topic-answer" },
      inputClassification: effectiveInputClassification,
      searchMode,
      sources: displaySources,
      ...(isStateParksPassQuestion(routingQuery) ? { controllingSourceOnly: true } : {}),
      sourceStatus: status,
      qualityChecks: {
        requestedFacetCoverage: coverageIssues.length === 0,
        issues: coverageIssues,
      },
    };
  }

  if (!answerSources.length || topScore < 2 || !confidence.canAnswer) {
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
  const needsSourceDerivedFacts = summaryHasVolatileFacts(plainAnswer) || needsStructuredOverview;
  const compoundDerived = compoundSources.length
    ? compoundSourceDerivedAnswer(routingQuery, answerSources, index)
    : null;
  const derived = compoundDerived || (needsSourceDerivedFacts
    ? sourceDerivedAnswerParts(
        routingQuery,
        answerSources,
        isLandscapeCompletionDeadlineQuery(routingQuery) ? "" : plainAnswer,
        question
      )
    : { available: true, answer: plainAnswer, sources: answerSources, strategy: "deterministic" });

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
  const finalConfidence = answerAdmitsInsufficientEvidence(answer)
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
    answerMode: needsSourceDerivedFacts
      ? rewrittenAnswer
        ? `source-derived-llm-${llmMode}`
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

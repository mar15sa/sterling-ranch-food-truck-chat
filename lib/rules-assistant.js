const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const { rewriteAnswerWithLLM } = require("./rules-llm");

const CLIENT_ID = 20324;
const PRODUCT_ID = 15752;
const PUBLICATION_ID = 4303;
const MUNIDOC_HOST = "https://library.municode.com";
const SOURCE_PATH =
  "/co/sterling_ranch_community_authority_board/codes/rules_and_regulations";
const OFFICIAL_SOURCE_URL = `${MUNIDOC_HOST}${SOURCE_PATH}`;
const CAB_SITE_URL = "https://sterlingranchcab.com";
const DESIGN_REVIEW_DOCUMENTS_URL = `${CAB_SITE_URL}/201/Design-Review-Documents`;
const SUBMIT_DRC_APPLICATION_URL = `${CAB_SITE_URL}/198/Architectural-Community-Standards`;
const DEFAULT_INDEX_PATH = path.join(__dirname, "..", "data", "rules-index.json");
const DEFAULT_SUPPLEMENTS_PATH = path.join(__dirname, "..", "data", "rules-supplements.json");
const DEFAULT_SUPPLEMENT_SECTIONS_PATH = path.join(
  __dirname,
  "..",
  "data",
  "rules-supplement-sections.json"
);
const DEFAULT_REFRESH_MAX_AGE_MS = 1000 * 60 * 60 * 24;
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
  privacy: ["screen", "screens", "screening", "landscape"],
  rates: ["rate", "fees", "charges"],
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
const SEMANTIC_CONCEPTS = [
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
  cans: ["can", "cans", "container", "containers", "receptacle", "receptacles"],
  dogs: ["dog", "dogs"],
  fence: ["fence", "fences", "fencing"],
  home: ["home", "house"],
  house: ["house", "home"],
  lights: ["light", "lights", "lighting"],
  panels: ["panel", "panels"],
  paint: ["paint", "painting", "repaint", "repainting"],
  privacy: ["privacy", "privacy screen", "landscape screen", "landscape screens", "screening"],
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
}

async function loadRulesIndex(indexPath = DEFAULT_INDEX_PATH) {
  try {
    const raw = await fs.readFile(indexPath, "utf8");
    return withSupplementalDocuments(JSON.parse(raw));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
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

function semanticConceptScore(document, query) {
  const sourceText = `${document.title || ""} ${document.chapter || ""} ${document.article || ""} ${document.text || ""}`;
  let score = 0;

  for (const concept of SEMANTIC_CONCEPTS) {
    const queryMatches = concept.queryPatterns.every((pattern) => pattern.test(query));
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
  const queryVector = hashedSemanticVector(query);
  const sourceVector = hashedSemanticVector(sourceText);
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

function isUpdatedExteriorLightingPolicy(document = {}) {
  const combined = `${document.title || ""} ${document.sourceName || ""} ${document.text || ""}`;
  return (
    Boolean(document.isSupplemental) &&
    /\b(updated exterior lighting policy|resolution no\.?\s*2024-05-04|Gemstone and Jellyfish systems are the approved systems)\b/i.test(
      combined
    )
  );
}

function extractQueryYears(query) {
  return [...String(query).matchAll(/\b(20\d{2})\b/g)]
    .map((match) => Number(match[1]))
    .filter((year) => year >= 2020 && year <= 2100);
}

function dateValue(value) {
  const timestamp = Date.parse(value || "");
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function documentEffectiveYear(document) {
  const explicitYear = Number(document.effectiveYear);
  if (Number.isInteger(explicitYear) && explicitYear >= 2020) return explicitYear;

  const effectiveDate = document.effectiveDate || document.approvedDate || "";
  const match = String(effectiveDate).match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : 0;
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
    /\b(tree|trees|plant|plants|material|materials|tree lawn)\b/i.test(text)
  );
}

function isWateringRestrictionQuery(query) {
  return (
    /\b(water|watering|irrigat)\b/i.test(query) &&
    /\b(lawn|yard|landscap|garden|outdoor|restrictions?|schedule|allowed|day|days)\b/i.test(query)
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

function isFlagQuery(query) {
  return /\b(flag|flags|flagpole|flagpoles|political sign|political signs|signage)\b/i.test(
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
  const searchStats = buildSearchStats(index.documents);
  const replacementSupplements = currentReplacementSupplements(index.documents);

  const scoredDocuments = index.documents
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
      isSupplemental: Boolean(result.isSupplemental),
      isSupplementSection: Boolean(result.isSupplementSection),
      extractionStatus: result.extractionStatus,
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
    isSupplemental: Boolean(document.isSupplemental),
    isSupplementSection: Boolean(document.isSupplementSection),
    extractionStatus: document.extractionStatus,
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

function capitalizeFirstLetter(text = "") {
  return String(text || "").replace(/^(\s*)([a-z])/, (_, space, letter) => `${space}${letter.toUpperCase()}`);
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
    };
  });
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

function designReviewResourceSourcesForQuestion(query, answerSources = []) {
  const questionText = cleanText(query);
  const combined = cleanText(
    [
      questionText,
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
  if (/\b(landscap|yard|turf|irrigation|garden|planting)\b/i.test(questionText)) add("landscape-submittal");
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

function sourcesWithOfficialResources(query, answerSources) {
  const sources = [...answerSources, ...designReviewResourceSourcesForQuestion(query, answerSources)];
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
        return `- ${title}: ${shortenText(excerpt, 420)}`;
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

function readableList(items) {
  const clean = items.filter(Boolean);
  if (!clean.length) return "the matching sections";
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")}, and ${clean[clean.length - 1]}`;
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

function buildPlainAnswer(query, results, index, sourcesForAnswer = []) {
  const topSources = sourcesForAnswer.length ? sourcesForAnswer.slice(0, 3) : meaningfulSources(results, 3);
  const chapterSummary = buildChapterSummary(index, query, topSources);
  if (chapterSummary) return chapterSummary;

  const sectionNames = readableList(topSources.map((source) => cleanSectionTitle(source.title)));

  if (isContactInfoQuery(query)) {
    const answer = contactAnswer(query, topSources);
    if (answer) return answer;
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
      "Exterior painting changes require DRC approval, even when repainting with the same colors. Small touch-ups on limited areas such as railings, shutters, or columns do not require approval.",
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
      "Yes, but a backyard utility shed requires DRC approval. The shed is reviewed for size, height, color, relationship to the lot, landscaping, and setbacks. The rule says sheds should generally stay under eight feet, six inches tall, the footprint maximum is 150 square feet, utilities must be underground, and landscape screening is required.",
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
      "Trampolines require DRC approval. The rulebook also says they should be at least five feet from property lines and screened with tall plant material.",
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

async function answerRulesQuestion(query, options = {}) {
  const question = cleanText(query);
  const indexPath = options.indexPath || DEFAULT_INDEX_PATH;
  const index = await loadRulesIndex(indexPath);
  const status = await getRulesIndexStatus(indexPath);

  if (!question) {
    return {
      answer: "Ask a plain-English question about the Sterling Ranch CAB Rules and Regulations.",
      sources: [],
      sourceStatus: status,
    };
  }

  if (!index) {
    return {
      answer:
        "I could not find a local rulebook index yet. Please refresh the source index, then try the question again.",
      sources: [],
      sourceStatus: status,
    };
  }

  const results = searchRulesIndex(index, question, 6);
  const topScore = results[0]?.score || 0;
  const sources = chapterSources(index, question, 5);
  let fallbackSources = focusedSourcesForQuestion(question, meaningfulSources(results, 5), 5);
  if (isWateringRestrictionQuery(question)) {
    fallbackSources = fallbackSources
      .filter((source) => /13-105|water conservation measures/i.test(source.title || ""))
      .slice(0, 1);
  }
  if (isFlagQuery(question)) {
    const flagTopic = sourcesByTitle(
      index,
      question,
      [/21-22.*\(b\)\(37\).*Flags/i],
      1
    )[0];
    if (flagTopic && !fallbackSources.some((source) => source.nodeId === flagTopic.nodeId)) {
      fallbackSources = [...fallbackSources, flagTopic].slice(0, 5);
    }
  }
  const overviewSources = isResidentFeeOverviewQuery(question)
    ? residentFeeOverviewSources(index, question)
    : [];
  const answerSources = decorateSourcesForQuestion(
    question,
    overviewSources.length ? overviewSources : sources.length ? sources : fallbackSources,
    index
  );
  const confidence = assessAnswerConfidence(question, results, answerSources);

  if (!answerSources.length || topScore < 2 || !confidence.canAnswer) {
    return {
      answer: unclearAnswer(answerSources),
      confidence,
      sources: answerSources.slice(0, 3),
      sourceStatus: status,
    };
  }

  const plainAnswer = buildPlainAnswer(question, results, index, answerSources);
  const rewrittenAnswer = await rewriteAnswerWithLLM(question, plainAnswer, answerSources);
  const displaySources = sourcesWithOfficialResources(question, answerSources);

  return {
    answer: rewrittenAnswer || plainAnswer,
    answerMode: rewrittenAnswer ? "llm" : "deterministic",
    confidence,
    sources: displaySources,
    sourceStatus: status,
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
  getRulesIndexStatus,
  hasRulesIndex,
  loadRulesIndex,
  searchRulesIndex,
};

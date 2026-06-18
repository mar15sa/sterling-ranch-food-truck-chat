const fs = require("node:fs/promises");
const path = require("node:path");

const CAB_BASE_URL = "https://sterlingranchcab.com";
const DEFAULT_INDEX_PATH = path.join(__dirname, "..", "data", "rules-index.json");
const DEFAULT_SUPPLEMENTS_PATH = path.join(__dirname, "..", "data", "rules-supplements.json");
const DEFAULT_BASELINE_PATH = path.join(
  __dirname,
  "..",
  "data",
  "rules-supplement-audit-baseline.json"
);
const DEFAULT_FROM_ID = 1;
const DEFAULT_TO_ID = 2800;
const DEFAULT_CONCURRENCY = 8;

const RULE_RELATED_PATTERNS = [
  /\bcharges?\b/i,
  /\bcode of rules\b/i,
  /\bcollection process\b/i,
  /\bcovenants?\b/i,
  /\bdelinquent\b/i,
  /\bdesign\b/i,
  /\bdispute resolution\b/i,
  /\bdrc\b/i,
  /\bdue process\b/i,
  /\benforcement\b/i,
  /\bexterior\b/i,
  /\bfacilit(y|ies)\b/i,
  /\bfees?\b/i,
  /\bfines?\b/i,
  /\bguidelines?\b/i,
  /\blighting\b/i,
  /\bpolic(y|ies)\b/i,
  /\bregulations?\b/i,
  /\brules?\b/i,
  /\bservice fees?\b/i,
  /\bstandards?\b/i,
  /\btap\b/i,
  /\butilit(y|ies)\b/i,
  /\bviolations?\b/i,
];

function parseArgs(argv) {
  const options = {
    concurrency: DEFAULT_CONCURRENCY,
    failOnCandidates: false,
    from: DEFAULT_FROM_ID,
    fromBaseline: false,
    json: false,
    lookahead: 600,
    to: DEFAULT_TO_ID,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--concurrency" && next) {
      options.concurrency = Number(next);
      index += 1;
    } else if (arg === "--fail-on-candidates") {
      options.failOnCandidates = true;
    } else if (arg === "--from" && next) {
      options.from = Number(next);
      index += 1;
    } else if (arg === "--from-baseline") {
      options.fromBaseline = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--lookahead" && next) {
      options.lookahead = Number(next);
      index += 1;
    } else if (arg === "--to" && next) {
      options.to = Number(next);
      index += 1;
    }
  }

  if (!Number.isInteger(options.lookahead) || options.lookahead < 1) {
    throw new Error("--lookahead must be a positive number.");
  }
  if (!options.fromBaseline && (!Number.isInteger(options.from) || !Number.isInteger(options.to) || options.from < 1)) {
    throw new Error("Use numeric --from and --to values.");
  }
  if (!options.fromBaseline && options.from > options.to) {
    throw new Error("--from must be less than or equal to --to.");
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1) {
    throw new Error("--concurrency must be a positive number.");
  }

  return options;
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function parseCodifiedDate(text = "") {
  const match = String(text).match(/enacted\s+([A-Z][a-z]+\s+\d{1,2},\s+\d{4})/);
  if (!match) return null;
  const timestamp = Date.parse(match[1]);
  return Number.isNaN(timestamp) ? null : new Date(timestamp);
}

function parseSlugDate(text = "") {
  const normalized = String(text).replace(/%20/g, "-");
  const yearFirstMatch = normalized.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (yearFirstMatch) {
    const year = Number(yearFirstMatch[1]);
    const month = Number(yearFirstMatch[2]);
    const day = Number(yearFirstMatch[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ) {
      return date;
    }
  }

  const match = normalized.match(/\b(\d{1,2})-(\d{1,2})-(\d{2,4})\b/);
  if (!match) return null;

  const month = Number(match[1]);
  const day = Number(match[2]);
  let year = Number(match[3]);
  if (year < 100) year += year >= 70 ? 1900 : 2000;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function decodeTitleFromLocation(location = "") {
  const url = new URL(location, CAB_BASE_URL);
  const parts = url.pathname.split("/").filter(Boolean);
  const documentCenterIndex = parts.findIndex(
    (part, index) =>
      part.toLowerCase() === "documentcenter" &&
      parts[index + 1]?.toLowerCase() === "view"
  );
  const slugStart = documentCenterIndex >= 0 ? documentCenterIndex + 3 : 3;
  const slug = parts.slice(slugStart).join(" ");
  return decodeURIComponent(slug)
    .replace(/\.(pdf|docx?|xlsx?)$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ruleRelatedScore(title = "") {
  return RULE_RELATED_PATTERNS.reduce(
    (score, pattern) => score + (pattern.test(title) ? 1 : 0),
    0
  );
}

function fullUrl(location) {
  if (!location) return "";
  if (/^https?:\/\//i.test(location)) return location;
  return `${CAB_BASE_URL}${location.startsWith("/") ? "" : "/"}${location}`;
}

async function probeDocument(id) {
  const url = `${CAB_BASE_URL}/DocumentCenter/View/${id}`;
  const response = await fetch(url, { redirect: "manual" });
  const location = response.headers.get("location") || "";
  const status = response.status;

  if (status < 300 || status >= 400 || !location) {
    return { exists: false, id, status };
  }

  const title = decodeTitleFromLocation(location);
  const approvedDate = parseSlugDate(location);
  return {
    approvedDate: approvedDate ? approvedDate.toISOString().slice(0, 10) : "",
    exists: true,
    id,
    location,
    score: ruleRelatedScore(title),
    status,
    title,
    url: fullUrl(location),
  };
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      try {
        results[currentIndex] = await mapper(items[currentIndex]);
      } catch (error) {
        results[currentIndex] = {
          error: error.message,
          id: items[currentIndex],
        };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
}

function dateIsAfter(value, cutoff) {
  if (!value || !cutoff) return false;
  const timestamp = Date.parse(value);
  return !Number.isNaN(timestamp) && timestamp > cutoff.getTime();
}

function formatReport(report) {
  const lines = [
    `Scanned CAB Document Center IDs ${report.range.from}-${report.range.to}.`,
    `Found ${report.foundCount} documents, ${report.candidates.length} possible missing rule supplements.`,
  ];

  if (report.codifiedThrough) {
    lines.push(`Local rulebook is codified through: ${report.codifiedThrough}.`);
  }

  if (!report.candidates.length) {
    lines.push("No unsupplemented rule-related candidates found in this ID range.");
    return lines.join("\n");
  }

  lines.push("", "Possible missing supplements:");
  report.candidates.slice(0, 50).forEach((candidate) => {
    const date = candidate.approvedDate ? `, date ${candidate.approvedDate}` : "";
    const reason = candidate.reasons.length ? ` (${candidate.reasons.join(", ")})` : "";
    lines.push(`- #${candidate.id}${date}${reason}: ${candidate.title}`);
    lines.push(`  ${candidate.url}`);
  });

  if (report.candidates.length > 50) {
    lines.push(`...and ${report.candidates.length - 50} more.`);
  }

  return lines.join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const [index, supplements, baseline] = await Promise.all([
    readJson(DEFAULT_INDEX_PATH, null),
    readJson(DEFAULT_SUPPLEMENTS_PATH, []),
    readJson(DEFAULT_BASELINE_PATH, {}),
  ]);

  if (options.fromBaseline) {
    const monitorFrom = Number(baseline.monitorFromDocumentCenterId);
    if (!Number.isInteger(monitorFrom) || monitorFrom < 1) {
      throw new Error(
        "Baseline is missing monitorFromDocumentCenterId. Run with explicit --from/--to or update data/rules-supplement-audit-baseline.json."
      );
    }
    options.from = monitorFrom;
    options.to = monitorFrom + options.lookahead - 1;
  }

  const codifiedDate = parseCodifiedDate(index?.source?.codifiedThrough || "");
  const knownSupplementIds = new Set(
    (Array.isArray(supplements) ? supplements : [])
      .flatMap((document) => [
        document.id,
        document.nodeId,
        document.sourceUrl,
        ...(Array.isArray(document.documentCenterIds) ? document.documentCenterIds : []),
        ...(Array.isArray(document.sourceUrls) ? document.sourceUrls : []),
      ])
      .filter(Boolean)
      .map(String)
  );

  const ids = [];
  for (let id = options.from; id <= options.to; id += 1) ids.push(id);

  const scanned = await mapWithConcurrency(ids, options.concurrency, probeDocument);
  const found = scanned.filter((document) => document.exists);
  const candidates = found
    .map((document) => {
      const reasons = [];
      if (document.score >= 1 && dateIsAfter(document.approvedDate, codifiedDate)) {
        reasons.push("newer than codified rulebook");
      }
      return { ...document, reasons };
    })
    .filter((document) => document.reasons.length > 0)
    .filter(
      (document) =>
        !knownSupplementIds.has(document.url) &&
        !knownSupplementIds.has(String(document.id)) &&
        ![...knownSupplementIds].some((value) => value.includes(`/View/${document.id}/`))
    )
    .sort((a, b) => {
      const dateCompare = String(b.approvedDate).localeCompare(String(a.approvedDate));
      return dateCompare || b.score - a.score || a.id - b.id;
    });

  const report = {
    candidates,
    codifiedThrough: index?.source?.codifiedThrough || "",
    foundCount: found.length,
    range: { from: options.from, to: options.to },
    scannedCount: scanned.length,
  };

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatReport(report));
  }

  if (options.failOnCandidates && candidates.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

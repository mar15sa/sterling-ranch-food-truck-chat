const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.join(__dirname, "..");
const CATALOG_PATH = path.join(ROOT_DIR, "data", "openings.json");
const SOURCES_PATH = path.join(ROOT_DIR, "data", "openings-sources.json");
const MONITOR_STATE_PATH = path.join(ROOT_DIR, "data", "openings-monitor-state.json");
const TIPS_PATH = path.join(ROOT_DIR, "data", "openings-tips.ndjson");

const STATUS_ORDER = {
  "opening-soon": 0,
  "under-construction": 1,
  confirmed: 2,
  approved: 3,
  proposed: 4,
  open: 5,
  paused: 6,
  closed: 7,
};

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function matches(value, expected) {
  return !expected || expected === "all" || normalize(value) === normalize(expected);
}

function getOpeningsCatalog(filters = {}) {
  const catalog = readJson(CATALOG_PATH, { updatedAt: null, items: [] });
  const query = normalize(filters.query);
  const items = catalog.items
    .filter((item) => matches(item.community, filters.community))
    .filter((item) => matches(item.category, filters.category))
    .filter((item) => matches(item.status, filters.status))
    .filter((item) => {
      if (!query) return true;
      return [item.name, item.category, item.community, item.area, item.address, item.summary]
        .map(normalize)
        .some((value) => value.includes(query));
    })
    .sort((a, b) => {
      if (filters.sort === "name") return a.name.localeCompare(b.name);
      if (filters.sort === "community") {
        return a.community.localeCompare(b.community) || a.name.localeCompare(b.name);
      }
      return (
        (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99) ||
        String(b.verifiedAt).localeCompare(String(a.verifiedAt)) ||
        a.name.localeCompare(b.name)
      );
    });

  const allItems = catalog.items;
  const communityNames = (catalog.communities || [])
    .map((community) => typeof community === "string" ? community : community.name)
    .filter(Boolean);
  const communities = [...new Set([...communityNames, ...allItems.map((item) => item.community).filter(Boolean)])].sort();
  const unique = (field) => [...new Set(allItems.map((item) => item[field]).filter(Boolean))].sort();
  const count = (predicate) => allItems.filter(predicate).length;

  return {
    scope: catalog.scope,
    updatedAt: catalog.updatedAt,
    items,
    total: allItems.length,
    matched: items.length,
    stats: {
      coming: count((item) => item.status !== "open" && item.status !== "closed"),
      open: count((item) => item.status === "open"),
      openingSoon: count((item) => item.status === "opening-soon"),
      communities: communities.length,
    },
    filters: {
      communities,
      categories: unique("category"),
      statuses: unique("status"),
    },
    communityCoverage: Object.fromEntries(
      (catalog.communities || [])
        .filter((community) => typeof community === "object" && community.name)
        .map((community) => [community.name, community])
    ),
  };
}

function getOpeningsSourceStatus() {
  const sourceConfig = readJson(SOURCES_PATH, { sources: [] });
  const state = readJson(MONITOR_STATE_PATH, { lastRunAt: null, sources: {} });
  const sources = sourceConfig.sources.map((source) => {
    const result = state.sources?.[source.id] || {};
    return {
      ...source,
      status: result.status || "awaiting-first-scan",
      checkedAt: result.checkedAt || null,
      changedAt: result.changedAt || null,
      signalCount: Array.isArray(result.signals) ? result.signals.length : 0,
      error: result.error || null,
    };
  });

  return {
    lastRunAt: state.lastRunAt || null,
    healthy: sources.filter((source) => source.status === "ok").length,
    changed: sources.filter((source) => source.status === "changed").length,
    errors: sources.filter((source) => source.status === "error").length,
    total: sources.length,
    sources,
  };
}

function cleanTip(body) {
  const clean = (value, max) => String(value || "").trim().slice(0, max);
  return {
    businessName: clean(body.businessName, 160),
    community: clean(body.community, 80),
    location: clean(body.location, 240),
    sourceUrl: clean(body.sourceUrl, 500),
    details: clean(body.details, 1200),
    contact: clean(body.contact, 200),
    website: clean(body.website, 120),
  };
}

function isLikelyUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

async function submitOpeningTip(body, fetchImpl = fetch) {
  const tip = cleanTip(body);
  if (tip.website) return { accepted: true, message: "Thanks." };
  if (!tip.businessName || (!tip.location && !tip.sourceUrl && !tip.details)) {
    return { accepted: false, status: 400, message: "Add a business name and at least one useful detail." };
  }
  if (!isLikelyUrl(tip.sourceUrl)) {
    return { accepted: false, status: 400, message: "That source link does not look valid." };
  }

  const record = { ...tip, submittedAt: new Date().toISOString(), status: "unreviewed" };
  const webhook = process.env.OPENINGS_TIP_WEBHOOK_URL || "";
  if (webhook) {
    const response = await fetchImpl(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(record),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Tip destination returned ${response.status}.`);
  } else {
    fs.appendFileSync(TIPS_PATH, `${JSON.stringify(record)}\n`, "utf8");
  }

  return {
    accepted: true,
    message: "Tip received. We’ll verify it before it appears in the tracker.",
  };
}

module.exports = {
  getOpeningsCatalog,
  getOpeningsSourceStatus,
  submitOpeningTip,
};

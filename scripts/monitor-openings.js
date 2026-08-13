const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT_DIR = path.join(__dirname, "..");
const SOURCES_PATH = path.join(ROOT_DIR, "data", "openings-sources.json");
const STATE_PATH = path.join(ROOT_DIR, "data", "openings-monitor-state.json");
const REPORT_PATH = path.join(ROOT_DIR, "data", "openings-monitor-report.md");
const LEADS_PATH = path.join(ROOT_DIR, "data", "openings-monitor-leads.json");
const WRITE_STATE = process.argv.includes("--write-state") || process.argv.includes("--write");
const TIMEOUT_MS = Number(process.env.OPENINGS_MONITOR_TIMEOUT_MS) || 15000;
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 SterlingRanchSocietyRadar/1.0";

const SIGNAL_WORDS = [
  "restaurant", "cafe", "café", "coffee", "bakery", "brewery", "taproom", "bar ",
  "market", "grocery", "retail", "store", "fitness", "salon", "spa", "theater",
  "cinema", "opening", "coming soon", "under construction", "tenant", "commercial",
  "building permit", "site plan", "tenant finish", "certificate of occupancy", "inspection",
  "liquor license", "new license", "ownership transfer", "drive-thru", "drive through"
];

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function decodeHtml(value) {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&ndash;/gi, "–")
    .replace(/&mdash;/gi, "—")
    .replace(/&rsquo;/gi, "’")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function htmlToRelevantText(html) {
  return decodeHtml(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<\/(h1|h2|h3|h4|p|li|article|section|div)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 8 && line.length <= 500)
    .join("\n")
    .slice(0, 250000);
}

function fingerprint(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function extractSignals(text) {
  const seen = new Set();
  return text
    .split("\n")
    .filter((line) => SIGNAL_WORDS.some((word) => line.toLowerCase().includes(word)))
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => {
      const key = line.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 40);
}

function newSignals(previous = [], current = []) {
  const old = new Set(previous.map((line) => line.toLowerCase()));
  return current.filter((line) => !old.has(line.toLowerCase()));
}

function slugify(value) {
  return value.toLowerCase().replace(/&[^;]+;/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
}

function isDouglasCountyHeadline(headline) {
  return /castle rock|parker|lone tree|castle pines|highlands ranch|sterling ranch|roxborough|sedalia|larkspur|douglas county/i.test(headline);
}

function extractDougCoSocialLeads(html, source) {
  const leads = [];
  const seen = new Set();
  const pattern = /\{"@type":"ListItem","position":\d+,"url":"([^"]+)","item":\{"@type":"NewsArticle","headline":"([^"]+)"[\s\S]*?"dateModified":"([^"]+)"/g;
  for (const match of html.matchAll(pattern)) {
    const headline = decodeHtml(match[2]);
    const lower = headline.toLowerCase();
    if (!isDouglasCountyHeadline(headline)) continue;
    if (!SIGNAL_WORDS.some((word) => lower.includes(word)) && !/(coming|opens?|reopens?|takes over|replacing|new )/.test(lower)) continue;
    const id = `dougco-social-${slugify(headline)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    leads.push({ id, headline, url: match[1], observedDate: match[3], sourceId: source.id, sourceName: source.name });
  }
  return leads;
}

function extractStructuredLeads(rawText, source, contentType) {
  if (contentType.includes("html") && source.id === "dougco-social") {
    return extractDougCoSocialLeads(rawText, source);
  }
  return [];
}

async function checkSource(source, previous) {
  if (source.monitorMode === "manual") {
    return {
      status: "manual-review",
      checkedAt: null,
      changedAt: previous?.changedAt || null,
      fingerprint: previous?.fingerprint || null,
      signals: previous?.signals || [],
      structuredLeads: previous?.structuredLeads || [],
      newSignals: [],
    };
  }
  const checkedAt = new Date().toISOString();
  try {
    const response = await fetch(source.url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,application/pdf;q=0.8,*/*;q=0.5" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    const raw = Buffer.from(await response.arrayBuffer());
    if (raw.length > 8_000_000) throw new Error("Source is larger than the 8 MB safety limit.");
    const rawText = raw.toString("utf8");
    const text = contentType.includes("pdf")
      ? `PDF ${raw.length} bytes ${response.url}`
      : htmlToRelevantText(rawText);
    if (text.length < 40) throw new Error("Source returned too little readable content.");
    const hash = fingerprint(text);
    const signals = extractSignals(text);
    const structuredLeads = extractStructuredLeads(rawText, source, contentType);
    const changed = Boolean(previous?.fingerprint && previous.fingerprint !== hash);
    return {
      status: changed ? "changed" : "ok",
      checkedAt,
      changedAt: changed ? checkedAt : previous?.changedAt || null,
      fingerprint: hash,
      finalUrl: response.url,
      contentType,
      signals,
      structuredLeads,
      newSignals: changed ? newSignals(previous?.signals, signals) : [],
    };
  } catch (error) {
    return {
      status: "error",
      checkedAt,
      changedAt: previous?.changedAt || null,
      fingerprint: previous?.fingerprint || null,
      signals: previous?.signals || [],
      newSignals: [],
      error: error.message,
    };
  }
}

function buildReport(config, state, previousState) {
  const changed = config.sources.filter((source) => state.sources[source.id]?.status === "changed");
  const errors = config.sources.filter((source) => state.sources[source.id]?.status === "error");
  const firstRun = !previousState.lastRunAt;
  const previousLeadIds = new Set(
    Object.values(previousState.sources || {}).flatMap((source) => (source.structuredLeads || []).map((lead) => lead.id))
  );
  const newLeads = Object.values(state.sources)
    .flatMap((source) => source.structuredLeads || [])
    .filter((lead) => !previousLeadIds.has(lead.id));
  const currentLeadIds = new Set(
    Object.values(state.sources).flatMap((source) => (source.structuredLeads || []).map((lead) => lead.id))
  );
  const removedLeads = Object.values(previousState.sources || {})
    .flatMap((source) => source.structuredLeads || [])
    .filter((lead) => !currentLeadIds.has(lead.id));
  const lines = [
    "# Douglas County openings radar",
    "",
    `Scan completed: ${state.lastRunAt}`,
    `Sources tracked: ${config.sources.length}`,
    `Automatically checked: ${config.sources.filter((source) => source.monitorMode !== "manual").length}`,
    `Manual research lookups: ${config.sources.filter((source) => source.monitorMode === "manual").length}`,
    `Changed: ${changed.length}`,
    `Errors: ${errors.length}`,
    `New structured leads: ${firstRun ? 0 : newLeads.length}`,
    "",
  ];

  if (firstRun) {
    lines.push("This was the baseline scan. Future scans will report only changes.", "");
  }

  if (!firstRun && newLeads.length) {
    lines.push("## New leads", "");
    for (const lead of newLeads) lines.push(`- [${lead.headline}](${lead.url}) — ${lead.sourceName}`);
    lines.push("");
  }

  if (!firstRun && removedLeads.length) {
    lines.push("## Leads no longer present", "");
    for (const lead of removedLeads) lines.push(`- [${lead.headline}](${lead.url}) — may have moved off the source feed`);
    lines.push("");
  }

  for (const source of changed) {
    const result = state.sources[source.id];
    lines.push(`## Changed: ${source.name}`, "", source.url, "");
    if (result.newSignals.length) {
      lines.push("Possible opening-related signals:", "");
      for (const signal of result.newSignals.slice(0, 12)) lines.push(`- ${signal}`);
      lines.push("");
    } else {
      lines.push("The page changed, but the text filter did not isolate a new business signal. Review the page manually.", "");
    }
  }

  if (errors.length) {
    lines.push("## Sources needing attention", "");
    for (const source of errors) lines.push(`- ${source.name}: ${state.sources[source.id].error}`);
    lines.push("");
  }

  lines.push("## Review rule", "", "Do not publish a detected name as fact until an official record, the business itself, or two independent credible sources confirm it.", "");
  return lines.join("\n");
}

async function main() {
  const config = readJson(SOURCES_PATH, { sources: [] });
  if (!config.sources.length) throw new Error("No opening sources are configured.");
  const previousState = readJson(STATE_PATH, { lastRunAt: null, sources: {} });
  const results = await Promise.all(
    config.sources.map(async (source) => [source.id, await checkSource(source, previousState.sources?.[source.id])])
  );
  const state = { version: 1, lastRunAt: new Date().toISOString(), sources: Object.fromEntries(results) };
  const report = buildReport(config, state, previousState);
  const catalog = readJson(path.join(ROOT_DIR, "data", "openings.json"), { items: [] });
  const publishedUrls = new Set(catalog.items.flatMap((item) => (item.sources || []).map((source) => source.url)));
  const publishedNames = catalog.items.map((item) => slugify(item.name)).filter(Boolean);
  const leads = Object.values(state.sources)
    .flatMap((source) => source.structuredLeads || [])
    .filter((lead) => !publishedUrls.has(lead.url))
    .filter((lead) => !publishedNames.some((name) => name.length >= 5 && slugify(lead.headline).includes(name)));

  if (WRITE_STATE) {
    fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    fs.writeFileSync(REPORT_PATH, `${report}\n`, "utf8");
    fs.writeFileSync(LEADS_PATH, `${JSON.stringify({ generatedAt: state.lastRunAt, leads }, null, 2)}\n`, "utf8");
  }

  console.log(report);
  const changedCount = results.filter(([, result]) => result.status === "changed").length;
  const errorCount = results.filter(([, result]) => result.status === "error").length;
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changedCount}\nerrors=${errorCount}\n`, "utf8");
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});

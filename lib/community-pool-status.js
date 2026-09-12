const { createConnectorAdapters, emitEvidenceEnvelope } = require("./community-connector-adapter");

function configuredPoolStatus(profile) {
  const adapter = createConnectorAdapters(profile).find((item) => item.family === "live-status" && item.capabilities.includes("status"));
  const connector = (profile?.connectors || []).find((item) => item.id === adapter?.connectorId);
  const sourceUrl = adapter?.endpoints.find((endpoint) => endpoint.id === "primary")?.url;
  const poolStatus = connector?.adapter?.poolStatus;
  const mappings = Array.isArray(poolStatus?.statusMappings) ? poolStatus.statusMappings : [];
  const markerClass = String(poolStatus?.statusMarkerClass || "").trim();
  if (!adapter || !sourceUrl || !markerClass || !mappings.length) {
    throw new Error("No configured live pool-status adapter with exact status mappings is available.");
  }
  const normalized = mappings.map((mapping) => ({
    label: String(mapping?.label || "").trim(),
    state: String(mapping?.state || "").trim(),
    headline: String(mapping?.headline || "").trim(),
    residentMeaning: String(mapping?.residentMeaning || "").trim(),
  }));
  if (normalized.some((mapping) => !mapping.label || !mapping.state || !mapping.headline || !mapping.residentMeaning)
    || new Set(normalized.map((mapping) => mapping.label.toLowerCase())).size !== normalized.length) {
    throw new Error("Pool status mappings must have unique exact labels, states, headlines, and resident meanings.");
  }
  return { adapter, sourceUrl, mappings: normalized, markerClass, season: poolStatus?.season || null };
}

function decodeHtml(value = "") {
  return String(value).replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
}

function attribute(markup, name) {
  const match = String(markup).match(new RegExp(`${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"));
  return match ? decodeHtml(match[2]).replace(/\s+/g, " ").trim() : "";
}

function visibleText(markup = "") {
  return decodeHtml(String(markup).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function absoluteUrl(value, baseUrl) {
  try { return new URL(value, baseUrl).toString(); } catch { return ""; }
}

// A color swatch is deliberately not a status. This accepts only an exact,
// configured operational label that the official page itself exposes in text.
function hasClass(markup, className) {
  return attribute(markup, "class").split(/\s+/).includes(className);
}

function parseConfiguredPoolStatus(html, { sourceUrl, mappings, markerClass }) {
  const links = [...String(html || "").matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)].map((match) => match[0]);
  for (const link of links) {
    if (!hasClass(link, markerClass)) continue;
    const image = link.match(/<img\b[^>]*>/i)?.[0] || "";
    const observed = [attribute(link, "aria-label"), attribute(image, "alt"), attribute(image, "title"), visibleText(link)]
      .map((value) => value.trim()).filter(Boolean);
    const mapping = mappings.find((candidate) => observed.some((value) => value.toLowerCase() === candidate.label.toLowerCase()));
    if (!mapping) continue;
    const actionUrl = absoluteUrl(attribute(link, "href") || sourceUrl, sourceUrl);
    if (!actionUrl) return null;
    return { mapping, observedLabel: observed.find((value) => value.toLowerCase() === mapping.label.toLowerCase()) || mapping.label, actionUrl };
  }
  return null;
}

function memorialDay(year) {
  const date = new Date(Date.UTC(year, 4, 31));
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date;
}

function laborDay(year) {
  const date = new Date(Date.UTC(year, 8, 1));
  date.setUTCDate(date.getUTCDate() + ((8 - date.getUTCDay()) % 7));
  return date;
}

function withinConfiguredPoolSeason(date, season) {
  if (season?.kind !== "memorial-day-weekend-through-labor-day") return null;
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return null;
  const year = value.getUTCFullYear();
  const start = memorialDay(year);
  start.setUTCDate(start.getUTCDate() - 2);
  const end = laborDay(year);
  const day = Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  return day >= start.getTime() && day <= end.getTime();
}

function poolSummary(mapping) {
  return mapping.residentMeaning;
}

function localDateInTimeZone(value, timeZone) {
  if (!timeZone) throw new Error("The live pool-status adapter requires the community timezone.");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(value);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  if (!/^\d{4}$/.test(byType.year || "") || !/^\d{2}$/.test(byType.month || "") || !/^\d{2}$/.test(byType.day || "")) {
    throw new Error("The live pool-status observation date could not be determined.");
  }
  return `${byType.year}-${byType.month}-${byType.day}`;
}

async function getCommunityPoolStatus(options = {}) {
  const { profile, fetchImpl = global.fetch, now = () => new Date() } = options;
  if (typeof fetchImpl !== "function") throw new Error("Fetch is unavailable.");
  const { adapter, sourceUrl, mappings, markerClass } = configuredPoolStatus(profile);
  const response = await fetchImpl(sourceUrl, { headers: { accept: "text/html" } });
  if (!response?.ok) throw new Error(`Official pool-status source returned ${response?.status || "an invalid response"}.`);
  const parsed = parseConfiguredPoolStatus(await response.text(), { sourceUrl, mappings, markerClass });
  if (!parsed) throw new Error("Official pool-status source did not expose a configured exact operational status.");
  const observedAt = new Date(now());
  if (Number.isNaN(observedAt.getTime())) throw new Error("The live pool-status observation time is invalid.");
  const checkedAt = observedAt.toISOString();
  const date = localDateInTimeZone(observedAt, profile?.timezone);
  const evidence = emitEvidenceEnvelope(adapter, {
    observedAt: checkedAt,
    request: { dateRange: { start: date, end: date, label: "current" }, filters: { facility: "pool" } },
    sources: [{ id: "current-status", sourceUrl, checkedAt, controllingSourceRole: "operational" }],
    claims: [{ id: "current-status", facet: "status", text: parsed.mapping.headline, controllingEvidenceId: `${adapter.adapterId}:current-status`, controllingSourceRole: "operational" }],
    actions: [{ id: "official-status", type: "information", label: adapter.labels.openAction || "Open official pool status", url: parsed.actionUrl }],
    coverage: { requested: ["status"], covered: ["status"] },
    degradation: { state: "healthy" },
  });
  return {
    state: parsed.mapping.state,
    headline: parsed.mapping.headline,
    summary: poolSummary(parsed.mapping),
    residentAction: "Open the official pool status for more details.",
    sourceUrl,
    actionUrl: parsed.actionUrl,
    date,
    checkedAt,
    stale: false,
    evidenceEnvelope: evidence,
  };
}

module.exports = { configuredPoolStatus, getCommunityPoolStatus, localDateInTimeZone, parseConfiguredPoolStatus, withinConfiguredPoolSeason };

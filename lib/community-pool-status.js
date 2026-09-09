const { createConnectorAdapters, emitEvidenceEnvelope } = require("./community-connector-adapter");

function configuredPoolStatus(profile) {
  const adapter = createConnectorAdapters(profile).find((item) => item.family === "live-status" && item.capabilities.includes("status"));
  const connector = (profile?.connectors || []).find((item) => item.id === adapter?.connectorId);
  const sourceUrl = adapter?.endpoints.find((endpoint) => endpoint.id === "primary")?.url;
  const labels = connector?.adapter?.poolStatus?.statusLabels;
  if (!adapter || !sourceUrl || !Array.isArray(labels) || !labels.length) {
    throw new Error("No configured live pool-status adapter with exact status labels is available.");
  }
  const normalized = labels.map((label) => String(label || "").trim()).filter(Boolean);
  if (!normalized.length || new Set(normalized.map((label) => label.toLowerCase())).size !== normalized.length) {
    throw new Error("Pool status labels must be a unique non-empty list.");
  }
  return { adapter, sourceUrl, labels: normalized };
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
function parseConfiguredPoolStatus(html, { sourceUrl, labels }) {
  const links = [...String(html || "").matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)].map((match) => match[0]);
  for (const link of links) {
    const image = link.match(/<img\b[^>]*>/i)?.[0] || "";
    const observed = [attribute(link, "aria-label"), attribute(image, "alt"), attribute(image, "title"), visibleText(link)]
      .map((value) => value.trim()).filter(Boolean);
    const label = labels.find((candidate) => observed.some((value) => value.toLowerCase() === candidate.toLowerCase()));
    if (!label) continue;
    const actionUrl = absoluteUrl(attribute(link, "href") || sourceUrl, sourceUrl);
    if (!actionUrl) return null;
    return { label, observedLabel: observed.find((value) => value.toLowerCase() === label.toLowerCase()) || label, actionUrl };
  }
  return null;
}

async function getCommunityPoolStatus(options = {}) {
  const { profile, fetchImpl = global.fetch, now = () => new Date() } = options;
  if (typeof fetchImpl !== "function") throw new Error("Fetch is unavailable.");
  const { adapter, sourceUrl, labels } = configuredPoolStatus(profile);
  const response = await fetchImpl(sourceUrl, { headers: { accept: "text/html" } });
  if (!response?.ok) throw new Error(`Official pool-status source returned ${response?.status || "an invalid response"}.`);
  const parsed = parseConfiguredPoolStatus(await response.text(), { sourceUrl, labels });
  if (!parsed) throw new Error("Official pool-status source did not expose a configured exact operational status.");
  const checkedAt = new Date(now()).toISOString();
  const evidence = emitEvidenceEnvelope(adapter, {
    observedAt: checkedAt,
    request: { filters: { facility: "pool" } },
    sources: [{ id: "current-status", sourceUrl, checkedAt, controllingSourceRole: "operational" }],
    claims: [{ id: "current-status", facet: "status", text: parsed.observedLabel, controllingEvidenceId: `${adapter.adapterId}:current-status`, controllingSourceRole: "operational" }],
    actions: [{ id: "official-status", type: "information", label: adapter.labels.openAction || "Open official pool status", url: parsed.actionUrl }],
    coverage: { requested: ["status"], covered: ["status"] },
    degradation: { state: "healthy" },
  });
  return {
    state: parsed.label.toLowerCase().replace(/\s+/g, "-"),
    headline: parsed.observedLabel,
    summary: `The official live status currently says: ${parsed.observedLabel}.`,
    residentAction: "Open the official pool status for any additional details.",
    sourceUrl,
    actionUrl: parsed.actionUrl,
    checkedAt,
    stale: false,
    evidenceEnvelope: evidence,
  };
}

module.exports = { configuredPoolStatus, getCommunityPoolStatus, parseConfiguredPoolStatus };

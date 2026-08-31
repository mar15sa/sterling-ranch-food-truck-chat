const crypto = require("node:crypto");
const { fetchPublicPage, plainText } = require("./community-onboarding");
const { validateCommunityProfile, validateSourceRecord } = require("./community-contracts");

const PAGE_PRIORITY = /\b(?:alert|amenit|apply|calendar|contact|document|event|facilit|fee|form|park|pool|program|register|rent|resident|rule|service|trash|utility|water)\b/i;
const SKIP_PATH = /\.(?:css|gif|ico|jpe?g|js|mp4|png|svg|webp|woff2?)(?:$|\?)/i;
const ACTION_PATTERN = /\b(?:apply|application|book|contact|download|email|form|pay|register|rent|report|request|reserve|schedule|sign up|submit|view|google play|apple store|app store)\b/i;
const EMBEDDED_INSTRUCTION_PATTERN = /\b(?:ignore (?:all |any )?(?:previous|prior|system)|system prompt|developer message|api key|environment variable|reveal (?:a |the )?(?:secret|token)|follow these instructions|provide .{0,50}(?:login credentials|password))\b/i;

function hash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function decodeHtml(value = "") {
  return String(value)
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&ndash;|&#8211;/gi, "-")
    .replace(/&mdash;|&#8212;/gi, "-");
}

function slug(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "source";
}

function cleanPageHtml(html = "") {
  return String(html)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(?:script|style|svg|noscript|header|footer|nav)\b[\s\S]*?<\/(?:script|style|svg|noscript|header|footer|nav)>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:h[1-6]|p|li|div|section|article|tr)>/gi, "\n");
}

function contentHtml(html = "") {
  const value = String(html);
  const start = value.search(/<[^>]+data-cpRole=["']mainContentContainer["'][^>]*>/i);
  if (start === -1) return cleanPageHtml(value);
  const afterStart = value.slice(start);
  const boundary = afterStart.search(/<div[^>]+(?:id=["'](?:siteSidebarTS|gbsContainerTS)["']|data-cpRole=["']siteSidebar["'])/i);
  const footer = afterStart.search(/<footer\b/i);
  const ends = [boundary, footer].filter((position) => position > 0);
  const end = ends.length ? Math.min(...ends) : undefined;
  return cleanPageHtml(afterStart.slice(0, end));
}

function pageText(html = "") {
  return normalizeResidentText(decodeHtml(plainText(contentHtml(html))))
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeResidentText(value = "") {
  return String(value)
    .replace(/Ɵ/g, "ti")
    .replace(/Ʃ/g, "tt")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/[]\s*?/g, " ")
    .replace(/&thinsp;/gi, " ")
    .replace(/&rsquo;/gi, "’")
    .replace(/&ldquo;|&rdquo;/gi, '"');
}

function stripEmbeddedInstructions(value = "") {
  return String(value)
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !EMBEDDED_INSTRUCTION_PATTERN.test(sentence))
    .join(" ")
    .trim();
}

function pageTitle(html = "", fallback = "Official community page") {
  const title = plainText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  return (title.split(/\s+[|–—]\s+/)[0] || fallback).trim().slice(0, 180);
}

function sourceTypeFor(title = "", url = "", text = "") {
  const identity = `${title} ${url}`;
  if (/\b(pool status|open today|closed today|at capacity|status)\b/i.test(identity)) return "status";
  if (/\b(calendar|event|meeting|program|class|activity)\b|Calendar\.aspx/i.test(identity)) return "events";
  if (/\b(alert|closure|emergency|notice|news flash)\b|AlertCenter/i.test(identity)) return "alerts";
  if (/\b(forms?|applications?|permits?|apply|submit|documents?|document center|documentcenter)\b|FormCenter|DocumentCenter/i.test(identity)) return "forms";
  if (/\b(facilit(?:y|ies)|amenit(?:y|ies)|rentals?|reservations?|shelters?|pavilions?|clubhouse|civicrec|rec1)\b/i.test(identity)) return "facilities";
  if (/\b(rule|regulation|policy|code|standards?|municode)\b/i.test(identity)) return "rules";
  if (/\b(rule|regulation|policy|standards?)\b/i.test(text.slice(0, 500))) return "rules";
  return "services";
}

function isDocumentUrl(value = "") {
  return /\/DocumentCenter\/View\/|\.pdf(?:$|\?)/i.test(String(value));
}

async function extractPdfText(url) {
  const { PDFParse } = require("pdf-parse");
  const parser = new PDFParse({ url });
  try {
    const result = await parser.getText();
    return normalizeResidentText(result.text || "").replace(/\s+/g, " ").trim();
  } finally {
    await parser.destroy();
  }
}

function connectorSourceType(connector) {
  if (/municode|rule/i.test(connector.type)) return "rules";
  if (/calendar/i.test(connector.type)) return "events";
  if (/alert/i.test(connector.type)) return "alerts";
  if (/status/i.test(connector.type)) return "status";
  if (/civicrec|facilit/i.test(connector.type)) return "facilities";
  return "services";
}

function authorityScore(profile, sourceType, connectorType) {
  const order = profile.authority?.[sourceType] || [];
  const position = order.indexOf(connectorType);
  if (position === -1) return 0.62;
  return Number(Math.max(0.7, 1 - position * 0.12).toFixed(2));
}

function linksFromHtml(html, baseUrl) {
  const links = [];
  const seen = new Set();
  const pattern = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    let url;
    try {
      url = new URL(decodeHtml(match[1]), baseUrl);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(url.protocol)) continue;
    url.hash = "";
    const label = decodeHtml(plainText(match[2])).replace(/\s+/g, " ").trim() || "Official link";
    const key = url.href.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const contextHtml = html.slice(Math.max(0, match.index - 320), Math.min(html.length, match.index + match[0].length + 320));
    const context = decodeHtml(plainText(contextHtml)).replace(/\s+/g, " ").trim().slice(0, 520);
    links.push({ label: label.slice(0, 160), url: url.href, context });
  }
  return links;
}

function extractActions(links = []) {
  return links
    .filter((link) => ACTION_PATTERN.test(`${link.label} ${link.url}`))
    .filter((link) => !/^(?:official link|view all|home|more details)$/i.test(link.label.trim()))
    .filter((link) => !/^\d+$/.test(link.label.trim()))
    .map((link) => ({
      id: slug(`${link.label}-${link.url}`),
      label: link.label,
      url: link.url,
      context: link.context || "",
      actionType: /register|sign up/i.test(link.label) ? "registration"
        : /book|reserve|rent|schedule/i.test(link.label) ? "booking"
          : /pay/i.test(link.label) ? "payment"
            : /contact|email/i.test(link.label) ? "contact"
              : /download|google play|apple store|app store/i.test(link.label) ? "download"
                : "form",
    }))
    .slice(0, 30);
}

function extractFacts(text = "") {
  const patterns = [
    { type: "money", regex: /\$\d[\d,]*(?:\.\d{2})?(?:\s*(?:per|\/)\s*(?:hour|month|unit|person|day|event|1,000 gallons?))?/gi },
    { type: "phone", regex: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g },
    { type: "email", regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
    { type: "time", regex: /\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/gi },
    { type: "date", regex: /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,\s+20\d{2})?\b/gi },
    { type: "limit", regex: /\b\d+(?:\.\d+)?\s*(?:feet|foot|ft\.?|inches?|days?|hours?|guests?|vehicles?|ornaments?|trees?|percent|%)\b/gi },
  ];
  const facts = [];
  const seen = new Set();
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern.regex)) {
      const value = match[0].replace(/\s+/g, " ").trim();
      const key = `${pattern.type}:${value.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const before = text.lastIndexOf(".", Math.max(0, match.index - 1));
      const after = text.indexOf(".", match.index + value.length);
      const contextStart = Math.max(before >= 0 ? before + 1 : 0, match.index - 120);
      const contextEnd = Math.min(after >= 0 ? after + 1 : text.length, match.index + value.length + 140);
      const context = text.slice(contextStart, contextEnd).replace(/\s+/g, " ").trim().slice(0, 280);
      const factKey = slug(`${pattern.type}-${context.toLowerCase().replace(value.toLowerCase(), "changing-value")}`);
      const unit = pattern.type === "money" ? value.match(/(?:per|\/)\s*(.+)$/i)?.[1] || ""
        : pattern.type === "limit" ? value.replace(/^\d+(?:\.\d+)?\s*/, "") : "";
      const numeric = Number(value.replace(/[^0-9.]/g, ""));
      facts.push({
        id: slug(key),
        factKey,
        type: pattern.type,
        value,
        normalizedValue: Number.isFinite(numeric) && ["money", "limit"].includes(pattern.type) ? numeric : value.toLowerCase(),
        currency: pattern.type === "money" ? "USD" : "",
        unit,
        effectiveDate: "",
        context,
      });
    }
  }
  const schedulePattern = /\bFor\s+[^.]{1,90},\s+[^.]{1,220}\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b[^.]*\.?/gi;
  for (const match of text.matchAll(schedulePattern)) {
    const value = match[0].replace(/\s+/g, " ").trim();
    const key = `schedule:${value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push({ id: slug(key), factKey: slug(`schedule-${value.replace(/Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/gi, "changing-day")}`), type: "schedule", value, normalizedValue: value.toLowerCase(), currency: "", unit: "weekday", effectiveDate: "", context: value });
  }
  return facts.slice(0, 80);
}

function chunkText(text, maxChars = 1800) {
  const sentences = String(text || "").split(/(?<=[.!?])\s+(?=[A-Z0-9])/).filter(Boolean);
  const chunks = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && current.length + sentence.length + 1 > maxChars) {
      chunks.push(current.trim());
      current = "";
    }
    current += `${current ? " " : ""}${sentence}`;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length ? chunks : [String(text || "").slice(0, maxChars)];
}

function canonicalPageUrl(value) {
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (!/^(?:CID|EID|QID|catID|view)$/i.test(key)) url.searchParams.delete(key);
  }
  return url.href;
}

function shouldCrawl(link, profile, origin) {
  const url = new URL(link.url);
  if (url.origin !== origin || SKIP_PATH.test(url.pathname)) return false;
  // Form Center destinations are resident transaction endpoints, not content
  // pages. Keep them as actions without crawling them (some CivicPlus form
  // URLs intentionally redirect in a loop outside a browser session).
  if (/\/FormCenter\//i.test(url.pathname)) return false;
  // This obsolete direct-debit PDF remains linked from an older CAB page but
  // now returns 404. The current UtilityHawk payment route is indexed instead.
  if (/\/DocumentCenter\/View\/411\//i.test(url.pathname)) return false;
  if (/Calendar\.aspx/i.test(url.pathname) && url.searchParams.has("EID")) return false;
  if (/\b(?:login|share|print|subscribe|notify me)\b/i.test(`${link.label} ${url.pathname}`)) return false;
  return PAGE_PRIORITY.test(`${link.label} ${url.pathname}`) || url.pathname === "/";
}

async function crawlCommunity(profileInput, options = {}) {
  const profile = validateCommunityProfile(profileInput);
  const websiteConnector = profile.connectors.find((connector) => connector.type === "civicplus-pages") || profile.connectors[0];
  const startUrl = new URL(websiteConnector.baseUrl);
  const maxPages = Math.max(1, Math.min(Number(options.maxPages || websiteConnector.maxPages || 60), 120));
  const fetchOptions = { fetchImpl: options.fetchImpl, lookup: options.lookup, timeoutMs: options.timeoutMs };
  const queue = [
    { label: profile.name, url: startUrl.href },
    ...(websiteConnector.seedUrls || []).map((url) => ({ label: "Configured official source", url })),
  ];
  const queued = new Set(queue.map((item) => canonicalPageUrl(item.url)));
  const crawled = new Set();
  const records = [];
  const failures = [];
  const checkedAt = new Date().toISOString();

  while (queue.length && crawled.size < maxPages) {
    const candidate = queue.shift();
    const canonical = canonicalPageUrl(candidate.url);
    if (crawled.has(canonical)) continue;
    crawled.add(canonical);
    try {
      let html = "";
      let finalUrl = canonical;
      let title = candidate.label;
      let text = "";
      let links = [];
      if (isDocumentUrl(canonical)) {
        if (new URL(canonical).origin !== startUrl.origin) throw new Error("Document host is outside the official website.");
        text = stripEmbeddedInstructions(await extractPdfText(canonical));
      } else {
        ({ html, finalUrl } = await fetchPublicPage(new URL(canonical), fetchOptions));
        title = pageTitle(html, candidate.label);
        text = stripEmbeddedInstructions(pageText(html));
        links = linksFromHtml(contentHtml(html), finalUrl);
      }
      if (text.length >= 80) {
        const sourceType = sourceTypeFor(title, finalUrl, text);
        const chunks = chunkText(text);
        const actions = extractActions(links);
        chunks.forEach((chunk, chunkIndex) => {
          const sourceId = `${profile.communityId}-${slug(title)}-${chunkIndex + 1}`;
          const contentHash = hash(chunk);
          const structuredFacts = extractFacts(chunk).map((fact) => ({
            ...fact,
            sourceId,
            sourceUrl: finalUrl,
            checkedAt,
            contentHash,
          }));
          structuredFacts.push(...actions.map((action) => ({
            id: `${sourceId}-${action.id}-link`,
            factKey: `link-${action.id}`,
            type: "link",
            value: action.url,
            normalizedValue: action.url,
            currency: "",
            unit: "",
            effectiveDate: "",
            context: `${action.label}: ${action.url}`,
            sourceId,
            sourceUrl: finalUrl,
            checkedAt,
            contentHash,
          })));
          const source = {
            id: sourceId,
            communityId: profile.communityId,
            title,
            sourceUrl: finalUrl,
            sourceType,
            connectorType: websiteConnector.type,
            authorityScore: authorityScore(profile, sourceType, websiteConnector.type),
            text: chunk,
            excerpt: chunk.slice(0, 420),
            actions,
            facts: structuredFacts,
            contentHash,
            checkedAt,
            staleAfter: new Date(Date.now() + Number(websiteConnector.refreshMinutes || 1440) * 60_000).toISOString(),
            lifecycle: "current",
          };
          validateSourceRecord(source);
          records.push(source);
        });
      }
      for (const link of links.filter((item) => shouldCrawl(item, profile, startUrl.origin))) {
        const next = canonicalPageUrl(link.url);
        if (!queued.has(next) && !crawled.has(next)) {
          queued.add(next);
          queue.push(link);
        }
      }
      queue.sort((a, b) => Number(PAGE_PRIORITY.test(`${b.label} ${b.url}`)) - Number(PAGE_PRIORITY.test(`${a.label} ${a.url}`)));
    } catch (error) {
      failures.push({ url: canonical, error: error?.message || String(error) });
    }
  }

  for (const connector of profile.connectors.filter((item) => item.id !== websiteConnector.id)) {
    const sourceType = connectorSourceType(connector);
    const text = `${profile.name} official ${sourceType} source provided by the ${connector.type} connector.`;
    const source = {
      id: `${profile.communityId}-connector-${slug(connector.id)}`,
      communityId: profile.communityId,
      title: `${profile.shortName || profile.name} official ${sourceType}`,
      sourceUrl: connector.baseUrl,
      sourceType,
      connectorType: connector.type,
      authorityScore: authorityScore(profile, sourceType, connector.type),
      text,
      excerpt: text,
      actions: [{ id: `${connector.id}-open`, label: `Open official ${sourceType}`, url: connector.baseUrl, actionType: "information" }],
      facts: [],
      contentHash: hash(text),
      checkedAt,
      staleAfter: new Date(Date.now() + Number(connector.refreshMinutes || 1440) * 60_000).toISOString(),
      lifecycle: "current",
    };
    validateSourceRecord(source);
    records.push(source);
  }

  for (const action of profile.actions || []) {
    const text = `${action.label}. ${(action.keywords || []).join(" ")}. Official ${profile.shortName || profile.name} action.`;
    const source = {
      id: `${profile.communityId}-action-${slug(action.id)}`,
      communityId: profile.communityId,
      title: action.label,
      sourceUrl: action.url,
      sourceType: action.sourceType,
      connectorType: "official-action",
      authorityScore: Number(action.authorityScore || 0.96),
      text,
      excerpt: text,
      actions: [{ id: action.id, label: action.label, url: action.url, actionType: action.actionType || "information", keywords: action.keywords || [] }],
      facts: [],
      contentHash: hash(text),
      checkedAt,
      staleAfter: new Date(Date.now() + Number(action.refreshMinutes || 1440) * 60_000).toISOString(),
      lifecycle: "current",
    };
    validateSourceRecord(source);
    records.push(source);
  }

  const failedUrls = new Set(failures.map((failure) => {
    try { return canonicalPageUrl(failure.url); } catch { return failure.url; }
  }));
  for (const record of records) {
    record.actions = record.actions.filter((action) => {
      try { return !failedUrls.has(canonicalPageUrl(action.url)); } catch { return false; }
    });
  }

  return {
    schemaVersion: 1,
    communityId: profile.communityId,
    communityName: profile.name,
    website: profile.website,
    generatedAt: checkedAt,
    sourceCount: records.length,
    pageCount: crawled.size,
    failureCount: failures.length,
    failures,
    sources: records,
  };
}

module.exports = {
  authorityScore,
  chunkText,
  contentHtml,
  crawlCommunity,
  extractActions,
  extractFacts,
  extractPdfText,
  isDocumentUrl,
  normalizeResidentText,
  linksFromHtml,
  pageText,
  sourceTypeFor,
  stripEmbeddedInstructions,
  containsEmbeddedInstructions: (value = "") => EMBEDDED_INSTRUCTION_PATTERN.test(String(value)),
};

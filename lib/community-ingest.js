const crypto = require("node:crypto");
const { fetchPublicPage, plainText } = require("./community-onboarding");
const { validateCommunityProfile, validateSourceRecord } = require("./community-contracts");
const { buildFactLedger, inferSubjectKey, resolveFactLedger } = require("./community-truth");

const PAGE_PRIORITY = /\b(?:alert|amenit|apply|calendar|contact|document|event|facilit|fee|form|park|pool|program|register|rent|resident|rule|service|trash|utility|water)\b/i;
const SKIP_PATH = /\.(?:css|gif|ico|jpe?g|js|mp4|png|svg|webp|woff2?)(?:$|\?)/i;
const SKIP_CONTENT_PATH = /\/(?:Admin|Account|ArchiveCenter|FormCenter|NotifyMe|Search|SiteMap)(?:\/|\.|$)|\/AgendaCenter\/(?:PreviousVersions|ViewFile)(?:\/|$)|\/m(?:\/|$)|\/(?:print|share)(?:\/|$)|\/(?:RSSFeed|Rss|QuickLinks|SlideShow|iCalendar|list|emailpage|application)\.?(?:aspx)?(?:$|\?)/i;
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

function disambiguateSourceIds(records = []) {
  const uniqueRecords = [];
  const seenRecords = new Set();
  for (const source of records) {
    const key = `${source.id}\n${new URL(source.sourceUrl).href}\n${source.contentHash}`;
    if (seenRecords.has(key)) continue;
    seenRecords.add(key);
    uniqueRecords.push(source);
  }
  records.splice(0, records.length, ...uniqueRecords);
  const groups = new Map();
  for (const source of records) {
    const group = groups.get(source.id) || [];
    group.push(source);
    groups.set(source.id, group);
  }
  for (const [originalId, group] of groups) {
    if (group.length < 2) continue;
    for (const source of group) {
      const sourceId = `${originalId}-${hash(new URL(source.sourceUrl).href).slice(0, 10)}`;
      source.id = sourceId;
      source.facts = (source.facts || []).map((fact) => ({
        ...fact,
        id: String(fact.id || "").startsWith(`${originalId}-`) ? `${sourceId}${String(fact.id).slice(originalId.length)}` : fact.id,
        sourceId,
      }));
    }
  }
  return records;
}

function cleanPageHtml(html = "") {
  return String(html)
    .replace(/<div\b[^>]*data-widget-controller-path=["']\/Calendar\/Widget["'][^>]*>[\s\S]*?<div\b[^>]*class=["']addItemModal hidden["'][^>]*>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/gi, " ")
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
    .replace(/[•]\s*?/g, ". ")
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
  if (/\b(facilit(?:y|ies)|amenit(?:y|ies)|rentals?|reservations?|shelters?|pavilions?|clubhouse|courts?|pickleball|tennis|recreation|civicrec|rec1)\b/i.test(identity)) return "facilities";
  if (/\b(rule|regulation|policy|code|standards?|municode)\b/i.test(identity)) return "rules";
  if (/\b(rule|regulation|policy|standards?)\b/i.test(text.slice(0, 500))) return "rules";
  return "services";
}

function isDocumentUrl(value = "") {
  return /\/DocumentCenter\/View\/|\.pdf(?:$|\?)/i.test(String(value));
}

async function fetchOfficialDocument(url, options = {}, redirectCount = 0) {
  const fetchImpl = options.fetchImpl || global.fetch;
  const response = await fetchImpl(url, {
    redirect: "manual",
    headers: { "user-agent": "Sterling Ranch community source indexer", accept: "application/pdf,*/*;q=0.2" },
  });
  if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
    if (redirectCount >= 3) throw new Error("The document redirected too many times.");
    const redirected = new URL(response.headers.get("location"), url);
    if (redirected.origin !== new URL(url).origin) throw new Error("Document redirected outside the official website.");
    return fetchOfficialDocument(redirected.href, options, redirectCount + 1);
  }
  if (!response.ok) throw new Error(`The document returned ${response.status}.`);
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length > 25_000_000) throw new Error("The document is too large to index safely.");
  if (data.subarray(0, 5).toString("ascii") !== "%PDF-") {
    const error = new Error("The DocumentCenter attachment is not a PDF.");
    error.code = "UNSUPPORTED_DOCUMENT_FORMAT";
    throw error;
  }
  return data;
}

async function extractPdfText(url, options = {}) {
  const { PDFParse } = require("pdf-parse");
  const data = await fetchOfficialDocument(url, options);
  options.onDocumentFingerprint?.(crypto.createHash('sha256').update(data).digest('hex'));
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    return normalizeResidentText(result.text || "")
      .replace(/([A-Za-z])-\s+([a-z]{2,})/g, "$1$2")
      .replace(/\s+/g, " ")
      .trim();
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
    const navigationOnly = decodeHtml(match[1]).trim() === "#"
      || (/^#question-\d+$/i.test(url.hash) && canonicalPageUrl(url.href) === canonicalPageUrl(baseUrl));
    // Keep real form/booking anchors intact. Only known FAQ expand controls
    // and empty controls are excluded from resident next-step actions.
    if (navigationOnly) url.hash = "";
    const label = decodeHtml(plainText(match[2])).replace(/\s+/g, " ").trim() || "Official link";
    const key = url.href.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const contextHtml = html.slice(Math.max(0, match.index - 320), Math.min(html.length, match.index + match[0].length + 320));
    const context = decodeHtml(plainText(contextHtml)).replace(/\s+/g, " ").trim().slice(0, 520);
    links.push({ label: label.slice(0, 160), url: url.href, context, ...(navigationOnly ? { navigationOnly: true } : {}) });
  }
  return links;
}

function extractActions(links = []) {
  return links
    .filter((link) => !link.navigationOnly)
    .filter((link) => /^https:\/\//i.test(link.url))
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
  const { MONEY_PATTERN, moneyAmount } = require('./community-money');
  const timeScopes = require('./community-hours-scopes').hoursScopes(text);
  const patterns = [
    { type: "money", regex: MONEY_PATTERN },
    { type: "phone", regex: /\b(?:\+?1[-.\s]*)?\(?\d{3}\)?[-.\s]+\d{3}[-.\s]+\d{4}\b/g },
    { type: "email", regex: /\b[A-Z0-9._%+&'-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
    { type: "time", regex: /\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/gi },
    { type: "date", regex: /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,\s+20\d{2})?\b/gi },
    { type: "limit", regex: /\b\d+(?:\.\d+)?\s*(?:feet|foot|ft\.?|inches?|days?|hours?|guests?|vehicles?|ornaments?|trees?|percent|%)\b/gi },
  ];
  const facts = [];
  const seen = new Set();
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern.regex)) {
      const value = match[0].replace(/\s+/g, " ").trim();
      const timeScope = pattern.type === 'time' ? timeScopes.get(match.index) : null;
      const key = `${pattern.type}:${value.toLowerCase()}${timeScope ? `:${timeScope.scopeKey}` : ''}`;
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
      const numeric = pattern.type === 'money'
        ? moneyAmount(value)
        : Number(value.replace(/[^0-9.]/g, ""));
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
        ...(timeScope || {}),
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
  url.hostname = url.hostname.toLowerCase();
  url.pathname = url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
  for (const key of [...url.searchParams.keys()]) {
    if (!/^(?:CID|EID|QID|catID|cat|view)$/i.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.href;
}

function crawlEligibility(link, profile, origin) {
  const url = new URL(link.url);
  if (url.origin !== origin) return { eligible: false, reason: "outside-official-site" };
  if (SKIP_PATH.test(url.pathname)) return { eligible: false, reason: "static-asset" };
  // Form Center destinations are resident transaction endpoints, not content
  // pages. Keep them as actions without crawling them (some CivicPlus form
  // URLs intentionally redirect in a loop outside a browser session).
  if (SKIP_CONTENT_PATH.test(url.pathname)) return { eligible: false, reason: "technical-or-transaction-route" };
  // This obsolete direct-debit PDF remains linked from an older CAB page but
  // now returns 404. The current UtilityHawk payment route is indexed instead.
  if (/\/DocumentCenter\/View\/411\//i.test(url.pathname)) return { eligible: false, reason: "known-obsolete-document" };
  if (/\/Facilities\/Facility\/Details\/-/i.test(url.pathname)) return { eligible: false, reason: "invalid-facility-route" };
  if (/@|\/[a-z0-9.-]+\.(?:com|org|gov)(?:\/|$)/i.test(url.pathname)) return { eligible: false, reason: "malformed-relative-external-link" };
  if (isDocumentUrl(url.href)) return { eligible: true, reason: "official-document" };
  if (/Calendar\.aspx/i.test(url.pathname) && url.searchParams.has("EID")) return { eligible: false, reason: "dynamic-calendar-detail" };
  if (/\b(?:login|share|print|subscribe|notify me)\b/i.test(`${link.label} ${url.pathname}`)) return { eligible: false, reason: "technical-or-transaction-link" };
  return { eligible: true, reason: "official-content-page" };
}

function shouldCrawl(link, profile, origin) {
  return crawlEligibility(link, profile, origin).eligible;
}

function crawlPriority(candidate = {}) {
  if (isDocumentUrl(candidate.url)) return 3;
  if (new URL(candidate.url).pathname === "/") return 2;
  return PAGE_PRIORITY.test(`${candidate.label || ""} ${candidate.url || ""}`) ? 1 : 0;
}

function canonicalLinkFromHtml(html = "", baseUrl) {
  const href = String(html).match(/<link\b[^>]*rel=["'][^"']*canonical[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>|<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["'][^"']*canonical[^"']*["'][^>]*>/i);
  if (!href) return "";
  try {
    const url = new URL(decodeHtml(href[1] || href[2]), baseUrl);
    return url.origin === new URL(baseUrl).origin ? canonicalPageUrl(url.href) : "";
  } catch { return ""; }
}

function sitemapUrlsFromXml(xml = "", baseUrl) {
  const urls = [];
  const seen = new Set();
  for (const match of String(xml).matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) {
    try {
      const url = canonicalPageUrl(decodeHtml(match[1]));
      if (new URL(url).origin !== new URL(baseUrl).origin || seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
    } catch { /* ignore malformed sitemap entries */ }
  }
  return urls;
}

function pageSources(index = {}, url = "") {
  const canonical = canonicalPageUrl(url);
  return (index.sources || []).filter((source) => {
    try { return canonicalPageUrl(source.sourceUrl) === canonical; } catch { return false; }
  });
}

function normalizedContentFingerprint(value = "") {
  return hash(String(value).toLowerCase().replace(/[^a-z0-9$@.]+/g, " ").replace(/\s+/g, " ").trim());
}

function pageContentIdentity(page) {
  const url = canonicalPageUrl(page.canonicalUrl || page.url);
  // Equal text layers cannot establish equality of scanned pages or maps.
  return isDocumentUrl(url)
    ? `pdf:${page.documentFingerprint || `unverified:${url}`}`
    : `text:${page.contentFingerprint}`;
}

function sourceContentHash(text, documentFingerprint = '') {
  return hash(documentFingerprint ? `${documentFingerprint}\n${text}` : text);
}

function hasReadableDocumentText(value = '') {
  // Broken PDF character maps can contain a few real words amid control codes.
  // Such text is not reliable evidence for extracted prices or other facts.
  const raw = String(value);
  const damagedCharacters = (raw.match(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/g) || []).length;
  if (damagedCharacters > 5 && damagedCharacters / Math.max(1, raw.length) > 0.01) return false;
  // pdf-parse emits page counters even when a scanned PDF has no text layer.
  // Those counters cannot establish content coverage or duplicate identity.
  const content = String(value)
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}\s*[AP]M\s+Landmark Web Official Records Search/gi, '')
    .replace(/https:\/\/apps\.douglas\.co\.us\/LandmarkWeb\/search\/\S+/gi, '')
    .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, '').trim();
  return /[a-z]{2}/i.test(content);
}

async function crawlCommunity(profileInput, options = {}) {
  const profile = validateCommunityProfile(profileInput);
  const websiteConnector = profile.connectors.find((connector) => connector.type === "civicplus-pages") || profile.connectors[0];
  const startUrl = new URL(websiteConnector.baseUrl);
  const maxPages = Math.max(1, Math.min(Number(options.maxPages || websiteConnector.maxPages || 60), 500));
  const maxDocuments = Math.max(1, Math.min(Number(options.maxDocuments || websiteConnector.maxDocuments || 60), 250));
  const fetchOptions = { fetchImpl: options.fetchImpl, lookup: options.lookup, timeoutMs: options.timeoutMs };
  const readPdfText = options.extractPdfText || extractPdfText;
  const previousIndex = options.previousIndex || {};
  const previousPages = new Map((previousIndex.pages || []).map((page) => [canonicalPageUrl(page.url), page]));
  const previousSourceUrls = new Set((previousIndex.sources || [])
    .filter(source => !isDocumentUrl(source.sourceUrl) || hasReadableDocumentText(source.text))
    .map(source => canonicalPageUrl(source.sourceUrl)));
  const previousInventory = previousIndex.inventory || {};
  const pendingFirst = previousInventory.pendingUrls || [];
  const initialCandidates = [
    ...pendingFirst.map((url) => ({ label: "Pending official source", url, pending: true })),
    { label: profile.name, url: startUrl.href },
    ...(websiteConnector.seedUrls || []).map((url) => ({ label: "Configured official source", url })),
    ...(previousInventory.eligibleUrls || []).map((url) => ({ label: "Previously discovered official source", url })),
  ];
  const queue = [];
  const queued = new Set();
  const crawled = new Set();
  const eligibleUrls = new Set();
  const exclusions = new Map((previousInventory.exclusions || []).map((item) => [item.url, item]));
  for (const candidate of initialCandidates) {
    let canonical;
    try { canonical = canonicalPageUrl(candidate.url); } catch { continue; }
    if (exclusions.has(canonical)) continue;
    const eligibility = crawlEligibility({ ...candidate, url: canonical }, profile, startUrl.origin);
    if (!eligibility.eligible) {
      exclusions.set(canonical, { url: canonical, reason: eligibility.reason });
      continue;
    }
    if (queued.has(canonical)) continue;
    queued.add(canonical);
    eligibleUrls.add(canonical);
    queue.push({ ...candidate, url: canonical });
  }
  const records = [];
  const pages = [];
  const failures = [];
  const discoveryWarnings = [];
  const checkedAt = new Date(options.now || Date.now()).toISOString();
  const contentOwners = new Map((previousIndex.pages || [])
    .filter((page) => page.contentFingerprint && !page.duplicateOf
      && previousSourceUrls.has(canonicalPageUrl(page.canonicalUrl || page.url)))
    .map((page) => [pageContentIdentity(page), canonicalPageUrl(page.url)]));
  let pageCount = 0;
  let documentCount = 0;

  if (options.discoverSitemap !== false) {
    try {
      const sitemapUrl = new URL(options.sitemapUrl || "/sitemap.xml", startUrl);
      const sitemap = await fetchPublicPage(sitemapUrl, fetchOptions);
      for (const url of sitemapUrlsFromXml(sitemap.html, startUrl.href)) {
        const link = { label: "Official sitemap page", url };
        const eligibility = crawlEligibility(link, profile, startUrl.origin);
        if (!eligibility.eligible) continue;
        const canonical = canonicalPageUrl(url);
        eligibleUrls.add(canonical);
        if (!queued.has(canonical)) {
          queued.add(canonical);
          queue.push(link);
        }
      }
    } catch (error) {
      discoveryWarnings.push({ url: new URL(options.sitemapUrl || "/sitemap.xml", startUrl).href, warning: `Sitemap discovery: ${error?.message || String(error)}` });
    }
  }

  function queueOrder(candidate) {
    const canonical = canonicalPageUrl(candidate.url);
    const previous = previousPages.get(canonical);
    const age = previous?.lastCheckedAt ? Math.min(5, Math.floor((Date.now() - new Date(previous.lastCheckedAt).getTime()) / 86_400_000)) : 10;
    const missingContent = previous?.indexed && !previousSourceUrls.has(canonicalPageUrl(previous.canonicalUrl || canonical));
    return (candidate.pending || missingContent ? 30 : 0) + crawlPriority(candidate) * 10 + age;
  }
  queue.sort((a, b) => queueOrder(b) - queueOrder(a));

  while (queue.length && (pageCount < maxPages || documentCount < maxDocuments)) {
    const candidate = queue.shift();
    const canonical = canonicalPageUrl(candidate.url);
    if (crawled.has(canonical)) continue;
    const documentUrl = isDocumentUrl(canonical);
    if (documentUrl && documentCount >= maxDocuments) continue;
    if (!documentUrl && pageCount >= maxPages) continue;
    crawled.add(canonical);
    if (documentUrl) documentCount += 1;
    else pageCount += 1;
    try {
      let html = "";
      let finalUrl = canonical;
      let title = candidate.label;
      let text = "";
      let links = [];
      let discoveryLinks = [];
      let etag = "";
      let lastModified = "";
      let documentFingerprint = "";
      const previousPage = previousPages.get(canonical);
      if (documentUrl) {
        if (new URL(canonical).origin !== startUrl.origin) throw new Error("Document host is outside the official website.");
        text = stripEmbeddedInstructions(await readPdfText(canonical, { ...fetchOptions,
          onDocumentFingerprint: value => { documentFingerprint = value; } }));
        if (!hasReadableDocumentText(text)) throw new Error('PDF has no readable text layer; OCR or manual document review is required.');
      } else {
        const fetched = await fetchPublicPage(new URL(canonical), {
          ...fetchOptions,
          etag: options.forceContent ? "" : previousPage?.etag,
          lastModified: options.forceContent ? "" : previousPage?.lastModified,
        });
        ({ html, finalUrl, etag, lastModified } = fetched);
        if (fetched.notModified && previousPage) {
          const reused = pageSources(previousIndex, previousPage.canonicalUrl || canonical).map((source) => ({
            ...source,
            checkedAt,
            staleAfter: new Date(Date.now() + Number(websiteConnector.refreshMinutes || 1440) * 60_000).toISOString(),
          }));
          records.push(...reused);
          pages.push({ ...previousPage, url: canonical, lastCheckedAt: checkedAt, etag, lastModified, reused: true });
          continue;
        }
        title = pageTitle(html, candidate.label);
        const declaredCanonical = canonicalLinkFromHtml(html, finalUrl);
        finalUrl = declaredCanonical && crawlEligibility({ label: title, url: declaredCanonical }, profile, startUrl.origin).eligible
          ? declaredCanonical
          : canonicalPageUrl(finalUrl);
        text = stripEmbeddedInstructions(pageText(html));
        links = linksFromHtml(contentHtml(html), finalUrl);
        discoveryLinks = linksFromHtml(html, finalUrl);
      }
      const contentFingerprint = normalizedContentFingerprint(text);
      const contentIdentity = pageContentIdentity({ url: finalUrl, contentFingerprint, documentFingerprint });
      const duplicateOf = text.length >= 80 && contentOwners.has(contentIdentity)
        && contentOwners.get(contentIdentity) !== canonicalPageUrl(finalUrl)
        ? contentOwners.get(contentIdentity)
        : "";
      if (text.length >= 80 && !duplicateOf) {
        contentOwners.set(contentIdentity, canonicalPageUrl(finalUrl));
        const sourceType = sourceTypeFor(title, finalUrl, text);
        const chunks = chunkText(text);
        const actions = extractActions(links);
        chunks.forEach((chunk, chunkIndex) => {
          const sourceId = `${profile.communityId}-${slug(title)}-${chunkIndex + 1}`;
          const contentHash = sourceContentHash(chunk, documentFingerprint);
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
            actionLabel: action.label,
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
            connectorType: documentUrl ? "official-pdf" : websiteConnector.type,
            authorityScore: authorityScore(profile, sourceType, websiteConnector.type),
            text: chunk,
            excerpt: chunk.slice(0, 420),
            actions,
            facts: structuredFacts,
            contentHash,
            checkedAt,
            ...(documentFingerprint ? { documentFingerprint } : {}),
            staleAfter: new Date(Date.now() + Number(websiteConnector.refreshMinutes || 1440) * 60_000).toISOString(),
            lifecycle: "current",
          };
          source.subjectKey = inferSubjectKey(source);
          validateSourceRecord(source);
          records.push(source);
        });
      }
      pages.push({
        url: canonical,
        canonicalUrl: canonicalPageUrl(finalUrl),
        title,
        contentFingerprint,
        ...(documentFingerprint ? { documentFingerprint } : {}),
        contentHash: sourceContentHash(text, documentFingerprint),
        chunkContentHashes: text.length >= 80 ? chunkText(text).map(chunk => sourceContentHash(chunk, documentFingerprint)) : [],
        etag,
        lastModified,
        lastCheckedAt: checkedAt,
        indexed: text.length >= 80 && !duplicateOf,
        ...(duplicateOf ? { duplicateOf } : {}),
      });
      for (const link of discoveryLinks) {
        const eligibility = crawlEligibility(link, profile, startUrl.origin);
        let next;
        try { next = canonicalPageUrl(link.url); } catch { continue; }
        if (!eligibility.eligible) {
          if (new URL(link.url).origin === startUrl.origin) exclusions.set(next, { url: next, reason: eligibility.reason });
          continue;
        }
        eligibleUrls.add(next);
        if (!queued.has(next) && !crawled.has(next)) {
          queued.add(next);
          queue.push(link);
        }
      }
      queue.sort((a, b) => queueOrder(b) - queueOrder(a));
    } catch (error) {
      if (error?.code === "UNSUPPORTED_DOCUMENT_FORMAT") {
        eligibleUrls.delete(canonical);
        exclusions.set(canonical, { url: canonical, reason: "unsupported-document-format" });
        continue;
      }
      const message = error?.message || String(error);
      const previousPage = previousPages.get(canonical);
      const missingStatus = message.match(/returned (404|410)\b/)?.[1] || "";
      if (missingStatus && previousPage) {
        const firstMissingAt = previousPage.firstMissingAt || checkedAt;
        const elapsed = new Date(checkedAt).getTime() - new Date(firstMissingAt).getTime();
        const previousChecks = Number(previousPage.missingCheckCount || 0);
        const independentlyConfirmed = previousChecks >= 1 && elapsed >= 86_400_000;
        pages.push({
          ...previousPage,
          lifecycle: "retirement-pending",
          firstMissingAt,
          lastMissingAt: checkedAt,
          missingCheckCount: previousChecks + 1,
          retirementConfirmedAt: independentlyConfirmed ? checkedAt : previousPage.retirementConfirmedAt || "",
          lastMissingStatus: Number(missingStatus),
          lastCheckedAt: checkedAt,
        });
        records.push(...pageSources(previousIndex, previousPage.canonicalUrl || canonical));
        continue;
      }
      if (/returned (?:404|410)\b|too large to index safely|redirected outside the official website/i.test(message)) {
        eligibleUrls.delete(canonical);
        exclusions.set(canonical, {
          url: canonical,
          reason: /too large/i.test(message) ? "oversized-document-safety-limit"
              : /redirected outside/i.test(message) ? "rejected-external-redirect"
                : "unavailable-official-link",
        });
      } else {
        failures.push({ url: canonical, error: message });
      }
      if (previousPage) {
        pages.push(previousPage);
        records.push(...pageSources(previousIndex, previousPage.canonicalUrl || canonical));
      }
    }
  }

  // A page budget limits work in one run; it must never make an already
  // approved page disappear. Unvisited pages stay approved while their place
  // in the persistent inventory waits for the next batch.
  for (const previousPage of previousIndex.pages || []) {
    const canonical = canonicalPageUrl(previousPage.url);
    if (crawled.has(canonical) || !eligibleUrls.has(canonical)) continue;
    pages.push(previousPage);
    records.push(...pageSources(previousIndex, previousPage.canonicalUrl || canonical));
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

  disambiguateSourceIds(records);

  const failedUrls = new Set(failures.map((failure) => {
    try { return canonicalPageUrl(failure.url); } catch { return failure.url; }
  }));
  for (const record of records) {
    record.actions = record.actions.filter((action) => /^https:\/\//i.test(action.url) && (() => {
      try { return !failedUrls.has(canonicalPageUrl(action.url)); } catch { return false; }
    })());
    record.facts = record.facts.filter((fact) => fact.type !== "link" || /^https:\/\//i.test(fact.value));
  }
  const uniquePages = pages.filter((page, index, all) =>
    all.findIndex((candidate) => canonicalPageUrl(candidate.url) === canonicalPageUrl(page.url)) === index
  );
  for (const page of uniquePages) {
    if (page.canonicalUrl && !crawlEligibility({ label: page.title, url: page.canonicalUrl }, profile, startUrl.origin).eligible) {
      page.canonicalUrl = canonicalPageUrl(page.url);
    }
  }
  for (const page of uniquePages) {
    if (isDocumentUrl(page.url) && page.duplicateOf) {
      const owner = uniquePages.find(p => canonicalPageUrl(p.canonicalUrl || p.url) === canonicalPageUrl(page.duplicateOf));
      if (!page.documentFingerprint || owner?.documentFingerprint !== page.documentFingerprint) {
        delete page.duplicateOf;
        page.indexed = false;
        page.indexingPending = true;
      }
    }
    if (page.indexed || page.duplicateOf || page.indexingPending || page.lifecycle === "retirement-pending") continue;
    const url = canonicalPageUrl(page.canonicalUrl || page.url);
    eligibleUrls.delete(url);
    exclusions.set(url, { url, reason: "insufficient-resident-content" });
  }
  const pageOwners = new Map();
  for (const page of uniquePages) {
    if (!page.indexed || !page.contentFingerprint) continue;
    const contentIdentity = pageContentIdentity(page);
    const owner = pageOwners.get(contentIdentity);
    if (owner && canonicalPageUrl(owner.url) !== canonicalPageUrl(page.url)) {
      page.indexed = false;
      page.duplicateOf = owner.canonicalUrl || owner.url;
    } else {
      pageOwners.set(contentIdentity, page);
    }
  }
  const recordsByContent = new Map();
  for (const record of records) {
    const key = `${record.connectorType}:${record.contentHash}${isDocumentUrl(record.sourceUrl) && !record.documentFingerprint ? `:${canonicalPageUrl(record.sourceUrl)}` : ''}`;
    const existing = recordsByContent.get(key);
    if (!existing) {
      recordsByContent.set(key, record);
      continue;
    }
    existing.actions = [...(existing.actions || []), ...(record.actions || [])].filter((action, index, all) =>
      all.findIndex((candidate) => candidate.url === action.url) === index
    );
    existing.facts = [...(existing.facts || []), ...(record.facts || [])].filter((fact, index, all) =>
      all.findIndex((candidate) => `${candidate.type}:${candidate.value}:${candidate.context}` === `${fact.type}:${fact.value}:${fact.context}`) === index
    );
  }
  const uniqueRecords = require('./community-facility-fees').scopeFacilityFees([...recordsByContent.values()]);
  // Reusing crawl results is not approval. Preserve exact fact decisions from
  // the ledger; never trust every source merely because it appeared last run.
  const trustedVersions = new Set();
  const factLedger = buildFactLedger({
    communityId: profile.communityId,
    generatedAt: checkedAt,
    sources: uniqueRecords,
  }, {
    previousLedger: previousIndex.factLedger || [],
    trustedVersions,
  });
  const truthResolution = resolveFactLedger(factLedger, profile);
  // Saved crawl metadata can describe quarantined candidate content that is
  // absent from the approved bundle. Metadata alone is not indexed evidence.
  const readableRecords = uniqueRecords.filter(record => !isDocumentUrl(record.sourceUrl) || hasReadableDocumentText(record.text));
  const availableUrls = new Set(readableRecords.map(record => canonicalPageUrl(record.sourceUrl)));
  const availableChunks = new Map();
  for (const record of readableRecords) {
    if (!availableChunks.has(record.contentHash)) availableChunks.set(record.contentHash, []);
    availableChunks.get(record.contentHash).push(record);
  }
  function pageChunkRecords(page) {
    return (page.chunkContentHashes || []).map(contentHash => (availableChunks.get(contentHash) || []).find(record =>
      !isDocumentUrl(page.url) || (page.documentFingerprint
        ? page.documentFingerprint === record.documentFingerprint
        : canonicalPageUrl(record.sourceUrl) === canonicalPageUrl(page.canonicalUrl || page.url))));
  }
  for (const page of uniquePages) {
    const chunks = page.chunkContentHashes || [];
    const matchedChunks = pageChunkRecords(page);
    const completeChunkCoverage = chunks.length > 0 && matchedChunks.every(Boolean);
    if (completeChunkCoverage) {
      page.indexedSourceIds = [...new Set(matchedChunks.map(record => record.id))];
      if (!page.duplicateOf) page.indexed = true;
      delete page.indexingPending;
    }
    if (page.indexed && (chunks.length ? !completeChunkCoverage : !availableUrls.has(canonicalPageUrl(page.canonicalUrl || page.url)))) {
      page.indexed = false;
      page.indexingPending = true;
    }
  }
  const accountedUrls = new Set(uniquePages.filter(page =>
    page.indexed || (page.duplicateOf && availableUrls.has(canonicalPageUrl(page.duplicateOf)))
      || (page.chunkContentHashes?.length > 0 && pageChunkRecords(page).every(Boolean))
  ).map(page => canonicalPageUrl(page.url)));
  // Discovery can rediscover a URL excluded earlier in the same or a prior
  // crawl. A URL must have one inventory disposition. Actual indexed evidence
  // overrides an old exclusion; otherwise preserve its explicit exclusion
  // reason rather than repeatedly reporting it as a crawl-limit omission.
  for (const url of exclusions.keys()) {
    if (accountedUrls.has(url)) exclusions.delete(url);
    else eligibleUrls.delete(url);
  }
  const pendingUrls = [...eligibleUrls].filter(url => !accountedUrls.has(url)).sort();
  const sameSiteFailures = failures.filter((failure) => {
    try { return new URL(failure.url).origin === startUrl.origin && !/sitemap/i.test(failure.error); } catch { return false; }
  });

  return {
    schemaVersion: 3,
    communityId: profile.communityId,
    communityName: profile.name,
    website: profile.website,
    generatedAt: checkedAt,
    sourceCount: uniqueRecords.length,
    pageCount,
    documentCount,
    failureCount: failures.length,
    failures,
    discoveryWarnings,
    factAuthority: profile.factAuthority,
    factLedger,
    truthStatus: {
      generatedAt: checkedAt,
      unresolvedConflictCount: truthResolution.unresolved.length,
      unresolvedSensitiveConflictCount: truthResolution.unresolvedSensitive.length,
      pendingSensitiveReviewCount: factLedger.filter((entry) => entry.reviewStatus === "candidate" && entry.lifecycle !== "retired").length,
    },
    pages: uniquePages,
    inventory: {
      discoveredCount: eligibleUrls.size + exclusions.size,
      eligibleCount: eligibleUrls.size,
      indexedPageCount: uniquePages.filter((page) => page.indexed).length,
      excludedCount: exclusions.size,
      pendingCount: pendingUrls.length,
      complete: pendingUrls.length === 0 && sameSiteFailures.length === 0,
      eligibleUrls: [...eligibleUrls].sort(),
      pendingUrls,
      exclusions: [...exclusions.values()].sort((a, b) => a.url.localeCompare(b.url)),
    },
    sources: uniqueRecords,
  };
}

module.exports = {
  authorityScore,
  chunkText,
  canonicalPageUrl,
  crawlEligibility,
  contentHtml,
  crawlCommunity,
  crawlPriority,
  disambiguateSourceIds,
  extractActions,
  extractFacts,
  extractPdfText,
  isDocumentUrl,
  normalizeResidentText,
  linksFromHtml,
  normalizedContentFingerprint,
  hasReadableDocumentText,
  pageText,
  sourceTypeFor,
  sitemapUrlsFromXml,
  stripEmbeddedInstructions,
  containsEmbeddedInstructions: (value = "") => EMBEDDED_INSTRUCTION_PATTERN.test(String(value)),
};

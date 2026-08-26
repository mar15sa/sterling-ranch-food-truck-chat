const dns = require("node:dns").promises;
const net = require("node:net");

const DEFAULT_TIMEOUT_MS = 8000;
const MAX_PAGE_BYTES = 1_500_000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; CommunityAnswerSetup/1.0; +https://sterlingranchsociety.com/)";

const SOURCE_TYPES = [
  {
    id: "rules",
    label: "Rules and policies",
    patterns: /\b(rule|regulation|policy|code|municode|governing|standards?)\b/i,
    authority: "The adopted rule, policy, or code controls the answer.",
  },
  {
    id: "events",
    label: "Events and calendars",
    patterns: /\b(calendar|event|meeting|activities|programs?)\b/i,
    authority: "The official calendar controls current dates, times, and registration links.",
  },
  {
    id: "facilities",
    label: "Facilities and rentals",
    patterns: /\b(facilit(?:y|ies)|amenit(?:y|ies)|rental|reservation|park shelter|clubhouse|pavilion|civicrec|rec1)\b/i,
    authority: "The facility or recreation system controls prices, availability, and booking steps.",
  },
  {
    id: "forms",
    label: "Forms and resident actions",
    patterns: /\b(forms?|apply|application|permit|register|request|document center|documentcenter)\b/i,
    authority: "The current official form or transaction page controls what residents should submit.",
  },
  {
    id: "alerts",
    label: "Alerts and current notices",
    patterns: /\b(alert|notify|emergency|closure|news|notice)\b/i,
    authority: "The newest official alert or notice controls time-sensitive guidance.",
  },
  {
    id: "services",
    label: "Services and everyday information",
    patterns: /\b(service|resident|utility|trash|water|pool|contact|department|faq)\b/i,
    authority: "The current official service page controls instructions and contact details.",
  },
];

function normalizeCommunityUrl(value) {
  let raw = String(value || "").trim();
  if (!raw) throw new Error("Enter the community's official website.");
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Enter a valid public website, such as https://example.gov/.");
  }

  if (url.protocol !== "https:") {
    throw new Error("Use the community's secure https:// website.");
  }
  if (url.username || url.password || (url.port && url.port !== "443")) {
    throw new Error("Enter the main public website without a login or custom port.");
  }
  if (!url.hostname.includes(".") || url.hostname.toLowerCase() === "localhost") {
    throw new Error("Enter a public community website.");
  }

  url.hash = "";
  url.search = "";
  url.pathname = "/";
  return url;
}

function isPrivateAddress(address) {
  if (!net.isIP(address)) return true;
  const value = address.toLowerCase();
  if (value.includes(":")) {
    return (
      value === "::1" ||
      value === "::" ||
      value.startsWith("fc") ||
      value.startsWith("fd") ||
      value.startsWith("fe8") ||
      value.startsWith("fe9") ||
      value.startsWith("fea") ||
      value.startsWith("feb") ||
      value.startsWith("::ffff:127.") ||
      value.startsWith("::ffff:10.") ||
      value.startsWith("::ffff:192.168.")
    );
  }

  const parts = value.split(".").map(Number);
  return (
    parts[0] === 0 ||
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    parts[0] >= 224
  );
}

async function assertPublicHostname(hostname, lookup = dns.lookup) {
  const records = await lookup(hostname, { all: true });
  if (!records.length || records.some((record) => isPrivateAddress(record.address))) {
    throw new Error("That address is not a public community website.");
  }
}

function decodeHtml(value = "") {
  return String(value)
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ");
}

function plainText(value = "") {
  return decodeHtml(String(value).replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function pageTitle(html, fallbackHostname) {
  const title = plainText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  if (title) return title.split(/\s+[|–—-]\s+/)[0].trim();
  return fallbackHostname.replace(/^www\./i, "");
}

function extractOfficialLinks(html, homepage) {
  const links = [];
  const seen = new Set();
  const anchorPattern = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorPattern.exec(html))) {
    let url;
    try {
      url = new URL(decodeHtml(match[1]), homepage);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") continue;
    const text = plainText(match[2]) || url.pathname.split("/").filter(Boolean).at(-1) || "Official page";
    const searchable = `${text} ${url.pathname} ${url.hostname}`;
    const type = SOURCE_TYPES.find((candidate) => candidate.patterns.test(searchable));
    if (!type) continue;
    url.hash = "";
    const key = `${type.id}:${url.href.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({
      type: type.id,
      typeLabel: type.label,
      title: text.slice(0, 120),
      url: url.href,
      authority: type.authority,
      official: url.hostname === homepage.hostname,
    });
  }
  return links.slice(0, 40);
}

function detectPlatform(html) {
  if (/civicplus|civicengage|civicplus\.com|\/api\/help\/index\.html/i.test(html)) {
    return {
      id: "civicplus-web-central",
      label: "CivicPlus Web Central",
      confidence: "high",
      connector: "CivicPlus APIs, RSS feeds, and monitored public pages",
    };
  }
  return {
    id: "public-website",
    label: "Public community website",
    confidence: "review",
    connector: "Monitored official pages, feeds, documents, and linked transaction systems",
  };
}

async function fetchPublicPage(url, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const lookup = options.lookup || dns.lookup;
  await assertPublicHostname(url.hostname, lookup);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      redirect: "manual",
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
    });
    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      if ((options.redirectCount || 0) >= 3) throw new Error("The website redirected too many times.");
      const redirected = new URL(response.headers.get("location"), url);
      const safeRedirect = normalizeCommunityUrl(redirected.href);
      safeRedirect.pathname = redirected.pathname || "/";
      safeRedirect.search = redirected.search;
      return fetchPublicPage(safeRedirect, { ...options, redirectCount: (options.redirectCount || 0) + 1 });
    }
    if (!response.ok) throw new Error(`The website returned ${response.status}.`);
    const contentType = response.headers.get("content-type") || "";
    if (contentType && !/html|text|xml/i.test(contentType)) {
      throw new Error("The website did not return a readable public page.");
    }
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length > MAX_PAGE_BYTES) throw new Error("The website's homepage is too large to preview safely.");
    return { html: body.toString("utf8"), finalUrl: url.href };
  } finally {
    clearTimeout(timer);
  }
}

function buildCapabilities(links, platform) {
  const found = new Set(links.map((link) => link.type));
  const apiFriendly = platform.id === "civicplus-web-central";
  return SOURCE_TYPES.map((sourceType) => ({
    id: sourceType.id,
    label: sourceType.label,
    status: found.has(sourceType.id) ? "found" : apiFriendly ? "available-to-connect" : "needs-review",
    explanation: found.has(sourceType.id)
      ? "An official source was found from the website."
      : apiFriendly
        ? "CivicPlus provides a matching module that can be connected during setup."
        : "We would inspect the site's documents, feeds, and linked systems during setup.",
    authority: sourceType.authority,
  }));
}

async function previewCommunitySetup(value, options = {}) {
  const homepage = normalizeCommunityUrl(value);
  const { html, finalUrl } = await fetchPublicPage(homepage, options);
  const finalHomepage = new URL(finalUrl);
  const platform = detectPlatform(html);
  const links = extractOfficialLinks(html, finalHomepage);
  const capabilities = buildCapabilities(links, platform);
  const foundCount = capabilities.filter((item) => item.status === "found").length;

  return {
    website: finalHomepage.origin,
    communityName: pageTitle(html, finalHomepage.hostname),
    platform,
    summary: `We found ${foundCount} official information categories from the main website and mapped the rest of the setup path.`,
    sources: links,
    capabilities,
    setupSteps: [
      "Identify the website platform and official connected systems.",
      "Map each question type to the source that is allowed to answer it.",
      "Turn pages, documents, forms, fees, events, and alerts into searchable source records.",
      "Add direct action links and plain-English answer formatting.",
      "Run resident-question tests, freshness checks, conflict checks, and broken-link checks before launch.",
    ],
    residentPromise:
      "Residents get direct, specific information in plain English, with the official source and next step attached.",
    publicationStatus: "preview-only",
  };
}

module.exports = {
  SOURCE_TYPES,
  buildCapabilities,
  detectPlatform,
  extractOfficialLinks,
  isPrivateAddress,
  normalizeCommunityUrl,
  previewCommunitySetup,
};

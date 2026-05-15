const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_DIR = path.join(__dirname, "public");
const STERLING_EVENT_ID = 6150;
const CALENDAR_BASE = "https://sterlingranchcab.com/Calendar.aspx";
const USER_AGENT =
  "Mozilla/5.0 (compatible; SterlingRanchFoodTruckHelper/1.0; +local)";
const MENU_CACHE_VERSION = "menus-v4";
const KNOWN_TRUCK_LINKS = {
  "d maracuchos": {
    official: {
      title: "D Maracuchos - Delivery Venezolan Food in Colorado",
      url: "https://d-maracuchos.com",
    },
    facebook: {
      title: "D'Maracuchos - Facebook",
      url: "https://www.facebook.com/people/D-Maracuchos-Cafe/100092150456933/",
    },
    instagram: {
      title: "D'Maracuchos - Instagram",
      url: "https://instagram.com/dmaracuchoscafe",
    },
  },
  "burning oven pizza": {
    official: {
      title: "The Burning Oven",
      url: "https://theburningoven.com/",
    },
    facebook: {
      title: "The Burning Oven Pizza Trailer - Facebook",
      url: "https://www.facebook.com/theburningoven",
    },
    instagram: {
      title: "The Burning Oven - Instagram",
      url: "https://www.instagram.com/theburningovenpizza/",
    },
  },
  "uptown humboldt": {
    official: {
      title: "Uptown & Humboldt",
      url: "https://www.uptownhumboldt.com/",
    },
    facebook: {
      title: "Uptown & Humboldt - Facebook",
      url: "https://www.facebook.com/uptownandhumboldt/",
    },
    instagram: {
      title: "Uptown & Humboldt - Instagram",
      url: "https://instagram.com/uptownandhumboldt",
    },
  },
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const calendarCache = new Map();
const menuCache = new Map();

function sendJson(res, status, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

function sendText(res, status, text, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "content-type": type });
  res.end(text);
}

function decodeHtml(input = "") {
  const named = {
    amp: "&",
    apos: "'",
    quot: '"',
    nbsp: " ",
    ndash: "-",
    mdash: "-",
    rsquo: "'",
    lsquo: "'",
    rdquo: '"',
    ldquo: '"',
  };

  return input
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(parseInt(code, 16))
    )
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] || match);
}

function stripHtml(html = "") {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "\n")
      .replace(/<style[\s\S]*?<\/style>/gi, "\n")
      .replace(/<[^>]+>/g, "\n")
  )
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

async function fetchText(url) {
  let lastError;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      if (!response.ok) {
        throw new Error(`Could not fetch ${url}: HTTP ${response.status}`);
      }

      return response.text();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

function denverToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return makeLocalDate(Number(values.year), Number(values.month), Number(values.day));
}

function makeLocalDate(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatIso(date) {
  return date.toISOString().slice(0, 10);
}

function formatFriendly(date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function parseAskedDate(question) {
  const text = String(question || "").toLowerCase();
  const today = denverToday();

  if (/\btomorrow\b/.test(text)) return addDays(today, 1);
  if (/\byesterday\b/.test(text)) return addDays(today, -1);
  if (/\btoday\b/.test(text) || text.trim().length === 0) return today;

  const iso = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return makeLocalDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slash) {
    let year = slash[3] ? Number(slash[3]) : today.getUTCFullYear();
    if (year < 100) year += 2000;
    return makeLocalDate(year, Number(slash[1]), Number(slash[2]));
  }

  const monthNames =
    "january february march april may june july august september october november december";
  const monthPattern = new RegExp(
    `\\b(${monthNames.split(" ").join("|")})\\s+(\\d{1,2})(?:,?\\s+(20\\d{2}))?\\b`
  );
  const monthMatch = text.match(monthPattern);
  if (monthMatch) {
    const month = monthNames.split(" ").indexOf(monthMatch[1]) + 1;
    const year = monthMatch[3] ? Number(monthMatch[3]) : today.getUTCFullYear();
    return makeLocalDate(year, month, Number(monthMatch[2]));
  }

  const weekdays = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  const wantedDay = weekdays.findIndex((day) => new RegExp(`\\b${day}\\b`).test(text));
  if (wantedDay !== -1) {
    const currentDay = today.getUTCDay();
    let offset = (wantedDay - currentDay + 7) % 7;
    if (offset === 0 && /\bnext\b/.test(text)) offset = 7;
    return addDays(today, offset);
  }

  return today;
}

async function getScheduleForMonth(year, month, day = 1) {
  const cacheKey = `${year}-${month}`;
  const cached = calendarCache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < 1000 * 60 * 60) return cached.data;

  const url = new URL(CALENDAR_BASE);
  url.searchParams.set("EID", STERLING_EVENT_ID);
  url.searchParams.set("month", String(month));
  url.searchParams.set("year", String(year));
  url.searchParams.set("day", String(day));
  url.searchParams.set("calType", "0");

  const html = await fetchText(url.toString());
  const text = stripHtml(html);
  const schedule = {};
  const matches = text.matchAll(/^(\d{1,2})\/(\d{1,2})\s*[-–]\s*(.+)$/gm);

  for (const match of matches) {
    const eventMonth = Number(match[1]);
    const eventDay = Number(match[2]);
    const truck = match[3].replace(/\s+/g, " ").trim();
    const date = makeLocalDate(year, eventMonth, eventDay);
    schedule[formatIso(date)] = truck;
  }

  const data = { schedule, sourceUrl: url.toString(), fetchedAt: new Date().toISOString() };
  calendarCache.set(cacheKey, { data, savedAt: Date.now() });
  return data;
}

function cleanResultUrl(rawUrl) {
  const decoded = decodeHtml(rawUrl);
  const absolute = decoded.startsWith("//") ? `https:${decoded}` : decoded;

  try {
    const parsed = new URL(absolute);
    const uddg = parsed.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : absolute;
  } catch {
    return absolute;
  }
}

function cleanText(input = "") {
  return decodeHtml(input)
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreResult(result) {
  const haystack = `${result.title} ${result.snippet} ${result.url}`.toLowerCase();
  let score = 0;
  if (haystack.includes("menu")) score += 5;
  if (haystack.includes("order")) score += 4;
  if (haystack.includes("food truck")) score += 3;
  if (haystack.includes("restaurant")) score += 1;
  if (haystack.includes("facebook") || haystack.includes("instagram")) score += 1;
  if (haystack.includes("doordash") || haystack.includes("toasttab")) score += 2;
  if (haystack.includes("yelp") || haystack.includes("tripadvisor")) score -= 2;
  return score;
}

function normalizeTruckName(truckName) {
  return truckName
    .normalize("NFKD")
    .replace(/[^\w\s&-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function knownTruckLinks(truckName) {
  const key = normalizeTruckName(truckName).toLowerCase().replace(/\s*&\s*/g, " ");
  const links = KNOWN_TRUCK_LINKS[key];
  if (!links) return {};

  return {
    official: links.official ? { ...links.official, snippet: "", rank: -10, score: 0 } : null,
    facebook: links.facebook ? { ...links.facebook, snippet: "", rank: -10, score: 0 } : null,
    instagram: links.instagram ? { ...links.instagram, snippet: "", rank: -10, score: 0 } : null,
  };
}

function getTruckNameTokens(truckName) {
  const genericWords = new Set([
    "and",
    "cafe",
    "co",
    "colorado",
    "company",
    "food",
    "grill",
    "llc",
    "pizza",
    "the",
    "truck",
  ]);

  return normalizeTruckName(truckName)
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 1 && !genericWords.has(word));
}

function resultMatchesTruck(result, truckName) {
  const haystack = normalizeTruckName(`${result.title || ""} ${result.url || ""}`).toLowerCase();
  const truckNames = String(truckName)
    .split(/\s*&\s*|\s+\+\s+/)
    .map((name) => name.trim())
    .filter(Boolean);

  return truckNames.some((name) => {
    const tokens = getTruckNameTokens(name);
    if (tokens.length === 0) return true;

    return tokens.every((token) => haystack.includes(token));
  });
}

function isDirectoryOrDeliveryLink(url = "") {
  return /(facebook|instagram|yelp|tripadvisor|mapquest|fictionbeer|doordash|ubereats|grubhub|findmeglutenfree|bestfoodtrucks|streetfoodfinder|gotruckster|menupix|sagemenu|foodtrucksin)\.com/.test(
    url.toLowerCase()
  );
}

function dedupeLinks(links) {
  const seen = new Set();
  return links.filter((link) => {
    const key = link.url.replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function searchLinks(query, limit = 5, sortByScore = true) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const html = await fetchText(url);
  const results = [];
  const resultPattern =
    /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

  let rank = 0;
  for (const match of html.matchAll(resultPattern)) {
    const result = {
      title: cleanText(match[2]),
      url: cleanResultUrl(match[1]),
      snippet: cleanText(match[3]),
      rank,
    };
    results.push({ ...result, score: scoreResult(result) });
    rank += 1;
  }

  return results
    .filter((result) => result.title && result.url)
    .sort((a, b) => (sortByScore ? b.score - a.score || a.rank - b.rank : a.rank - b.rank))
    .slice(0, limit);
}

async function safeSearchLinks(query, limit = 5, sortByScore = true) {
  try {
    return await searchLinks(query, limit, sortByScore);
  } catch (error) {
    console.warn(`Search failed for "${query}": ${error.message}`);
    return [];
  }
}

async function searchMenuLinks(truckName) {
  const searchName = normalizeTruckName(truckName);
  return (await safeSearchLinks(`${searchName} food truck Colorado menu`, 8)).filter((link) =>
    resultMatchesTruck(link, truckName)
  );
}

function findLinkByHost(links, hostPart) {
  return links.find((link) => {
    try {
      return new URL(link.url).host.toLowerCase().includes(hostPart);
    } catch {
      return false;
    }
  });
}

function isHomepage(link) {
  try {
    const pathParts = new URL(link.url).pathname.split("/").filter(Boolean);
    return pathParts.length <= 1;
  } catch {
    return false;
  }
}

function isFacebookProfile(link) {
  try {
    const parsed = new URL(link.url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const blocked = new Set([
      "events",
      "groups",
      "marketplace",
      "pages",
      "photos",
      "posts",
      "reel",
      "share",
      "story.php",
      "videos",
      "watch",
    ]);
    return (
      parsed.host.includes("facebook.com") &&
      ((parts.length === 1 && !blocked.has(parts[0])) ||
        (parts[0] === "people" && parts.length >= 2))
    );
  } catch {
    return false;
  }
}

function isInstagramProfile(link) {
  try {
    const parsed = new URL(link.url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const blocked = new Set(["explore", "p", "reel", "reels", "stories", "tv"]);
    return parsed.host.includes("instagram.com") && parts.length === 1 && !blocked.has(parts[0]);
  } catch {
    return false;
  }
}

async function getFeaturedLinks(truckName) {
  const knownLinks = knownTruckLinks(truckName);
  const searchName = normalizeTruckName(truckName);
  const [
    officialResults,
    facebookSiteResults,
    facebookGeneralResults,
    instagramSiteResults,
    instagramGeneralResults,
  ] = await Promise.all([
    safeSearchLinks(`${searchName} food truck Colorado official website`, 8, false),
    safeSearchLinks(`${searchName} food truck site:facebook.com`, 8, false),
    safeSearchLinks(`${searchName} cafe Facebook`, 8, false),
    safeSearchLinks(`${searchName} food truck site:instagram.com`, 8, false),
    safeSearchLinks(`${searchName} cafe Instagram`, 8, false),
  ]);
  const facebookResults = dedupeLinks([...facebookSiteResults, ...facebookGeneralResults]);
  const instagramResults = dedupeLinks([...instagramSiteResults, ...instagramGeneralResults]);

  const matchingOfficialResults = officialResults.filter((link) =>
    resultMatchesTruck(link, truckName)
  );
  const matchingFacebookResults = facebookResults.filter((link) =>
    resultMatchesTruck(link, truckName)
  );
  const matchingInstagramResults = instagramResults.filter((link) =>
    resultMatchesTruck(link, truckName)
  );

  const official =
    knownLinks.official ||
    matchingOfficialResults
      .filter((link) => !isDirectoryOrDeliveryLink(link.url))
      .sort((a, b) => Number(isHomepage(b)) - Number(isHomepage(a)) || a.rank - b.rank)[0] ||
    null;
  const facebook =
    knownLinks.facebook ||
    matchingFacebookResults.find(isFacebookProfile) ||
    findLinkByHost(matchingFacebookResults, "facebook.com");
  const instagram =
    knownLinks.instagram ||
    matchingInstagramResults.find(isInstagramProfile) ||
    findLinkByHost(matchingInstagramResults, "instagram.com");

  return {
    official: official || null,
    facebook: facebook || null,
    instagram: instagram || null,
    allResults: dedupeLinks([
      ...matchingOfficialResults,
      ...matchingFacebookResults,
      ...matchingInstagramResults,
    ]),
  };
}

function hostRoot(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

function domainMatchesTruck(link, truckName) {
  try {
    const host = normalizeTruckName(new URL(link.url).host.replace(/^www\./, "")).toLowerCase();
    const truckNames = String(truckName)
      .split(/\s*&\s*|\s+\+\s+/)
      .map((name) => name.trim())
      .filter(Boolean);

    return truckNames.some((name) => {
      const tokens = getTruckNameTokens(name);
      return tokens.length > 0 && tokens.every((token) => host.includes(token));
    });
  } catch {
    return false;
  }
}

function inferOfficialLink(links, truckName) {
  const candidates = links.filter(
    (link) =>
      link?.url &&
      !isDirectoryOrDeliveryLink(link.url) &&
      resultMatchesTruck(link, truckName) &&
      domainMatchesTruck(link, truckName)
  );

  const best = candidates.sort(
    (a, b) => Number(isHomepage(b)) - Number(isHomepage(a)) || (a.rank || 0) - (b.rank || 0)
  )[0];
  const root = best ? hostRoot(best.url) : null;

  if (!best || !root) return null;

  return {
    ...best,
    title: best.title || root,
    url: root,
  };
}

function absoluteUrl(url, baseUrl) {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

async function getSocialLinksFromOfficial(officialLink, truckName) {
  if (!officialLink?.url) return {};

  try {
    const html = await fetchText(officialLink.url);
    const links = [...html.matchAll(/href=["']([^"']+)["']/gi)]
      .map((match, index) => ({
        title: "",
        url: absoluteUrl(decodeHtml(match[1]), officialLink.url),
        snippet: "",
        rank: index,
        score: 0,
      }))
      .filter((link) => /facebook\.com|instagram\.com/i.test(link.url));

    const facebook = links.find(isFacebookProfile) || findLinkByHost(links, "facebook.com");
    const instagram = links.find(isInstagramProfile) || findLinkByHost(links, "instagram.com");

    if (facebook) facebook.title = `${truckName} - Facebook`;
    if (instagram) instagram.title = `${truckName} - Instagram`;

    return { facebook: facebook || null, instagram: instagram || null };
  } catch (error) {
    console.warn(`Official social link scan failed for "${truckName}": ${error.message}`);
    return {};
  }
}

function moneyFromWooPrice(prices) {
  if (!prices || !prices.price) return "";
  const amount = Number(prices.price) / 10 ** Number(prices.currency_minor_unit || 2);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: prices.currency_code || "USD",
  }).format(amount);
}

async function tryWooCommerceMenu(siteUrl) {
  const root = hostRoot(siteUrl);
  if (!root) return [];

  const productsUrl = `${root}/wp-json/wc/store/products?per_page=20`;
  const response = await fetch(productsUrl, {
    headers: { "user-agent": USER_AGENT, accept: "application/json" },
  });

  if (!response.ok) return [];

  const products = await response.json();
  if (!Array.isArray(products)) return [];

  return products.slice(0, 10).map((product) => ({
    name: cleanText(product.name || ""),
    description: cleanText(product.short_description || product.description || ""),
    price: moneyFromWooPrice(product.prices),
    url: product.permalink || siteUrl,
  }));
}

function isPlainPriceLine(line = "") {
  const match = line.match(/^\$?(\d{1,3})(?:\.(\d{2}))?$/);
  if (!match) return false;

  const amount = Number(match[1]);
  return amount > 0 && amount < 100;
}

function formatPlainPrice(line = "") {
  const amount = Number(line.replace("$", ""));
  if (!Number.isFinite(amount)) return "";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function isMenuStopLine(line = "") {
  return /^(contact us|contact|about us|our story|savor the flavors|copyright|powered by|this website uses cookies)$/i.test(
    line.trim()
  );
}

function isMenuCategoryLine(line = "") {
  const trimmed = line.trim();
  if (/^(menu|appetizers?|desserts?|salads?|sides?|drinks?|beverages?)$/i.test(trimmed)) {
    return true;
  }

  if (/^(burgers?|gyros?|mini hoagies)$/i.test(trimmed)) return true;
  if (/^\d+["']?\s+(pizzas?|tacos?|burgers?|sandwiches?)$/i.test(trimmed)) return true;
  return trimmed.length > 3 && trimmed === trimmed.toUpperCase() && /S$/.test(trimmed);
}

function isLikelyMenuItemName(line = "") {
  const trimmed = line.trim();
  if (trimmed.length < 2 || trimmed.length > 80) return false;
  if (isMenuStopLine(trimmed) || isMenuCategoryLine(trimmed)) return false;
  if (/https?:|@|^\$?\d+(?:\.\d{2})?$|copyright|reserved|cookie/i.test(trimmed)) return false;

  return true;
}

function menuTextWindow(text) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const menuIndex = lines.findIndex((line) => /\bmenu\b/i.test(line));
  const start = menuIndex === -1 ? 0 : menuIndex + 1;
  const end = lines.findIndex((line, index) => index > start && isMenuStopLine(line));

  return lines.slice(start, end === -1 ? Math.min(lines.length, start + 180) : end);
}

function normalizeMenuPriceLines(lines) {
  const normalized = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === "$" && /^\d{1,3}(?:\.\d{2})?$/.test(lines[index + 1] || "")) {
      normalized.push(`$${lines[index + 1]}`);
      index += 1;
    } else {
      normalized.push(line);
    }
  }

  return normalized;
}

function collectMenuDescription(lines, startIndex, options = {}) {
  const descriptionParts = [];

  for (let next = startIndex; next < lines.length; next += 1) {
    const line = lines[next];
    const followingLine = lines[next + 1] || "";

    if (isMenuStopLine(line) || isPlainPriceLine(line) || isMenuCategoryLine(line)) break;
    if (
      !options.allowDescriptionBeforePrice &&
      isLikelyMenuItemName(line) &&
      isPlainPriceLine(followingLine)
    ) {
      break;
    }
    if (isPlainPriceLine(line) && isLikelyMenuItemName(followingLine)) break;

    descriptionParts.push(line);
    if (descriptionParts.length >= 2) break;
  }

  return cleanText(descriptionParts.join(" "));
}

function parsePlainTextMenuItems(text, siteUrl) {
  const lines = normalizeMenuPriceLines(menuTextWindow(text));
  const items = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!isPlainPriceLine(lines[index])) continue;

    const previousLine = lines[index - 1] || "";
    const nextLine = lines[index + 1] || "";

    if (
      isLikelyMenuItemName(previousLine) &&
      !isPlainPriceLine(lines[index - 2] || "") &&
      !(isLikelyMenuItemName(lines[index - 2] || "") && isPlainPriceLine(lines[index - 3] || "")) &&
      !/^\+?\$?\d+/i.test(previousLine)
    ) {
      items.push({
        name: cleanMenuItemName(previousLine),
        description: collectMenuDescription(lines, index + 1),
        price: formatPlainPrice(lines[index]),
        url: siteUrl,
      });
      continue;
    }

    if (isLikelyMenuItemName(nextLine)) {
      items.push({
        name: cleanMenuItemName(nextLine),
        description: collectMenuDescription(lines, index + 2, {
          allowDescriptionBeforePrice: true,
        }),
        price: formatPlainPrice(lines[index]),
        url: siteUrl,
      });
    }
  }

  return dedupeMenuItems(items).slice(0, 10);
}

async function getMenuPageUrls(siteUrl) {
  const root = hostRoot(siteUrl);
  if (!root) return [siteUrl];

  const urls = [siteUrl, `${root}/menu`, `${root}/food-truck-menu`];

  try {
    const html = await fetchText(siteUrl);
    const menuLinks = [...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
      .map((match) => ({
        url: absoluteUrl(decodeHtml(match[1]), siteUrl),
        text: cleanText(match[2]),
      }))
      .filter((link) => /\bmenu\b/i.test(`${link.url} ${link.text}`))
      .map((link) => link.url);

    urls.push(...menuLinks);
  } catch {
    // Common menu URLs above are still worth trying.
  }

  return dedupeLinks(urls.map((url) => ({ url }))).map((link) => link.url).slice(0, 5);
}

async function tryPlainTextMenu(siteUrl) {
  const menuUrls = await getMenuPageUrls(siteUrl);
  let bestItems = [];

  for (const menuUrl of menuUrls) {
    try {
      const html = await fetchText(menuUrl);
      const items = parsePlainTextMenuItems(stripHtml(html), menuUrl);
      if (items.length > bestItems.length) bestItems = items;
      if (bestItems.length >= 10) break;
    } catch {
      // Try the next likely menu URL.
    }
  }

  return bestItems.slice(0, 10);
}

function cleanMenuItemName(line = "") {
  return cleanText(line).replace(/^\*+/, "").trim();
}

function dedupeMenuItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.name}|${item.price}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return item.name;
  });
}

async function getMenuForTruck(truckName) {
  const cacheKey = `${MENU_CACHE_VERSION}:${truckName.toLowerCase()}`;
  const cached = menuCache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < 1000 * 60 * 30) return cached.data;

  const featuredLinks = await getFeaturedLinks(truckName);
  const menuLinks = await searchMenuLinks(truckName);
  const official = featuredLinks.official || inferOfficialLink([...menuLinks, ...featuredLinks.allResults], truckName);
  const socialFromOfficial = official ? await getSocialLinksFromOfficial(official, truckName) : {};
  const enhancedFeaturedLinks = {
    official,
    facebook: featuredLinks.facebook || socialFromOfficial.facebook || null,
    instagram: featuredLinks.instagram || socialFromOfficial.instagram || null,
  };
  const links = dedupeLinks([
    ...(enhancedFeaturedLinks.official ? [enhancedFeaturedLinks.official] : []),
    ...(enhancedFeaturedLinks.facebook ? [enhancedFeaturedLinks.facebook] : []),
    ...(enhancedFeaturedLinks.instagram ? [enhancedFeaturedLinks.instagram] : []),
    ...menuLinks,
    ...featuredLinks.allResults,
  ]).slice(0, 8);
  const menuItems = [];
  if (enhancedFeaturedLinks.official) {
    try {
      menuItems.push(...(await tryWooCommerceMenu(enhancedFeaturedLinks.official.url)));
    } catch {
      // Some sites block product APIs. The links are still useful.
    }

    if (menuItems.length === 0) {
      try {
        menuItems.push(...(await tryPlainTextMenu(enhancedFeaturedLinks.official.url)));
      } catch {
        // Many small business sites are hand-built. If parsing fails, keep the links.
      }
    }
  }

  const data = {
    featuredLinks: {
      official: enhancedFeaturedLinks.official,
      facebook: enhancedFeaturedLinks.facebook,
      instagram: enhancedFeaturedLinks.instagram,
    },
    links,
    items: menuItems.slice(0, 10),
  };
  menuCache.set(cacheKey, { data, savedAt: Date.now() });
  return data;
}

function buildAnswer({ question, targetDate, truck, calendar, menu }) {
  const friendlyDate = formatFriendly(targetDate);
  if (!truck) {
    return {
      text: `I could not find a listed food truck for ${friendlyDate}. The calendar might not have that date posted yet.`,
      date: formatIso(targetDate),
      friendlyDate,
      truck: null,
      sourceUrl: calendar.sourceUrl,
      checkedAt: new Date().toISOString(),
      menu,
    };
  }

  const itemText = menu.items.length
    ? ` I found menu items like ${menu.items
        .slice(0, 3)
        .map((item) => item.name)
        .join(", ")}.`
    : " I found the truck, but could not read menu items automatically this time. The links below are the best places to check.";

  return {
    text: `For ${friendlyDate}, the listed food truck is ${truck}.${itemText}`,
    date: formatIso(targetDate),
    friendlyDate,
    truck,
    sourceUrl: calendar.sourceUrl,
    checkedAt: new Date().toISOString(),
    menu,
    question,
  };
}

async function handleAsk(req, res, url) {
  const question = url.searchParams.get("q") || "";
  const targetDate = parseAskedDate(question);
  const year = targetDate.getUTCFullYear();
  const month = targetDate.getUTCMonth() + 1;
  const day = targetDate.getUTCDate();
  const calendar = await getScheduleForMonth(year, month, day);
  const truck = calendar.schedule[formatIso(targetDate)] || "";
  const menu = truck ? await getMenuForTruck(truck) : { links: [], items: [] };
  sendJson(res, 200, buildAnswer({ question, targetDate, truck, calendar, menu }));
}

async function handleSchedule(req, res, url) {
  const today = denverToday();
  const year = Number(url.searchParams.get("year")) || today.getUTCFullYear();
  const month = Number(url.searchParams.get("month")) || today.getUTCMonth() + 1;
  const calendar = await getScheduleForMonth(year, month);
  sendJson(res, 200, calendar);
}

function serveStatic(req, res, url) {
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendText(res, 404, "Not found");
      return;
    }

    const type = mimeTypes[path.extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "content-type": type });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/api/ask") {
      await handleAsk(req, res, url);
      return;
    }

    if (url.pathname === "/api/schedule") {
      await handleSchedule(req, res, url);
      return;
    }

    serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, {
      error: "Something went wrong while checking the truck/menu.",
      detail: error.message,
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Food truck chat is running on ${HOST}:${PORT}`);
});

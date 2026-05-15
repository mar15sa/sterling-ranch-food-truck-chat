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
  const haystack = normalizeTruckName(
    `${result.title || ""} ${result.snippet || ""} ${result.url || ""}`
  ).toLowerCase();
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

async function searchMenuLinks(truckName) {
  const searchName = normalizeTruckName(truckName);
  return (await searchLinks(`${searchName} food truck Colorado menu`, 8)).filter((link) =>
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
    return parsed.host.includes("facebook.com") && parts.length === 1 && !blocked.has(parts[0]);
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
  const searchName = normalizeTruckName(truckName);
  const [
    officialResults,
    facebookSiteResults,
    facebookGeneralResults,
    instagramSiteResults,
    instagramGeneralResults,
  ] = await Promise.all([
    searchLinks(`${searchName} food truck Colorado official website`, 8, false),
    searchLinks(`${searchName} food truck site:facebook.com`, 8, false),
    searchLinks(`${searchName} cafe Facebook`, 8, false),
    searchLinks(`${searchName} food truck site:instagram.com`, 8, false),
    searchLinks(`${searchName} cafe Instagram`, 8, false),
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
    matchingOfficialResults
      .filter((link) => !isDirectoryOrDeliveryLink(link.url))
      .sort((a, b) => Number(isHomepage(b)) - Number(isHomepage(a)) || a.rank - b.rank)[0] ||
    null;
  const facebook =
    matchingFacebookResults.find(isFacebookProfile) ||
    findLinkByHost(matchingFacebookResults, "facebook.com");
  const instagram =
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

async function getMenuForTruck(truckName) {
  const cacheKey = truckName.toLowerCase();
  const cached = menuCache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < 1000 * 60 * 30) return cached.data;

  const featuredLinks = await getFeaturedLinks(truckName);
  const links = dedupeLinks([
    ...(featuredLinks.official ? [featuredLinks.official] : []),
    ...(featuredLinks.facebook ? [featuredLinks.facebook] : []),
    ...(featuredLinks.instagram ? [featuredLinks.instagram] : []),
    ...(await searchMenuLinks(truckName)),
    ...featuredLinks.allResults,
  ]).slice(0, 8);
  const menuItems = [];
  const bestOfficialish =
    featuredLinks.official || links.find((link) => !isDirectoryOrDeliveryLink(link.url));

  if (bestOfficialish) {
    try {
      menuItems.push(...(await tryWooCommerceMenu(bestOfficialish.url)));
    } catch {
      // Some sites block product APIs. The links are still useful.
    }
  }

  const data = {
    featuredLinks: {
      official: featuredLinks.official,
      facebook: featuredLinks.facebook,
      instagram: featuredLinks.instagram,
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
      menu,
    };
  }

  const itemText = menu.items.length
    ? ` I found menu items like ${menu.items
        .slice(0, 3)
        .map((item) => item.name)
        .join(", ")}.`
    : " I found likely menu links, but could not safely read menu items from the page.";

  return {
    text: `For ${friendlyDate}, the listed food truck is ${truck}.${itemText}`,
    date: formatIso(targetDate),
    friendlyDate,
    truck,
    sourceUrl: calendar.sourceUrl,
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

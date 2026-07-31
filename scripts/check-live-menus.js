const { assertMenuQualityFixtures, describeMenuQuality, isJunkMenuItem } = require("../lib/menu-quality");

const SITE_URL =
  process.env.SITE_URL || "https://sterling-ranch-food-truck-chat-production.up.railway.app";
const DAYS_TO_CHECK = Number(process.env.DAYS_TO_CHECK || 8);
const TRUCK_NAME_SANITY_DAYS = Number(process.env.TRUCK_NAME_SANITY_DAYS || 45);
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 15000);
const FETCH_RETRIES = Number(process.env.FETCH_RETRIES || 5);
const LINK_FETCH_RETRIES = Number(process.env.LINK_FETCH_RETRIES || 2);
const SITE_READY_ATTEMPTS = Number(process.env.SITE_READY_ATTEMPTS || 6);
const SITE_READY_DELAY_MS = Number(process.env.SITE_READY_DELAY_MS || 10000);
const FAIL_ON_UNREACHABLE_SITE = process.env.FAIL_ON_UNREACHABLE_SITE === "true";
function makeLocalDate(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
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

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatIso(date) {
  return date.toISOString().slice(0, 10);
}

function normalizeTruckName(truckName = "") {
  return String(truckName)
    .normalize("NFKD")
    .replace(/[^\w\s&-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isImplausibleTruckName(truckName = "") {
  const normalized = normalizeTruckName(truckName).toLowerCase();
  if (!normalized || /^\d+$/.test(normalized)) return true;
  if (/^(st|nd|rd|th)$/.test(normalized)) return true;
  return !/[a-z]/i.test(normalized);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function describeFetchError(error) {
  if (error?.name === "AbortError" || error?.name === "TimeoutError") {
    return `timed out after ${FETCH_TIMEOUT_MS}ms`;
  }

  const cause = error?.cause;
  const causeDetails = [cause?.code, cause?.message].filter(Boolean).join(": ");
  return causeDetails || error?.message || String(error);
}

async function fetchWithRetry(path, options = {}) {
  const url = new URL(path, SITE_URL);
  let lastError;

  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
      });
    } catch (error) {
      lastError = error;
      if (attempt < FETCH_RETRIES) {
        await sleep(500 * (attempt + 1));
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`${url.toString()} could not be reached: ${describeFetchError(lastError)}`);
}

async function fetchUrlWithRetry(url, options = {}, retries = FETCH_RETRIES) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
      });
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(500 * (attempt + 1));
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`${url} could not be reached: ${describeFetchError(lastError)}`);
}

function isLikelyErrorPage(text = "") {
  const sample = text.slice(0, 200000).toLowerCase();
  return /\b(404|page not found|not found|nothing found|error page|server error|site is unavailable|domain has expired)\b/.test(
    sample
  );
}

function shouldVerifyListedLink(link) {
  return Boolean(link?.url && /^https?:\/\//i.test(link.url));
}

async function verifyListedLink(link) {
  const response = await fetchUrlWithRetry(
    link.url,
    {
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "user-agent": "SterlingRanchFoodTruckHealthCheck/1.0",
      },
      redirect: "follow",
    },
    LINK_FETCH_RETRIES
  );

  if (!response.ok) {
    return `${link.title || link.url} returned HTTP ${response.status}`;
  }

  const contentType = response.headers.get("content-type") || "";
  if (/text\/html|text\/plain|application\/xhtml\+xml/i.test(contentType)) {
    const text = await response.text();
    if (isLikelyErrorPage(text)) {
      return `${link.title || link.url} appears to be an error page`;
    }
  }

  return "";
}

async function verifyListedLinks(links) {
  const uniqueLinks = [];
  const seen = new Set();

  for (const link of links) {
    if (!shouldVerifyListedLink(link) || seen.has(link.url)) continue;
    seen.add(link.url);
    uniqueLinks.push(link);
  }

  const issues = [];
  for (const link of uniqueLinks) {
    try {
      const issue = await verifyListedLink(link);
      if (issue) issues.push(issue);
    } catch (error) {
      issues.push(`${link.title || link.url} could not be verified: ${error.message}`);
    }
  }

  return issues;
}

async function fetchJson(path) {
  const response = await fetchWithRetry(path, {
    headers: {
      accept: "application/json",
      "user-agent": "SterlingRanchFoodTruckHealthCheck/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function assertLiveSiteReachable() {
  let lastError;

  for (let attempt = 1; attempt <= SITE_READY_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchWithRetry("/", {
        headers: {
          accept: "text/html",
          "user-agent": "SterlingRanchFoodTruckHealthCheck/1.0",
        },
      });

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      return true;
    } catch (error) {
      lastError = error;

      if (attempt < SITE_READY_ATTEMPTS) {
        console.warn(
          `Live site reachability check failed on attempt ${attempt}/${SITE_READY_ATTEMPTS}; retrying in ${Math.round(
            SITE_READY_DELAY_MS / 1000
          )}s. ${error.message}`
        );
        await sleep(SITE_READY_DELAY_MS);
      }
    }
  }

  const message = `Live site stayed unreachable after ${SITE_READY_ATTEMPTS} reachability attempts: ${SITE_URL}. Last error: ${
      lastError?.message || "unknown error"
    }`;

  if (FAIL_ON_UNREACHABLE_SITE) {
    throw new Error(message);
  }

  console.warn(`${message}`);
  console.warn(
    "Food truck lookup health check inconclusive: this runner could not open the live site, so no date/truck data was checked."
  );
  return false;
}

async function main() {
  assertMenuQualityFixtures();

  if (process.argv.includes("--fixtures-only")) {
    console.log("Menu quality fixtures passed.");
    return;
  }

  const siteReachable = await assertLiveSiteReachable();
  if (!siteReachable) return;

  const today = denverToday();
  const failures = [];

  const scheduleByMonth = new Map();
  for (let index = 0; index < TRUCK_NAME_SANITY_DAYS; index += 1) {
    const targetDate = addDays(today, index);
    const date = formatIso(targetDate);
    const year = targetDate.getUTCFullYear();
    const month = targetDate.getUTCMonth() + 1;
    const monthKey = `${year}-${month}`;

    if (!scheduleByMonth.has(monthKey)) {
      scheduleByMonth.set(monthKey, await fetchJson(`/api/schedule?year=${year}&month=${month}`));
    }

    const truck = scheduleByMonth.get(monthKey).schedule?.[date];
    if (truck && isImplausibleTruckName(truck)) {
      failures.push({
        date,
        truck,
        hasFeaturedLink: false,
        itemCount: 0,
        truckNameIssue: "implausible truck name",
      });
    }
  }

  for (let index = 0; index < DAYS_TO_CHECK; index += 1) {
    const date = formatIso(addDays(today, index));
    const data = await fetchJson(`/api/ask?date=${date}&q=health-check`);

    if (!data.truck) continue;

    if (isImplausibleTruckName(data.truck)) {
      failures.push({
        date,
        truck: data.truck,
        hasFeaturedLink: false,
        itemCount: data.menu?.items?.length || 0,
        truckNameIssue: "implausible truck name",
      });
      continue;
    }

    const featured = data.menu?.featuredLinks || {};
    const hasFeaturedLink = Boolean(featured.official || featured.facebook || featured.instagram);
    const items = data.menu?.items || [];
    const hasMenuItems = Boolean(items.length);
    const junkItems = items.filter(isJunkMenuItem);
    const menuQualityIssue = hasMenuItems ? describeMenuQuality(items) : "";
    const linkValidationIssues = await verifyListedLinks([featured.official]);

    if (
      !hasFeaturedLink ||
      !hasMenuItems ||
      junkItems.length ||
      menuQualityIssue ||
      linkValidationIssues.length
    ) {
      failures.push({
        date,
        truck: data.truck,
        hasFeaturedLink,
        itemCount: items.length,
        junkItems: junkItems.map((item) => item.name).join(", "),
        menuQualityIssue,
        linkValidationIssue: linkValidationIssues.join("; "),
      });
    }
  }

  if (failures.length) {
    console.error("Food truck lookup health check failed:");
    failures.forEach((failure) => {
      console.error(
        `- ${failure.date} ${failure.truck}: featured link=${failure.hasFeaturedLink}, menu items=${failure.itemCount}${
          failure.truckNameIssue ? `, truck name=${failure.truckNameIssue}` : ""
        }${
          failure.junkItems ? `, junk items=${failure.junkItems}` : ""
        }${
          failure.menuQualityIssue ? `, menu quality=${failure.menuQualityIssue}` : ""
        }${
          failure.linkValidationIssue ? `, link validation=${failure.linkValidationIssue}` : ""
        }`
      );
    });
    process.exitCode = 1;
    return;
  }

  console.log(`Food truck lookup health check passed for ${DAYS_TO_CHECK} days.`);
}

main().catch((error) => {
  console.error(`Food truck lookup health check errored: ${error.message}`);
  process.exitCode = 1;
});

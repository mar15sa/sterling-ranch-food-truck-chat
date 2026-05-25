const SITE_URL =
  process.env.SITE_URL || "https://sterling-ranch-food-truck-chat-production.up.railway.app";
const DAYS_TO_CHECK = Number(process.env.DAYS_TO_CHECK || 8);
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 15000);
const FETCH_RETRIES = Number(process.env.FETCH_RETRIES || 5);
const SITE_READY_ATTEMPTS = Number(process.env.SITE_READY_ATTEMPTS || 6);
const SITE_READY_DELAY_MS = Number(process.env.SITE_READY_DELAY_MS || 10000);

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

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function describeFetchError(error) {
  if (error?.name === "AbortError" || error?.name === "TimeoutError") {
    return `timed out after ${FETCH_TIMEOUT_MS}ms`;
  }

  return error?.message || String(error);
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

      return;
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

  throw new Error(
    `Live site stayed unreachable after ${SITE_READY_ATTEMPTS} reachability attempts: ${SITE_URL}. Last error: ${
      lastError?.message || "unknown error"
    }`
  );
}

async function main() {
  await assertLiveSiteReachable();

  const today = denverToday();
  const failures = [];

  for (let index = 0; index < DAYS_TO_CHECK; index += 1) {
    const date = formatIso(addDays(today, index));
    const data = await fetchJson(`/api/ask?date=${date}&q=health-check`);

    if (!data.truck) continue;

    const featured = data.menu?.featuredLinks || {};
    const hasFeaturedLink = Boolean(featured.official || featured.facebook || featured.instagram);
    const hasMenuItems = Boolean(data.menu?.items?.length);

    if (!hasFeaturedLink || !hasMenuItems) {
      failures.push({
        date,
        truck: data.truck,
        hasFeaturedLink,
        itemCount: data.menu?.items?.length || 0,
      });
    }
  }

  if (failures.length) {
    console.error("Food truck lookup health check failed:");
    failures.forEach((failure) => {
      console.error(
        `- ${failure.date} ${failure.truck}: featured link=${failure.hasFeaturedLink}, menu items=${failure.itemCount}`
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

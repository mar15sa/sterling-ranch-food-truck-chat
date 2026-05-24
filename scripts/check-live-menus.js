const SITE_URL = process.env.SITE_URL || "https://sterlingranchsociety.com";
const DAYS_TO_CHECK = Number(process.env.DAYS_TO_CHECK || 8);

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

async function fetchJson(path) {
  const response = await fetch(new URL(path, SITE_URL), {
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

async function main() {
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

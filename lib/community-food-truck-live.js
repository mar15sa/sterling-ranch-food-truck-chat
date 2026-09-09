const { createConnectorAdapters } = require("./community-connector-adapter");

function configuredFoodTruckCalendar(profile) {
  const adapter = createConnectorAdapters(profile).find((item) => item.family === "food-truck-schedule");
  const sourceUrl = adapter?.endpoints.find((endpoint) => endpoint.id === "schedule")?.url;
  if (!adapter || !sourceUrl) throw new Error("No official food-truck calendar is configured for this community.");
  return { adapter, sourceUrl };
}

function calendarTruckForDate(text = "", isoDate = "") {
  const target = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(target.getTime())) return "";
  for (const match of String(text).matchAll(/^(\d{1,2})\/(\d{1,2})\s*[-–]\s*(.+)$/gm)) {
    if (Number(match[1]) === target.getUTCMonth() + 1 && Number(match[2]) === target.getUTCDate()) return match[3].replace(/\s+/g, " ").trim();
  }
  return "";
}

function friendlyDate(isoDate) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" })
    .format(new Date(`${isoDate}T12:00:00Z`));
}

async function getCommunityFoodTruckSchedule(request = {}, { profile, fetchImpl = global.fetch, stripHtml = (value) => value } = {}) {
  if (typeof fetchImpl !== "function") throw new Error("Fetch is unavailable.");
  const { sourceUrl } = configuredFoodTruckCalendar(profile);
  const date = request?.dateRange?.start;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) throw new Error("A requested food-truck date is required.");
  const url = new URL(sourceUrl);
  url.searchParams.set("year", date.slice(0, 4));
  url.searchParams.set("month", String(Number(date.slice(5, 7))));
  url.searchParams.set("day", String(Number(date.slice(8, 10))));
  const response = await fetchImpl(url, { headers: { accept: "text/html" } });
  if (!response.ok) throw new Error(`Official food-truck calendar returned ${response.status}.`);
  const truck = calendarTruckForDate(stripHtml(await response.text()), date);
  return {
    date,
    friendlyDate: friendlyDate(date),
    trucks: truck ? [{ name: truck, location: "", menu: { links: [], items: [] } }] : [],
    sourceUrl,
    checkedAt: new Date().toISOString(),
    menuEnrichment: { status: "degraded", failures: [{ component: "menu-not-configured" }] },
  };
}

module.exports = { calendarTruckForDate, getCommunityFoodTruckSchedule };

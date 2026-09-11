const { createConnectorAdapters } = require("./community-connector-adapter");

function configuredFoodTruckCalendar(profile) {
  const adapter = createConnectorAdapters(profile).find((item) => item.family === "food-truck-schedule");
  const sourceUrl = adapter?.endpoints.find((endpoint) => endpoint.id === "schedule")?.url;
  if (!adapter || !sourceUrl) throw new Error("No official food-truck calendar is configured for this community.");
  const connector = (profile?.connectors || []).find((item) => item.id === adapter.connectorId);
  const datePolicy = connector?.adapter?.foodTruck?.calendarDatePolicy;
  if (!datePolicy || typeof datePolicy !== "object" || Array.isArray(datePolicy)
    || datePolicy.kind !== "rolling"
    || !Number.isInteger(datePolicy.pastDays) || datePolicy.pastDays < 0
    || !Number.isInteger(datePolicy.futureDays) || datePolicy.futureDays < 0
    || datePolicy.pastDays + datePolicy.futureDays < 1) {
    throw new Error("Food-truck calendar requires a bounded rolling date policy.");
  }
  return { adapter, sourceUrl, datePolicy };
}

function validIsoDate(isoDate = "") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return false;
  return new Date(`${isoDate}T12:00:00Z`).toISOString().slice(0, 10) === isoDate;
}

function isoDateInTimezone(now, timeZone = "UTC") {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = (type) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function dateWithinPolicy(isoDate, policy, now, timeZone) {
  if (!validIsoDate(isoDate)) return false;
  const today = isoDateInTimezone(now, timeZone);
  const offset = Math.round((Date.parse(`${isoDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  return offset >= -policy.pastDays && offset <= policy.futureDays;
}

function normalizedCalendarText(value = "") {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/td\s*>/gi, " - ")
    .replace(/<\/p\s*>/gi, "\n")
    .replace(/<\/li\s*>/gi, "\n")
    .replace(/<\/tr\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[\t\r ]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function calendarDateMatches(match, target) {
  const month = Number(match[1]);
  const day = Number(match[2]);
  const explicitYear = match[3] ? Number(match[3].length === 2 ? `20${match[3]}` : match[3]) : null;
  if (month !== Number(target.slice(5, 7)) || day !== Number(target.slice(8, 10))) return false;
  return !explicitYear || explicitYear === Number(target.slice(0, 4));
}

function calendarTruckForDate(text = "", isoDate = "") {
  if (!validIsoDate(isoDate)) return { recognized: false, truck: "" };
  let recognized = false;
  const datePrefix = /^(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\s*[-–—:]\s*(.+)$/gm;
  for (const match of normalizedCalendarText(text).matchAll(datePrefix)) {
    const sameMonthAndDay = Number(match[1]) === Number(isoDate.slice(5, 7)) && Number(match[2]) === Number(isoDate.slice(8, 10));
    const explicitOtherYear = match[3] && !calendarDateMatches(match, isoDate);
    if (sameMonthAndDay && explicitOtherYear) continue;
    recognized = true;
    if (calendarDateMatches(match, isoDate)) return { recognized, truck: match[4].replace(/\s+/g, " ").replace(/\s*[-–—:]\s*$/, "").trim() };
  }
  return { recognized, truck: "" };
}

function friendlyDate(isoDate) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" })
    .format(new Date(`${isoDate}T12:00:00Z`));
}

async function getCommunityFoodTruckSchedule(request = {}, { profile, fetchImpl = global.fetch, now = new Date() } = {}) {
  if (typeof fetchImpl !== "function") throw new Error("Fetch is unavailable.");
  const { sourceUrl, datePolicy } = configuredFoodTruckCalendar(profile);
  const date = request?.dateRange?.start;
  if (!validIsoDate(date || "")) throw new Error("A valid requested food-truck date is required.");
  if (!dateWithinPolicy(date, datePolicy, now, profile?.timezone || "UTC")) throw new Error("The configured food-truck calendar does not cover that date.");
  const url = new URL(sourceUrl);
  url.searchParams.set("year", date.slice(0, 4));
  url.searchParams.set("month", String(Number(date.slice(5, 7))));
  url.searchParams.set("day", String(Number(date.slice(8, 10))));
  const response = await fetchImpl(url, { headers: { accept: "text/html" } });
  if (!response.ok) throw new Error(`Official food-truck calendar returned ${response.status}.`);
  const parsed = calendarTruckForDate(await response.text(), date);
  if (!parsed.recognized) throw new Error("Official food-truck calendar could not be parsed reliably.");
  return {
    date,
    friendlyDate: friendlyDate(date),
    trucks: parsed.truck ? [{ name: parsed.truck, location: "", menu: { links: [], items: [] } }] : [],
    sourceUrl,
    checkedAt: new Date().toISOString(),
    menuEnrichment: { status: "degraded", failures: [{ component: "menu-not-configured" }] },
  };
}

module.exports = { calendarTruckForDate, configuredFoodTruckCalendar, dateWithinPolicy, getCommunityFoodTruckSchedule, validIsoDate };

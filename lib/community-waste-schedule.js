const WASTE_CONNECTIONS_SCHEDULE_URL = "https://www.wasteconnections.com/pickup-schedule-wasteconnect-calendar?areaName=WC-5311#";
const RECOLLECT_API_ORIGIN = "https://api.recollect.net";
const RECOLLECT_AREA = "WC-5311";
const RECOLLECT_SERVICE_ID = 975;

// The Overlook is an official Sterling Ranch facility, so its publicly listed
// address gives us a privacy-safe Monday calendar anchor without collecting a
// resident's home address. The CAB's official page supplies the village days.
const PUBLIC_REFERENCE_ADDRESS = "7853 Piney River Avenue";
const VILLAGE_DAY_OFFSETS = [
  { village: "Providence Village", offset: 0 },
  { village: "Ascent Village", offset: 1 },
  { village: "Prospect Village", offset: 3 },
];
const DEFAULT_TIMEOUT_MS = Number(process.env.WASTE_SCHEDULE_TIMEOUT_MS || 4500);
const PLACE_ID_CACHE_MS = 6 * 60 * 60 * 1000;
let cachedPublicPlace = null;

function isoDateInDenver(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDays(isoDate, days) {
  const value = new Date(`${isoDate}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function formatDate(isoDate) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T12:00:00Z`));
}

function mondayOfWeek(isoDate) {
  const value = new Date(`${isoDate}T12:00:00Z`);
  const day = value.getUTCDay();
  return addDays(isoDate, -(day === 0 ? 6 : day - 1));
}

function scheduleTimingLabel(anchorDate, today) {
  const daysAway = Math.round((new Date(`${anchorDate}T12:00:00Z`) - new Date(`${today}T12:00:00Z`)) / (24 * 60 * 60 * 1000));
  if (daysAway === 0) return "today";
  if (daysAway === 1) return "starting tomorrow";
  const anchorWeek = mondayOfWeek(anchorDate);
  const thisWeek = mondayOfWeek(today);
  if (anchorWeek === thisWeek) return "this week";
  if (anchorWeek === addDays(thisWeek, 7)) return "next week";
  return `the week of ${formatDate(anchorWeek).replace(/^[^,]+,\s*/, "")}`;
}

async function fetchJson(url, fetchImpl, signal) {
  const response = await fetchImpl(url, {
    headers: { accept: "application/json", "user-agent": "SterlingRanchCommunityAssistant/1.0" },
    signal,
  });
  if (!response.ok) throw new Error(`Waste schedule source returned ${response.status}`);
  return await response.json();
}

function eventNames(event = {}) {
  return (event.flags || []).map((flag) => String(flag.name || "").toLowerCase());
}

function holidayMessage(events = [], collectionDate = "") {
  const collection = new Date(`${collectionDate}T12:00:00Z`);
  const nearby = events.find((event) => {
    if (!event.is_holiday && event.type !== "holiday") return false;
    const holiday = new Date(`${event.day}T12:00:00Z`);
    return Math.abs(collection - holiday) <= 6 * 24 * 60 * 60 * 1000;
  });
  if (!nearby) return "";
  const flag = nearby.flags?.[0] || {};
  const subject = flag.subject_hash?.["en-US"] || nearby.title || "Holiday schedule";
  const message = flag.short_text_message_hash?.["en-US"] || flag.voice_message_hash?.["en-US"] || "Collection may be delayed.";
  return `${subject}: ${message}`;
}

function villageDatesForAnchor(anchorDate, events = []) {
  const standardMonday = mondayOfWeek(anchorDate);
  const anchorShift = Math.max(0, Math.round((new Date(`${anchorDate}T12:00:00Z`) - new Date(`${standardMonday}T12:00:00Z`)) / (24 * 60 * 60 * 1000)));
  const holidays = events.filter((event) =>
    (event.is_holiday || event.type === "holiday") && mondayOfWeek(event.day) === standardMonday
  );
  return VILLAGE_DAY_OFFSETS.map(({ village, offset }) => {
    let date = addDays(standardMonday, offset + anchorShift);
    // When Monday itself was delayed, the live reference event already carries
    // the one-day shift for the whole week. For a later-week holiday (notably
    // Thanksgiving), shift only villages whose normal day is on/after it.
    if (anchorShift === 0 && holidays.some((holiday) => holiday.day <= date)) date = addDays(date, 1);
    return { village, date };
  });
}

async function getSterlingRanchWasteSchedule(options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== "function") throw new Error("Fetch is unavailable");
  const timeoutMs = Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS;
  const today = isoDateInDenver(options.now || new Date());
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const cacheEnabled = options.cache !== false && !options.fetchImpl;
    let placeId = cacheEnabled && cachedPublicPlace?.expiresAt > Date.now() ? cachedPublicPlace.placeId : "";
    if (!placeId) {
      const suggestUrl = new URL(`${RECOLLECT_API_ORIGIN}/api/areas/${RECOLLECT_AREA}/services/${RECOLLECT_SERVICE_ID}/address-suggest`);
      suggestUrl.searchParams.set("q", PUBLIC_REFERENCE_ADDRESS);
      suggestUrl.searchParams.set("locale", "en");
      const candidates = await fetchJson(suggestUrl, fetchImpl, controller.signal);
      placeId = candidates?.[0]?.place_id;
      if (!placeId || !/^[A-F0-9-]{20,}$/i.test(placeId)) throw new Error("Official calendar could not resolve the community reference location");
      if (cacheEnabled) cachedPublicPlace = { placeId, expiresAt: Date.now() + PLACE_ID_CACHE_MS };
    }

    const eventsUrl = new URL(`${RECOLLECT_API_ORIGIN}/api/places/${placeId}/services/${RECOLLECT_SERVICE_ID}/events`);
    Object.entries({
      nomerge: "1",
      hide: "reminder_only",
      after: addDays(today, -1),
      before: addDays(today, 45),
      locale: "en",
      include_message: "email",
    }).forEach(([key, value]) => eventsUrl.searchParams.set(key, value));
    const payload = await fetchJson(eventsUrl, fetchImpl, controller.signal);
    const events = Array.isArray(payload?.events) ? payload.events : [];
    const recycling = events
      .filter((event) => event.day >= today && eventNames(event).includes("recycling"))
      .sort((a, b) => a.day.localeCompare(b.day))[0];
    if (!recycling?.day) throw new Error("Official calendar did not return an upcoming recycling date");

    return {
      today,
      timing: scheduleTimingLabel(recycling.day, today),
      anchorDate: recycling.day,
      villageDates: villageDatesForAnchor(recycling.day, events),
      holidayNote: holidayMessage(events, recycling.day),
      checkedAt: new Date().toISOString(),
      sourceUrl: WASTE_CONNECTIONS_SCHEDULE_URL,
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  WASTE_CONNECTIONS_SCHEDULE_URL,
  addDays,
  formatDate,
  getSterlingRanchWasteSchedule,
  isoDateInDenver,
  mondayOfWeek,
  scheduleTimingLabel,
  villageDatesForAnchor,
};

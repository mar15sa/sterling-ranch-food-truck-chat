const { createConnectorAdapters, emitEvidenceEnvelope } = require("./community-connector-adapter");

const DEFAULT_TIMEOUT_MS = Number(process.env.WASTE_SCHEDULE_TIMEOUT_MS || 4500);
const PLACE_ID_CACHE_MS = 6 * 60 * 60 * 1000;
const placeCache = new Map();

function isoDateInTimezone(timeZone, value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(value).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDays(isoDate, days) {
  const value = new Date(`${isoDate}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function formatDate(isoDate) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${isoDate}T12:00:00Z`));
}

function mondayOfWeek(isoDate) {
  const value = new Date(`${isoDate}T12:00:00Z`);
  return addDays(isoDate, -(value.getUTCDay() === 0 ? 6 : value.getUTCDay() - 1));
}

function scheduleTimingLabel(anchorDate, today) {
  const daysAway = Math.round((new Date(`${anchorDate}T12:00:00Z`) - new Date(`${today}T12:00:00Z`)) / 86_400_000);
  if (daysAway === 0) return "today";
  if (daysAway === 1) return "starting tomorrow";
  const anchorWeek = mondayOfWeek(anchorDate);
  const thisWeek = mondayOfWeek(today);
  if (anchorWeek === thisWeek) return "this week";
  if (anchorWeek === addDays(thisWeek, 7)) return "next week";
  return `the week of ${formatDate(anchorWeek).replace(/^[^,]+,\s*/, "")}`;
}

async function fetchJson(url, fetchImpl, signal) {
  const response = await fetchImpl(url, { headers: { accept: "application/json", "user-agent": "CommunityAssistant/1.0" }, signal });
  if (!response.ok) throw new Error(`Waste schedule source returned ${response.status}`);
  return response.json();
}

function eventNames(event = {}) { return (event.flags || []).map((flag) => String(flag.name || "").toLowerCase()); }

function holidayMessage(events = [], collectionDate = "") {
  const collection = new Date(`${collectionDate}T12:00:00Z`);
  const nearby = events.find((event) => (event.is_holiday || event.type === "holiday")
    && Math.abs(collection - new Date(`${event.day}T12:00:00Z`)) <= 6 * 86_400_000);
  if (!nearby) return "";
  const flag = nearby.flags?.[0] || {};
  return `${flag.subject_hash?.["en-US"] || nearby.title || "Holiday schedule"}: ${flag.short_text_message_hash?.["en-US"] || flag.voice_message_hash?.["en-US"] || "Collection may be delayed."}`;
}

function wasteAdapter(profile) {
  const adapter = createConnectorAdapters(profile).find((item) => item.family === "live-waste-schedule" && item.capabilities.includes("services"));
  if (!adapter) throw new Error("No live waste schedule connector is configured for this community.");
  const connector = profile.connectors.find((item) => item.id === adapter.connectorId);
  const settings = connector?.adapter?.wasteSchedule;
  if (!settings?.recollect?.areaId || !settings?.recollect?.serviceId || !Array.isArray(settings?.serviceAreas)) {
    throw new Error("Live waste schedule connector requires configured provider and service areas.");
  }
  return { adapter, settings };
}

function matchingCandidate(candidates, pattern) {
  const matcher = new RegExp(pattern, "i");
  return (candidates || []).find((candidate) => matcher.test([candidate.address, candidate.description, candidate.name, candidate.text, candidate.formatted_address].filter(Boolean).join(" "))
    && /^[A-F0-9-]{20,}$/i.test(String(candidate.place_id || "")));
}

function requestedServiceArea(question = "", areas = []) {
  return areas.find(({ label }) => new RegExp(`\\b${String(label || "").replace(/ Village$/i, "").replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`, "i").test(question));
}

function hasPublicReference(area = {}) {
  const reference = area.officialReferenceLocation;
  return reference?.privacy === "published-service-area-reference"
    && Boolean(reference.query && reference.candidateTextPattern);
}

function hasPublishedReference(reference = {}) {
  return reference?.privacy === "published-service-area-reference"
    && Boolean(reference.query && reference.candidateTextPattern);
}

function communityCycleReference(settings = {}, service = "") {
  const reference = settings.communityCycleReference;
  const canMapEveryArea = (settings.serviceAreas || []).every((area) => Number.isInteger(area.serviceWeekday));
  return service === "recycling" && canMapEveryArea && hasPublishedReference(reference) ? reference : null;
}

function datesFromCommunityCycle(anchorDate, reference, serviceAreas = []) {
  const referenceWeekday = Number(reference.serviceWeekday);
  if (!Number.isInteger(referenceWeekday)) return serviceAreas.map(({ label }) => ({ label }));
  return serviceAreas.map(({ label, serviceWeekday }) => ({
    label,
    date: addDays(anchorDate, Number(serviceWeekday) - referenceWeekday),
  }));
}

async function getWasteSchedule(options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== "function") throw new Error("Fetch is unavailable");
  if (!options.profile) throw new Error("A community profile is required for the live waste schedule.");
  const { adapter, settings } = wasteAdapter(options.profile);
  const timeoutMs = Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS;
  const today = isoDateInTimezone(options.profile.timezone || "UTC", options.now || new Date());
  const requestText = `${options.question || ""} ${options.routingPlan?.subject || ""} ${(options.routingPlan?.searchQueries || []).join(" ")}`;
  const service = /\b(?:trash|garbage)\b/i.test(requestText) && !/\brecycl(?:e|ing)\b/i.test(requestText) ? "garbage" : "recycling";
  const requestedDate = options.routingPlan?.dateRange?.start;
  const selectedArea = requestedServiceArea(requestText, settings.serviceAreas);
  const serviceAreas = settings.serviceAreas.map(({ label }) => ({ label }));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const calendarEndpoint = adapter.endpoints.find((endpoint) => endpoint.id === "calendar")?.url;
    const suggestEndpoint = adapter.endpoints.find((endpoint) => endpoint.id === "address-suggest")?.url;
    if (!calendarEndpoint || !suggestEndpoint) throw new Error("Live waste schedule endpoints are incomplete.");
    const sharedCycleReference = communityCycleReference(settings, service);
    const reference = selectedArea && hasPublicReference(selectedArea)
      ? selectedArea.officialReferenceLocation
      : sharedCycleReference;
    if (!reference) {
      const checkedAt = new Date().toISOString();
      const sourceUrl = adapter.endpoints.find((endpoint) => endpoint.id === "pickup-calendar")?.url || calendarEndpoint;
      const evidence = emitEvidenceEnvelope(adapter, {
        observedAt: checkedAt,
        request: requestedDate ? { dateRange: { start: requestedDate, end: requestedDate } } : {},
        sources: [{ id: "live-calendar", sourceUrl, controllingSourceRole: "operational", checkedAt }],
        claims: [],
        coverage: { requested: ["date"], covered: [] },
        actions: (settings.actionLinks || []).map((action) => ({ id: action.id, type: action.type, label: action.label, url: action.url })),
        degradation: { state: "unavailable", reason: selectedArea ? "no-published-service-area-reference" : "no-service-area-selected" },
      });
      return { today, service, date: "", range: requestedDate ? { start: requestedDate, end: requestedDate } : null, timing: "", anchorDate: "", serviceAreas, villageDates: serviceAreas, holidayNote: "", checkedAt, sourceUrl, evidence };
    }
    const usesSharedCycle = reference === sharedCycleReference;
    const cacheKey = `${adapter.adapterId}:${selectedArea?.label || `community-cycle:${reference.query}`}`;
    const cacheEnabled = options.cache !== false && !options.fetchImpl;
    let placeId = cacheEnabled && placeCache.get(cacheKey)?.expiresAt > Date.now() ? placeCache.get(cacheKey).placeId : "";
    if (!placeId) {
      const suggestUrl = new URL(suggestEndpoint);
      suggestUrl.pathname = `${suggestUrl.pathname.replace(/\/$/, "")}/${encodeURIComponent(settings.recollect.areaId)}/services/${encodeURIComponent(settings.recollect.serviceId)}/address-suggest`;
      suggestUrl.searchParams.set("q", reference.query);
      suggestUrl.searchParams.set("locale", "en");
      const candidate = matchingCandidate(await fetchJson(suggestUrl, fetchImpl, controller.signal), reference.candidateTextPattern);
      if (!candidate) throw new Error("Official calendar could not prove the published service-area reference.");
      placeId = candidate.place_id;
      if (cacheEnabled) placeCache.set(cacheKey, { placeId, expiresAt: Date.now() + PLACE_ID_CACHE_MS });
    }
    const eventsUrl = new URL(calendarEndpoint);
    eventsUrl.pathname = `${eventsUrl.pathname.replace(/\/$/, "")}/${encodeURIComponent(placeId)}/services/${encodeURIComponent(settings.recollect.serviceId)}/events`;
    Object.entries({ nomerge: "1", hide: "reminder_only", after: addDays(requestedDate && requestedDate < today ? requestedDate : today, -1), before: addDays(requestedDate && requestedDate > today ? requestedDate : today, 45), locale: "en", include_message: "email" }).forEach(([key, value]) => eventsUrl.searchParams.set(key, value));
    const payload = await fetchJson(eventsUrl, fetchImpl, controller.signal);
    const events = Array.isArray(payload?.events) ? payload.events : [];
    const pickup = events.filter((event) => event.day >= (requestedDate || today) && eventNames(event).includes(service)).sort((a, b) => a.day.localeCompare(b.day))[0];
    if (!pickup?.day || !/^\d{4}-\d{2}-\d{2}$/.test(pickup.day)) throw new Error(`Official calendar did not return an upcoming ${service} date.`);
    const datedServiceAreas = usesSharedCycle
      ? datesFromCommunityCycle(pickup.day, reference, settings.serviceAreas)
      : serviceAreas.map((area) => area.label === selectedArea.label ? { ...area, date: pickup.day } : area);
    const checkedAt = new Date().toISOString();
    const sourceUrl = adapter.endpoints.find((endpoint) => endpoint.id === "pickup-calendar")?.url || calendarEndpoint;
    const evidence = emitEvidenceEnvelope(adapter, {
      observedAt: checkedAt,
      request: requestedDate ? { dateRange: { start: requestedDate, end: requestedDate } } : {},
      sources: [{ id: "live-calendar", sourceUrl, controllingSourceRole: "operational", checkedAt }],
      claims: [
        ...datedServiceAreas.filter((area) => area.date).map((area, index) => ({
          id: `service-area-date-${index + 1}`,
          facet: "date",
          text: area.date,
          controllingEvidenceId: `${adapter.adapterId}:live-calendar`,
          controllingSourceRole: "operational",
        })),
      ],
      coverage: { requested: ["date"], covered: ["date"] },
      actions: (settings.actionLinks || []).map((action) => ({ id: action.id, type: action.type, label: action.label, url: action.url })),
      degradation: { state: "healthy" },
    });
    return { today, service, date: pickup.day, range: requestedDate ? { start: requestedDate, end: requestedDate } : null, timing: scheduleTimingLabel(pickup.day, today), anchorDate: pickup.day, serviceAreas: datedServiceAreas, villageDates: datedServiceAreas, holidayNote: holidayMessage(events, pickup.day), checkedAt, sourceUrl, evidence };
  } finally { clearTimeout(timer); }
}

module.exports = { addDays, formatDate, getWasteSchedule, getSterlingRanchWasteSchedule: getWasteSchedule, isoDateInTimezone, mondayOfWeek, requestedServiceArea, scheduleTimingLabel };

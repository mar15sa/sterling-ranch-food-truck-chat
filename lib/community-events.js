const { emitEvidenceEnvelope } = require("./community-connector-adapter");

const DEFAULT_CALENDAR_URL = "https://sterlingranchcab.com/calendar.aspx?CID=0&view=list";
const calendarCache = new Map();

function decodeHtml(value = "") {
  return String(value)
    .replace(/&nbsp;/gi, " ")
    .replace(/&thinsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function localDateParts(date = new Date(), timeZone = "America/Denver") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(value.year), month: Number(value.month), day: Number(value.day), weekday: value.weekday };
}

function isoDay(parts) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function addDays(iso, amount) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return date.toISOString().slice(0, 10);
}

function eventDateRange(question, now = new Date(), timeZone = "America/Denver") {
  const today = isoDay(localDateParts(now, timeZone));
  const text = String(question || "").toLowerCase();
  if (/\btomorrow\b/.test(text)) return { start: addDays(today, 1), end: addDays(today, 1), label: "tomorrow" };
  if (/\btoday\b|\btonight\b/.test(text)) return { start: today, end: today, label: "today" };
  if (/\bthis weekend\b|\bweekend\b/.test(text)) {
    const day = new Date(`${today}T12:00:00Z`).getUTCDay();
    const untilSaturday = day === 0 ? -1 : day === 6 ? 0 : 6 - day;
    const saturday = addDays(today, untilSaturday);
    return { start: saturday, end: addDays(saturday, 1), label: "this weekend" };
  }
  return { start: today, end: addDays(today, 7), label: "the next seven days" };
}

function parseCivicPlusEvents(html, baseUrl = DEFAULT_CALENDAR_URL) {
  const events = [];
  const seen = new Set();
  const anchors = [...html.matchAll(/<a\s+id="eventTitle_(\d+)"[^>]+href="([^"]+)"[^>]*>\s*<span>([\s\S]*?)<\/span><\/a>/gi)];
  for (let index = 0; index < anchors.length; index += 1) {
    const match = anchors[index];
    const eventId = match[1];
    if (seen.has(eventId)) continue;
    const next = anchors.slice(index + 1).find((candidate) => candidate[1] !== eventId);
    const segment = html.slice(match.index, next?.index || html.length);
    const startDate = decodeHtml(segment.match(/itemprop="startDate"[^>]*>([^<]+)</i)?.[1] || "");
    const location = decodeHtml(segment.match(/itemprop="location"[\s\S]*?itemprop="name">([^<]+)</i)?.[1] || "");
    if (!startDate) continue;
    seen.add(eventId);
    const before = html.slice(Math.max(0, match.index - 4000), match.index);
    const categoryMatches = [...before.matchAll(/<h2[^>]*class="title"[^>]*>([\s\S]*?)<\/h2>/gi)];
    const category = decodeHtml(categoryMatches.at(-1)?.[1] || "Community event");
    let url;
    try { url = new URL(decodeHtml(match[2]), baseUrl).href; } catch { url = baseUrl; }
    events.push({
      id: eventId,
      title: decodeHtml(match[3]),
      category,
      startDate,
      date: startDate.slice(0, 10),
      time: startDate.slice(11, 16),
      location,
      url,
    });
  }
  return events.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function requestRange(request, now = new Date(), timeZone = "America/Denver") {
  const supplied = request && typeof request === "object" ? request.dateRange : null;
  if (supplied?.start && supplied?.end) return supplied;
  return eventDateRange(typeof request === "string" ? request : "", now, timeZone);
}

function appliedEventFilters(request) {
  if (!request || typeof request !== "object") return [];
  return Object.entries(request.filters || {})
    .map(([field, value]) => ({ field, value: String(value || "").trim() }))
    .filter((filter) => filter.value);
}

function legacyEventTerms(question = "") {
  const ignored = new Set(["what", "events", "event", "are", "happening", "this", "weekend", "today", "tomorrow", "upcoming", "when", "where", "calendar", "community"]);
  return (String(question).toLowerCase().match(/[a-z0-9']+/g) || []).filter((term) => term.length > 2 && !ignored.has(term));
}

function eventMatchesFilter(event, filter) {
  const corpus = filter.field === "location" || filter.field === "facility"
    ? event.location
    : `${event.title} ${event.category} ${event.location}`;
  const terms = (filter.value.toLowerCase().match(/[a-z0-9']+/g) || []).filter((term) => term.length > 2);
  return terms.length > 0 && terms.some((term) => String(corpus).toLowerCase().includes(term));
}

function calendarAdapter(options = {}) {
  const adapter = options.adapter;
  if (!adapter) return null;
  if (adapter.family !== "civicplus-calendar" || !adapter.capabilities.includes("events")) {
    throw new Error("The selected connector adapter cannot provide community events.");
  }
  return adapter;
}

function configuredCalendarUrl(adapter, options = {}) {
  return options.calendarUrl || adapter?.endpoints.find((endpoint) => endpoint.id === "primary")?.url
    || adapter?.endpoints[0]?.url || DEFAULT_CALENDAR_URL;
}

function calendarCacheKey(adapter, calendarUrl, range) {
  return `${adapter?.adapterId || calendarUrl}:${range.start}:${range.end}`;
}

function calendarEnvelope(adapter, { events, sourceUrl, checkedAt, staleAfter, degradation, range, filters }) {
  if (!adapter) return null;
  const evidenceId = `${adapter.adapterId}:calendar`;
  return emitEvidenceEnvelope(adapter, {
    observedAt: checkedAt,
    request: { dateRange: range, filters: Object.fromEntries((filters || []).map((filter) => [filter.field, filter.value])) },
    sources: [{ id: "calendar", sourceUrl, checkedAt, staleAfter, controllingSourceRole: "operational" }],
    claims: events.map((event) => ({
      id: `event-${event.id}`,
      facet: "event-date",
      text: `${event.title}: ${event.startDate}`,
      controllingEvidenceId: evidenceId,
      controllingSourceRole: "operational",
    })),
    actions: events.map((event) => ({ id: `event-${event.id}`, type: "information", label: event.title, url: event.url })),
    coverage: { requested: ["event-date", "date"], covered: degradation?.state === "healthy" ? ["event-date", "date"] : [] },
    degradation,
  });
}

function resultFromCalendarData(data, request, range, { degraded = null, reason = null } = {}) {
  const appliedFilters = appliedEventFilters(request);
  const legacyTerms = typeof request === "string" ? legacyEventTerms(request) : [];
  const events = data.events.filter((event) => event.date >= range.start && event.date <= range.end);
  const filtered = appliedFilters.length
    ? events.filter((event) => appliedFilters.every((filter) => eventMatchesFilter(event, filter)))
    : legacyTerms.length
      ? events.filter((event) => legacyTerms.some((term) => `${event.title} ${event.category} ${event.location}`.toLowerCase().includes(term)))
      : events;
  const alternatives = appliedFilters.length && !filtered.length ? events.slice(0, 8) : [];
  const envelope = calendarEnvelope(data.adapter, {
    events: filtered.length ? filtered.slice(0, 8) : alternatives,
    sourceUrl: data.sourceUrl,
    checkedAt: data.checkedAt,
    staleAfter: data.staleAfter,
    degradation: degraded || { state: "healthy" },
    range,
    filters: appliedFilters,
  });
  return {
    events: filtered.slice(0, 8),
    alternatives,
    range,
    sourceUrl: data.sourceUrl,
    calendarLabel: data.calendarLabel,
    calendarActionLabel: data.calendarActionLabel,
    checkedAt: data.checkedAt,
    evidenceEnvelope: envelope,
    diagnostics: {
      sourceOutcome: degraded ? "partial" : "ok",
      parserHealthy: data.parserHealthy,
      uniqueEventMarkers: data.uniqueEventMarkers,
      structuredDateMarkers: data.structuredDateMarkers,
      parsedCount: data.events.length,
      beforeFilterCount: events.length,
      afterFilterCount: filtered.length,
      appliedFilters,
      legacyFilterApplied: legacyTerms.length > 0,
      requestedRange: { start: range.start, end: range.end },
      ...(reason ? { degradationReason: reason } : {}),
    },
  };
}

async function getCommunityEvents(request, options = {}) {
  const adapter = calendarAdapter(options);
  const calendarUrl = configuredCalendarUrl(adapter, options);
  const timeZone = options.profile?.timezone || options.timeZone || "America/Denver";
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const range = requestRange(request, now, timeZone);
  const fetchImpl = options.fetchImpl || fetch;
  const cacheKey = calendarCacheKey(adapter, calendarUrl, range);
  const cached = calendarCache.get(cacheKey);
  const refreshMs = (adapter?.freshness.refreshMinutes || 0) * 60_000;
  if (cached && now.getTime() - new Date(cached.checkedAt).getTime() < refreshMs) {
    return resultFromCalendarData(cached, request, range);
  }
  const url = new URL(calendarUrl);
  const [year, month, day] = range.start.split("-");
  url.searchParams.set("year", year);
  url.searchParams.set("month", String(Number(month)));
  url.searchParams.set("day", String(Number(day)));
  url.searchParams.set("calType", "0");
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(options.timeoutMs || 10000), headers: { "user-agent": "Community Assistant" } });
    if (!response.ok) throw new Error(`Official calendar returned HTTP ${response.status}.`);
    const html = await response.text();
    const parsed = parseCivicPlusEvents(html, url.href);
    const uniqueEventMarkers = new Set([...html.matchAll(/eventTitle_(\d+)/gi)].map((match) => match[1])).size;
    const structuredDateMarkers = (html.match(/itemprop="startDate"/gi) || []).length;
    const explicitNoEvents = uniqueEventMarkers === 0
      && structuredDateMarkers === 0
      && /\b(?:there (?:are|is) no|no upcoming|no) events?\b/i.test(html);
    const parserHealthy = explicitNoEvents || (structuredDateMarkers > 0 && parsed.length >= structuredDateMarkers);
    if (!parserHealthy) throw new Error("Official calendar response could not be parsed reliably.");
    const checkedAt = now.toISOString();
    const staleAfter = new Date(now.getTime() + (adapter?.freshness.staleAfterMinutes || 180) * 60_000).toISOString();
    const communityName = options.profile?.shortName || options.profile?.name || "community";
    const data = {
      adapter,
      events: parsed,
      sourceUrl: url.href,
      checkedAt,
      staleAfter,
      parserHealthy,
      uniqueEventMarkers,
      structuredDateMarkers,
      calendarLabel: adapter?.labels?.calendarTitle || `Official ${communityName} Calendar`,
      calendarActionLabel: adapter?.labels?.openAction || "Open official community calendar",
    };
    calendarCache.set(cacheKey, data);
    return resultFromCalendarData(data, request, range);
  } catch (error) {
    const mayRetain = !adapter || adapter.degradation.policy === "retain-last-known";
    if (mayRetain && cached && now.getTime() <= new Date(cached.staleAfter).getTime()) {
      return resultFromCalendarData(cached, request, range, {
        degraded: { state: "degraded", reason: error.message },
        reason: error.message,
      });
    }
    throw error;
  }
}

function clearCommunityEventsCache() {
  calendarCache.clear();
}

module.exports = { appliedEventFilters, clearCommunityEventsCache, eventDateRange, eventMatchesFilter, getCommunityEvents, legacyEventTerms, localDateParts, parseCivicPlusEvents, requestRange };

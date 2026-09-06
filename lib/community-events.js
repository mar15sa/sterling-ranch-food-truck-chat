const DEFAULT_CALENDAR_URL = "https://sterlingranchcab.com/calendar.aspx?CID=0&view=list";

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

function denverDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
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

function eventDateRange(question, now = new Date()) {
  const today = isoDay(denverDateParts(now));
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

function requestRange(request, now = new Date()) {
  const supplied = request && typeof request === "object" ? request.dateRange : null;
  if (supplied?.start && supplied?.end) return supplied;
  return eventDateRange(typeof request === "string" ? request : "", now);
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

async function getCommunityEvents(request, options = {}) {
  const calendarUrl = options.calendarUrl || DEFAULT_CALENDAR_URL;
  const range = requestRange(request, options.now || new Date());
  const fetchImpl = options.fetchImpl || fetch;
  const url = new URL(calendarUrl);
  const [year, month, day] = range.start.split("-");
  url.searchParams.set("year", year);
  url.searchParams.set("month", String(Number(month)));
  url.searchParams.set("day", String(Number(day)));
  url.searchParams.set("calType", "0");
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(options.timeoutMs || 10000), headers: { "user-agent": "Sterling Ranch Community Assistant" } });
  if (!response.ok) throw new Error(`Official calendar returned HTTP ${response.status}.`);
  const html = await response.text();
  const parsed = parseCivicPlusEvents(html, url.href);
  const uniqueEventMarkers = new Set([...html.matchAll(/eventTitle_(\d+)/gi)].map((match) => match[1])).size;
  const structuredDateMarkers = (html.match(/itemprop="startDate"/gi) || []).length;
  const parserHealthy = structuredDateMarkers > 0 && parsed.length >= structuredDateMarkers;
  const events = parsed.filter((event) => event.date >= range.start && event.date <= range.end);
  const appliedFilters = appliedEventFilters(request);
  const legacyTerms = typeof request === "string" ? legacyEventTerms(request) : [];
  const filtered = appliedFilters.length
    ? events.filter((event) => appliedFilters.every((filter) => eventMatchesFilter(event, filter)))
    : legacyTerms.length
      ? events.filter((event) => legacyTerms.some((term) => `${event.title} ${event.category} ${event.location}`.toLowerCase().includes(term)))
    : events;
  return {
    events: filtered.slice(0, 8),
    alternatives: appliedFilters.length && !filtered.length ? events.slice(0, 8) : [],
    range,
    sourceUrl: url.href,
    checkedAt: new Date().toISOString(),
    diagnostics: {
      sourceOutcome: parserHealthy ? "ok" : "partial",
      parserHealthy,
      uniqueEventMarkers,
      structuredDateMarkers,
      parsedCount: parsed.length,
      beforeFilterCount: events.length,
      afterFilterCount: filtered.length,
      appliedFilters,
      legacyFilterApplied: legacyTerms.length > 0,
    },
  };
}

module.exports = { appliedEventFilters, eventDateRange, eventMatchesFilter, getCommunityEvents, legacyEventTerms, parseCivicPlusEvents, requestRange };

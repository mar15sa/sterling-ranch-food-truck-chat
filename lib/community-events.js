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
  const pattern = /<a\s+id="eventTitle_(\d+)"[^>]+href="([^"]+)"[^>]*>\s*<span>([\s\S]*?)<\/span><\/a>[\s\S]{0,1600}?itemprop="startDate"[^>]*>([^<]+)<[\s\S]{0,900}?itemprop="location"[\s\S]{0,500}?itemprop="name">([^<]+)</gi;
  for (const match of html.matchAll(pattern)) {
    const eventId = match[1];
    if (seen.has(eventId)) continue;
    seen.add(eventId);
    const before = html.slice(Math.max(0, match.index - 4000), match.index);
    const categoryMatches = [...before.matchAll(/<h2[^>]*class="title"[^>]*>([\s\S]*?)<\/h2>/gi)];
    const category = decodeHtml(categoryMatches.at(-1)?.[1] || "Community event");
    const startDate = decodeHtml(match[4]);
    const location = decodeHtml(match[5]);
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

function relevantEventTerms(question = "") {
  const ignored = new Set(["what", "events", "event", "are", "happening", "this", "weekend", "today", "tomorrow", "upcoming", "when", "where", "calendar", "community"]);
  return (String(question).toLowerCase().match(/[a-z0-9']+/g) || []).filter((term) => term.length > 2 && !ignored.has(term));
}

async function getCommunityEvents(question, options = {}) {
  const calendarUrl = options.calendarUrl || DEFAULT_CALENDAR_URL;
  const range = eventDateRange(question, options.now || new Date());
  const fetchImpl = options.fetchImpl || fetch;
  const url = new URL(calendarUrl);
  const [year, month, day] = range.start.split("-");
  url.searchParams.set("year", year);
  url.searchParams.set("month", String(Number(month)));
  url.searchParams.set("day", String(Number(day)));
  url.searchParams.set("calType", "0");
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(options.timeoutMs || 10000), headers: { "user-agent": "Sterling Ranch Community Assistant" } });
  if (!response.ok) throw new Error(`Official calendar returned HTTP ${response.status}.`);
  const events = parseCivicPlusEvents(await response.text(), url.href)
    .filter((event) => event.date >= range.start && event.date <= range.end);
  const terms = relevantEventTerms(question);
  const filtered = terms.length
    ? events.filter((event) => terms.some((term) => `${event.title} ${event.category} ${event.location}`.toLowerCase().includes(term)))
    : events;
  return { events: filtered.slice(0, 8), range, sourceUrl: url.href, checkedAt: new Date().toISOString() };
}

module.exports = { eventDateRange, getCommunityEvents, parseCivicPlusEvents };

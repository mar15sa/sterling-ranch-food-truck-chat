const DEFAULT_MONTH_CACHE_TTL_MS = 1000 * 60 * 60;

function calendarUrlForDate(calendarBase, eventId, year, month, day) {
  const url = new URL(calendarBase);
  url.searchParams.set("EID", String(eventId));
  url.searchParams.set("month", String(month));
  url.searchParams.set("year", String(year));
  url.searchParams.set("day", String(day));
  url.searchParams.set("calType", "0");
  return url.toString();
}

function createMonthlyScheduleCache({ calendarBase, eventId, ttlMs = DEFAULT_MONTH_CACHE_TTL_MS, now = Date.now } = {}) {
  const cache = new Map();

  async function getSchedule(year, month, day, loadMonth) {
    const sourceUrl = calendarUrlForDate(calendarBase, eventId, year, month, day);
    const cacheKey = `${year}-${month}`;
    const cached = cache.get(cacheKey);
    if (cached && now() - cached.savedAt < ttlMs) {
      return { ...cached.data, sourceUrl };
    }

    const loaded = await loadMonth(sourceUrl);
    const { sourceUrl: _loadedSourceUrl, ...data } = loaded;
    cache.set(cacheKey, { data, savedAt: now() });
    return { ...data, sourceUrl };
  }

  return { getSchedule };
}

module.exports = { calendarUrlForDate, createMonthlyScheduleCache, DEFAULT_MONTH_CACHE_TTL_MS };

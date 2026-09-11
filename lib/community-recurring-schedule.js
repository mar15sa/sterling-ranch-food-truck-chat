const HOLIDAY_PATTERN_SOURCE = "(?:Labor Day|Memorial Day|Independence Day|New Year(?:'s|s)? Day|Christmas(?: Day)?|Thanksgiving(?: Day)?|Martin Luther King(?: Jr\\.?)? Day|Presidents?' Day|Juneteenth)";

function isoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function namedHolidayDateForYear(holidayName = "", year) {
  if (!Number.isInteger(year) || !holidayName) return "";
  const name = holidayName.toLowerCase();
  const nthWeekday = (month, weekday, occurrence) => {
    const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    return 1 + ((weekday - firstWeekday + 7) % 7) + (occurrence - 1) * 7;
  };
  const lastWeekday = (month, weekday) => {
    const lastDay = new Date(Date.UTC(year, month, 0));
    return lastDay.getUTCDate() - ((lastDay.getUTCDay() - weekday + 7) % 7);
  };
  if (/new year/.test(name)) return isoDate(year, 1, 1);
  if (/martin luther king/.test(name)) return isoDate(year, 1, nthWeekday(1, 1, 3));
  if (/presidents?/.test(name)) return isoDate(year, 2, nthWeekday(2, 1, 3));
  if (/memorial/.test(name)) return isoDate(year, 5, lastWeekday(5, 1));
  if (/juneteenth/.test(name)) return isoDate(year, 6, 19);
  if (/independence/.test(name)) return isoDate(year, 7, 4);
  if (/labor/.test(name)) return isoDate(year, 9, nthWeekday(9, 1, 1));
  if (/thanksgiving/.test(name)) return isoDate(year, 11, nthWeekday(11, 4, 4));
  if (/christmas/.test(name)) return isoDate(year, 12, 25);
  return "";
}

function shiftIsoDate(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(value.getTime())) return "";
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function recurringSeasonCoverage(text = "", requestedDate = "") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) return { declared: false, covers: false, statement: "" };
  const sentences = String(text).split(/(?<=[.!?])\s+/);
  for (const statement of sentences) {
    if (!/\b(?:open|season)\b/i.test(statement) || !/\bthrough\b/i.test(statement)) continue;
    const holidays = [...statement.matchAll(new RegExp(HOLIDAY_PATTERN_SOURCE, "gi"))];
    if (holidays.length < 2) continue;
    const year = Number(requestedDate.slice(0, 4));
    let start = namedHolidayDateForYear(holidays[0][0], year);
    let end = namedHolidayDateForYear(holidays[1][0], year);
    if (!start || !end) continue;
    const afterStart = statement.slice((holidays[0].index || 0) + holidays[0][0].length, (holidays[1].index || statement.length));
    if (/^\s+weekend\b/i.test(afterStart)) {
      const weekday = new Date(`${start}T12:00:00Z`).getUTCDay();
      start = shiftIsoDate(start, -((weekday - 6 + 7) % 7));
    }
    if (end < start) {
      const previousStart = namedHolidayDateForYear(holidays[0][0], year - 1);
      const nextEnd = namedHolidayDateForYear(holidays[1][0], year + 1);
      if (requestedDate <= end) start = previousStart;
      else end = nextEnd;
    }
    return {
      declared: true,
      covers: requestedDate >= start && requestedDate <= end,
      statement: statement.replace(/\s+/g, " ").trim(),
      start,
      end,
    };
  }
  return { declared: false, covers: true, statement: "" };
}

function localIsoDate(value, timeZone = "UTC") {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return byType.year && byType.month && byType.day ? `${byType.year}-${byType.month}-${byType.day}` : "";
}

function capturedProjectionCoversPastDate(source = {}, requestedDate = "", now = Date.now(), timeZone = "UTC") {
  if (source.canonicalScopedProjection !== true || !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) return false;
  const today = localIsoDate(now, timeZone);
  const observedDate = localIsoDate(source.checkedAt, timeZone);
  return Boolean(today && observedDate && requestedDate < today && observedDate >= requestedDate);
}

module.exports = { capturedProjectionCoversPastDate, namedHolidayDateForYear, recurringSeasonCoverage };

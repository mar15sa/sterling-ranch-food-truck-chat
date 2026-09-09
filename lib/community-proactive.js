// This module keeps compatibility exports for callers and historical tests.
// Resident answers no longer use topic-specific static templates. Static CAB
// content must cross the answer boundary as an exact URL + content-hash claim
// projection carrying the owner's decision ID.

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isoDateInDenver(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function nextDrcReview(now = new Date()) {
  const today = isoDateInDenver(now);
  for (let offset = 0; offset < 180; offset += 1) {
    const candidate = addDays(today, offset);
    const date = new Date(`${candidate}T12:00:00Z`);
    if (date.getUTCDay() !== 4) continue;
    const month = date.getUTCMonth() + 1;
    const occurrence = Math.ceil(date.getUTCDate() / 7);
    const eligible = month >= 3 && month <= 9 ? [1, 3].includes(occurrence) : occurrence === 1;
    if (!eligible) continue;
    const deadline = addDays(candidate, -6);
    if (deadline >= today) return { meeting: candidate, deadline };
  }
  return null;
}

function proactiveCommunityAnswer() {
  return null;
}

function enhanceProactiveRulesAnswer(_question, answer) {
  return answer;
}

module.exports = {
  enhanceProactiveRulesAnswer,
  nextDrcReview,
  proactiveCommunityAnswer,
};

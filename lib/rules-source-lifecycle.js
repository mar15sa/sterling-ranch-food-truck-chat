function extractQueryYears(query = "") {
  return [...String(query).matchAll(/\b(20\d{2})\b/g)]
    .map((match) => Number(match[1]))
    .filter((year) => year >= 2020 && year <= 2100);
}

function dateValue(value) {
  const timestamp = Date.parse(value || "");
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function documentEffectiveYear(document = {}) {
  const explicitYear = Number(document.effectiveYear);
  if (Number.isInteger(explicitYear) && explicitYear >= 2020) return explicitYear;
  const effectiveDate = document.effectiveDate || document.approvedDate || "";
  const match = String(effectiveDate).match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : 0;
}

function sourceLifecycleStatus(document = {}, now = Date.now()) {
  const effectiveAt = dateValue(document.effectiveDate || document.approvedDate);
  const expiresAt = dateValue(document.expirationDate || document.expiresAt);
  if (document.supersededBy) return "superseded";
  if (expiresAt && expiresAt <= now) return "expired";
  if (effectiveAt && effectiveAt > now) return "future";
  return "current";
}

function documentEligibleForQuery(document = {}, query = "", now = Date.now()) {
  const lifecycle = sourceLifecycleStatus(document, now);
  if (lifecycle === "current") return true;
  const queryYears = extractQueryYears(query);
  const effectiveYear = documentEffectiveYear(document);
  return Boolean(effectiveYear && queryYears.includes(effectiveYear));
}

module.exports = {
  dateValue,
  documentEffectiveYear,
  documentEligibleForQuery,
  extractQueryYears,
  sourceLifecycleStatus,
};

function normalizeTruckName(truckName = "") {
  return String(truckName)
    .normalize("NFKD")
    .replace(/[^\w\s&-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function identityKey(truckName = "") {
  return normalizeTruckName(String(truckName).replace(/[+&]/g, " and ")).toLowerCase();
}

function splitListedTruckNames(
  truckName,
  { hasKnownTruckData = () => false, singleTruckNamesWithJoiners = [] } = {}
) {
  const withoutEventLabel = String(truckName).replace(/\([^)]*\)/g, " ");
  const normalized = normalizeTruckName(withoutEventLabel);
  if (!normalized) return [];
  if (hasKnownTruckData(normalized)) return [normalized];

  const chunks = withoutEventLabel
    .split(/\s*(?:,|&|\+)\s*/)
    .map((name) => normalizeTruckName(name))
    .filter(Boolean);
  const protectedNames = new Set(singleTruckNamesWithJoiners.map(identityKey));
  const parts = [];

  for (let start = 0; start < chunks.length; ) {
    let protectedEnd = start + 1;

    for (let end = chunks.length; end > start + 1; end -= 1) {
      if (protectedNames.has(identityKey(chunks.slice(start, end).join(" & ")))) {
        protectedEnd = end;
        break;
      }
    }

    parts.push(chunks.slice(start, protectedEnd).join(" & "));
    start = protectedEnd;
  }

  return parts.length < 2 ? [normalized] : parts;
}

module.exports = {
  normalizeTruckName,
  splitListedTruckNames,
};

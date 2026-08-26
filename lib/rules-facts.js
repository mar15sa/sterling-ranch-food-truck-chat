const FACT_PATTERN = new RegExp(
  [
    "\\$\\s*\\d[\\d,]*(?:\\.\\d{1,2})?(?:\\s*(?:per|/)[^.;,]{1,45})?",
    "\\b\\d+(?:\\.\\d+)?\\s*%",
    "\\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?\\s+\\d{1,2}(?:,\\s*20\\d{2})?\\b",
    "\\b\\d{1,2}:\\d{2}\\s*(?:a\\.?m\\.?|p\\.?m\\.?)\\b",
    "\\b(?:last\\s+Wednesday|20\\d{2})\\b",
    "\\b\\d+(?:\\.\\d+)?\\s*(?:calendar\\s+)?(?:animals?|barrels?|containers?|courts?|days?|feet|foot|gallons?|hours?|inches?|items?|kelvin|minutes?|months?|notices?|objects?|ornaments?|overnights?|pets?|plants?|screens?|signs?|spaces?|square\\s+feet|trees?|vehicles?|years?)\\b",
    "\\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[-\\s](?:one|two|three|four|five|six|seven|eight|nine))?(?:\\s*\\(\\d+\\))?\\s+(?:calendar\\s+)?(?:domestic\\s+)?(?:animals?|barrels?|containers?|courts?|days?|feet|foot|hours?|inches?|items?|minutes?|months?|notices?|objects?|ornaments?|overnights?|pets?|plants?|screens?|signs?|spaces?|trees?|vehicles?|years?)\\b",
  ].join("|"),
  "gi"
);

function clean(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function sentenceAt(text, index) {
  const value = String(text || "");
  // Keep decimal money and measurements intact when locating sentence boundaries.
  const boundaries = value.replace(/(?<=\d)\.(?=\d)/g, "·");
  const left = Math.max(boundaries.lastIndexOf(".", index - 1), boundaries.lastIndexOf(";", index - 1), boundaries.lastIndexOf("\n", index - 1));
  const rightCandidates = [boundaries.indexOf(".", index), boundaries.indexOf(";", index), boundaries.indexOf("\n", index)].filter((position) => position >= 0);
  const right = rightCandidates.length ? Math.min(...rightCandidates) + 1 : value.length;
  return clean(value.slice(left + 1, right)).slice(0, 520);
}

function factKind(value = "") {
  if (/^\$/.test(value)) return "money";
  if (/%$/.test(value)) return "percentage";
  if (/\b(?:a\.?m\.?|p\.?m\.?)\b/i.test(value)) return "time";
  if (/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|last Wednesday)\b/i.test(value)) return "date";
  if (/\b(?:feet|foot|inches|kelvin|square feet)\b/i.test(value)) return "measurement";
  if (/\b(?:days?|hours?|minutes?|months?|overnights?|years?)\b/i.test(value)) return "duration";
  if (/^20\d{2}$/.test(value)) return "year";
  return "count";
}

function factSourceId(source = {}) {
  return (
    source.parentSupplementId ||
    source.id ||
    source.nodeId ||
    source.sourceUrl ||
    source.title ||
    "unknown-source"
  );
}

function normalizedFactValue(value = "", kind = factKind(value)) {
  const display = clean(value);
  const numeric = Number(display.replace(/[^0-9.-]/g, ""));
  const unitMatch = display.match(/\b(?:calendar\s+days?|days?|feet|foot|gallons?|hours?|inches?|kelvin|minutes?|months?|overnights?|square\s+feet|years?)\b/i);
  if (kind === "money" && Number.isFinite(numeric)) return { amount: numeric, currency: "USD" };
  if (kind === "percentage" && Number.isFinite(numeric)) return { amount: numeric, unit: "percent" };
  if (["measurement", "duration", "count"].includes(kind) && Number.isFinite(numeric)) {
    return { amount: numeric, unit: unitMatch ? unitMatch[0].toLowerCase() : "count" };
  }
  if (kind === "year" && Number.isFinite(numeric)) return { amount: numeric, unit: "year" };
  return { text: display };
}

function factKey(fact = {}) {
  const contextKey = clean(fact.context)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
  return `${fact.sourceId}:${fact.kind}:${contextKey}`;
}

function extractStructuredFacts(text, source = {}) {
  const value = String(text || "");
  const facts = [];
  FACT_PATTERN.lastIndex = 0;

  for (const match of value.matchAll(FACT_PATTERN)) {
    const displayValue = clean(match[0]);
    const context = sentenceAt(value, match.index || 0);
    if (!displayValue || !context) continue;

    const fact = {
      kind: factKind(displayValue),
      value: displayValue,
      context,
      sourceId: factSourceId(source),
      sourceTitle: source.title || "",
      sourceUrl: source.sourceUrl || "",
      approvedDate: source.approvedDate || "",
      effectiveDate: source.effectiveDate || "",
      expirationDate: source.expirationDate || source.expiresAt || "",
      sourceHash: source.sourceTextHash || source.chunkHash || "",
      scope: clean([source.chapter, source.article, source.title].filter(Boolean).join(" > ")),
      sourceOffset: match.index || 0,
    };
    fact.normalizedValue = normalizedFactValue(displayValue, fact.kind);
    fact.factKey = factKey(fact);
    const key = `${fact.kind}|${fact.value.toLowerCase()}|${fact.context.toLowerCase()}`;
    if (!facts.some((existing) => existing._key === key)) {
      facts.push({ ...fact, _key: key });
    }
  }

  return facts.map(({ _key, ...fact }) => fact);
}

module.exports = {
  extractStructuredFacts,
  factKey,
  normalizedFactValue,
};

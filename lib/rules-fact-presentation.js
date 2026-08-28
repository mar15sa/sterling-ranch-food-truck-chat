function cleanFactText(value = "") {
  return String(value).replace(/\r/g, "").split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n").trim();
}

function conciseFactContext(fact, rawText = "") {
  const raw = String(rawText || "");
  if (raw && Number.isInteger(fact.sourceOffset)) {
    const start = Math.max(0, fact.sourceOffset - 150);
    const end = Math.min(raw.length, fact.sourceOffset + String(fact.value || "").length + 210);
    return `${start > 0 ? "..." : ""}${cleanFactText(raw.slice(start, end))}${end < raw.length ? "..." : ""}`;
  }
  const context = cleanFactText(fact.context || "");
  const value = cleanFactText(fact.value || "");
  const index = context.toLowerCase().indexOf(value.toLowerCase());
  if (index < 0 || context.length <= 260) return context;
  const start = Math.max(0, index - 110);
  const end = Math.min(context.length, index + value.length + 150);
  return `${start > 0 ? "..." : ""}${context.slice(start, end).trim()}${end < context.length ? "..." : ""}`;
}

function readableSourcePassage(text = "") {
  return cleanFactText(text).replace(/\b([A-Za-z]+(?:-[A-Za-z]+)?)\s+\(\d+\)\s+(calendar\s+)?(days?|hours?|minutes?|months?|years?)/gi, "$1 $2$3");
}

module.exports = { cleanFactText, conciseFactContext, readableSourcePassage };

const TYPO_CORRECTIONS = Object.freeze([
  [/\bartificial\s+tuef\b/gi, "artificial turf"],
  [/\bfront\s+uarx\b/gi, "front yard"],
  [/\bhouse\s+pain\b/gi, "house paint"],
  [/\bflag\s+pole\b/gi, "flagpole"],
  [/\bmini[-\s]?split\b/gi, "mini split air conditioner"],
]);

const COMMUNITY_TOPIC_TERMS = new RegExp(
  [
    "air conditioners?|ac units?|hvac|mini split",
    "artificial turf|synthetic turf|rain barrels?|rainwater(?: harvesting)? barrels?",
    "gazebos?|pergolas?|fireworks?|pickle ?ball|sport courts?",
    "flagpoles?|leashes?|dog leash|chicken wire|privacy film|window tint|jellyfish|gemstone",
    "easements?|tree lawns?|approved plants?|approved landscapers?",
    "fence stains?|paint colors?|internet access|fiber internet|quantum fiber|atlas (?:coffee )?wifi",
    "calendar|clubs? calendar|utility trailers?|long[-\\s]?term rentals?",
    "backyards?|alto homes?|alto v",
  ].join("|"),
  "i"
);

function normalizeResidentQuestion(value = "") {
  let text = String(value).normalize("NFKC").replace(/\s+/g, " ").trim();
  for (const [pattern, replacement] of TYPO_CORRECTIONS) text = text.replace(pattern, replacement);
  return text;
}

function hasCommunityTopicSignal(value = "") {
  return COMMUNITY_TOPIC_TERMS.test(normalizeResidentQuestion(value));
}

function requestedAnswerFacets(value = "") {
  const text = normalizeResidentQuestion(value).toLowerCase();
  const facets = [];
  const add = (name) => { if (!facets.includes(name)) facets.push(name); };
  if (/\b(?:sec(?:tion)?\.?\s*)?\d+-\d+[a-z]?\b/.test(text)) add("section");
  if (/\b(?:height|high|tall|maximum|max)\b/.test(text)) add("height");
  if (/\b(?:price|pricing|fee|fees|cost|costs|how much|deposit)\b/.test(text)) add("price");
  if (/\b(?:link|website|url|where can i find|list)\b/.test(text)) add("resource");
  if (/\b(?:how do i|how to|submit|apply|book|reserve|rent)\b/.test(text)) add("process");
  if (/\b(?:how long|hours?|days?|nights?|week|longer than)\b/.test(text)) add("duration");
  if (/\b(?:what is|what are|define|means?)\b/.test(text)) add("definition");
  if (/\b(?:can i|can we|can the|are .* allowed|is .* allowed|required|do i need|permission|may i|allowed|prohibited)\b/.test(text)) add("permission");
  if (/^who\b/.test(text)) add("identity");
  return facets;
}

function answerCoverageIssues(question, answer = "", sources = []) {
  const text = String(answer || "");
  const lower = text.toLowerCase();
  const facets = requestedAnswerFacets(question);
  const issues = [];
  const sourceText = (sources || []).map((source) => `${source.title || ""} ${source.text || source.excerpt || ""}`).join(" ").toLowerCase();
  const explicitlyUnavailable = /\b(?:does not|doesn't|do not|don't|could not|couldn't|not specified|not listed|no specific|no numeric|not in the rulebook|current source)\b/i.test(text);

  if (facets.includes("section")) {
    const section = normalizeResidentQuestion(question).match(/\b(?:sec(?:tion)?\.?\s*)?(\d+-\d+[a-z]?)\b/i)?.[1];
    if (section && !lower.includes(section.toLowerCase()) && !sourceText.includes(section.toLowerCase())) issues.push("requested-section-missing");
  }
  if (facets.includes("height") && !/\b(?:feet|foot|inches|inch|height|tall|numeric limit|does not (?:give|set|state|specify))\b/i.test(text)) issues.push("requested-height-missing");
  if (facets.includes("price") && !/\$|\b(?:fee|cost|price|deposit|current agreement|does not (?:give|list|state|specify))\b/i.test(text)) issues.push("requested-price-missing");
  if (facets.includes("resource") && !/https?:\/\/|\b(?:linked|link|official(?:\s+[A-Za-z]+){0,4}\s+page|official section|below|list|does not (?:provide|list))\b/i.test(text)) issues.push("requested-resource-missing");
  if (facets.includes("process") && !/\b(?:submit|application|agreement|contact|call|email|open|use the linked|approval|reserve|book|does not (?:give|state|specify))\b/i.test(text)) issues.push("requested-process-missing");
  if (facets.includes("duration") && !/\b(?:hours?|days?|nights?|weeks?|duration|time|limit|does not (?:give|state|specify))\b/i.test(text)) issues.push("requested-duration-missing");
  if (facets.includes("permission") && !/\b(?:yes|no|allowed|approved|not allowed|prohibited|required|requires|may|must|does not (?:say|state|specify))\b/i.test(text)) issues.push("direct-permission-answer-missing");
  if (facets.includes("identity") && !explicitlyUnavailable) issues.push("identity-question-should-not-use-rules");
  return issues;
}

module.exports = {
  answerCoverageIssues,
  hasCommunityTopicSignal,
  normalizeResidentQuestion,
  requestedAnswerFacets,
};

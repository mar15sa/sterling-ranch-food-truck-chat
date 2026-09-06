const TYPO_CORRECTIONS = Object.freeze([
  [/\bartificial\s+tuef\b/gi, "artificial turf"],
  [/\bfront\s+uarx\b/gi, "front yard"],
  [/\bfinshed\b/gi, "finished"],
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
    "easements?|tree lawns?|(?:pre[- ]?approved|approved|recommended) (?:plants?|trees?|plant lists?)|approved landscapers?",
    "fence stains?|paint colors?|exterior colors?|garage door colors?|internet access|fiber internet|quantum fiber|atlas (?:coffee )?wifi",
    "calendar|clubs? calendar|utility trailers?|long[-\\s]?term rentals?",
    "backyards?|alto homes?|alto v",
  ].join("|"),
  "i"
);

const LIST_RESOURCE_NOUN = "(?:list|directory|catalog|catalogue|registry|roster|palette)";

function isPlantListQuestion(value = "") {
  const text = normalizeResidentQuestion(value).toLowerCase();
  const plantTerm = "(?:plants?|trees?|shrubs?|grasses?|perennials?|species)";
  const approvalTerm = "(?:pre[- ]?approved|approved|recommended|acceptable|allowed)";
  return new RegExp(
    `(?:\\b${approvalTerm}\\s+${plantTerm}\\s+(?:list|palette)\\b|` +
      `\\b(?:list|palette)\\s+(?:of\\s+)?${approvalTerm}\\s+${plantTerm}\\b|` +
      `\\b${approvalTerm}\\s+(?:plant|tree)\\s+(?:list|palette)\\b|` +
      `\\b(?:list|palette)\\s+(?:of\\s+)?${plantTerm}\\b|` +
      `\\b(?:examples?|kinds?|types?)\\s+of\\s+${approvalTerm}\\s+${plantTerm}\\b|` +
      `\\bwhat\\s+(?:kinds?|types?)\\s+of\\s+${plantTerm}\\b|` +
      `\\b(?:what|which|where|is there|do (?:you|we) have|show me|find)\\b.{0,45}\\b${approvalTerm}\\s+${plantTerm}\\b|` +
      `\\b${plantTerm}\\b.{0,25}\\b(?:can (?:i|we) plant|are (?:approved|recommended|acceptable|allowed))\\b)`,
    "i"
  ).test(text);
}

function isStateParksPassQuestion(value = "") {
  const text = normalizeResidentQuestion(value);
  return (
    /\b(?:cpw|colorado(?: state)? parks?(?: and wildlife)?|state parks?|parks?)\s+(?:annual\s+)?pas(?:s(?:es)?)?\b/i.test(text) ||
    /\b(?:annual\s+)?pas(?:s(?:es)?)?\s+(?:for\s+)?(?:cpw|colorado(?: state)? parks?(?: and wildlife)?|state parks?)\b/i.test(text)
  ) && !/\b(?:guest|caregiver|child\s*care|parking)\s+pas(?:s(?:es)?)?\b/i.test(text);
}

// A missing search result is not proof that an official resource does not
// exist. Negative existence claims need an official source that says so.
function unsupportedResourceAbsenceIssues(answer = "", sources = []) {
  const denialPattern = new RegExp(
    `(?:\\bthere (?:is|are)(?:n't| not)\\b.{0,90}\\b${LIST_RESOURCE_NOUN}s?\\b|` +
      `\\bno\\b.{0,90}\\b${LIST_RESOURCE_NOUN}s?\\b(?:\\s+(?:exists?|is available|is published))?|` +
      `\\b(?:does not|doesn't|do not|don't)\\s+(?:have|include|provide|publish|maintain|offer)\\b.{0,90}\\b${LIST_RESOURCE_NOUN}s?\\b)`,
    "i"
  );
  if (!denialPattern.test(String(answer || ""))) return [];
  const sourceText = (sources || [])
    .map((source) => `${source.title || ""} ${source.text || source.excerpt || ""}`)
    .join(" ");
  return denialPattern.test(sourceText) ? [] : ["unsupported-resource-absence-claim"];
}

const ANSWER_TOPIC_PATTERNS = Object.freeze([
  ["fence", /\bfenc(?:e|es|ing)\b/i, /\bfenc(?:e|es|ing)\b/i],
  ["shed", /\bsheds?\b/i, /\bsheds?\b/i],
  ["deck", /\bdecks?\b/i, /\bdecks?\b/i],
  ["patio", /\bpatios?\b/i, /\bpatios?\b/i],
  ["pergola", /\bpergolas?\b/i, /\bpergolas?\b/i],
  ["gazebo", /\bgazebos?\b/i, /\bgazebos?\b/i],
  ["dog", /\bdogs?\b/i, /\bdogs?\b/i],
  ["cat", /\bcats?\b/i, /\bcats?\b/i],
  ["tree", /\btrees?\b/i, /\btrees?\b/i],
  ["turf", /\b(?:artificial|synthetic|living|sodded)?\s*turf\b/i, /\bturf\b/i],
  ["sign", /\bsigns?\b/i, /\bsigns?\b/i],
  ["flag", /\bflags?\b/i, /\bflags?\b/i],
  ["rv", /\b(?:rv|rvs|recreational vehicles?)\b/i, /\b(?:rv|rvs|recreational vehicles?)\b/i],
  ["trailer", /\btrailers?\b/i, /\btrailers?\b/i],
]);

const ATTRIBUTE_QUESTION_PATTERN = /\b(?:color|colour|paint|stain|height|size|material|price|cost|fee|location|setback|distance|deadline|limit)\b/i;
const PRIMARY_OBJECT_PATTERNS = Object.freeze([
  ["fence", /\bfenc(?:e|es|ing)\b/i, /\bfenc(?:e|es|ing)\b/i],
  ["shed", /\bsheds?\b/i, /\bsheds?\b/i],
  ["deck", /\bdecks?\b/i, /\bdecks?\b/i],
  ["patio", /\bpatios?\b/i, /\bpatios?\b/i],
  ["pergola", /\bpergolas?\b/i, /\bpergolas?\b/i],
  ["gazebo", /\bgazebos?\b/i, /\bgazebos?\b/i],
  ["flagpole", /\bflag\s*poles?\b/i, /\bflag\s*poles?\b/i],
  ["tree", /\btrees?\b/i, /\btrees?\b/i],
]);

function normalizeResidentQuestion(value = "") {
  let text = String(value).normalize("NFKC").replace(/\s+/g, " ").trim();
  for (const [pattern, replacement] of TYPO_CORRECTIONS) text = text.replace(pattern, replacement);
  return text;
}

function hasCommunityTopicSignal(value = "") {
  return COMMUNITY_TOPIC_TERMS.test(normalizeResidentQuestion(value)) || isPlantListQuestion(value);
}

function requestedAnswerFacets(value = "") {
  const text = normalizeResidentQuestion(value).toLowerCase();
  const facets = [];
  const add = (name) => { if (!facets.includes(name)) facets.push(name); };
  if (/\b(?:sec(?:tion)?\.?\s*)?\d+-\d+[a-z]?\b/.test(text)) add("section");
  if (/\b(?:height|high|tall|maximum|max)\b/.test(text)) add("height");
  if (/\b(?:price|pricing|fee|fees|cost|costs|how much|deposit)\b/.test(text)) add("price");
  if (/\b(?:link|website|url|where can i find|list)\b/.test(text)) add("resource");
  if (/\b(?:example|examples|kind of)\b.{0,35}\b(?:trees?|plants?|species)\b|\b(?:approved (?:trees?|plants?)|(?:what|which) trees? can (?:i|we)|(?:trees?|plants?|species) can (?:i|we) plant)\b/.test(text)) add("examples");
  if (/\b(?:how do i|how to|submit|apply|book|reserve|rent|register|sign up|log in|login)\b/.test(text)
    || /\b(?:how|where)\b.{0,25}\bpay\b|\bpay\b.{0,30}\b(?:bill|balance|invoice)\b/.test(text)) add("process");
  if (/\b(?:how long|hours?|days?|nights?|week|longer than)\b/.test(text)) add("duration");
  if (/\b(?:what is|what are|define|means?)\b/.test(text)) add("definition");
  if (/\b(?:can i|can we|can the|are .* allowed|is .* allowed|required|do i need|permission|may i|allowed|prohibited)\b/.test(text)
    && !/\b(?:where|how|when|what)\s+can i\b/.test(text)
    && !/\bcan i\s+(?:pay|book|reserve|register|sign up|log in|login|submit|apply)\b/.test(text)) add("permission");
  if (/^who\b/.test(text)) add("identity");
  return facets;
}

function requestedAnswerTopics(value = "") {
  const text = normalizeResidentQuestion(value);
  if (!/\b(?:and|or|also|plus|both|as well as)\b/i.test(text)) return [];
  return ANSWER_TOPIC_PATTERNS
    .filter(([, questionPattern]) => questionPattern.test(text))
    .map(([name]) => name);
}

function answerCoverageIssues(question, answer = "", sources = []) {
  const text = String(answer || "");
  const lower = text.toLowerCase();
  const facets = requestedAnswerFacets(question);
  const topics = requestedAnswerTopics(question);
  const issues = [];
  issues.push(...unsupportedResourceAbsenceIssues(answer, sources));
  const sourceText = (sources || []).map((source) => `${source.title || ""} ${source.text || source.excerpt || ""}`).join(" ").toLowerCase();
  const explicitlyUnavailable = /\b(?:does not|doesn't|do not|don't|could not|couldn't|not specified|not listed|no specific|no numeric|not in the rulebook|current source)\b/i.test(text);
  const directOpening = text
    .replace(/^\s*(?:Short answer|Answer):\s*/i, "")
    .split(/\n\s*(?:Key details|What I found|Next step):/i)[0]
    .slice(0, 420);

  if (ATTRIBUTE_QUESTION_PATTERN.test(question)) {
    for (const [objectName, questionPattern, answerPattern] of PRIMARY_OBJECT_PATTERNS) {
      if (questionPattern.test(question) && !answerPattern.test(directOpening)) {
        issues.push(`requested-object-missing:${objectName}`);
      }
    }
  }

  if (facets.includes("section")) {
    const section = normalizeResidentQuestion(question).match(/\b(?:sec(?:tion)?\.?\s*)?(\d+-\d+[a-z]?)\b/i)?.[1];
    if (section && !lower.includes(section.toLowerCase()) && !sourceText.includes(section.toLowerCase())) issues.push("requested-section-missing");
  }
  if (facets.includes("height") && !/\b(?:feet|foot|inches|inch|height|tall|numeric (?:maximum|limit)|does not (?:give|publish|set|state|specify))\b/i.test(text)) issues.push("requested-height-missing");
  if (facets.includes("price") && !/\$|\b(?:fee|cost|price|deposit|current agreement|does not (?:give|list|state|specify))\b/i.test(text)) issues.push("requested-price-missing");
  if (facets.includes("resource") && !/https?:\/\/|\b(?:linked|link|official(?:\s+[A-Za-z]+){0,4}\s+page|official section|below|list|directory|catalog(?:ue)?|registry|roster|palette|does not (?:provide|list))\b/i.test(text)) issues.push("requested-resource-missing");
  if (facets.includes("process") && !/\b(?:submit|application|agreement|contact|call|email|open|use the linked|approval|reserve|book|does not (?:give|state|specify))\b/i.test(text)) issues.push("requested-process-missing");
  if (facets.includes("duration") && !/\b(?:hours?|days?|nights?|weeks?|duration|time|limit|does not (?:give|state|specify))\b/i.test(text)) issues.push("requested-duration-missing");
  if (facets.includes("permission") && !/\b(?:yes|no|allowed|approved|not allowed|prohibited|required|requires|may|must|does not (?:say|state|specify))\b/i.test(text)) issues.push("direct-permission-answer-missing");
  if (facets.includes("examples") && !/\bexamples?:\s*[^.]+(?:,| and )[^.]+/i.test(text)) issues.push("requested-examples-missing");
  if (facets.includes("identity") && !explicitlyUnavailable) issues.push("identity-question-should-not-use-rules");
  if (/\bpickle ?ball\b/i.test(question) && !/\b(?:build|construct|install|private|backyard|on my (?:lot|property))\b/i.test(question)) {
    if (!/\bpublic(?:-court| pickleball courts?)\b/i.test(text) || !/\bCAB(?:’s|'s)? Pickleball Courts page\b/i.test(text)) issues.push("community-court-source-boundary-missing");
    if (/5:00\s*a\.m\..{0,80}11:00\s*p\.m\./is.test(text)) issues.push("generic-park-hours-used-for-pickleball");
  }
  if (/\bflag\s*poles?\b/i.test(question) && /\b(?:height|high|tall|maximum|max)\b/i.test(question)) {
    if (!/four feet by six feet/i.test(text) || !/nighttime illumination/i.test(text)) issues.push("connected-flagpole-details-missing");
  }
  if (/\b(?:yard art|ornaments?|garden statues?|decorative objects?)\b/i.test(question)) {
    if (/\.\.\.|I pulled the controlling dates, amounts, and limits/i.test(text)) issues.push("yard-art-raw-source-answer");
  }
  for (const topic of topics) {
    const answerPattern = ANSWER_TOPIC_PATTERNS.find(([name]) => name === topic)?.[2];
    if (answerPattern && !answerPattern.test(text)) issues.push(`requested-topic-missing:${topic}`);
  }
  return issues;
}

module.exports = {
  answerCoverageIssues,
  hasCommunityTopicSignal,
  isPlantListQuestion,
  isStateParksPassQuestion,
  normalizeResidentQuestion,
  requestedAnswerFacets,
  requestedAnswerTopics,
  unsupportedResourceAbsenceIssues,
};

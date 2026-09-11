const TYPO_CORRECTIONS = Object.freeze([
  [/\bartificial\s+tuef\b/gi, "artificial turf"],
  [/\bfront\s+uarx\b/gi, "front yard"],
  [/\bfinshed\b/gi, "finished"],
  [/\bhouse\s+pain\b/gi, "house paint"],
  [/\bflag\s+pole\b/gi, "flagpole"],
  [/\bmini[-\s]?split\b/gi, "mini split air conditioner"],
  [/\bporhc\b/gi, "porch"],
  [/\bfurnture\b/gi, "furniture"],
  [/\bbelongins\b/gi, "belongings"],
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
    "backyards?",
    "porch(?:es)?|patios?|walkways?|sidewalks?|household items?|personal property|outdoor furniture|patio furniture|porch furniture",
  ].join("|"),
  "i"
);

const LIST_RESOURCE_NOUN = "(?:list|directory|catalog|catalogue|registry|roster|palette)";

function normalizedMembershipEntity(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/^[\s\"“”']*(?:the|a|an)\s+/i, "")
    .replace(/[\"“”'][\s]*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanedMembershipObject(value = "") {
  const resourceSuffix = new RegExp(
    `\\s+(?:on|in|among|from)\\s+[^.!?\\n]{0,110}\\b${LIST_RESOURCE_NOUN}s?\\b.*$`,
    "i"
  );
  return normalizedMembershipEntity(String(value)
    .replace(resourceSuffix, "")
    .replace(/\s*(?:[,;]|[—–])\s*(?:(?:but|although|though|however)\b)?[\s\S]*$/i, "")
    .replace(/^(?:any\s+)?(?:listing|entry|record|result|match)\s+for\s+/i, "")
    .trim());
}

function negativeCatalogMembershipClaims(value = "", options = {}) {
  // A catalog name is often followed by an ordinary scope qualifier, such as
  // "the preapproved plant list for this community." Keep that qualifier in
  // the resource match so a negative membership claim cannot evade the guard
  // merely by adding words after the list noun.
  const resource = `[^.!?\\n]{0,110}\\b${LIST_RESOURCE_NOUN}s?\\b(?:\\s+(?:for|of|at|within|under|from|in)\\b[^.!?\\n]{0,90})?`;
  // A negative membership statement can be followed by a resident-friendly
  // contrast or explanation. That later clause does not turn an unsupported
  // absence claim into evidence, so keep matching through the sentence.
  const trailingExplanation = `(?:\\s*(?:(?:[,;]|[—–])\\s*|\\b(?:but|although|though|however)\\b\\s+)[^.!?\\n]{0,160})?`;
  const entityFirst = new RegExp(
    `^(.{1,120}?)\\s+(?:is|are|was|were)(?:n't| not)\\s+` +
      `(?:(?:explicitly\\s+)?(?:listed|included|mentioned|named|shown|found)\\s+)?` +
      `(?:on|in|among)\\s+(${resource})${trailingExplanation}$`,
    "i"
  );
  const doesNotAppear = new RegExp(
    `^(.{1,120}?)\\s+(?:does|do)(?:n't| not)\\s+(?:appear|show up|belong)\\s+` +
      `(?:on|in|among)\\s+(${resource})${trailingExplanation}$`,
    "i"
  );
  const excludedFrom = new RegExp(
    `^(.{1,120}?)\\s+(?:is|are|was|were)\\s+(?:absent|excluded|omitted)\\s+from\\s+(${resource})${trailingExplanation}$`,
    "i"
  );
  const resourceFirst = new RegExp(
    `^(${resource})[^.!?\\n]{0,25}?\\s+(?:does|do)(?:n't| not)\\s+` +
      `(?:(?:specifically|explicitly|currently)\\s+)?(?:include|contain|list|name|show)\\s+(.{1,120}?)${trailingExplanation}$`,
    "i"
  );
  const catalogReference = "(?:it|that|this|the (?:same |approved |preapproved )?(?:list|directory|catalog|catalogue|registry|roster|palette))";
  const pronounMembershipMiss = new RegExp(
    `(?:^|\\b(?:if|unless|whether)\\s+)(.{1,120}?)\\s+(?:is|are|was|were)(?:n't| not)\\s+` +
      `(?:on|in|among)\\s+${catalogReference}\\b`,
    "i"
  );
  const authorityMiss = /^(?:(?:the|these|those|my)\s+)?(?:(?:official|current|cited|selected)\s+)?(?:rules?|sources?|documents?|pages?|search|search results?|materials?|guidance)\b[^.!?\n]{0,45}?\b(?:does|do|did|can|could|was|were)(?:n't| not)\s+(?:(?:specifically|explicitly|currently)\s+)?(?:list|include|mention|name|show|identify|contain|find|locate)\s+(.{1,140})$/i;
  const finderMiss = /^(?:I|we|the search|the search results?|the results?)\s+(?:did|can|could)(?:n't| not)\s+(?:find|locate|identify)\s+(.{1,140})$/i;
  const noEntry = /^(?:(?:the|these|those)\s+)?(?:(?:official|current|cited|selected)\s+)?(?:rules?|sources?|documents?|pages?|search|search results?|materials?|guidance)\b[^.!?\n]{0,45}?\b(?:has|have|shows?|contains?)\s+no\s+(?:listing|entry|record|result|match)\s+for\s+(.{1,140})$/i;
  const passiveMiss = /^(.{1,120}?)\s+(?:is|are|was|were)(?:n't| not)\s+(?:listed|included|mentioned|named|shown|found)\s+(?:in|on|by)\s+(?:(?:the|these|those)\s+)?(?:(?:official|current|cited|selected)\s+)?(?:rules?|sources?|documents?|pages?|search|search results?|materials?|guidance)$/i;
  const resultMiss = /^(.{1,120}?)\s+(?:does|do)(?:n't| not)\s+(?:appear|show up)\s+(?:in|on)\s+(?:(?:the|these|those)\s+)?(?:rules?|sources?|documents?|pages?|search|search results?|materials?|guidance)$/i;
  const unsupportedStatus = /^(.{1,120}?)\s+(?:is|are|was|were)(?:n't| not)\s+(?:(?:an?|among the)\s+)?(?:approved|preapproved|recommended|listed|included|eligible)\b/i;
  const claims = [];
  for (const sentence of String(value || "").split(/[.!?]+(?:\s+|$)|[\r\n]+/).map((part) => part.trim()).filter(Boolean)) {
    const entityMatch = sentence.match(entityFirst) || sentence.match(doesNotAppear) || sentence.match(excludedFrom);
    if (entityMatch) {
      claims.push({ entity: normalizedMembershipEntity(entityMatch[1]), sentence });
      continue;
    }
    const resourceMatch = sentence.match(resourceFirst);
    if (resourceMatch) {
      claims.push({ entity: cleanedMembershipObject(resourceMatch[2]), sentence });
      continue;
    }
    if (options.catalogContext) {
      const pronounMatch = sentence.match(pronounMembershipMiss);
      if (pronounMatch) {
        claims.push({ entity: cleanedMembershipObject(pronounMatch[1]), sentence });
        continue;
      }
      const semanticMiss = sentence.match(authorityMiss)
        || sentence.match(finderMiss)
        || sentence.match(noEntry)
        || sentence.match(passiveMiss)
        || sentence.match(resultMiss)
        || sentence.match(unsupportedStatus);
      if (semanticMiss) claims.push({ entity: cleanedMembershipObject(semanticMiss[1]), sentence });
    }
  }
  return claims.filter((claim) => claim.entity && !/^(?:it|this|that|they|these|those|item|choice|option)$/.test(claim.entity));
}

function sourceExplicitlyExcludesEntity(entity, sources = []) {
  const normalizedEntity = normalizedMembershipEntity(entity);
  if (!normalizedEntity) return false;
  const entityPattern = new RegExp(
    `\\b${normalizedEntity.split(/\\s+/).map((part) => part.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")).join("\\s+")}\\b`,
    "i"
  );
  const explicitNegativeStatus = /(?:\b(?:is|are|was|were)(?:n't| not)\s+(?:approved|preapproved|recommended|eligible|allowed|listed|included|named|shown)|\b(?:excluded|prohibited|ineligible|omitted)\b)/i;
  return (sources || []).some((source) => {
    const corpus = `${source.title || ""}. ${source.text || source.excerpt || ""}`;
    if (!new RegExp(`\\b${LIST_RESOURCE_NOUN}s?\\b`, "i").test(corpus)) return false;
    if (negativeCatalogMembershipClaims(corpus).some((claim) => claim.entity === normalizedEntity)) return true;
    return corpus.split(/[.!?]\s+|[\r\n]+/).some((sentence) =>
      entityPattern.test(sentence) && explicitNegativeStatus.test(sentence)
    );
  });
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function residentNamedCatalogEntities(question = "") {
  const ignoredFirstWords = new Set([
    "can", "could", "do", "does", "did", "is", "are", "was", "were", "may", "might",
    "what", "when", "where", "why", "how", "who", "will", "would", "should", "the", "a", "an",
  ]);
  return [...new Set((String(question).match(/\b[A-Z][A-Za-z0-9'’-]*(?:\s+[A-Z][A-Za-z0-9'’-]*){0,4}\b/g) || [])
    .map((phrase) => normalizedMembershipEntity(phrase))
    .filter((phrase) => phrase && !ignoredFirstWords.has(phrase.split(/\s+/)[0]))
  )];
}

function safeCatalogUncertainty(sentence = "", entity = "") {
  const normalizedSentence = normalizedMembershipEntity(sentence);
  const normalizedEntity = normalizedMembershipEntity(entity);
  return Boolean(normalizedEntity)
    && normalizedSentence.includes(normalizedEntity)
    && /\b(?:confirm|verify|establish|determine|tell|say)\b/i.test(normalizedSentence)
    && /\b(?:whether|if)\b/i.test(normalizedSentence);
}

function inferredNegativeCatalogClaims(answer = "", question = "") {
  const entities = residentNamedCatalogEntities(question);
  if (!entities.length) return [];
  const negativeCue = /\b(?:not|no|missing|absent|without|isn't|aren't|wasn't|weren't|doesn't|don't|didn't|can't|cannot|couldn't)\b/i;
  const catalogReference = new RegExp(
    `\\b(?:${LIST_RESOURCE_NOUN}s?|entry|entries|record|records|listing|listings|result|results|match|matches|there|it)\\b`,
    "i"
  );
  const absenceVerb = /\b(?:see|find|locate|identify|name|list|include|contain|show|appear|belong)\b/i;
  const claims = [];
  for (const sentence of String(answer || "").split(/[.!?]+(?:\s+|$)|[\r\n]+/).map((part) => part.trim()).filter(Boolean)) {
    for (const entity of entities) {
      const entityPattern = new RegExp(`\\b${escapeRegExp(entity).replace(/\\s+/g, "\\\\s+")}\\b`, "i");
      if (!entityPattern.test(sentence) || safeCatalogUncertainty(sentence, entity)) continue;
      if (negativeCue.test(sentence) && (catalogReference.test(sentence) || absenceVerb.test(sentence))) {
        claims.push({ entity, sentence });
      }
    }
  }
  return claims;
}

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

// Treat the plant as the subject when a resident asks whether they can grow or
// place one. Words such as "fence", "wall", and "yard" describe the location
// in these questions; they must not take over routing to an unrelated property
// standard. This intentionally covers plant families and named plants instead
// of maintaining a list of resident questions.
function isPlantPermissionQuestion(value = "") {
  const text = normalizeResidentQuestion(value).toLowerCase();
  const plantNoun = "(?:plants?|plantings?|trees?|shrubs?|bushes?|flowers?|grasses?|perennials?|vines?|groundcovers?|berr(?:y|ies)|raspberr(?:y|ies))";
  const featureBeforePlant = /\b(?:fenc(?:e|es|ing)|wall|house|shed|trellis|structure|screen|container|planter|bed)\b/i;
  const asksAboutFeature = /^(?:what|which)\s+(?:kind of\s+|type of\s+)?(?:fenc(?:e|es|ing)|wall|house|shed|trellis|structure|screen|container|planter|bed)\b/i;

  // A resident can use "plant" while asking about a regulated project or a
  // maintenance obligation. Those questions need the project's controlling
  // clause, not the general plant palette. Keep these exclusions based on the
  // subject of the request so they apply to new phrasings as well.
  const asksAboutGardenProject = /\b(?:vegetable gardens?|garden boxes?|raised (?:vegetable )?(?:gardens?|beds?))\b/i.test(text);
  const asksAboutDeadPlantMaintenance = (
    /\b(?:dead|dying|diseased)\b[^.?!]{0,45}\b(?:trees?|plants?|materials?)\b|\b(?:trees?|plants?|materials?)\b[^.?!]{0,45}\b(?:dead|dying|diseased)\b/i.test(text)
    && /\b(?:remove|removed|removing|replace|replaced|replacing|replacement|replant|replanted|replanting|must|need|have to|required|permission|approval)\b/i.test(text)
  );
  if (asksAboutGardenProject || asksAboutDeadPlantMaintenance) return false;

  // "Plant" and "grow" make the subject clear even when the resident names a
  // species instead of using a generic plant noun (for example, lavender).
  if (/\b(?:plant|grow)\b/i.test(text)) {
    return !/\b(?:plant|grow)\s+(?:up|install|build)\b/i.test(text);
  }

  // For broader permission verbs, require the plant noun to be the nearby
  // object. This keeps "Can I have a fence around my plants?" with fencing.
  const actionMatch = text.match(new RegExp(`\\b(?:have|put|place|add|use)\\b([^.?!]{0,70}?)\\b${plantNoun}\\b`, "i"));
  if (
    actionMatch &&
    !asksAboutFeature.test(text) &&
    !featureBeforePlant.test(actionMatch[1]) &&
    !/\btree\s+house\b/i.test(text)
  ) {
    return true;
  }

  // Also cover passive forms such as "Are raspberry plants allowed here?".
  return new RegExp(`\\b${plantNoun}\\b(?!\\s+house\\b)[^.?!]{0,45}\\b(?:allowed|approved|acceptable|permitted)\\b`, "i").test(text);
}

function isStateParksPassQuestion(value = "") {
  const text = normalizeResidentQuestion(value);
  return (
    /\b(?:cpw|colorado(?: state)? parks?(?: and wildlife)?|state parks?|parks?)\s+(?:annual\s+)?pas(?:s(?:es)?)?\b/i.test(text) ||
    /\b(?:annual\s+)?pas(?:s(?:es)?)?\s+(?:for\s+)?(?:cpw|colorado(?: state)? parks?(?: and wildlife)?|state parks?)\b/i.test(text)
  ) && !/\b(?:guest|caregiver|child\s*care|parking)\s+pas(?:s(?:es)?)?\b/i.test(text);
}

// Residents rarely use the codebook phrase "household items." They ask about
// "stuff," chairs, bikes, grills, and other belongings near outdoor living
// spaces. Keep this family separate from permanent construction and yard art,
// which have their own controlling rules.
function isMovableOutdoorBelongingsQuestion(value = "") {
  const text = normalizeResidentQuestion(value);
  const movableItem = /\b(?:stuff|things|belongings|personal property|household items?|furniture|chairs?|tables?|bikes?|bicycles?|toys?|grills?|barbecues?|bbqs?|electrical cords?)\b/i;
  const outdoorPlacement = /\b(?:porch(?:es)?|patios?|decks?|front steps?|walkways?|sidewalks?|roadways?|roads?|streets?|driveways?|curbs?|outside|outdoors?|lots?|propert(?:y|ies)|leave|left|keep|kept|store|stored|put|place|park|past|beyond|off|how far|where)\b/i;
  const permanentProject = /\b(?:build|construct|extend|expand|enlarge|replace|remodel|modify|addition|setback)\b.{0,35}\b(?:porch(?:es)?|patios?|decks?)\b|\b(?:porch(?:es)?|patios?|decks?)\b.{0,35}\b(?:build|construct|extend|expand|enlarge|replace|remodel|modify|addition|setback)\b/i;
  const decorativeObject = /\b(?:ornaments?|yard art|lawn decorations?|decorative objects?|garden statues?|statues?)\b/i;
  const lighting = /\b(?:lights?|lighting|fixtures?)\b/i;
  return movableItem.test(text) && outdoorPlacement.test(text) && !permanentProject.test(text) && !decorativeObject.test(text) && !lighting.test(text);
}

// A missing search result is not proof that an official resource does not
// exist. Negative existence claims need an official source that says so.
function unsupportedResourceAbsenceIssues(answer = "", sources = [], question = "") {
  const denialPattern = new RegExp(
    `(?:\\bthere (?:is|are)(?:n't| not)\\b.{0,90}\\b${LIST_RESOURCE_NOUN}s?\\b|` +
      `\\bno\\b.{0,90}\\b${LIST_RESOURCE_NOUN}s?\\b(?:\\s+(?:exists?|is available|is published))?|` +
      `\\b(?:does not|doesn't|do not|don't)\\s+(?:have|include|provide|publish|maintain|offer)\\b.{0,90}\\b${LIST_RESOURCE_NOUN}s?\\b)`,
    "i"
  );
  const issues = [];
  const catalogContext = new RegExp(`\\b${LIST_RESOURCE_NOUN}s?\\b`, "i").test(
    (sources || []).map((source) => `${source.title || ""} ${source.text || source.excerpt || ""}`).join(" ")
  );
  const membershipClaims = [
    ...negativeCatalogMembershipClaims(answer, { catalogContext }),
    ...(catalogContext ? inferredNegativeCatalogClaims(answer, question) : []),
  ];
  if (membershipClaims.some((claim) => !sourceExplicitlyExcludesEntity(claim.entity, sources))) {
    issues.push("unsupported-resource-absence-claim");
  }
  if (!denialPattern.test(String(answer || ""))) return issues;
  const sourceText = (sources || [])
    .map((source) => `${source.title || ""} ${source.text || source.excerpt || ""}`)
    .join(" ");
  if (!denialPattern.test(sourceText)) issues.push("unsupported-resource-absence-claim");
  return issues;
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
  return COMMUNITY_TOPIC_TERMS.test(normalizeResidentQuestion(value))
    || isPlantListQuestion(value)
    || isPlantPermissionQuestion(value);
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
  issues.push(...unsupportedResourceAbsenceIssues(answer, sources, question));
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
  if (facets.includes("process") && !/\b(?:submit|application|agreement|contact|call|email|open|select|register|follow|pay online|use the linked|approval|reserve|book|does not (?:give|state|specify))\b/i.test(text)) issues.push("requested-process-missing");
  if (facets.includes("duration") && !/\b(?:hours?|days?|nights?|weeks?|duration|time|limit|does not (?:give|state|specify))\b/i.test(text)) issues.push("requested-duration-missing");
  if (facets.includes("permission") && !/\b(?:yes|no|allowed|approved|preapproved|not allowed|prohibited|required|requires|may|must|does not (?:say|state|specify)|evaluated on an individual basis)\b/i.test(text)) issues.push("direct-permission-answer-missing");
  if (facets.includes("examples") && !/\bexamples?:\s*[^.]+(?:,| and )[^.]+/i.test(text)) issues.push("requested-examples-missing");
  if (facets.includes("identity") && !explicitlyUnavailable) issues.push("identity-question-should-not-use-rules");
  if (/\bpickle ?ball\b/i.test(question) && !/\b(?:build|construct|install|private|backyard|on my (?:lot|property))\b/i.test(question)) {
    const courtEvidence = `${text} ${sourceText}`;
    if (!/\b(?:sport courts?|pickleball)\b/i.test(courtEvidence) || !/\bDRC approval\b/i.test(courtEvidence)) issues.push("private-court-rule-missing");
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
  isMovableOutdoorBelongingsQuestion,
  isPlantListQuestion,
  isPlantPermissionQuestion,
  isStateParksPassQuestion,
  normalizeResidentQuestion,
  requestedAnswerFacets,
  requestedAnswerTopics,
  unsupportedResourceAbsenceIssues,
};

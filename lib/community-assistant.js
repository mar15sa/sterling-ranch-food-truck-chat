const { buildAnswerContract, detectFactConflicts } = require("./community-contracts");
const { foodTruckAnswer, isFoodTruckQuestion, isFoodTruckRequest } = require("./community-food-trucks");
const { normalizeInterpretation, resolveInterpretationMode } = require("./community-interpretation");
const { claimsFromDraft, verifyStructuredDraft } = require("./community-grounding");
const { planCommunitySearch: defaultPlanSearch, synthesizeCommunityAnswer: defaultSynthesize } = require("./community-llm");
const { enhanceProactiveRulesAnswer, proactiveCommunityAnswer } = require("./community-proactive");
const {
  ACTION_GOALS,
  actionSupportsGoal,
  classifyCommunityIntent,
  normalizedRoutingPlan,
  requestedDetails,
  searchCommunityIndex,
  searchCommunityIndexWithQueries,
  sourceSupportsGoal,
  tokens,
} = require("./community-search");
const { formatDate, WASTE_CONNECTIONS_SCHEDULE_URL } = require("./community-waste-schedule");
const { INPUT_CLASSIFICATIONS, classifyRulesInput, hasPromptInjectionSignals, normalizeInput } = require("./rules-input");

function sourceForDisplay(source) {
  return {
    ...source,
    nodeId: source.nodeId || `COMMUNITY_${String(source.id || "SOURCE").toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`,
    sourceName: source.sourceName || "Official community website",
    isOfficialResource: true,
  };
}

function cleanAnswerText(value = "") {
  const cleaned = String(value)
    .replace(/\s*--\s*\d+\s+of\s+\d+\s*--\s*/gi, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  let inFindings = false;
  let findingCount = 0;
  return cleaned.split(/\r?\n/).filter((line) => {
    if (/^What I found\s*:/i.test(line.trim())) { inFindings = true; return true; }
    if (/^Before you act\s*:/i.test(line.trim())) { inFindings = false; return true; }
    if (inFindings && /^[-•]\s+/.test(line.trim())) {
      findingCount += 1;
      return findingCount <= 3;
    }
    return true;
  }).join("\n");
}

function isOfficialCommunitySource(source = {}) {
  if (source.isOfficialResource) return true;
  try {
    return new URL(source.sourceUrl || "").hostname.toLowerCase() === "sterlingranchcab.com";
  } catch {
    return false;
  }
}

const GENERIC_EVIDENCE_TERMS = new Set([
  "account", "answer", "cab", "community", "contact", "does", "help", "hoa", "information",
  "number", "official", "phone", "question", "ranch", "rule", "rules", "sterling", "their",
]);

const GENERIC_PROJECT_TERMS = new Set([
  ...GENERIC_EVIDENCE_TERMS,
  "allowed", "approval", "backyard", "before", "build", "building", "could", "home", "house",
  "install", "make", "maximum", "need", "permission", "property", "residential", "there", "want",
  "what", "when", "where", "which", "with", "would", "yard",
  "book", "reserve", "space", "hours", "form", "apply", "application",
]);

function hasDistinctiveCommunityEvidence(question, sources = []) {
  const distinctive = tokens(question).filter((token) => token.length >= 4 && !GENERIC_EVIDENCE_TERMS.has(token));
  if (!distinctive.length) return false;
  return sources.some((source) => {
    const evidence = `${source.title || ""} ${source.text || ""}`.toLowerCase();
    return distinctive.some((token) => evidence.includes(token));
  });
}

function requiresKnownRulesBoundary(question = "") {
  const text = String(question);
  return /\bremove\b.{0,30}\btrees?\b|\btrees?\b.{0,30}\bremove\b/i.test(text)
    || (/\bfood\s*trucks?\b/i.test(text) && /\b(?:driveway|run|operate|business)\b/i.test(text))
    || /\bquiet hours?\b/i.test(text)
    || /\bmailbox\b/i.test(text)
    || /\binstagram\b/i.test(text)
    || /\bhelipad\b/i.test(text)
    || (/\bhoa\b/i.test(text) && /\b(?:phone|number|contact)\b/i.test(text));
}

function rulesAnswerHasQuestionSpecificEvidence(question, rulesAnswer = {}) {
  const subjectTerms = tokens(question).filter((token) =>
    token.length >= 4 && !GENERIC_PROJECT_TERMS.has(token)
  );
  if (!subjectTerms.length) return true;
  const evidence = (rulesAnswer.sources || []).map((source) =>
    `${source.title || ""} ${source.excerpt || ""} ${source.section || ""}`
  ).join(" ").toLowerCase();
  const answer = String(rulesAnswer.answer || "").toLowerCase();
  return subjectTerms.some((token) => evidence.includes(token) && answer.includes(token));
}

function directlyRelevantOfficialPdf(question, sources = []) {
  const objectPatterns = [
    /\bfenc(?:e|es|ing)\b/i,
    /\bsheds?\b/i,
    /\bdecks?\b/i,
    /\bpatios?\b/i,
    /\bpergolas?\b/i,
    /\bgazebos?\b/i,
    /\btrees?\b/i,
    /\bplants?\b/i,
  ];
  const requestedObjects = objectPatterns.filter((pattern) => pattern.test(question));
  if (!requestedObjects.length) return null;
  const facetGroups = [
    [/\b(?:color|colour|paint|stain|finish)\b/i, /\b(?:color|colour|paint|stain|finish)\b/i],
    [/\b(?:height|high|tall)\b/i, /\b(?:height|high|tall|feet|foot|inches)\b/i],
    [/\b(?:size|dimensions?)\b/i, /\b(?:size|dimensions?|feet|foot|inches)\b/i],
    [/\bmaterials?\b/i, /\bmaterials?\b/i],
    [/\b(?:setback|distance)\b/i, /\b(?:setback|distance|property line|feet|foot)\b/i],
    [/\b(?:price|cost|fee)\b/i, /\$|\b(?:price|cost|fee)\b/i],
    [/\b(?:deadline|how long)\b/i, /\b(?:deadline|days?|weeks?|months?)\b/i],
  ];
  const requestedFacets = facetGroups.filter(([questionPattern]) => questionPattern.test(question));
  if (!requestedFacets.length) return null;
  return sources.find((source) => {
    if (source.connectorType !== "official-pdf") return false;
    const evidence = `${source.title || ""} ${source.text || source.excerpt || ""}`;
    return requestedObjects.every((pattern) => pattern.test(evidence))
      && requestedFacets.every(([, evidencePattern]) => evidencePattern.test(evidence));
  }) || null;
}

function officialCabHomepage() {
  return {
    title: "Official Sterling Ranch CAB website",
    sourceUrl: "https://sterlingranchcab.com/",
    text: "Official Sterling Ranch Community Authority Board website.",
    excerpt: "Official Sterling Ranch Community Authority Board website.",
    isOfficialResource: true,
  };
}

function safeRulesBoundaryAnswer(question, rulesAnswer = {}, index = {}) {
  const text = String(question);
  let directAnswer = "I could not verify a Sterling Ranch rule or official page that specifically answers that exact question.";
  let keyDetails = [];
  let nextStep = "Use the official CAB website below to confirm before acting; I won’t substitute a related rule for the missing answer.";
  let sources = [officialCabHomepage()];
  let actions = [{ label: "Open official CAB website", url: "https://sterlingranchcab.com/", actionType: "information" }];

  if (/\bremove\b.{0,30}\btrees?\b|\btrees?\b.{0,30}\bremove\b/i.test(text)) {
    directAnswer = "I could not verify blanket permission to remove a tree.";
    keyDetails = ["The current rules say dead trees must be replaced.", "A design change to the tree lawn requires DRC approval."];
    nextStep = "Confirm the tree’s location and condition with the DRC before removing it.";
    sources = (rulesAnswer.sources || []).filter((source) => /tree|landscape maintenance/i.test(source.title || "")).slice(0, 3);
    if (!sources.length) sources = [officialCabHomepage()];
  } else if (/\bfood\s*trucks?\b/i.test(text) && /\b(?:driveway|run|operate|business)\b/i.test(text)) {
    directAnswer = "I could not verify a Sterling Ranch rule that specifically allows operating a food-truck business from a residential driveway.";
    nextStep = "Confirm both CAB rules and Douglas County business requirements before operating or parking a commercial food truck at a home.";
  } else if (/\bquiet hours?\b/i.test(text)) {
    directAnswer = "I could not verify one community-wide quiet-hours rule in the connected official sources.";
    keyDetails = ["Facility hours are posted separately and should not be treated as a neighborhood-wide noise rule."];
    nextStep = "Use the official CAB website or contact the Resident Resource Center for the rule that applies to your location.";
  } else if (/\bmailbox\b/i.test(text)) {
    directAnswer = "I could not verify permission to repaint a neighborhood mailbox.";
    keyDetails = ["The connected exterior-paint rule applies to homes; it should not be reused as a mailbox-color rule."];
    nextStep = "Confirm with the CAB and USPS before altering a neighborhood mailbox unit.";
  } else if (/\binstagram\b/i.test(text)) {
    directAnswer = "I could not verify a current official CAB Instagram account from the connected official website.";
    nextStep = "Use the official CAB website below so an unverified social-media account is not presented as official.";
  } else if (/\bhelipad\b/i.test(text)) {
    directAnswer = "I could not verify a Sterling Ranch rule that specifically authorizes a residential helipad.";
    nextStep = "Contact the CAB and applicable county authorities before planning one; a shed or yard-art rule is not evidence for a helipad.";
  } else if (/\bhoa\b/i.test(text) && /\b(?:phone|number|contact)\b/i.test(text)) {
    const contactSource = (index?.sources || []).find((source) => /^Important Contact Information$/i.test(source.title || ""));
    const residentPhone = contactSource?.facts?.find((fact) => fact.type === "phone" && /Resident Resource Center/i.test(fact.context || ""));
    directAnswer = residentPhone
      ? `I could not verify a separate “HOA” phone number. The official CAB contact page lists the Resident Resource Center at ${residentPhone.value}.`
      : "I could not verify a separate “HOA” phone number; Sterling Ranch’s official site publishes CAB contacts instead.";
    nextStep = "Use the official Important Contact Information page to choose the current contact for your issue.";
    if (contactSource) {
      sources = [sourceForDisplay(contactSource)];
      actions = [{ label: "Open official Important Contact Information", url: contactSource.sourceUrl, actionType: "contact" }];
    }
  }

  const boundary = buildAnswerContract({ directAnswer, keyDetails, nextStep, actions, sources, status: "could-not-verify", answerMode: "community-rules-boundary" });
  return {
    ...boundary,
    answerVerdict: "unverified",
    inputClassification: rulesAnswer.inputClassification || "rules-question",
    confidence: { canAnswer: false, confidence: "high", reason: rulesAnswer.confidence?.reason || "no-exact-official-evidence" },
    reviewNeeded: false,
  };
}

function isWasteStorageRuleQuestion(question = "") {
  const text = String(question);
  return /\b(?:trash|garbage|recycling|waste|bins?|carts?|containers?)\b/i.test(text)
    && (/(?:bring|take)(?:\s+\w+){0,4}\s+(?:in|back)\b/i.test(text)
      || /\b(?:store|stored|storage|leave|left|overnight|curb|bring back|take back|taking|put out|outside|exact hour|what time)\b/i.test(text))
    && !/\b(?:pickup|pick up|collection|schedule|which day|what day)\b/i.test(text);
}

function sentenceScore(sentence, queryTokens, question = "") {
  const text = sentence.toLowerCase();
  return queryTokens.reduce((score, token) => score + (text.includes(token) ? 2 : 0), 0)
    + (/\$|@|\b\d{3}[-.)\s]\d{3}/.test(sentence) ? 1 : 0)
    + (/\b(?:contact|call|phone|email|who)\b/i.test(question) && /@|\b\d{3}[-.)\s]\d{3}/.test(sentence) ? 8 : 0)
    + (/\b(?:cost|price|fee|rate|deposit|how much)\b/i.test(question) && /\$/.test(sentence) ? 8 : 0)
    - (sentence.length > 420 ? 2 : 0);
}

function usefulSentences(question, sources, limit = 3) {
  const queryTokens = tokens(question);
  const candidates = [];
  for (const source of sources.slice(0, 3)) {
    const sentences = String(source.text || "")
      .replace(/^[^.!?]{0,180}?Skip to Main Content\s*/i, "")
      .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
      .map((sentence) => sentence
        .replace(/\s+/g, " ")
        .replace(/\s+(?:or|and)\s+\.$/i, ".")
        .replace(/([”’"])\./g, "$1")
        .replace(/\s+\./g, ".")
        .trim())
      .filter((sentence) => sentence.length >= 35 && sentence.length <= 420);
    for (const sentence of sentences) {
      if (/\b(?:8220|8155) Piney River Avenue\b|\bthe information on this sheet is not all inclusive\b/i.test(sentence)) continue;
      candidates.push({ sentence, score: sentenceScore(sentence, queryTokens, question) });
    }
  }
  const seen = new Set();
  return candidates
    .sort((a, b) => b.score - a.score)
    .filter((item) => item.score > 0)
    .filter((item) => {
      const key = item.sentence.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map((item) => item.sentence);
}

function relevantActions(question, sources, limit = 3, routingPlan = null) {
  const queryTokens = tokens(question);
  const generic = new Set(["apply", "application", "book", "call", "contact", "cost", "fee", "form", "pay", "price", "rent", "reserve", "reservation"]);
  const coreTokens = queryTokens.filter((token) => !generic.has(token));
  const asksToReportProblem = /\b(?:complaint|concern|delivery|feedback|issue|missed|problem|report)\b/i.test(question);
  const actionMatchesPurpose = (actionText) => {
    if (/resident-amenity|resident amenity form/i.test(actionText)) return /\b(?:amenit(?:y|ies)|membership|clubhouse|pool access|resident card)\b/i.test(question);
    if (/wasteconnections\.com\/contact-us|bulk item/i.test(actionText)) return /\b(?:trash|recycl(?:e|ing)|waste|bulk|mattress|furniture)\b/i.test(question);
    if (/park-shelters|amenity-rentals|secure\.rec1\.com/i.test(actionText)) return /\b(?:amenit(?:y|ies)|book|clubhouse|facility|great hall|overlook|park|pavilion|rent|reserv(?:e|ation)|room|shelter|space)\b/i.test(question);
    if (/faq\.aspx\?qid=119|reserve the pool for a party/i.test(actionText)) return /\bpool\b/i.test(question) && /\b(?:party|reserv(?:e|ation))\b/i.test(question);
    if (/\/248\/water-sewer|\bwater & sewer\b/i.test(actionText)) return /\b(?:bill|meter|sewer|utilit(?:y|ies)|water)\b/i.test(question);
    if (/calendar\.aspx/i.test(actionText)) return /\b(?:calendar|club|event|happening)\b/i.test(question);
    if (/constantcontact|email distribution sign up/i.test(actionText)) return /\b(?:email updates?|newsletter|notifications?|sign up|subscribe)\b/i.test(question);
    return true;
  };
  const actions = sources.flatMap((source) => (source.actions || []).map((action) => ({
    ...action,
    sourceTitle: source.title || "",
    explicitAction: source.connectorType === "official-action",
  })));
  const ranked = actions
    .map((action) => ({
      ...action,
      actionText: `${action.label} ${action.url} ${action.context || ""} ${(action.keywords || []).join(" ")}`.toLowerCase(),
    }))
    .filter((action) => actionMatchesPurpose(action.actionText))
    .filter((action) => actionSupportsGoal(action, routingPlan?.goal))
    .filter((action) => asksToReportProblem || !/submit-your-feedback|\bgeneral inquiries\b|\bplease submit this form\b/i.test(action.actionText))
    .map((action) => ({
      ...action,
      score: queryTokens.reduce((score, token) => score + (action.actionText.includes(token) ? 2 : 0), 0) + (action.explicitAction ? 20 : 0),
      coreMatch: !coreTokens.length || coreTokens.some((token) => action.actionText.includes(token)),
    }))
    .filter((action) => action.coreMatch && (action.score > 0 || actions.length === 1))
    .sort((a, b) => b.score - a.score)
    .filter((action, index, all) => all.findIndex((candidate) => candidate.url === action.url) === index)
    .slice(0, limit)
    .map(({ score, coreMatch, sourceTitle, explicitAction, actionText, ...action }) => action);
  if (ranked.length) return ranked;
  if (routingPlan?.goal && ACTION_GOALS.has(routingPlan.goal)) return [];
  const top = sources[0];
  return top?.sourceUrl ? [{ label: `Open official ${top.title}`, url: top.sourceUrl, actionType: "information" }] : [];
}

function needsExactRecurringDate(question = "") {
  if (!/\brecycling\b/i.test(question)) return false;
  if (/\b(?:bins?|cans?|carts?|containers?|curb|store|stored|storage|bring\s+(?:it|them|the)|put\s+(?:it|them|the))\b/i.test(question)) return false;
  return /\b(?:week|next|date|today|tomorrow|pickup|collection|schedule)\b/i.test(question)
    || /\bwhen\s+(?:is|are)\s+(?:the\s+)?(?:next\s+)?recycling\b/i.test(question);
}

function liveRecyclingScheduleAnswer(question, schedule) {
  const requestedVillage = schedule.villageDates.find(({ village }) =>
    new RegExp(`\\b${village.replace(/ Village$/i, "")}\\b`, "i").test(question)
  );
  const dates = requestedVillage ? [requestedVillage] : schedule.villageDates;
  const directAnswer = requestedVillage
    ? `${requestedVillage.village}'s next recycling pickup is ${formatDate(requestedVillage.date)}—${schedule.timing}.`
    : `Recycling pickup is ${schedule.timing}. The next dates are listed below by village.`;
  const keyDetails = dates.map(({ village, date }) => `${village}: ${formatDate(date)}`);
  if (schedule.holidayNote) keyDetails.push(schedule.holidayNote);
  const sources = [{
    id: "waste-connections-live-calendar",
    title: "Waste Connections live pickup calendar",
    sourceUrl: schedule.sourceUrl || WASTE_CONNECTIONS_SCHEDULE_URL,
    text: `The live calendar lists recycling for ${schedule.anchorDate}.`,
    excerpt: `Upcoming recycling week anchored on ${formatDate(schedule.anchorDate)}.`,
    checkedAt: schedule.checkedAt,
    authorityScore: 1,
    isOfficialResource: true,
  }, {
    id: "sterling-ranch-trash-recycling-schedule",
    title: "Sterling Ranch Trash & Recycling schedule",
    sourceUrl: "https://sterlingranchcab.com/247/Trash-Recycling",
    text: "Providence recycling is every other Monday, Ascent every other Tuesday, and Prospect every other Thursday. Place bins outside by 7 a.m.",
    excerpt: "Official village pickup weekdays and 7 a.m. bin instructions.",
    checkedAt: schedule.checkedAt,
    authorityScore: 1,
    isOfficialResource: true,
  }];
  return { ...buildAnswerContract({
    directAnswer,
    keyDetails,
    nextStep: "Place your bins outside by 7 a.m. on your village's pickup day.",
    actions: [{ label: "Check an address in the official pickup calendar", url: schedule.sourceUrl || WASTE_CONNECTIONS_SCHEDULE_URL, actionType: "calendar" }],
    sources,
    status: "verified",
    checkedAt: schedule.checkedAt,
    requestedDetails: ["date"],
    coveredDetails: ["date"],
    answerMode: "community-live-recycling",
  }), _connectorDiagnostics: { sourceOutcome: "ok", beforeFilterCount: schedule.villageDates?.length || 0, afterFilterCount: dates.length, appliedFilters: requestedVillage ? [{ field: "location", value: requestedVillage.village }] : [] } };
}

function hasDatedAnchor(fact = {}) {
  if (String(fact.effectiveDate || "").trim()) return true;
  return /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}\b|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/i.test(`${fact.value || ""} ${fact.context || ""}`);
}

function conciseRecurringSchedule(value = "") {
  const match = String(value).match(/For\s+(.+?Village)\s*,?\s*.*?recycling is picked up\s+(every other\s+\w+)/i);
  return match ? `${match[1]}: recycling ${match[2]}` : String(value).replace(/\s+/g, " ").trim();
}

function unanchoredRecurringScheduleAnswer(question, result) {
  if (!needsExactRecurringDate(question)) return null;
  const sources = result.sources.map(sourceForDisplay);
  const scheduleFacts = sources.flatMap((source) => (source.facts || []).filter((fact) => fact.type === "schedule" && /every other/i.test(fact.value || "")));
  if (!scheduleFacts.length || scheduleFacts.some(hasDatedAnchor)) return null;

  const configuredActionSources = (result.index?.sources || [])
    .filter((source) => source.communityId === (result.index?.communityId || "sterling-ranch"))
    .filter((source) => source.connectorType === "official-action" && /wasteconnect/i.test(`${source.id} ${source.title}`));
  const appActions = relevantActions(question, [...sources, ...configuredActionSources], 5)
    .filter((action) => /\bWasteConnect\b|play\.google\.com|apps\.apple\.com/i.test(`${action.label} ${action.url}`));
  const scheduleSource = sources.find((source) => /trash|recycling/i.test(`${source.title} ${source.sourceUrl}`));
  const actions = [
    ...appActions,
    ...(scheduleSource ? [{ label: "Open official Trash & Recycling information", url: scheduleSource.sourceUrl, actionType: "information" }] : []),
  ].filter((action, index, all) => all.findIndex((candidate) => candidate.url === action.url) === index).slice(0, 3);

  return buildAnswerContract({
    directAnswer: "The official schedule says recycling is every other week, but it does not publish a dated starting point. That means I can’t reliably tell whether your pickup is this week or next from the CAB page alone.",
    keyDetails: scheduleFacts.slice(0, 3).map((fact) => conciseRecurringSchedule(fact.value)),
    nextStep: "Use WasteConnect for your service address to see the next dated pickup and set a reminder.",
    actions,
    sources,
    status: "verified-incomplete",
    requestedDetails: result.requestedDetails,
    coveredDetails: [],
    checkedAt: scheduleSource?.checkedAt || sources[0]?.checkedAt,
    answerMode: "community-recurring-schedule",
  });
}

function coveredDetails(requested, sources, actions) {
  const facts = sources.flatMap((source) => source.facts || []);
  return requested.filter((detail) => {
    if (detail === "action") return actions.length > 0;
    if (detail === "price") return facts.some((fact) => fact.type === "money");
    if (detail === "contact") return facts.some((fact) => ["phone", "email"].includes(fact.type));
    if (detail === "date") return facts.some((fact) => ["date", "schedule"].includes(fact.type)) || sources.some((source) => source.sourceType === "events");
    if (detail === "hours") return facts.some((fact) => fact.type === "time") || sources.some((source) => source.sourceType === "status");
    return true;
  });
}

function bestContactCandidate(question, sources) {
  const queryTokens = tokens(question).filter((token) => !["call", "contact", "email", "phone"].includes(token));
  const requestedType = /\bemail\b/i.test(question) ? "email" : /\b(?:phone|call|number)\b/i.test(question) ? "phone" : "";
  const candidates = sources.flatMap((source, sourceIndex) => (source.facts || [])
    .filter((fact) => ["phone", "email"].includes(fact.type))
    .filter((fact) => !requestedType || fact.type === requestedType)
    .map((fact) => ({
      source,
      context: fact.context || fact.value,
      score: queryTokens.reduce((score, token) => {
        const contextMatch = String(fact.context || "").toLowerCase().includes(token) ? 3 : 0;
        const titleMatch = String(source.title || "").toLowerCase().includes(token) ? 5 : 0;
        return score + contextMatch + titleMatch;
      }, Math.max(0, 5 - sourceIndex) * 2
        + (/@/.test(fact.context || "") && /\d{3}[-.)\s]\d{3}/.test(fact.context || "") ? 3 : 0)
        - (/^FAQs?\b/i.test(source.title || "") ? 5 : 0)),
    })));
  return candidates.sort((a, b) => b.score - a.score)[0] || null;
}

function bestContactContext(question, sources) {
  const best = bestContactCandidate(question, sources);
  if (!best) return "";
  if (/\b(?:email|phone|call|number)\b/i.test(question)) return best.context || "";

  // A generic “who do I contact?” asks for the useful contact card, not just
  // whichever structured fact happened to score first. Select the strongest
  // phone and email from the same official source so both stay tied to the
  // requested service and unrelated page-footer contacts do not leak in.
  const queryTokens = tokens(question).filter((token) => !["call", "contact", "email", "phone", "who"].includes(token));
  const values = ["phone", "email"].map((type) => (best.source.facts || [])
    .filter((fact) => fact.type === type)
    .map((fact) => ({
      fact,
      score: queryTokens.reduce((score, token) => score + (String(fact.context || "").toLowerCase().includes(token) ? 3 : 0), 0)
        + (/AmCoBi/i.test(best.context || "") && /AmCoBi/i.test(fact.context || "") ? 5 : 0),
    }))
    .sort((a, b) => b.score - a.score)[0]?.fact?.context)
    .filter(Boolean);
  return values.join(" ") || best.context || "";
}

function contactDirectAnswer(sentence, sourceTitle, question = "", source = {}) {
  const text = String(sentence || "").replace(/at::/gi, "at:").replace(/please completed\b/gi, "please complete");
  const wantsEmailOnly = /\bemail\b/i.test(question) && !/\b(?:phone|call|number)\b/i.test(question);
  const wantsPhoneOnly = /\b(?:phone|call|number)\b/i.test(question) && !/\bemail\b/i.test(question);
  const phone = wantsEmailOnly ? "" : text.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/)?.[0];
  const email = wantsPhoneOnly ? "" : text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  if (!phone && !email) return text;
  const requestedSubject = String(question).match(/\b(?:contact|call|email)(?:\s+\w+){0,4}\s+(?:about|regarding|for)\s+(.+?)[?.!]*$/i)?.[1]
    || String(question).match(/\b(?:phone number|email)\s+(?:should i use\s+)?for\s+(.+?)[?.!]*$/i)?.[1];
  const label = requestedSubject || sourceTitle;
  if (/\bwater billing\b/i.test(question) && /AmCoBi/i.test(text)) {
    const company = /American Conservation and Billing Solutions/i.test(String(source.text || source.excerpt || ""))
      ? "American Conservation and Billing Solutions (AmCoBi)"
      : "AmCoBi";
    return `For water billing, contact ${company}: ${[phone ? `call ${phone}` : "", email ? `email ${email}` : ""].filter(Boolean).join(" or ")}.`;
  }
  return `For ${label}, ${[phone ? `call ${phone}` : "", email ? `email ${email}` : ""].filter(Boolean).join(" or ")}.`;
}

function extractiveAnswer(question, result, options = {}) {
  let sources = result.sources.map(sourceForDisplay);
  if (!sources.length || Number(sources[0].score || 0) < 24) {
    return buildAnswerContract({
      directAnswer: "I could not verify that from the connected official community sources.",
      nextStep: "Try adding the service, facility, form, or rule you mean, or use the official community website below.",
      sources: result.index ? [{ title: `${result.index.communityName} official website`, sourceUrl: result.index.website, text: "Official community website", excerpt: "Official community website", isOfficialResource: true }] : [],
      status: "could-not-verify",
      answerMode: "community-no-source",
    });
  }
  const recurringSchedule = unanchoredRecurringScheduleAnswer(question, { ...result, sources });
  if (recurringSchedule) return recurringSchedule;
  if (result.requestedDetails.includes("contact")) {
    const contactCandidate = bestContactCandidate(question, sources);
    if (contactCandidate?.source) sources = [contactCandidate.source];
  }
  const sentences = usefulSentences(question, sources, 3);
  const scheduleFacts = sources.flatMap((source) => (source.facts || []).filter((fact) => fact.type === "schedule"));
  const operationalSourceLink = result.requestedDetails.some((detail) => ["contact", "date", "hours"].includes(detail));
  const actions = (operationalSourceLink || result.intent === "events") && sources[0]?.sourceUrl
    ? [{ label: `Open official ${sources[0].title}`, url: sources[0].sourceUrl, actionType: "information" }]
    : relevantActions(question, sources, 3, options.routingPlan);
  const covered = coveredDetails(result.requestedDetails, sources, actions);
  const complete = covered.length === result.requestedDetails.length;
  const directAnswer = options.preferredAction
    ? `Use “${options.preferredAction.label}” below. ${sentences[0] || "The linked official source contains the current instructions."}`
    : result.requestedDetails.includes("date") && scheduleFacts.length
    ? `The official ${sources[0].title} schedule depends on your village or service area.`
    : result.intent === "events" && actions.length
    ? `Use the official ${sources[0].title} link below to find current community events.`
    : result.intent === "forms" && actions.length
    ? `Use the official ${sources[0].title} source below to open the current form or application.`
    : result.requestedDetails.includes("contact") && (bestContactContext(question, sources) || sentences[0])
      ? contactDirectAnswer(bestContactContext(question, sources) || sentences[0], sources[0].title, question, sources[0])
    : sentences[0] || `The official ${sources[0].title} page is the closest current source for this question.`;
  const keyDetails = result.requestedDetails.includes("date") && scheduleFacts.length
    ? scheduleFacts.slice(0, 3).map((fact) => fact.value)
    : result.requestedDetails.includes("contact")
    ? []
    : result.intent === "forms"
      ? sentences.filter((sentence) => !/DRC design review architectural application/i.test(sentence)).slice(0, 2)
      : sentences.slice(1);
  const draft = { directAnswer, keyDetails };
  const claims = claimsFromDraft(draft, sources);
  const stale = sources.some((source) => source.staleAfter && new Date(source.staleAfter).getTime() < Date.now());
  return buildAnswerContract({
    directAnswer,
    keyDetails,
    nextStep: actions[0] ? `Use the “${actions[0].label}” link below for the current next step.` : `Open the official ${sources[0].title} page below for the current details.`,
    actions,
    sources,
    status: complete && !stale && claims.every((claim) => claim.verified) ? "verified" : "verified-incomplete",
    requestedDetails: result.requestedDetails,
    coveredDetails: covered,
    checkedAt: sources[0].checkedAt,
    answerMode: "community-source-extractive",
    claims,
    ...(options.routingPlan ? { routingPlan: options.routingPlan, routingDecision: "ai-planned" } : {}),
  });
}

function directlyAnswersQuestionForm(question, draft) {
  const direct = String(draft?.directAnswer || "").trim();
  if (!direct) return false;
  if (/^how\s+(?:do|can|should|would|may)\b/i.test(question)) {
    if (/^(?:yes|no)\b/i.test(direct)) return false;
    if (!/\b(?:open|click|select|choose|visit|go to|start|book|reserve|submit|email|call|log in|sign in|register|use|bring|return|tell me)\b/i.test(direct)) return false;
  }
  if (/^(?:how much|what (?:does|will).{0,30}cost|what is the (?:cost|price))/i.test(question) && !/\$\d|\b(?:free|no charge)\b/i.test(direct)) return false;
  if (/^when\b/i.test(question)
    && !/\b(?:today|tomorrow|currently|now|morning|afternoon|evening|day|week|month|year|time|schedule|pickup|collection|a\.m\.|p\.m\.|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(direct)) return false;
  return true;
}

function proactiveCompositionSources(proactive) {
  const sources = proactive.sources || [];
  if (!sources.length) return [];
  const factBrief = [
    proactive.directAnswer,
    ...(proactive.keyDetails || []),
    proactive.nextStep,
  ].filter(Boolean).join("\n");
  return [{
    ...sources[0],
    text: `Verified answer facts assembled from the cited official sources:\n${factBrief}`,
    excerpt: factBrief,
    actions: proactive.actions || sources[0].actions || [],
  }, ...sources.slice(1)];
}

async function composeProactiveAnswer(question, proactive, options = {}) {
  const synthesize = options.synthesizeCommunityAnswer === false ? null : (options.synthesizeCommunityAnswer || defaultSynthesize);
  if (!synthesize || !(proactive.sources || []).length) return proactive;
  const evidenceSources = proactiveCompositionSources(proactive);
  const draft = await synthesize(question, evidenceSources, options.llmOptions || {});
  const verified = verifyStructuredDraft(draft, evidenceSources, { question });
  if (!verified.valid || !directlyAnswersQuestionForm(question, verified.draft)) return proactive;
  return buildAnswerContract({
    directAnswer: verified.draft.directAnswer,
    keyDetails: verified.draft.keyDetails,
    nextStep: verified.draft.nextStep || proactive.nextStep,
    actions: proactive.actions,
    sources: proactive.sources,
    status: proactive.answerStatus,
    checkedAt: proactive.checkedAt,
    answerMode: "community-proactive-grounded-ai",
    claims: verified.claims,
  });
}

async function sourcedAnswer(question, result, options = {}) {
  const sources = result.sources.map(sourceForDisplay);
  if (!sources.length || Number(sources[0].score || 0) < 24) return extractiveAnswer(question, result, options);
  const recurringSchedule = unanchoredRecurringScheduleAnswer(question, { ...result, sources });
  if (recurringSchedule) return recurringSchedule;
  const conflicts = detectFactConflicts(sources, result.requestedDetails);
  if (conflicts.length) {
    return buildAnswerContract({
      directAnswer: "I found conflicting values in the connected official sources, so I can’t safely choose one for you.",
      nextStep: `Open the official ${sources[0].title} source below or contact the CAB to confirm the current value.`,
      actions: relevantActions(question, sources, 3, options.routingPlan),
      sources,
      status: "conflicting-sources",
      conflicts,
      requestedDetails: result.requestedDetails,
      answerMode: "community-source-conflict",
    });
  }

  // Contact details are exact structured facts, not prose for a model to
  // interpret. Keep phone numbers and email addresses on the deterministic
  // path so a grounded synthesis cannot accidentally omit or paraphrase them.
  if (result.requestedDetails.includes("contact")) {
    return extractiveAnswer(question, result);
  }

  const actions = relevantActions(question, sources, 3, options.routingPlan);
  const covered = coveredDetails(result.requestedDetails, sources, actions);
  const stale = sources.some((source) => source.staleAfter && new Date(source.staleAfter).getTime() < Date.now());
  const synthesize = options.synthesizeCommunityAnswer === false ? null : (options.synthesizeCommunityAnswer || defaultSynthesize);
  const aiDraft = synthesize ? await synthesize(question, sources, { ...(options.llmOptions || {}), routingPlan: options.routingPlan || null }) : null;
  if (!aiDraft) return extractiveAnswer(question, result, options);
  return buildAnswerContract({
    directAnswer: aiDraft.directAnswer,
    keyDetails: aiDraft.keyDetails,
    nextStep: aiDraft.nextStep || (actions[0] ? `Use the “${actions[0].label}” link below for the current next step.` : `Open the official ${sources[0].title} page below for the current details.`),
    actions,
    sources,
    status: covered.length === result.requestedDetails.length && !stale ? "verified" : "verified-incomplete",
    requestedDetails: result.requestedDetails,
    coveredDetails: covered,
    checkedAt: sources[0].checkedAt,
    answerMode: aiDraft.answerMode || "community-grounded-ai",
    claims: aiDraft.claims,
    ...(options.routingPlan ? { routingPlan: options.routingPlan, routingDecision: "ai-planned" } : {}),
  });
}

function poolStatusAnswer(status) {
  return { ...buildAnswerContract({
    directAnswer: `${status.headline}. ${status.summary}`,
    keyDetails: status.stale ? ["The latest refresh failed, so this may be an older status."] : [],
    nextStep: status.residentAction,
    actions: [{ label: "Open official pool status", url: status.actionUrl || status.sourceUrl, actionType: "status" }],
    sources: [{ title: "Official CAB pool status", sourceUrl: status.sourceUrl, text: `${status.headline}. ${status.summary}`, excerpt: status.summary, authorityScore: 1, checkedAt: status.checkedAt, isOfficialResource: true }],
    status: status.stale ? "verified-incomplete" : "verified",
    checkedAt: status.checkedAt,
    answerMode: "community-live-status",
  }), _connectorDiagnostics: { sourceOutcome: status.stale ? "partial" : "ok", beforeFilterCount: 1, afterFilterCount: 1, appliedFilters: [] } };
}

function eventsAnswer(result) {
  const eventDetail = (event) => {
    const time = event.time ? new Date(`2000-01-01T${event.time}:00`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
    return `${event.title}: ${event.date}${time ? ` at ${time}` : ""}${event.location ? `, ${event.location}` : ""}.`;
  };
  const details = result.events.map(eventDetail);
  const diagnostics = result.diagnostics || {};
  const calendarSource = { title: "Official Sterling Ranch Calendar", sourceUrl: result.sourceUrl, text: "Official current community calendar", excerpt: "Official current community calendar", authorityScore: 1, checkedAt: result.checkedAt, isOfficialResource: true };
  if (!details.length) {
    if (!diagnostics.parserHealthy) {
      return { ...buildAnswerContract({
        directAnswer: `I could not reliably read the official calendar for ${result.range.label}.`,
        nextStep: "Open the official calendar below before making plans.",
        actions: [{ label: "Open official community calendar", url: result.sourceUrl, actionType: "calendar" }],
        sources: [calendarSource],
        status: "source-unavailable",
        checkedAt: result.checkedAt,
        answerMode: "community-live-events",
      }), _connectorDiagnostics: diagnostics };
    }
    if (diagnostics.appliedFilters?.length && result.alternatives?.length) {
      const filterLabel = diagnostics.appliedFilters.map((filter) => filter.value).join(" and ");
      const alternatives = result.alternatives.map(eventDetail);
      return { ...buildAnswerContract({
        directAnswer: `I did not find an event matching “${filterLabel}” for ${result.range.label}, but the official calendar has ${result.alternatives.length} other ${result.alternatives.length === 1 ? "event" : "events"}.`,
        keyDetails: alternatives,
        nextStep: "Open the calendar or one of the listed events to review the full details.",
        actions: [
          ...result.alternatives.map((event) => ({ label: event.title, url: event.url, actionType: "event" })),
          { label: "Open official community calendar", url: result.sourceUrl, actionType: "calendar" },
        ],
        sources: [calendarSource, ...result.alternatives.map((event) => ({ title: event.title, sourceUrl: event.url, text: eventDetail(event), excerpt: eventDetail(event), authorityScore: 1, checkedAt: result.checkedAt, isOfficialResource: true }))],
        status: "verified",
        checkedAt: result.checkedAt,
        answerMode: "community-live-events",
      }), _connectorDiagnostics: diagnostics };
    }
    return { ...buildAnswerContract({
      directAnswer: `The official calendar does not list an event for ${result.range.label}.`,
      nextStep: "Open the official calendar below to check for newly added events.",
      actions: [{ label: "Open official community calendar", url: result.sourceUrl, actionType: "calendar" }],
      sources: [calendarSource],
      status: "verified",
      checkedAt: result.checkedAt,
      answerMode: "community-live-events",
    }), _connectorDiagnostics: diagnostics };
  }
  return { ...buildAnswerContract({
    directAnswer: `I found ${details.length} official calendar ${details.length === 1 ? "event" : "events"} for ${result.range.label}.`,
    keyDetails: details,
    nextStep: "Open an event link below for its full details and any registration instructions.",
    actions: result.events.map((event) => ({ label: event.title, url: event.url, actionType: "event" })),
    sources: result.events.map((event) => ({ title: event.title, sourceUrl: event.url, text: `${event.title} ${event.startDate} ${event.location}`, excerpt: `${event.date} ${event.time} ${event.location}`, authorityScore: 1, checkedAt: result.checkedAt, isOfficialResource: true })),
    status: diagnostics.parserHealthy === false ? "verified-incomplete" : "verified",
    checkedAt: result.checkedAt,
    answerMode: "community-live-events",
  }), _connectorDiagnostics: diagnostics };
}

function fallbackStructuredInterpretation(question, intent, options = {}) {
  const details = requestedDetails(question);
  const goal = intent === "status" ? "status"
    : intent === "events" ? "schedule"
      : details.includes("permission") ? "permission"
        : details.includes("price") ? "cost"
          : details.includes("contact") ? "contact"
            : details.includes("date") ? "schedule"
            : "information";
  return normalizeInterpretation({
    intent,
    goal,
    goals: [goal],
    subject: question,
    requestedDetails: details,
    filters: {},
    searchQueries: [question],
    scope: "community",
    needsClarification: false,
    clarificationQuestion: "",
  }, question, options);
}

function interpretationFields(plan, outcome, mode, extra = {}) {
  return {
    routingPlan: plan,
    routingDecision: outcome === "ai" ? "ai-planned" : "structured-fallback",
    _interpretation: {
      mode,
      outcome,
      clarificationReason: plan?.needsClarification ? "model-requested-clarification" : "",
      appliedFilters: Object.entries(plan?.filters || {}).filter(([, value]) => value).map(([field, value]) => ({ field, value })),
      ...extra,
    },
  };
}

function structuredClarification(plan, mode, outcome) {
  return {
    ...buildAnswerContract({
      directAnswer: plan.clarificationQuestion,
      nextStep: "Add that detail and I’ll check the appropriate official source.",
      status: "could-not-verify",
      answerMode: "targeted-clarification",
    }),
    inputClassification: "unclear",
    confidence: { canAnswer: false, confidence: "high", reason: "clarification-needed" },
    reviewNeeded: false,
    ...interpretationFields(plan, outcome, mode),
  };
}

async function answerCommunityQuestionCore(query, options = {}) {
  const question = normalizeInput(query);
  if (hasPromptInjectionSignals(question)) {
    const rejected = buildAnswerContract({
      directAnswer: "I can help with community questions, but I can’t follow instructions that try to change my safeguards or reveal private information.",
      nextStep: "Ask about a community rule, service, form, facility, event, or current status instead.",
      status: "safety-rejected",
      answerMode: "safety",
    });
    return {
      ...rejected,
      inputClassification: "prompt-injection",
      reviewNeeded: false,
      confidence: { ...rejected.confidence, reason: "prompt-injection-rejected" },
    };
  }
  if (!question) {
    return buildAnswerContract({ directAnswer: "What would you like to know about the community?", status: "could-not-verify", answerMode: "conversation" });
  }
  const classifiedInput = classifyRulesInput(question);
  if (classifiedInput.classification === INPUT_CLASSIFICATIONS.CONVERSATION) {
    const conversation = buildAnswerContract({ directAnswer: "Hi! Ask me about community rules, services, forms, facilities, events, or current status.", status: "out-of-scope", answerMode: "conversation" });
    return {
      ...conversation,
      inputClassification: "conversation",
      confidence: { ...conversation.confidence, reason: "conversation-not-rule-question" },
      reviewNeeded: false,
    };
  }
  if (
    classifiedInput.classification === INPUT_CLASSIFICATIONS.UNCLEAR
    && /^(?:what about (?:that|this|it|them|those)|please help|help me|can i|can we|could i|is it allowed|may i)[?.!\s]*$/i.test(question)
  ) {
    const clarification = buildAnswerContract({
      directAnswer: "What would you like help with in the community?",
      nextStep: "Add the rule, service, facility, form, or activity you mean—for example, “Can I build a shed?” or “How do I reserve a park shelter?”",
      status: "could-not-verify",
      answerMode: "conversation",
    });
    return {
      ...clarification,
      inputClassification: INPUT_CLASSIFICATIONS.UNCLEAR,
      confidence: { canAnswer: false, confidence: "high", reason: "unclear-input" },
      reviewNeeded: false,
    };
  }
  if (/^(?:can|could|may|should|would)\s+(?:i|we|you)(?:\s+please)?[!.?\s]*$/i.test(question)) {
    return { ...buildAnswerContract({
      directAnswer: "What would you like permission or help to do?",
      nextStep: "Add the activity, facility, service, or rule you mean—for example, “Can I build a shed?” or “Can I reserve a park shelter?”",
      status: "could-not-verify",
      answerMode: "conversation",
    }), inputClassification: "unclear" };
  }

  const intent = classifyCommunityIntent(question);
  const interpretationMode = resolveInterpretationMode(options.interpretationMode);
  let searchPlan = null;
  let routingPlan = null;
  let interpretationOutcome = "legacy";
  let shadowPlan = null;
  const asksForAction = requestedDetails(question).includes("action");
  const looksLikeCompleteQuestion = /\?\s*$/.test(question)
    && question.trim().split(/\s+/).length >= 4
    && !/\b(?:section|sec\.?|article)\s*[\w.-]+/i.test(question);
  const shouldInterpret = interpretationMode === "structured"
    || interpretationMode === "shadow"
    || asksForAction
    || looksLikeCompleteQuestion;
  if (shouldInterpret && options.planCommunitySearch !== false) {
    const planner = options.planCommunitySearch || defaultPlanSearch;
    searchPlan = await planner(question, options.llmOptions || {});
    const interpreted = normalizedRoutingPlan(searchPlan, question, { now: options.now });
    if (interpretationMode === "shadow") shadowPlan = interpreted;
    else routingPlan = interpreted;
    if (routingPlan) interpretationOutcome = "ai";
  }
  if (interpretationMode === "structured" && !routingPlan) {
    routingPlan = fallbackStructuredInterpretation(question, intent, { now: options.now });
    interpretationOutcome = "fallback";
  }
  if (routingPlan?.scope === "unrelated") {
    const unrelated = buildAnswerContract({
      directAnswer: "I can help with Sterling Ranch rules and official community information, but I can’t verify that unrelated request from those sources.",
      nextStep: "Ask about a community rule, service, form, facility, event, pool status, or food truck instead.",
      status: "out-of-scope",
      answerMode: "conversation",
    });
    return { ...unrelated, reviewNeeded: false, ...interpretationFields(routingPlan, interpretationOutcome, interpretationMode) };
  }
  if (routingPlan?.needsClarification) {
    return structuredClarification(routingPlan, interpretationMode, interpretationOutcome);
  }
  if (options._interpretationState) {
    options._interpretationState.mode = interpretationMode;
    options._interpretationState.outcome = interpretationOutcome;
    options._interpretationState.plan = routingPlan;
    options._interpretationState.shadowPlan = shadowPlan;
  }

  const proactive = proactiveCommunityAnswer(question, { index: options.index, now: options.now, routingPlan });
  if (proactive) return {
    ...await composeProactiveAnswer(question, proactive, options),
    communityIntent: routingPlan?.intent || intent,
    ...(routingPlan ? { routingPlan, routingDecision: "ai-planned" } : {}),
  };

  // If the planner is unavailable, action questions still get a safe generic
  // transaction lookup. This does not decide a topic by phrase; it pairs the
  // highest-scoring official content with the highest-scoring configured
  // action returned by the same search.
  if (asksForAction && (!routingPlan || interpretationOutcome === "fallback")) {
    const fallbackResult = searchCommunityIndex(question, {
      index: options.index,
      indexPath: options.indexPath,
      communityId: options.communityId,
      intent,
      interpretation: routingPlan,
      limit: 20,
    });
    const originalContentSource = fallbackResult.sources.find((source) => source.connectorType !== "official-action");
    const actionSource = fallbackResult.sources.find((source) => source.connectorType === "official-action");
    // Page-level links may sit beside unrelated forms. When the AI planner is
    // down, expose only the deliberately configured official action selected
    // by retrieval instead of guessing among neighboring page links.
    const contentSource = originalContentSource ? { ...originalContentSource, actions: [] } : null;
    const fallbackIds = new Set();
    fallbackResult.sources = [contentSource, actionSource].filter((source) => {
      if (!source || fallbackIds.has(source.id)) return false;
      fallbackIds.add(source.id);
      return true;
    });
    if (Number(fallbackResult.sources[0]?.score || 0) >= 36
      && actionSource
      && hasDistinctiveCommunityEvidence(question, fallbackResult.sources)) {
      const fallbackAnswer = await sourcedAnswer(question, fallbackResult, {
        ...options,
        preferredAction: actionSource.actions?.[0],
      });
      if (fallbackAnswer.confidence?.canAnswer && (fallbackAnswer.actions || []).length) {
        return {
          ...fallbackAnswer,
          communityIntent: intent,
          routingDecision: "official-action-fallback",
          routingFallbackReason: searchPlan ? "planner-route-unfulfilled" : "planner-unavailable-or-disabled",
        };
      }
    }
  }

  if (routingPlan && ACTION_GOALS.has(routingPlan.goal)) {
    const planned = searchCommunityIndexWithQueries(question, routingPlan.searchQueries, {
      index: options.index,
      indexPath: options.indexPath,
      communityId: options.communityId,
      intent: routingPlan.intent,
      interpretation: routingPlan,
      // Keep a wider candidate pool here because page chunks can otherwise
      // crowd the direct official action (pay, book, apply, register) out of
      // the small top-results window before goal verification runs.
      limit: 20,
    });
    planned.intent = routingPlan.intent;
    const goalSources = planned.sources.filter((source) => sourceSupportsGoal(source, routingPlan.goal));
    const contentSource = goalSources.find((source) => source.connectorType !== "official-action")
      || goalSources[0];
    const actionSource = goalSources.find((source) =>
      (source.actions || []).some((action) => actionSupportsGoal(action, routingPlan.goal))
    );
    const selectedIds = new Set();
    planned.sources = [contentSource, actionSource].filter((source) => {
      if (!source || selectedIds.has(source.id)) return false;
      selectedIds.add(source.id);
      return true;
    });
    if (Number(planned.sources[0]?.score || 0) >= 24 && hasDistinctiveCommunityEvidence(question, planned.sources)) {
      const plannedAnswer = await sourcedAnswer(question, planned, {
        ...options,
        routingPlan,
        preferredAction: actionSource?.actions?.[0],
      });
      if (plannedAnswer.confidence?.canAnswer && (plannedAnswer.actions || []).length) {
        return { ...plannedAnswer, communityIntent: routingPlan.intent, routingPlan, routingDecision: "ai-planned" };
      }
    }
  }

  const structuredActive = interpretationMode === "structured" && routingPlan;
  const foodTruckRequested = structuredActive ? isFoodTruckRequest(routingPlan) : isFoodTruckQuestion(question);
  if (foodTruckRequested && options.getFoodTruckAnswer) {
    try {
      return { ...foodTruckAnswer(await options.getFoodTruckAnswer(structuredActive ? routingPlan : question, question)), communityIntent: "food-trucks", _connectorDiagnostics: { sourceOutcome: "ok", appliedFilters: [], beforeFilterCount: null, afterFilterCount: null } };
    } catch {
      const unavailable = buildAnswerContract({
        directAnswer: "I could not check the live food-truck schedule just now.",
        nextStep: "Use the official Sterling Ranch calendar below before making plans.",
        actions: [{ label: "Open official community calendar", url: "https://sterlingranchcab.com/Calendar.aspx", actionType: "calendar" }],
        status: "source-unavailable",
        answerMode: "community-live-food-truck",
      });
      return { ...unavailable, communityIntent: "food-trucks", _connectorDiagnostics: { sourceOutcome: "unavailable", appliedFilters: [], beforeFilterCount: null, afterFilterCount: null } };
    }
  }

  const recyclingScheduleRequested = structuredActive
    ? routingPlan.goal === "schedule" && /\brecycl(?:e|ing)\b/i.test(routingPlan.subject)
    : needsExactRecurringDate(question);
  if (recyclingScheduleRequested && options.getWasteSchedule) {
    try {
      return { ...liveRecyclingScheduleAnswer(question, await options.getWasteSchedule()), communityIntent: "services" };
    } catch {
      if (options._interpretationState) options._interpretationState.connectorDiagnostics = { sourceOutcome: "unavailable", appliedFilters: [], beforeFilterCount: null, afterFilterCount: null };
      // Keep the indexed, source-grounded fallback available when the live
      // provider is temporarily unavailable.
    }
  }

  if (
    classifiedInput.classification === INPUT_CLASSIFICATIONS.UNRELATED
    && ["known-unrelated-topic", "person-identity"].includes(classifiedInput.reason)
  ) {
    const unrelated = buildAnswerContract({
      directAnswer: classifiedInput.reason === "person-identity"
        ? "I can verify official community information, but I can’t reliably identify or describe a person from the rulebook."
        : "I can help with Sterling Ranch rules and official community information, but I can’t verify that unrelated request from those sources.",
      nextStep: classifiedInput.reason === "person-identity"
        ? "Use the official CAB staff or board directory if you are trying to identify a community representative."
        : "Ask about a community rule, service, form, facility, event, pool status, or food truck instead.",
      status: "out-of-scope",
      answerMode: "conversation",
    });
    return {
      ...unrelated,
      answerVerdict: "informational",
      inputClassification: classifiedInput.classification,
      confidence: { canAnswer: false, confidence: "high", reason: "unrelated-not-rule-question" },
      reviewNeeded: false,
    };
  }

  let rulesFallback = null;
  const activeIntent = routingPlan?.intent || intent;
  if (activeIntent === "status" && options.getPoolStatus) {
    try { return poolStatusAnswer(await options.getPoolStatus()); } catch {
      if (options._interpretationState) options._interpretationState.connectorDiagnostics = { sourceOutcome: "unavailable", appliedFilters: [], beforeFilterCount: null, afterFilterCount: null };
    }
  }
  if (activeIntent === "events" && options.getCommunityEvents) {
    try { return eventsAnswer(await options.getCommunityEvents(structuredActive ? routingPlan : question)); } catch {
      if (structuredActive) {
        return { ...buildAnswerContract({
          directAnswer: "I could not check the official community calendar just now.",
          nextStep: "Open the official calendar below before making plans.",
          actions: [{ label: "Open official community calendar", url: "https://sterlingranchcab.com/Calendar.aspx", actionType: "calendar" }],
          status: "source-unavailable",
          answerMode: "community-live-events",
        }), communityIntent: "events", _connectorDiagnostics: { sourceOutcome: "unavailable", appliedFilters: [], beforeFilterCount: null, afterFilterCount: null } };
      }
    }
  }

  if (options.answerRulesQuestion) {
    const rulesOptions = { ...(options.rulesOptions || {}), interpretation: routingPlan || null };
    let rulesAnswer = await options.answerRulesQuestion(question, rulesOptions);
    rulesFallback = rulesAnswer;
    if (
      rulesAnswer?.inputClassification === INPUT_CLASSIFICATIONS.CONVERSATION
      || (
        rulesAnswer?.inputClassification === INPUT_CLASSIFICATIONS.UNRELATED
        && ["known-unrelated-topic", "person-identity"].includes(rulesAnswer?.confidence?.reason)
      )
    ) {
      return { ...rulesAnswer, answer: cleanAnswerText(rulesAnswer.answer), communityIntent: intent };
    }
    if (rulesAnswer?.answerMode === "targeted-clarification") {
      return { ...rulesAnswer, answer: cleanAnswerText(rulesAnswer.answer), communityIntent: intent };
    }
    if (rulesAnswer?.inputClassification === "unclear") {
      const communityEvidence = searchCommunityIndex(question, { index: options.index, indexPath: options.indexPath, communityId: options.communityId, intent: activeIntent, interpretation: routingPlan, limit: 5 });
      if (Number(communityEvidence.sources[0]?.score || 0) >= 24 && hasDistinctiveCommunityEvidence(question, communityEvidence.sources)) {
        const communityAnswer = await sourcedAnswer(question, communityEvidence, options);
        return { ...communityAnswer, communityIntent: intent };
      }
      return { ...safeRulesBoundaryAnswer(question, rulesAnswer, communityEvidence.index || options.index), communityIntent: intent };
    }
    if (/\b(?:section|sec\.?)[\s#]*(?:\d+-\d+|\d+)\b/i.test(question)) {
      return { ...rulesAnswer, answer: cleanAnswerText(rulesAnswer.answer), communityIntent: intent };
    }
    if ((!rulesAnswer?.confidence?.canAnswer || ["conversation", "safety"].includes(rulesAnswer.answerMode)) && intent === "facilities") {
      rulesAnswer = await options.answerRulesQuestion(
        `${question} Community facility rental reservation process fees application`,
          rulesOptions
      );
    }
    if (rulesAnswer?.confidence?.canAnswer && !["conversation", "safety"].includes(rulesAnswer.answerMode)) {
      const community = searchCommunityIndex(question, { index: options.index, indexPath: options.indexPath, communityId: options.communityId, intent: activeIntent, interpretation: routingPlan, limit: 3 });

      const exactOfficialPdf = directlyRelevantOfficialPdf(question, community.sources);
      const rulesCoverageIssues = rulesAnswer.qualityChecks?.issues || [];
      const requestedObjectMissing = rulesCoverageIssues.some((issue) => String(issue).startsWith("requested-object-missing:"));
      const rulesAdmitMissingAttribute = /\b(?:does not|doesn't|could not|couldn't)\b.{0,90}\b(?:provide|publish|expose|include|list|name|specify|state|reliable|searchable)\b|\bnot (?:available|found|provided|listed|named|specified)\b/i.test(String(rulesAnswer.answer || ""));
      const preferExactPdf = exactOfficialPdf && (
        rulesAdmitMissingAttribute
        || requestedObjectMissing
        || !rulesAnswerHasQuestionSpecificEvidence(question, rulesAnswer)
      );
      if (preferExactPdf || (requestedObjectMissing && hasDistinctiveCommunityEvidence(question, community.sources))) {
        const preferredSources = exactOfficialPdf ? [exactOfficialPdf] : community.sources;
        return {
          ...await sourcedAnswer(question, { ...community, sources: preferredSources }, options),
          communityIntent: intent,
        };
      }

      const requestedOperationalDetail = community.requestedDetails.some((detail) => ["contact", "date", "hours", "action"].includes(detail));
      const rulesAdmitsMissingDetail = /does not (?:give|include|list|provide|set|specify|state)|not found in the rulebook|use the .*instructions/i.test(String(rulesAnswer.answer || ""));
      const rulesMissesRequestedDetail = rulesCoverageIssues.some((issue) => /requested-(?:process|action|contact|date|hours)-missing/i.test(String(issue)));
      if (requestedOperationalDetail && (rulesAdmitsMissingDetail || rulesMissesRequestedDetail) && !isWasteStorageRuleQuestion(question) && Number(community.sources[0]?.score || 0) >= 36) {
        return { ...await sourcedAnswer(question, community, { ...options, routingPlan }), communityIntent: routingPlan?.intent || intent };
      }

      // The mature rules path may produce a plausible prose answer before the
      // broader community index is consulted. For contact questions, prefer
      // exact structured phone/email facts whenever the official community
      // source has them; those facts must outrank an earlier AI summary.
      if (
        community.requestedDetails.includes("contact")
        && !/@|(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/.test(String(rulesAnswer.answer || ""))
        && community.sources.some((source) => (source.facts || []).some((fact) => ["phone", "email"].includes(fact.type)))
      ) {
        return { ...extractiveAnswer(question, community), communityIntent: intent };
      }

      const aiOrganizedRulesAnswer = /\b(?:ai|llm)\b/i.test(String(rulesAnswer.answerMode || ""));
      const confidenceCameFromAi = /\b(?:ai|llm)\b|grounded/i.test(String(rulesAnswer.confidence?.reason || ""));
      if (
        requiresKnownRulesBoundary(question)
        || (aiOrganizedRulesAnswer && confidenceCameFromAi && !rulesAnswerHasQuestionSpecificEvidence(question, rulesAnswer))
      ) {
        return { ...safeRulesBoundaryAnswer(question, rulesAnswer, community.index || options.index), communityIntent: intent };
      }

      const extraSources = community.sources.map(sourceForDisplay);
      const officialRuleActions = (rulesAnswer.sources || [])
        .filter((source) => isOfficialCommunitySource(source) && /^https?:\/\//i.test(source.sourceUrl || ""))
        .map((source) => ({ label: `Open ${source.title}`, url: source.sourceUrl, actionType: /catalog/i.test(source.title) ? "booking" : "information" }))
        .sort((a, b) => Number(b.actionType === "booking") - Number(a.actionType === "booking"));
      // Community pages often contain unrelated calls to action in their
      // footer or neighboring sections. Do not add one to an already-grounded
      // rule answer unless it is the controlling rule source itself or the
      // resident explicitly asked how/where to take an action.
      const extraActions = officialRuleActions.length
        ? officialRuleActions.slice(0, 3)
        : community.requestedDetails.includes("action")
          ? relevantActions(question, extraSources, 3)
          : [];
      const mergedSources = [...(rulesAnswer.sources || []), ...extraSources].filter((source, index, all) =>
        all.findIndex((candidate) => (candidate.sourceUrl || candidate.title) === (source.sourceUrl || source.title)) === index
      );
      const mergedActions = [...(rulesAnswer.actions || []), ...extraActions].filter((action, index, all) =>
        action?.url && all.findIndex((candidate) => candidate?.url === action.url) === index
      );
      const completedRulesAnswer = { ...rulesAnswer, answer: cleanAnswerText(rulesAnswer.answer), answerStatus: "verified", sources: mergedSources, actions: mergedActions, communityIntent: intent };
      return enhanceProactiveRulesAnswer(question, completedRulesAnswer, { now: options.now });
    }
    if (intent === "rules") {
      return { ...safeRulesBoundaryAnswer(question, rulesAnswer, options.index), communityIntent: intent };
    }
  }

  let result = searchCommunityIndex(question, { index: options.index, indexPath: options.indexPath, communityId: options.communityId, intent: routingPlan?.intent || intent, interpretation: routingPlan });
  if ((!result.sources.length || Number(result.sources[0].score || 0) < 72)
    && options.planCommunitySearch !== false
    && interpretationMode !== "shadow") {
    const planner = options.planCommunitySearch || defaultPlanSearch;
    const plan = searchPlan || await planner(question, options.llmOptions || {});
    routingPlan = routingPlan || normalizedRoutingPlan(plan, question);
    if (plan?.searchQueries?.length) {
      result = searchCommunityIndexWithQueries(question, plan.searchQueries, {
        index: options.index,
        indexPath: options.indexPath,
        communityId: options.communityId,
        intent: plan.intent || intent,
        interpretation: routingPlan || plan,
      });
      result.intent = plan.intent || intent;
    }
  }
  const distinctiveEvidence = hasDistinctiveCommunityEvidence(question, result.sources);
  if ((!result.sources.length || Number(result.sources[0].score || 0) < 24 || !distinctiveEvidence) && rulesFallback) {
    if (/conversation|informational/i.test(`${rulesFallback.answerMode} ${rulesFallback.answerVerdict}`) && rulesFallback.inputClassification !== INPUT_CLASSIFICATIONS.UNCLEAR) {
      return { ...rulesFallback, communityIntent: intent };
    }
    return { ...safeRulesBoundaryAnswer(question, rulesFallback, result.index || options.index), communityIntent: intent };
  }
  const answer = await sourcedAnswer(question, result, { ...options, routingPlan });
  return { ...answer, communityIntent: result.intent || intent };
}

async function answerCommunityQuestion(query, options = {}) {
  const state = {};
  const answer = await answerCommunityQuestionCore(query, { ...options, _interpretationState: state });
  if (!state.plan && !state.shadowPlan) return answer;
  if (state.plan && !answer.routingPlan) {
    return { ...answer, ...interpretationFields(state.plan, state.outcome, state.mode), ...(state.connectorDiagnostics && !answer._connectorDiagnostics ? { _connectorDiagnostics: state.connectorDiagnostics } : {}) };
  }
  return {
    ...answer,
    ...(state.connectorDiagnostics && !answer._connectorDiagnostics ? { _connectorDiagnostics: state.connectorDiagnostics } : {}),
    _interpretation: {
      ...(answer._interpretation || {}),
      mode: state.mode,
      outcome: state.shadowPlan ? "shadow" : state.outcome,
      appliedFilters: Object.entries((state.plan || state.shadowPlan)?.filters || {}).filter(([, value]) => value).map(([field, value]) => ({ field, value })),
      shadowPlan: state.shadowPlan || undefined,
    },
  };
}

module.exports = { answerCommunityQuestion, bestContactContext, cleanAnswerText, composeProactiveAnswer, conciseRecurringSchedule, contactDirectAnswer, directlyAnswersQuestionForm, eventsAnswer, extractiveAnswer, liveRecyclingScheduleAnswer, poolStatusAnswer, relevantActions, sourcedAnswer, unanchoredRecurringScheduleAnswer, usefulSentences };

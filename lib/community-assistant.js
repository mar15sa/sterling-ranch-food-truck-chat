const { buildAnswerContract, detectFactConflicts } = require("./community-contracts");
const { answerStatusForCompletion, resolveAnswerCompletion } = require("./community-completion");
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
const { shortcutEligibility } = require("./community-shortcut-eligibility");
const { isFreshnessTrackedSource } = require("./community-source-identity");
const { INPUT_CLASSIFICATIONS, classifyRulesInput, hasPromptInjectionSignals, normalizeInput } = require("./rules-input");
const { isStateParksPassQuestion } = require("./rules-intent");

function sourceForDisplay(source) {
  return {
    ...source,
    nodeId: source.nodeId || `COMMUNITY_${String(source.id || "SOURCE").toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`,
    sourceName: source.sourceName || "Official community website",
    isOfficialResource: true,
  };
}

function withheldSourceAnswer(source, intent, requested = []) {
  const requestedDetails = [...new Set(requested)].filter(Boolean);
  const requestedLabel = requestedDetails.map(detailLabel).join(" and ");
  const unavailable = buildAnswerContract({
    directAnswer: requestedLabel
      ? `I could not safely confirm the ${requestedLabel} from approved, up-to-date CAB information.`
      : "I could not safely confirm the current value from approved, up-to-date CAB information.",
    nextStep: "Check the controlling official page below while its information is being reconfirmed.",
    actions: [{ label: `Open ${source.title || "the controlling official source"}`, url: source.sourceUrl, actionType: "information" }],
    sources: [sourceForDisplay(source)],
    status: "source-unavailable",
    requestedDetails,
    coveredDetails: [],
    answerMode: "community-freshness-withheld",
    confidence: { level: "low", score: 0, reason: "source-review-required" },
  });
  return { ...unavailable, communityIntent: intent, authorityDecision: "freshness-withheld" };
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

function exactOperationalFacilitySource(question, sources = []) {
  const normalized = String(question).toLowerCase().replace(/pickle\s+ball/g, "pickleball");
  if (!/\b(?:court|pickleball|tennis|pool|clubhouse|pavilion|shelter|facility|amenity|recreation)\b/i.test(normalized)) return null;
  if (/\b(?:build|construct|install|private|backyard|on my (?:lot|property)|drc|approval|prohibited|fine|violation)\b/i.test(normalized)) return null;
  const subject = tokens(normalized).filter((token) => token.length >= 5 && !GENERIC_PROJECT_TERMS.has(token));
  return sources.find((source) =>
    source.sourceType === "facilities"
    && subject.some((token) => `${source.title || ""} ${source.text || ""}`.toLowerCase().includes(token))
  ) || null;
}

function pickleballFacilityAnswer(source) {
  const text = String(source.text || "").replace(/\s+/g, " ").trim();
  if (!/\bPickleball Courts\b/i.test(source.title || "") || !/Weekdays\s+7\s*am-dusk/i.test(text)) return null;
  const officialSource = sourceForDisplay(source);
  const reservationAction = (source.actions || []).find((action) => /Court\s*Reserve/i.test(`${action.label} ${action.url}`));
  const directAnswer = "Sterling Ranch’s pickleball courts are open weekdays from 7 a.m. to dusk and weekends from 8 a.m. to dusk, with both reservations and drop-in play.";
  const keyDetails = [
    "Reservations are limited to two hours per day. Residents can reserve seven days ahead; non-residents can reserve three days ahead.",
    "Residents play free. Non-residents pay $40 per court for up to four players, or $20 for two players during open play.",
    "Open play is 7–11 a.m. and 5–8 p.m. weekdays, and 8–11 a.m. and 5–8 p.m. weekends. Reservation hours are 11 a.m.–5 p.m.",
  ];
  return buildAnswerContract({
    directAnswer,
    keyDetails,
    nextStep: "Use the CAB CourtReserve page to reserve a court or set up your account; review the linked facility page for play, weather, age, and rotation rules.",
    actions: reservationAction ? [reservationAction] : [],
    sources: [officialSource],
    claims: [directAnswer, ...keyDetails].map((claim) => ({ text: claim, evidenceSourceIds: [officialSource.id] })),
    requestedDetails: ["hours", "action", "price"],
    coveredDetails: ["hours", "action", "price"],
    status: "verified",
    checkedAt: source.checkedAt,
    answerMode: "community-facility-operations",
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
    [/\b(?:color|colour|paint|stain|finish(?:es)?)\b/i, /\b(?:color|colour|paint|stain|finish(?:es|ed|ing)?)\b/i],
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
  let confidenceReason = rulesAnswer.confidence?.reason || "no-exact-official-evidence";

  if (/\bremove\b.{0,30}\btrees?\b|\btrees?\b.{0,30}\bremove\b/i.test(text)) {
    directAnswer = "I could not verify blanket permission to remove a tree.";
    keyDetails = ["The current rules say dead trees must be replaced.", "A design change to the tree lawn requires DRC approval."];
    nextStep = "Confirm the tree’s location and condition with the DRC before removing it.";
    sources = (rulesAnswer.sources || []).filter((source) => /tree|landscape maintenance/i.test(source.title || "")).slice(0, 3);
    if (!sources.length) sources = [officialCabHomepage()];
  } else if (/\bfood\s*trucks?\b/i.test(text) && /\b(?:driveway|run|operate|business)\b/i.test(text)) {
    directAnswer = "I could not verify a Sterling Ranch rule that specifically allows operating a food-truck business from a residential driveway.";
    nextStep = "Confirm both CAB rules and Douglas County business requirements before operating or parking a commercial food truck at a home.";
    confidenceReason = "no-food-truck-specific-rule";
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
    confidenceReason = "missing-requested-contact-info";
  }

  const boundary = buildAnswerContract({
    directAnswer,
    keyDetails,
    nextStep,
    actions,
    sources,
    status: "could-not-verify",
    requestedDetails: requestedDetails(question),
    answerMode: "community-rules-boundary",
  });
  return {
    ...boundary,
    answerVerdict: "unverified",
    inputClassification: rulesAnswer.inputClassification || "rules-question",
    confidence: { canAnswer: false, confidence: "high", reason: confidenceReason },
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

function asksBindingRule(question = "", routingPlan = null) {
  if (routingPlan?.intent === "rules" || routingPlan?.requestedDetails?.includes("permission")) return true;
  return /\b(?:allowed|allow|permission|prohibited|prohibit|approval|required|requirement|rule|regulation|violation|may I|can I)\b/i.test(question);
}

function actionForGoal(source = {}, goal = "") {
  return (source.actions || []).find((action) => actionSupportsGoal(action, goal)) || null;
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
  const actionStopWords = new Set(["a", "an", "and", "are", "at", "can", "do", "does", "for", "from", "how", "i", "in", "is", "it", "me", "my", "of", "on", "or", "the", "to", "we", "what", "where", "with", ...generic]);
  // Use the resident's literal topic words here, not search expansions. An
  // expansion such as “rent” -> “facility” made an unrelated download look
  // relevant to a pool-rental fee question.
  const coreTokens = [...new Set((String(question).toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g) || [])
    .filter((token) => token.length > 2 && !actionStopWords.has(token)))];
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
  const actions = sources.flatMap((source) => {
    const sourceActions = source.actions || [];
    return sourceActions.map((action) => ({
      ...action,
      sourceTitle: source.title || "",
      sourceEvidence: `${source.title || ""} ${source.text || ""} ${source.excerpt || ""}`.toLowerCase(),
      sourceActionCount: sourceActions.length,
      explicitAction: source.connectorType === "official-action",
    }));
  });
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
      // A generic form label can still be the correct next step when it is
      // the only action attached to a page whose own evidence names the
      // resident's literal topic. Do not apply that exception to multi-action
      // pages, where a generic word such as “fee” can otherwise leak an
      // unrelated download into a pool-rental answer.
      coreMatch: !coreTokens.length || coreTokens.some((token) => action.actionText.includes(token))
        || (action.sourceActionCount === 1 && coreTokens.some((token) => action.sourceEvidence.includes(token))),
    }))
    .filter((action) => action.coreMatch && (action.score > 0 || actions.length === 1))
    .sort((a, b) => b.score - a.score)
    .filter((action, index, all) => all.findIndex((candidate) => candidate.url === action.url) === index)
    .slice(0, limit)
    .map(({ score, coreMatch, sourceTitle, sourceEvidence, sourceActionCount, explicitAction, actionText, ...action }) => action);
  if (ranked.length) return ranked;
  if (routingPlan?.goal && ACTION_GOALS.has(routingPlan.goal)) return [];
  const top = sources[0];
  return top?.sourceUrl ? [{ label: `Open official ${top.title}`, url: top.sourceUrl, actionType: "information" }] : [];
}

function isWastePickupScheduleRequest(question = "", plan = null) {
  const text = `${question} ${plan?.subject || ""} ${(plan?.searchQueries || []).join(" ")}`;
  if (!/\b(?:trash|garbage|recycling|waste)\b/i.test(text)) return false;
  if (/\b(?:bins?|cans?|carts?|containers?|curb|store|stored|storage|bring\s+(?:it|them|the)|put\s+(?:it|them|the))\b/i.test(question)) return false;
  return /\b(?:week|next|date|today|tomorrow|pickup|pick up|collection|schedule|delayed|delay|holiday)\b/i.test(text)
    || /\bwhen\s+(?:is|are)\s+(?:the\s+)?(?:next\s+)?(?:trash|garbage|recycling)\b/i.test(text);
}

function needsExactRecurringDate(question = "") {
  return /\brecycling\b/i.test(question) && isWastePickupScheduleRequest(question);
}

function liveWasteScheduleAnswer(question, schedule) {
  const service = schedule.service === "garbage" ? "trash" : "recycling";
  const requestedVillage = schedule.villageDates.find(({ village }) =>
    new RegExp(`\\b${village.replace(/ Village$/i, "")}\\b`, "i").test(question)
  );
  const dates = requestedVillage ? [requestedVillage] : schedule.villageDates;
  const asksAboutDelay = /\b(?:delayed?|delay|holiday|labor\s+day)\b/i.test(question);
  const directAnswer = asksAboutDelay && schedule.holidayNote
    ? `The official pickup calendar flags a holiday schedule: ${schedule.holidayNote} The listed ${service} dates are below by village.`
    : requestedVillage
      ? `${requestedVillage.village}'s next ${service} pickup is ${formatDate(requestedVillage.date)}—${schedule.timing}.`
      : `${service[0].toUpperCase()}${service.slice(1)} pickup is ${schedule.timing}. The next dates are listed below by village.`;
  const keyDetails = dates.map(({ village, date }) => `${village}: ${formatDate(date)}`);
  if (schedule.holidayNote) keyDetails.push(schedule.holidayNote);
  const sources = [{
    id: "waste-connections-live-calendar",
    title: "Waste Connections live pickup calendar",
    sourceUrl: schedule.sourceUrl || WASTE_CONNECTIONS_SCHEDULE_URL,
    text: `The live calendar lists ${service} for ${schedule.anchorDate}. ${schedule.holidayNote || ""}`.trim(),
    excerpt: `Upcoming ${service} service anchored on ${formatDate(schedule.anchorDate)}.`,
    checkedAt: schedule.checkedAt,
    authorityScore: 1,
    isOfficialResource: true,
  }, {
    id: "sterling-ranch-trash-recycling-schedule",
    title: "Sterling Ranch Trash & Recycling schedule",
    sourceUrl: "https://sterlingranchcab.com/247/Trash-Recycling",
    text: "Official village pickup weekdays and 7 a.m. bin instructions.",
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
    answerMode: `community-live-${service}`,
  }), _connectorDiagnostics: { sourceOutcome: "ok", beforeFilterCount: schedule.villageDates?.length || 0, afterFilterCount: dates.length, appliedFilters: requestedVillage ? [{ field: "location", value: requestedVillage.village }] : [] } };
}

const liveRecyclingScheduleAnswer = liveWasteScheduleAnswer;

function supportsKnownLiveCommunityRequest(question = "", plan = {}) {
  const text = `${question} ${plan.subject || ""} ${(plan.searchQueries || []).join(" ")}`;
  const goals = new Set([plan.goal, ...(plan.goals || [])]);
  const foodTruck = /\bfood\s*trucks?\b/i.test(text)
    && ["schedule", "status", "cost", "information"].some((goal) => goals.has(goal))
    && isFoodTruckQuestion(question);
  const wasteSchedule = isWastePickupScheduleRequest(question, plan)
    && ["schedule", "status", "information"].some((goal) => goals.has(goal));
  return foodTruck || wasteSchedule;
}

function normalizeKnownLiveCommunityPlan(question = "", plan = {}) {
  if (!supportsKnownLiveCommunityRequest(question, plan)) return plan;
  const text = `${question} ${plan.subject || ""} ${(plan.searchQueries || []).join(" ")}`;
  // The planner sometimes calls a future schedule or holiday-delay question
  // “status.”  The goal and date remain useful, but the connector contracts
  // need the stable service intent. Restrict this correction to explicit
  // food-truck and pickup wording; no broad scope or intent rewrite occurs.
  const foodTruck = /\bfood\s*trucks?\b/i.test(text);
  const intent = foodTruck ? "events" : "services";
  // A live food-truck listing is a dated schedule, even when a planner calls
  // a resident's “who is here today?” wording a status request. Normalize the
  // connector family once here so its eligibility and answer checks use the
  // same semantics. The raw-question business guard above prevents rules
  // questions about operating a truck from reaching this path.
  const goal = foodTruck && plan.goal === "status" ? "schedule" : plan.goal;
  const goals = foodTruck
    ? [...new Set((plan.goals || [plan.goal]).map((item) => item === "status" ? "schedule" : item).filter(Boolean))]
    : plan.goals;
  return { ...plan, intent, goal, goals, scope: "community", needsClarification: false, clarificationQuestion: "" };
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

function coveredDetails(requested, sources, actions, question = "") {
  const facts = sources.flatMap((source) => source.facts || []);
  return requested.filter((detail) => {
    if (detail === "action") return actions.length > 0;
    if (detail === "price") return facts.some((fact) => fact.type === "money");
    if (detail === "contact") return facts.some((fact) => ["phone", "email"].includes(fact.type));
    if (detail === "date") return facts.some((fact) => ["date", "schedule"].includes(fact.type)) || sources.some((source) => source.sourceType === "events");
    if (detail === "hours") return !/\bholidays?\b/i.test(question) && facts.some((fact) => fact.type === "time");
    if (detail === "status") return sources.some((source) => source.connectorType === "live-status" && source.sourceType === "status");
    if (detail === "specification") return sources.some((source) => (source.authorityFacets || []).includes("specification"));
    if (detail === "methods") return facts.some((fact) => fact.facet === "method");
    return false;
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

function missingRequestedOrganization(question, sources = []) {
  const requestedOrganizations = [...new Set(String(question).match(/\b[A-Z]{2,8}\b/g) || [])];
  const evidence = sources.map((source) => `${source.title || ""} ${source.text || source.excerpt || ""}`).join(" ");
  return requestedOrganizations.find((organization) => !new RegExp(`\\b${organization}\\b`, "i").test(evidence)) || "";
}

function missingContactAnswer(organization, routingPlan) {
  const contactDirectory = {
    title: "Official Sterling Ranch contact directory",
    sourceUrl: "https://sterlingranchcab.com/324/Important-Contact-Information",
    text: "Official Sterling Ranch CAB Important Contact Information directory.",
    excerpt: "Official Sterling Ranch CAB Important Contact Information directory.",
    isOfficialResource: true,
  };
  const boundary = buildAnswerContract({
    directAnswer: `I could not verify an official ${organization} phone number from the connected official sources.`,
    nextStep: "Use the official CAB contact directory rather than an unrelated service number.",
    actions: [{ label: "Open official CAB contact directory", url: contactDirectory.sourceUrl, actionType: "contact" }],
    sources: [contactDirectory],
    status: "could-not-verify",
    answerMode: "community-contact-boundary",
  });
  return {
    ...boundary,
    inputClassification: "rules-question",
    confidence: { canAnswer: false, confidence: "high", reason: "missing-requested-contact-info" },
    reviewNeeded: false,
    ...(routingPlan ? { routingPlan, routingDecision: "ai-planned" } : {}),
  };
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
  if (result.requestedDetails.includes("contact") || options.routingPlan?.goal === "contact") {
    const missingOrganization = missingRequestedOrganization(question, sources);
    if (missingOrganization) return missingContactAnswer(missingOrganization, options.routingPlan);
    const contactCandidate = bestContactCandidate(question, sources);
    if (contactCandidate?.source) sources = [contactCandidate.source];
  }
  const sentences = usefulSentences(question, sources, 3);
  const scheduleFacts = sources.flatMap((source) => (source.facts || []).filter((fact) => fact.type === "schedule"));
  const operationalSourceLink = result.requestedDetails.some((detail) => ["contact", "date", "hours"].includes(detail));
  const actions = (operationalSourceLink || result.intent === "events") && sources[0]?.sourceUrl
    ? [{ label: `Open official ${sources[0].title}`, url: sources[0].sourceUrl, actionType: "information" }]
    : relevantActions(question, sources, 3, options.routingPlan);
  const covered = coveredDetails(result.requestedDetails, sources, actions, question);
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
  const stale = sources.some((source) => isFreshnessTrackedSource(source)
    && source.staleAfter && new Date(source.staleAfter).getTime() < Date.now());
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

function approvedOperationalProjectionAnswer(question, result, options = {}) {
  const sources = (result.sources || []).filter((source) => source.canonicalScopedProjection);
  if (!sources.length) return null;
  const actions = relevantActions(question, sources, 3, options.routingPlan);
  const preferredAction = options.preferredAction || actions[0];
  if (options.routingPlan?.goal && ACTION_GOALS.has(options.routingPlan.goal) && !preferredAction) return null;
  const displayedSources = sources.map(sourceForDisplay);
  const displayedIds = new Set(displayedSources.map((source) => source.id));
  const details = displayedSources.flatMap((source) => (source.facts || []).map((fact) => ({
    text: String(fact.context || "").trim(),
    sourceId: source.id,
  }))).filter((detail) => detail.text && displayedIds.has(detail.sourceId));
  const groupedDetails = [];
  for (const detail of details) {
    const current = groupedDetails[groupedDetails.length - 1];
    if (current && current.sourceId === detail.sourceId && `${current.text} ${detail.text}`.length <= 400) {
      current.text = `${current.text} ${detail.text}`;
    } else if (groupedDetails.length < 3) groupedDetails.push({ ...detail });
  }
  const actionEvidenceSourceIds = preferredAction ? displayedSources.filter((source) => (source.actions || []).some((action) =>
    (preferredAction.id && action.id === preferredAction.id) || action.url === preferredAction.url
  )).map((source) => source.id) : [];
  const directDetail = preferredAction ? null : groupedDetails.shift();
  const directAnswer = preferredAction
    ? `Use “${preferredAction.label}” below to continue.`
    : directDetail?.text || `Open the official ${displayedSources[0].title} source below.`;
  const covered = coveredDetails(result.requestedDetails, displayedSources, preferredAction ? [preferredAction] : [], question);
  if (covered.length !== result.requestedDetails.length) return null;
  const directEvidenceSourceIds = preferredAction ? actionEvidenceSourceIds : directDetail ? [directDetail.sourceId] : [];
  if (!directEvidenceSourceIds.length) return null;
  const answer = buildAnswerContract({
    directAnswer,
    keyDetails: groupedDetails.map((detail) => detail.text),
    nextStep: preferredAction ? `Open “${preferredAction.label}” below.` : `Open the official ${displayedSources[0].title} source below.`,
    actions: preferredAction ? [preferredAction] : [],
    sources: displayedSources,
    status: "verified",
    requestedDetails: result.requestedDetails,
    coveredDetails: covered,
    checkedAt: displayedSources[0].checkedAt,
    answerMode: "community-approved-operational",
    claims: [
      { text: directAnswer, evidenceSourceIds: directEvidenceSourceIds },
      ...groupedDetails.map((detail) => ({ text: detail.text, evidenceSourceIds: [detail.sourceId] })),
    ],
    ...(options.routingPlan ? { routingPlan: options.routingPlan, routingDecision: "ai-planned" } : {}),
  });
  if (answer.confidence?.canAnswer !== true) return null;
  return {
    ...answer,
    authorityDecision: "exact-version-approved-claims",
  };
}

function approvedOperationalActionAnswer(question, routingPlan, options = {}) {
  if (!routingPlan || !ACTION_GOALS.has(routingPlan.goal)) return null;
  const result = searchCommunityIndexWithQueries(question, routingPlan.searchQueries, {
    index: options.index,
    indexPath: options.indexPath,
    communityId: options.communityId,
    intent: routingPlan.intent,
    interpretation: routingPlan,
    allowPartialRequestedDetails: true,
    limit: 20,
    now: options.now,
  });
  result.intent = routingPlan.intent;
  const approvedSources = result.sources.filter((source) => source.canonicalScopedProjection);
  const goalSources = approvedSources.filter((source) => sourceSupportsGoal(source, routingPlan.goal));
  const actionSource = goalSources.find((source) => source.canonicalScopedProjection
    && (source.actions || []).some((action) => actionSupportsGoal(action, routingPlan.goal))
  );
  const preferredAction = actionForGoal(actionSource, routingPlan.goal);
  const requested = routingPlan.requestedDetails || [];
  const selectedSources = [actionSource];
  for (const detail of requested) {
    if (coveredDetails([detail], selectedSources.filter(Boolean), preferredAction ? [preferredAction] : [], question).includes(detail)) continue;
    const supportingSource = approvedSources.find((source) => coveredDetails([detail], [source], (source.actions || []).filter((action) => actionSupportsGoal(action, routingPlan.goal)), question).includes(detail));
    if (supportingSource) selectedSources.push(supportingSource);
  }
  const selectedIds = new Set();
  result.sources = selectedSources.filter((source) => {
    if (!source || selectedIds.has(source.id)) return false;
    selectedIds.add(source.id);
    return true;
  });
  if (Number(result.sources[0]?.score || 0) < 24 || !hasDistinctiveCommunityEvidence(question, result.sources)) return null;
  return approvedOperationalProjectionAnswer(question, result, { ...options, routingPlan, preferredAction });
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
  // Proactive answers are already assembled from exact, validated facts and
  // action links. Keep that complete answer deterministic by default instead
  // of adding a second model round-trip after interpretation. Tests or future
  // callers can still opt in by supplying an explicit synthesis function.
  const synthesize = typeof options.synthesizeCommunityAnswer === "function"
    ? options.synthesizeCommunityAnswer
    : null;
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

function dateWeekday(date = "") {
  const value = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(value.getTime()) ? value.getUTCDay() : -1;
}

function datedFacilityHoursAnswer(question, result, options = {}) {
  const plan = options.routingPlan;
  if (!plan?.dateRange?.start || !plan.requestedDetails?.includes("hours")) return null;
  const suppliedNow = options.now ?? Date.now();
  const answerNow = typeof suppliedNow === "string" ? Date.parse(suppliedNow) : Number(suppliedNow);
  const weekday = dateWeekday(plan.dateRange.start);
  if (weekday < 0) return null;
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const labels = weekday === 6 ? ["Saturday", "Weekends"] : weekday === 0 ? ["Sunday", "Weekends"] : [dayNames[weekday], "Monday-Friday", "Monday to Friday", "Weekdays"];
  for (const source of result.sources || []) {
    const stale = isFreshnessTrackedSource(source) && source.staleAfter && new Date(source.staleAfter).getTime() < answerNow;
    const dateLabel = formatDate(plan.dateRange.start);
    if (stale) {
      // A stale source needs no access to its old prose to produce the safe
      // response. This lets the freshness reason win before claim withholding.
      const citation = sourceForDisplay({
        id: source.id,
        title: source.title,
        sourceUrl: source.sourceUrl,
        checkedAt: source.checkedAt,
        staleAfter: source.staleAfter,
        authorityScore: source.authorityScore,
      });
      return buildAnswerContract({
        directAnswer: `I can’t currently confirm the published facility hours for ${dateLabel}.`,
        keyDetails: ["The official facility page is awaiting a fresh source check."],
        nextStep: "Open the official facility page below for the latest hours and closure notices before you go.",
        actions: [{ label: `Open official ${source.title}`, url: source.sourceUrl, actionType: "information" }],
        sources: [citation],
        status: "could-not-verify",
        confidence: { level: "low", score: 0, reason: "source-stale" },
        requestedDetails: plan.requestedDetails,
        coveredDetails: [],
        checkedAt: source.checkedAt,
        answerMode: "community-dated-facility-hours-stale",
      });
    }
    const text = String(source.text || source.excerpt || "").replace(/\s+/g, " ").trim();
    const labelPattern = (item) => item === "Monday-Friday" ? "Monday\\s*[-–]\\s*Friday" : item.replace(/ /g, "\\s+");
    const label = labels.find((item) => new RegExp(`\\b${labelPattern(item)}\\s*:`, "i").test(text));
    if (!label) continue;
    const start = text.search(new RegExp(`\\b${labelPattern(label)}\\s*:`, "i"));
    const laterLabels = label === dayNames[weekday]
      ? [...dayNames.filter((item) => item !== label), "Guest Passes", "Rules to Remember"]
      : weekday === 6 ? ["Sunday"] : weekday === 0 ? ["Guest Passes", "Rules to Remember"] : ["Saturday"];
    const tail = text.slice(start);
    const endMatches = laterLabels.map((item) => tail.search(new RegExp(`\\b${item.replace(/ /g, "\\s+")}\\b`, "i"))).filter((index) => index > 0);
    let segment = tail.slice(0, endMatches.length ? Math.min(...endMatches) : 700);
    // A weekday block can name a narrower Tuesday/Thursday maintenance slot.
    // It is not evidence for Monday, Wednesday, or Friday.
    if (weekday !== 2 && weekday !== 4) segment = segment.replace(/Tuesday\s*(?:&|and)\s*Thursday\s*[-:]?\s*[^.]*?\./i, "");
    const times = segment.match(/\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)/gi) || [];
    if (!times.length) continue;
    const sourceForAnswer = sourceForDisplay(source);
    const holidayLabel = /holiday|labor day|memorial day|independence day/i.test(plan.dateRange.label || question);
    const detail = segment.replace(/\s+/g, " ").trim();
    const labelForResident = /^(?:Monday-Friday|Monday to Friday|Weekdays)$/i.test(label) ? "weekday" : label;
    const directAnswer = `For ${dateLabel}, the published ${labelForResident.toLowerCase()} hours are: ${detail}`;
    const holidayNote = holidayLabel
      ? "The official page does not publish separate holiday hours, so this uses the schedule for that weekday."
      : "These are the published hours for that weekday.";
    return buildAnswerContract({
      directAnswer,
      keyDetails: [holidayNote],
      nextStep: "Check the official facility page for current closure notices before you go.",
      actions: [{ label: `Open official ${source.title}`, url: source.sourceUrl, actionType: "information" }],
      sources: [sourceForAnswer],
      status: "verified",
      requestedDetails: plan.requestedDetails,
      coveredDetails: ["hours", "date"],
      checkedAt: source.checkedAt,
      answerMode: "community-dated-facility-hours",
      claims: [{ text: directAnswer, evidenceSourceIds: [sourceForAnswer.id] }],
    });
  }
  return null;
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
  const datedHours = datedFacilityHoursAnswer(question, result, options);
  if (datedHours) return datedHours;

  // Contact details are exact structured facts, not prose for a model to
  // interpret. Keep phone numbers and email addresses on the deterministic
  // path so a grounded synthesis cannot accidentally omit or paraphrase them.
  if (result.requestedDetails.includes("contact") || options.routingPlan?.goal === "contact") {
    const missingOrganization = missingRequestedOrganization(question, sources);
    if (missingOrganization) return missingContactAnswer(missingOrganization, options.routingPlan);
    return extractiveAnswer(question, result);
  }

  const actions = relevantActions(question, sources, 3, options.routingPlan);
  const covered = coveredDetails(result.requestedDetails, sources, actions, question);
  const stale = sources.some((source) => isFreshnessTrackedSource(source)
    && source.staleAfter && new Date(source.staleAfter).getTime() < Date.now());
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

function authoritySourceId(source = {}) {
  return source.id || source.nodeId || source.sourceUrl || source.title;
}

async function bindingSpecificationAnswer(question, rulesAnswer, specificationSource, options = {}) {
  const ruleSources = (rulesAnswer.sources || []).filter((source) => /library\.municode\.com/i.test(source.sourceUrl || ""));
  if (!ruleSources.length || !specificationSource) return null;
  const scopedRuleSources = ruleSources.slice(0, 2).map((source) => ({
    ...sourceForDisplay(source),
    authorityFacets: ["permission"],
  }));
  const scopedSpecificationSource = {
    ...sourceForDisplay(specificationSource),
    authorityFacets: ["specification"],
  };
  const sources = [...scopedRuleSources, scopedSpecificationSource].filter((source, index, all) =>
    all.findIndex((candidate) => authoritySourceId(candidate) === authoritySourceId(source)) === index
  );
  const synthesize = options.synthesizeCommunityAnswer === false ? null : (options.synthesizeCommunityAnswer || defaultSynthesize);
  if (!synthesize) return null;
  const draft = await synthesize(question, sources, { ...(options.llmOptions || {}), routingPlan: options.routingPlan || null });
  const verified = verifyStructuredDraft(draft, sources, { question, routingPlan: options.routingPlan });
  if (!verified.valid || !directlyAnswersQuestionForm(question, verified.draft)) return null;
  const directSentences = verified.draft.directAnswer.split(/(?<=[.!?])\s+/).filter(Boolean);
  const permissionText = directSentences.filter((sentence) => /\b(?:yes|no|allowed|permitted|prohibited|approval|permission|may|must|cannot|can't)\b/i.test(sentence)).join(" ");
  const specificationText = directSentences.filter((sentence) => /#[0-9]{2,}\b|\b(?:color|colour|paint|stain|finish|material|height|size|dimension|setback|distance)\b/i.test(sentence)).join(" ");
  const permissionClaims = claimsFromDraft({ directAnswer: permissionText }, scopedRuleSources);
  const specificationClaims = claimsFromDraft({ directAnswer: specificationText }, [scopedSpecificationSource]);
  if (!permissionText || !specificationText
    || !permissionClaims.length || permissionClaims.some((claim) => !claim.verified)
    || !specificationClaims.length || specificationClaims.some((claim) => !claim.verified)) return null;
  const requested = options.routingPlan?.requestedDetails || requestedDetails(question);
  const covered = requested.filter((detail) => ["permission", "specification"].includes(detail));
  const actions = [...(rulesAnswer.actions || []), ...relevantActions(question, [scopedSpecificationSource], 2, options.routingPlan)]
    .filter((action, index, all) => action?.url && all.findIndex((candidate) => candidate?.url === action.url) === index);
  const composed = buildAnswerContract({
    directAnswer: verified.draft.directAnswer,
    keyDetails: verified.draft.keyDetails,
    nextStep: verified.draft.nextStep || rulesAnswer.nextStep,
    actions,
    sources,
    status: covered.length === requested.length ? "verified" : "verified-incomplete",
    requestedDetails: requested,
    coveredDetails: covered,
    checkedAt: scopedSpecificationSource.checkedAt,
    answerMode: "community-per-facet-grounded-ai",
    claims: verified.claims,
  });
  return {
    ...composed,
    answerVerdict: composed.answerStatus === "verified" ? rulesAnswer.answerVerdict : "unverified",
    qualityChecks: { requestedFacetCoverage: composed.completion?.outcome === "complete", issues: [] },
    authorityDecision: "per-facet-rule-and-specification",
    facetAuthority: {
      permission: scopedRuleSources.map(authoritySourceId),
      specification: [authoritySourceId(scopedSpecificationSource)],
    },
    claimAuthorityBoundary: {
      bindingClaim: "rulebook-only",
      supportingEvidence: "specification-only",
      completion: "per-facet",
    },
  };
}

function poolStatusAnswer(status, requested = ["status"]) {
  const requestedDetails = Array.isArray(requested) && requested.length ? [...new Set(requested)] : ["status"];
  const coveredDetails = requestedDetails.includes("status") ? ["status"] : [];
  return { ...buildAnswerContract({
    directAnswer: `${status.headline}. ${status.summary}`,
    keyDetails: status.stale ? ["The latest refresh failed, so this may be an older status."] : [],
    nextStep: status.residentAction,
    actions: [{ label: "Open official pool status", url: status.actionUrl || status.sourceUrl, actionType: "status" }],
    sources: [{ title: "Official CAB pool status", sourceUrl: status.sourceUrl, text: `${status.headline}. ${status.summary}`, excerpt: status.summary, authorityScore: 1, checkedAt: status.checkedAt, isOfficialResource: true, connectorType: "live-status", sourceType: "status", capabilities: ["status"] }],
    status: status.stale ? "verified-incomplete" : "verified",
    requestedDetails,
    coveredDetails,
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
      const filterLabel = [...new Set(diagnostics.appliedFilters.map((filter) => filter.value))].join(" and ");
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
      : intent === "forms" && details.includes("action") ? "application"
        : intent === "facilities" && details.includes("action") ? "booking"
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
      requestedDetails: plan.requestedDetails,
      completionEvidence: {
        ambiguous: true,
        clarification: {
          question: plan.clarificationQuestion,
          detailKey: plan.requestedDetails?.[0] || "",
          rationale: "The requested detail changes which official source or action applies.",
        },
        nextBestMove: { type: "answer-follow-up", label: plan.clarificationQuestion },
      },
    }),
    inputClassification: "unclear",
    confidence: { canAnswer: false, confidence: "high", reason: "clarification-needed" },
    reviewNeeded: false,
    ...interpretationFields(plan, outcome, mode),
  };
}

const COVERAGE_ISSUE_DETAILS = [
  ["price", /requested-price-missing/],
  ["permission", /direct-permission-answer-missing/],
  ["action", /requested-(?:process|action|resource)-missing/],
  ["contact", /requested-contact-missing/],
  ["date", /requested-date-missing/],
  ["hours", /requested-hours-missing/],
  ["specification", /requested-(?:color|colour|paint|stain|finish|material|height|size|dimension|setback|distance|specification)-missing/],
  ["examples", /requested-examples-missing/],
];

function hasAuthoritativePermissionDecision(answer) {
  const hasControllingRuleSource = (answer?.sources || []).some((source) =>
    source.sourceType === "rules" || /library\.municode\.com/i.test(source.sourceUrl || "")
  );
  return answer?.confidence?.canAnswer === true
    && ["allowed", "prohibited", "conditional"].includes(answer.answerVerdict)
    && hasControllingRuleSource
    && (answer.controllingSourceOnly === true || answer.authorityDecision === "rulebook-controls-binding-claim");
}

function hasAuthoritativeSpecification(answer) {
  const text = String(answer?.answer || "");
  const explicitlyScoped = (answer?.sources || []).some((source) => (source.authorityFacets || []).includes("specification"));
  const governingRuleSource = (answer?.sources || []).some((source) =>
    source.sourceType === "rules" || /library\.municode\.com/i.test(source.sourceUrl || "")
  );
  const explicitNoNumericLimit = /\b(?:current\s+)?(?:rule|code|standard|amendment)\b.{0,100}\b(?:does not|doesn't)\s+(?:set|specify|establish|impose)\b.{0,80}\b(?:numeric|maximum|minimum|height|size|dimension|setback|distance|limit)\b/i.test(text);
  const rendered = /#[0-9]{2,}\b|\b(?:\d+(?:[ -]\d+\/\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s*(?:feet|foot|inches|inch|ft\.?|in\.?)\b|\b(?:color|colour|paint|stain|finish|material|height|size|dimension|setback|distance)\b.{0,180}\b(?:approved|required|requires|must|match|prohibited|not allowed|no more than|at least|feet|foot|inches|#[0-9]{2,})\b/i.test(text);
  const admittedMissing = /\b(?:does not|doesn't|could not|couldn't)\b.{0,100}\b(?:provide|publish|expose|include|list|name|specify|state|set|identify)\b.{0,80}\b(?:color|colour|paint|stain|finish|material|height|size|dimension|setback|distance|product|maximum|limit)\b|\bwithout\b.{0,80}\b(?:identifying|listing|naming|specifying|stating)\b.{0,80}\b(?:color|colour|paint|stain|finish|material|height|size|dimension|setback|distance|product|maximum|limit)\b/i.test(text);
  return answer?.confidence?.canAnswer === true
    && ((governingRuleSource && explicitNoNumericLimit) || ((explicitlyScoped || governingRuleSource) && rendered && !admittedMissing));
}

function alreadyExplainsMissingSpecification(answer = "") {
  return /\b(?:does not|doesn't|could not|couldn't)\b.{0,100}\b(?:provide|publish|expose|include|list|name|specify|state|set|identify)\b.{0,100}\b(?:color|colour|paint|stain|finish|material|height|size|dimension|setback|distance|product|maximum|limit)\b|\bwithout\b.{0,80}\b(?:identifying|listing|naming|specifying|stating)\b.{0,100}\b(?:color|colour|paint|stain|finish|material|height|size|dimension|setback|distance|product|maximum|limit)\b/i.test(String(answer));
}

function missingDetailsFromQuality(requested, issues = [], answer = {}) {
  return requested.filter((detail) => {
    if (detail === "permission" && hasAuthoritativePermissionDecision(answer)) return false;
    if (detail === "specification") return !hasAuthoritativeSpecification(answer);
    const matcher = COVERAGE_ISSUE_DETAILS.find(([key]) => key === detail)?.[1];
    return matcher && issues.some((issue) => matcher.test(String(issue)));
  }).map((key) => ({ key, reason: "no-current-authoritative-source" }));
}

function detailLabel(key) {
  return ({
    price: "current fee or price",
    permission: "permission or approval requirement",
    action: "official application or action",
    contact: "current contact information",
    date: "current date",
    hours: "current hours",
    status: "current status",
    specification: "requested color, finish, material, or dimension",
    methods: "requested methods or options",
    examples: "requested examples",
  })[key] || String(key).replace(/-/g, " ");
}

function renderPartialGap(answer, completion) {
  const current = String(answer || "");
  if (!["verified-partial", "missing-evidence"].includes(completion?.outcome) || !completion.missingDetails.length
    || /\b(?:could not|couldn't|cannot|can't)\b.{0,100}\b(?:verify|confirm)\b/i.test(current)
    || (completion.missingDetails.every((detail) => detail.key === "specification") && alreadyExplainsMissingSpecification(current))) return current;
  const missingSentence = `I could not verify the ${completion.missingDetails.map((detail) => detailLabel(detail.key)).join(" and ")} from the cited current authoritative evidence.`;
  const move = completion.nextBestMove.label
    ? `Use “${completion.nextBestMove.label}” below to confirm it before acting.`
    : "Ask the CAB to confirm it before acting.";
  return `${cleanAnswerText(current)}\n\nStill to confirm: ${missingSentence} ${move}`;
}

function ensureAnswerCompletion(question, answer) {
  if (!answer || ["safety-rejected", "out-of-scope"].includes(answer.answerStatus)) return answer;
  if (answer.completion) {
    const requested = requestedDetails(question);
    if (requested.length && !answer.completion.requestedDetails?.length && answer.confidence?.canAnswer === false) {
      const nextAction = (answer.actions || [])[0];
      const completion = resolveAnswerCompletion({
        requestedDetails: requested,
        resolvedDetails: [],
        evidenceUnavailable: true,
        nextBestMove: nextAction
          ? { type: "official-action", label: nextAction.label, actionId: nextAction.id || "", url: nextAction.url }
          : {},
      });
      return { ...answer, completion, answer: renderPartialGap(answer.answer, completion) };
    }
    return { ...answer, answer: renderPartialGap(answer.answer, answer.completion) };
  }
  const requested = requestedDetails(question);
  const issues = answer.qualityChecks?.issues || [];
  const missingDetails = missingDetailsFromQuality(requested, issues, answer);
  const blocked = ["source-unavailable", "could-not-verify", "conflicting-sources"].includes(answer.answerStatus)
    || answer.confidence?.canAnswer === false;
  const resolved = blocked ? [] : requested.filter((key) => !missingDetails.some((detail) => detail.key === key));
  const nextAction = (answer.actions || [])[0];
  const nextSource = (answer.sources || []).find((source) => /^https?:\/\//i.test(source.sourceUrl || ""));
  const completion = resolveAnswerCompletion({
    requestedDetails: requested,
    resolvedDetails: resolved,
    missingDetails,
    conflicts: answer.conflicts || [],
    blockers: answer.answerStatus === "conflicting-sources" ? [{ type: "source-conflict", detailKeys: requested }] : [],
    ambiguous: answer.inputClassification === INPUT_CLASSIFICATIONS.UNCLEAR,
    evidenceUnavailable: blocked,
    clarification: answer.inputClassification === INPUT_CLASSIFICATIONS.UNCLEAR
      ? { question: answer.directAnswer || String(answer.answer || "").split("\n")[0], detailKey: requested[0] || "", rationale: "The request needs one resident-provided detail." }
      : {},
    nextBestMove: nextAction
      ? { type: "official-action", label: nextAction.label, actionId: nextAction.id || "", url: nextAction.url }
      : nextSource ? { type: "official-source", label: `Open ${nextSource.title}`, url: nextSource.sourceUrl } : {},
  });
  const answerStatus = answerStatusForCompletion(completion, answer.answerStatus || (answer.confidence?.canAnswer ? "verified" : "could-not-verify"));
  const renderedAnswer = renderPartialGap(answer.answer, completion);
  const qualityChecks = hasAuthoritativePermissionDecision(answer) && requested.includes("permission")
    ? {
        ...(answer.qualityChecks || {}),
        requestedFacetCoverage: completion.outcome === "complete",
        issues: issues.filter((issue) => !/direct-permission-answer-missing/.test(String(issue))),
      }
    : answer.qualityChecks;
  return {
    ...answer,
    answer: renderedAnswer,
    answerStatus,
    answerVerdict: answerStatus === "verified" ? answer.answerVerdict : "unverified",
    ...(qualityChecks ? { qualityChecks } : {}),
    completion,
    confidence: {
      ...(answer.confidence || {}),
      canAnswer: ["complete", "verified-partial"].includes(completion.outcome),
      ...(completion.outcome === "verified-partial" ? { reason: "requested-details-incomplete" } : {}),
    },
  };
}

function recordShortcutRejection(options, kind, decision) {
  if (!options._interpretationState || decision.eligible) return;
  const prior = options._interpretationState.connectorDiagnostics?.shortcutRejections || [];
  options._interpretationState.connectorDiagnostics = {
    sourceOutcome: "ineligible",
    appliedFilters: [],
    beforeFilterCount: null,
    afterFilterCount: null,
    shortcutRejections: [...prior, { connector: kind, reasons: decision.reasons }],
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
  const stateParksPassQuestion = isStateParksPassQuestion(question);
  if (stateParksPassQuestion) {
    routingPlan = {
      ...(routingPlan || fallbackStructuredInterpretation(question, "rules", { now: options.now })),
      intent: "rules",
      scope: "community",
      needsClarification: false,
      clarificationQuestion: "",
    };
  }
  if (routingPlan && supportsKnownLiveCommunityRequest(question, routingPlan)) {
    // The planner may preserve the right service, goal, and date while
    // mistakenly assigning a broad scope label. Known live community
    // services are only promoted when their narrow connector contract also
    // matches the resident wording; this never turns a generic unrelated
    // request into a community answer.
    routingPlan = normalizeKnownLiveCommunityPlan(question, routingPlan);
  }
  if (
    routingPlan?.scope === "unrelated" &&
    !stateParksPassQuestion
  ) {
    const unrelated = buildAnswerContract({
      directAnswer: "I can help with Sterling Ranch rules and official community information, but I can’t verify that unrelated request from those sources.",
      nextStep: "Ask about a community rule, service, form, facility, event, pool status, or food truck instead.",
      status: "out-of-scope",
      answerMode: "conversation",
    });
    return {
      ...unrelated,
      answerVerdict: "informational",
      inputClassification: "unrelated",
      confidence: { canAnswer: false, confidence: "high", reason: "unrelated-not-rule-question" },
      reviewNeeded: false,
      ...interpretationFields(routingPlan, interpretationOutcome, interpretationMode),
    };
  }
  if (options._interpretationState) {
    options._interpretationState.mode = interpretationMode;
    options._interpretationState.outcome = interpretationOutcome;
    options._interpretationState.plan = routingPlan;
    options._interpretationState.shadowPlan = shadowPlan;
  }
  const shortcutPlan = routingPlan || fallbackStructuredInterpretation(question, intent, { now: options.now });

  const approvedActionAnswer = approvedOperationalActionAnswer(question, routingPlan, options);
  if (approvedActionAnswer) {
    return { ...approvedActionAnswer, communityIntent: routingPlan.intent, routingPlan, routingDecision: "ai-planned" };
  }

  const proactive = proactiveCommunityAnswer(question, { index: options.index, now: options.now, routingPlan });
  if (proactive) {
    const proactiveDecision = shortcutEligibility("proactive", { question, plan: shortcutPlan, candidate: proactive });
    if (proactiveDecision.eligible) {
      const composed = await composeProactiveAnswer(question, proactive, options);
      const composedDecision = shortcutEligibility("proactive", {
        question,
        plan: shortcutPlan,
        candidate: { ...composed, answerMode: proactive.answerMode },
      });
      if (composedDecision.eligible) return {
        ...composed,
        communityIntent: routingPlan?.intent || intent,
        ...(routingPlan ? { routingPlan, routingDecision: "ai-planned" } : {}),
      };
      recordShortcutRejection(options, "proactive", composedDecision);
    }
    recordShortcutRejection(options, "proactive", proactiveDecision);
  }

  // A model clarification is provisional. If the established, source-grounded
  // rules path recognizes a complete question, let it try to answer before we
  // ask the resident to repeat themselves. Questions that do not have a known
  // official-information signal still clarify immediately, so vague references
  // such as "How do I book it?" do not trigger guessed retrieval.
  const pendingStructuredClarification = routingPlan?.needsClarification
    && classifiedInput.classification === INPUT_CLASSIFICATIONS.RULES_QUESTION
    ? routingPlan
    : null;
  if (routingPlan?.needsClarification && !pendingStructuredClarification) {
    return structuredClarification(routingPlan, interpretationMode, interpretationOutcome);
  }

  // These negative controls have deliberately reviewed, source-safe boundary
  // answers. Interpretation has already run; do not send the same question
  // through a second AI-assisted rules planner only to reach the identical
  // boundary after another timeout.
  if (requiresKnownRulesBoundary(question)) {
    return {
      ...safeRulesBoundaryAnswer(question, {}, options.index),
      communityIntent: routingPlan?.intent || intent,
      ...(routingPlan ? { routingPlan, routingDecision: "ai-planned" } : {}),
    };
  }

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
    const actionSource = fallbackResult.sources.find((source) => source.connectorType === "official-action" || source.canonicalScopedProjection);
    const fallbackGoal = [...ACTION_GOALS].find((goal) => actionForGoal(actionSource, goal));
    const fallbackAction = actionForGoal(actionSource, fallbackGoal);
    const actionLabelTerms = String(fallbackAction?.label || "").toLowerCase()
      .match(/[a-z0-9]+/g)?.filter((term) => term.length >= 8) || [];
    const brandedContentSource = fallbackResult.sources.find((source) =>
      source.connectorType !== "official-action"
      && actionLabelTerms.some((term) => `${source.title || ""} ${source.text || ""}`.toLowerCase().includes(term))
    );
    const originalContentSource = brandedContentSource || fallbackResult.sources.find((source) =>
      source.connectorType !== "official-action" && (!fallbackGoal || sourceSupportsGoal(source, fallbackGoal))
    ) || fallbackResult.sources.find((source) => source.connectorType !== "official-action");
    // Page-level links may sit beside unrelated forms. When the AI planner is
    // down, expose only the deliberately configured official action selected
    // by retrieval instead of guessing among neighboring page links.
    const contentSource = originalContentSource && originalContentSource.id !== actionSource?.id
      ? { ...originalContentSource, actions: [] }
      : originalContentSource;
    const fallbackIds = new Set();
    fallbackResult.sources = [contentSource, actionSource].filter((source) => {
      if (!source || fallbackIds.has(source.id)) return false;
      fallbackIds.add(source.id);
      return true;
    });
    if (Number(fallbackResult.sources[0]?.score || 0) >= 36
      && actionSource
      && hasDistinctiveCommunityEvidence(question, fallbackResult.sources)) {
      const preferredAction = fallbackAction;
      const fallbackPlan = routingPlan || { intent, goal: fallbackGoal, requestedDetails: fallbackResult.requestedDetails, subject: question, searchQueries: [question] };
      const approvedProjection = approvedOperationalProjectionAnswer(question, fallbackResult, {
        ...options,
        routingPlan: fallbackPlan,
        preferredAction,
      });
      if (approvedProjection) {
        return {
          ...approvedProjection,
          communityIntent: intent,
          routingDecision: "official-action-fallback",
          routingFallbackReason: searchPlan ? "planner-route-unfulfilled" : "planner-unavailable-or-disabled",
        };
      }
      const fallbackAnswer = await sourcedAnswer(question, fallbackResult, {
        ...options,
        preferredAction,
      });
      const fallbackDecision = shortcutEligibility("official-action", {
        question,
        plan: routingPlan || { intent, goal: fallbackGoal, requestedDetails: fallbackResult.requestedDetails, subject: question, searchQueries: [question] },
        candidate: fallbackAnswer,
      });
      if (fallbackAnswer.confidence?.canAnswer && (fallbackAnswer.actions || []).length && fallbackDecision.eligible) {
        return {
          ...fallbackAnswer,
          communityIntent: intent,
          routingDecision: "official-action-fallback",
          routingFallbackReason: searchPlan ? "planner-route-unfulfilled" : "planner-unavailable-or-disabled",
        };
      } else if (!fallbackDecision.eligible) recordShortcutRejection(options, "official-action", fallbackDecision);
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
    // Only a deliberately configured official action may be selected as the
    // resident's transaction handoff.  A page that happens to say “reserve”
    // is useful process context, but it is not an action record.
    const actionSource = goalSources.find((source) => (source.connectorType === "official-action" || source.canonicalScopedProjection)
      && (source.actions || []).some((action) => actionSupportsGoal(action, routingPlan.goal))
    );
    const preferredAction = actionForGoal(actionSource, routingPlan.goal);
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
        preferredAction,
      });
      const plannedDecision = shortcutEligibility("official-action", { question, plan: routingPlan, candidate: plannedAnswer });
      // When a resident asks both whether approval is required and how to
      // apply, the controlling rule must answer the permission question
      // before a generic forms page can become the response. The mature
      // rules path below will merge the relevant official action afterward.
      if (
        plannedAnswer.confidence?.canAnswer
        && (plannedAnswer.actions || []).length
        && !routingPlan.requestedDetails.includes("permission")
        && plannedDecision.eligible
      ) {
        return { ...plannedAnswer, communityIntent: routingPlan.intent, routingPlan, routingDecision: "ai-planned" };
      }
      if (!plannedDecision.eligible) recordShortcutRejection(options, "official-action", plannedDecision);
    }
  }

  const structuredActive = interpretationMode === "structured" && routingPlan;
  const foodTruckRequested = structuredActive ? isFoodTruckRequest(routingPlan, question) : isFoodTruckQuestion(question);
  const foodTruckRequestDecision = shortcutEligibility("food-truck", { question, plan: shortcutPlan });
  if (foodTruckRequested && foodTruckRequestDecision.eligible && options.getFoodTruckAnswer) {
    try {
      const connectorResult = await options.getFoodTruckAnswer(structuredActive ? routingPlan : question, question);
      const candidate = { ...foodTruckAnswer(connectorResult), communityIntent: "food-trucks", _connectorDiagnostics: { sourceOutcome: "ok", appliedFilters: [], beforeFilterCount: null, afterFilterCount: null } };
      const decision = shortcutEligibility("food-truck", { question, plan: shortcutPlan, candidate, connectorResult });
      if (decision.eligible) return candidate;
      recordShortcutRejection(options, "food-truck", decision);
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
  } else if (foodTruckRequested && !foodTruckRequestDecision.eligible) recordShortcutRejection(options, "food-truck", foodTruckRequestDecision);

  const wasteScheduleRequested = structuredActive
    ? isWastePickupScheduleRequest(question, routingPlan)
    : isWastePickupScheduleRequest(question);
  const wasteRequestDecision = shortcutEligibility("waste-schedule", { question, plan: shortcutPlan });
  if (wasteScheduleRequested && wasteRequestDecision.eligible && options.getWasteSchedule) {
    try {
      const connectorResult = await options.getWasteSchedule({ question, routingPlan: structuredActive ? routingPlan : shortcutPlan });
      const candidate = { ...liveWasteScheduleAnswer(question, connectorResult), communityIntent: "services" };
      const decision = shortcutEligibility("waste-schedule", { question, plan: shortcutPlan, candidate, connectorResult });
      if (decision.eligible) return candidate;
      recordShortcutRejection(options, "waste-schedule", decision);
    } catch {
      if (options._interpretationState) options._interpretationState.connectorDiagnostics = { sourceOutcome: "unavailable", appliedFilters: [], beforeFilterCount: null, afterFilterCount: null };
      // Keep the indexed, source-grounded fallback available when the live
      // provider is temporarily unavailable.
    }
  } else if (wasteScheduleRequested && !wasteRequestDecision.eligible) recordShortcutRejection(options, "waste-schedule", wasteRequestDecision);

  if (
    classifiedInput.classification === INPUT_CLASSIFICATIONS.UNRELATED
    && !supportsKnownLiveCommunityRequest(question, routingPlan || shortcutPlan)
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
  const poolRequestDecision = shortcutEligibility("pool-status", { question, plan: shortcutPlan });
  if (activeIntent === "status" && poolRequestDecision.eligible && options.getPoolStatus) {
    try {
      const connectorResult = await options.getPoolStatus();
      const candidate = poolStatusAnswer(connectorResult, routingPlan?.requestedDetails || shortcutPlan?.requestedDetails || ["status"]);
      const decision = shortcutEligibility("pool-status", { question, plan: shortcutPlan, candidate, connectorResult });
      if (decision.eligible) return candidate;
      recordShortcutRejection(options, "pool-status", decision);
    } catch {
      if (options._interpretationState) options._interpretationState.connectorDiagnostics = { sourceOutcome: "unavailable", appliedFilters: [], beforeFilterCount: null, afterFilterCount: null };
    }
  } else if (activeIntent === "status" && !poolRequestDecision.eligible) recordShortcutRejection(options, "pool-status", poolRequestDecision);
  const eventsRequestDecision = shortcutEligibility("events", { question, plan: shortcutPlan });
  if (activeIntent === "events" && eventsRequestDecision.eligible && options.getCommunityEvents) {
    try {
      const connectorResult = await options.getCommunityEvents(structuredActive ? routingPlan : question);
      const candidate = eventsAnswer(connectorResult);
      const decision = shortcutEligibility("events", { question, plan: shortcutPlan, candidate, connectorResult });
      if (decision.eligible) return candidate;
      recordShortcutRejection(options, "events", decision);
    } catch {
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
  } else if (activeIntent === "events" && !eventsRequestDecision.eligible) recordShortcutRejection(options, "events", eventsRequestDecision);

  // Current facility pages control operating hours, reservations, prices, and
  // open-play instructions. Consult an exact operational page before a broad
  // rulebook summary, while private construction and permission questions
  // continue through the governing-rules path.
  const operationalSearch = searchCommunityIndex(question, {
    index: options.index,
    indexPath: options.indexPath,
    communityId: options.communityId,
    intent: activeIntent,
    interpretation: routingPlan,
    limit: 5,
    now: options.now,
  });
  const withheld = operationalSearch.withheldSources?.[0];
  const withheldControls = withheld
    // A withheld page cannot override a distinct, claim-scoped projection
    // that has already passed the exact canonical decision gate.
    && !operationalSearch.sources.some((source) => source.canonicalScopedProjection)
    && Number(withheld.score || 0) >= Number(operationalSearch.sources[0]?.score || 0);
  if (withheldControls) {
    const staleDatedHours = datedFacilityHoursAnswer(question, { sources: [withheld] }, { ...options, routingPlan });
    if (staleDatedHours) return { ...staleDatedHours, communityIntent: intent, authorityDecision: "freshness-withheld" };
  }
  const operationalSource = exactOperationalFacilitySource(question, operationalSearch.sources);
  if (operationalSource && Number(operationalSource.score || 0) >= 24) {
    const structuredFacilityAnswer = pickleballFacilityAnswer(operationalSource);
    const facilityCandidate = {
      ...(structuredFacilityAnswer || await sourcedAnswer(question, { ...operationalSearch, sources: [operationalSource] }, { ...options, routingPlan })),
      communityIntent: intent,
      authorityDecision: "current-facility-operations",
    };
    const facilityDecision = shortcutEligibility("facility-operations", { question, plan: shortcutPlan, candidate: facilityCandidate });
    if (facilityDecision.eligible) return facilityCandidate;
    recordShortcutRejection(options, "facility-operations", facilityDecision);
  }

  // Once the shared interpreter has identified a non-rules contact request,
  // go directly to the official community contact index. The rulebook path
  // cannot add authority to an exact phone/email fact and may make its own AI
  // call before returning the same contact, adding avoidable latency. Rules
  // contact questions still use the rules engine (for example, a submission
  // address published only in a governing document).
  const shouldConsultRules = options.answerRulesQuestion
    && !(structuredActive && activeIntent !== "rules" && routingPlan.goal === "contact");
  if (shouldConsultRules) {
    const rulesOptions = { ...(options.rulesOptions || {}), interpretation: routingPlan || null };
    let rulesAnswer;
    try {
      rulesAnswer = await options.answerRulesQuestion(question, rulesOptions);
    } catch (error) {
      if (withheldControls) return withheldSourceAnswer(withheld, intent, routingPlan?.requestedDetails || operationalSearch.requestedDetails);
      throw error;
    }
    // The shared interpreter decides that this is a rules question, but the
    // optional AI-assisted rules search can still fail or return too little
    // evidence. Retry the proven deterministic index before considering a
    // broader community-page fallback; this is broad and source-grounded, not
    // a guessed keyword narrowing step.
    if (routingPlan?.intent === "rules" && rulesAnswer?.confidence?.canAnswer !== true) {
      const deterministicRulesAnswer = await options.answerRulesQuestion(question, {
        ...rulesOptions,
        searchMode: "legacy",
        llmMode: "off",
      });
      if (deterministicRulesAnswer?.confidence?.canAnswer === true) {
        rulesAnswer = deterministicRulesAnswer;
      }
    }
    if (rulesAnswer?.answerMode === "targeted-clarification") {
      return { ...rulesAnswer, answer: cleanAnswerText(rulesAnswer.answer), communityIntent: intent };
    }
    if (/\b(?:section|sec\.?)[\s#]*(?:\d+-\d+|\d+)\b/i.test(question)) {
      return { ...rulesAnswer, answer: cleanAnswerText(rulesAnswer.answer), communityIntent: intent };
    }
    if (withheldControls) {
      const normalizedWithheldUrl = String(withheld.sourceUrl || "").replace(/\/$/, "").toLowerCase();
      const independentlySourced = (rulesAnswer?.sources || []).some((source) => {
        const sourceUrl = String(source.sourceUrl || "").replace(/\/$/, "").toLowerCase();
        return sourceUrl && sourceUrl !== normalizedWithheldUrl;
      });
      const asksForBlockedServiceSchedule = /\b(?:trash|garbage|recycling)\b/i.test(question)
        && /\b(?:what|which) day\b|\bwhen is\b|\b(?:pickup|collection) schedule\b|\brecycling week\b/i.test(question)
        && !/\b(?:store|stored|storage|bring|take|back|curb|container|bins?|cans?|carts?)\b/i.test(question);
      const needsBlockedOperationalDetail = operationalSearch.requestedDetails.includes("contact")
        || asksForBlockedServiceSchedule
        || (activeIntent === "facilities"
          && operationalSearch.requestedDetails.some((detail) => ["hours", "price", "action"].includes(detail)));
      const verifiedRuleFacet = hasAuthoritativePermissionDecision(rulesAnswer);
      if ((!verifiedRuleFacet && needsBlockedOperationalDetail)
        || rulesAnswer?.confidence?.canAnswer !== true
        || (!verifiedRuleFacet && !independentlySourced)) {
        return withheldSourceAnswer(withheld, intent, routingPlan?.requestedDetails || operationalSearch.requestedDetails);
      }
    }
    rulesFallback = rulesAnswer;
    if ((
      rulesAnswer?.inputClassification === INPUT_CLASSIFICATIONS.CONVERSATION
      || (
        rulesAnswer?.inputClassification === INPUT_CLASSIFICATIONS.UNRELATED
        && ["known-unrelated-topic", "person-identity"].includes(rulesAnswer?.confidence?.reason)
      )
    ) && !supportsKnownLiveCommunityRequest(question, routingPlan || shortcutPlan)) {
      return { ...rulesAnswer, answer: cleanAnswerText(rulesAnswer.answer), communityIntent: intent };
    }
    if (rulesAnswer?.inputClassification === "unclear" && rulesAnswer?.confidence?.canAnswer !== true) {
      const communityEvidence = searchCommunityIndex(question, { index: options.index, indexPath: options.indexPath, communityId: options.communityId, intent: activeIntent, interpretation: routingPlan, limit: 5 });
      if (Number(communityEvidence.sources[0]?.score || 0) >= 24 && hasDistinctiveCommunityEvidence(question, communityEvidence.sources)) {
        const communityAnswer = await sourcedAnswer(question, communityEvidence, { ...options, routingPlan });
        return { ...communityAnswer, communityIntent: intent };
      }
      return { ...safeRulesBoundaryAnswer(question, rulesAnswer, communityEvidence.index || options.index), communityIntent: intent };
    }
    if ((!rulesAnswer?.confidence?.canAnswer || ["conversation", "safety"].includes(rulesAnswer.answerMode)) && intent === "facilities") {
      rulesAnswer = await options.answerRulesQuestion(
        `${question} Community facility rental reservation process fees application`,
          rulesOptions
      );
    }
    // A governing-rules plan may intentionally answer permission before a
    // separately retrieved application action is attached. Apply this fallback
    // gate only when the interpreter chose a non-rules domain and the rules
    // engine is acting as a secondary fallback.
    const shortcutWasRejected = activeIntent !== "rules"
      && !shortcutPlan?.requestedDetails?.includes("permission")
      && Boolean(options._interpretationState?.connectorDiagnostics?.shortcutRejections?.length);
    const rulesFallbackDecision = shortcutWasRejected
      ? shortcutEligibility("grounded-fallback", { question, plan: shortcutPlan, candidate: rulesAnswer })
      : { eligible: true, reasons: [] };
    if (!rulesFallbackDecision.eligible) {
      rulesFallback = null;
      recordShortcutRejection(options, "grounded-fallback", rulesFallbackDecision);
    }
    if (rulesAnswer?.confidence?.canAnswer
      && !["conversation", "safety"].includes(rulesAnswer.answerMode)
      && rulesFallbackDecision.eligible) {
      // Some structured answers explicitly identify a single controlling
      // source. Do not dilute that citation with merely related community
      // pages whose neighboring content can point at a different pass, fee,
      // form, or service.
      if (rulesAnswer.controllingSourceOnly === true) {
        return { ...rulesAnswer, answer: cleanAnswerText(rulesAnswer.answer), communityIntent: intent };
      }
      let community = searchCommunityIndex(question, { index: options.index, indexPath: options.indexPath, communityId: options.communityId, intent: activeIntent, interpretation: routingPlan, limit: 3 });

      const bindingRule = asksBindingRule(question, routingPlan);
      let exactOfficialPdf = directlyRelevantOfficialPdf(question, community.sources);
      if (bindingRule && routingPlan?.requestedDetails?.includes("specification") && routingPlan.searchQueries?.length) {
        const expanded = searchCommunityIndexWithQueries(question, routingPlan.searchQueries, {
          index: options.index,
          indexPath: options.indexPath,
          communityId: options.communityId,
          intent: activeIntent,
          interpretation: routingPlan,
          limit: 3,
        });
        const expandedExactPdf = directlyRelevantOfficialPdf(question, expanded.sources);
        if (expandedExactPdf) {
          community = expanded;
          exactOfficialPdf = expandedExactPdf;
        }
      }
      const rulesCoverageIssues = rulesAnswer.qualityChecks?.issues || [];
      const requestedObjectMissing = rulesCoverageIssues.some((issue) => String(issue).startsWith("requested-object-missing:"));
      const rulesAdmitMissingAttribute = /\b(?:does not|doesn't|could not|couldn't)\b.{0,90}\b(?:provide|publish|expose|include|list|name|specify|state|reliable|searchable)\b|\bnot (?:available|found|provided|listed|named|specified)\b/i.test(String(rulesAnswer.answer || ""));
      // An exact form or one-sheet may supplement an attribute, but it cannot
      // replace the governing rule for a binding permission decision. Apply
      // the authority boundary before considering the exact-PDF fallback.
      if (bindingRule && exactOfficialPdf && routingPlan?.requestedDetails?.includes("specification")) {
        const composed = await bindingSpecificationAnswer(question, rulesAnswer, exactOfficialPdf, {
          ...options,
          routingPlan,
        });
        if (composed) return { ...composed, communityIntent: intent, routingPlan, routingDecision: "ai-planned" };
      }
      const preferExactPdf = !bindingRule && exactOfficialPdf && (
        rulesAdmitMissingAttribute
        || requestedObjectMissing
        || !rulesAnswerHasQuestionSpecificEvidence(question, rulesAnswer)
      );
      if (!bindingRule && (preferExactPdf || (requestedObjectMissing && hasDistinctiveCommunityEvidence(question, community.sources)))) {
        const preferredSources = exactOfficialPdf
          ? [{ ...exactOfficialPdf, authorityFacets: ["specification"] }]
          : community.sources;
        return {
          ...await sourcedAnswer(question, { ...community, sources: preferredSources }, { ...options, routingPlan }),
          communityIntent: intent,
        };
      }

      const requestedOperationalDetail = community.requestedDetails.some((detail) => ["contact", "date", "hours", "action"].includes(detail));
      const rulesAdmitsMissingDetail = /does not (?:give|include|list|provide|set|specify|state)|not found in the rulebook|use the .*instructions/i.test(String(rulesAnswer.answer || ""));
      const rulesMissesRequestedDetail = rulesCoverageIssues.some((issue) => /requested-(?:process|action|contact|date|hours)-missing/i.test(String(issue)));
      if (!bindingRule && requestedOperationalDetail && (rulesAdmitsMissingDetail || rulesMissesRequestedDetail) && !isWasteStorageRuleQuestion(question) && Number(community.sources[0]?.score || 0) >= 36) {
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

      // A binding answer keeps its rulebook evidence separate from optional
      // process links.  In particular, do not merge a form/facility page into
      // its sources and then present the whole mixed response as verified.
      const extraSources = bindingRule ? [] : community.sources.map(sourceForDisplay);
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
        : !bindingRule && community.requestedDetails.includes("action")
          ? relevantActions(question, extraSources, 3)
          : [];
      const mergedSources = [...(rulesAnswer.sources || []), ...extraSources].filter((source, index, all) =>
        all.findIndex((candidate) => (candidate.sourceUrl || candidate.title) === (source.sourceUrl || source.title)) === index
      );
      const mergedActions = [...(rulesAnswer.actions || []), ...extraActions].filter((action, index, all) =>
        action?.url && all.findIndex((candidate) => candidate?.url === action.url) === index
      );
      const completedRulesAnswer = {
        ...rulesAnswer,
        answer: cleanAnswerText(rulesAnswer.answer),
        // Do not upgrade a partial rule answer merely because related pages
        // were found.  A verified status remains valid only when the rules
        // path itself supplied it.
        answerStatus: rulesAnswer.answerStatus || "verified",
        sources: mergedSources,
        actions: mergedActions,
        communityIntent: intent,
        ...(bindingRule ? {
          authorityDecision: "rulebook-controls-binding-claim",
          // This is a narrow authority boundary, not the planned full
          // per-facet completion model. This slice deliberately does not
          // expose unproven adjacent process candidates as support.
          claimAuthorityBoundary: {
            bindingClaim: "rulebook-only",
            supportingEvidence: "non-controlling",
            completion: "not-derived-by-this-slice",
          },
        } : {}),
      };
      return enhanceProactiveRulesAnswer(question, completedRulesAnswer, { now: options.now });
    }
    if (intent === "rules") {
      if (pendingStructuredClarification) {
        return structuredClarification(pendingStructuredClarification, interpretationMode, interpretationOutcome);
      }
      return { ...safeRulesBoundaryAnswer(question, rulesAnswer, options.index), communityIntent: intent };
    }
  }

  // A conflicted community page must never be used, but it also must not mask
  // an independently answerable governing rule. Only fall back to the review
  // notice after the safe rules path above has had a chance to answer.
  if (withheldControls) return withheldSourceAnswer(withheld, intent, routingPlan?.requestedDetails || operationalSearch.requestedDetails);

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
  if (pendingStructuredClarification && answer.confidence?.canAnswer !== true) {
    return structuredClarification(pendingStructuredClarification, interpretationMode, interpretationOutcome);
  }
  return { ...answer, communityIntent: result.intent || intent };
}

async function answerCommunityQuestion(query, options = {}) {
  const state = {};
  const answer = ensureAnswerCompletion(query, await answerCommunityQuestionCore(query, { ...options, _interpretationState: state }));
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

module.exports = { answerCommunityQuestion, bestContactContext, cleanAnswerText, composeProactiveAnswer, conciseRecurringSchedule, contactDirectAnswer, datedFacilityHoursAnswer, directlyAnswersQuestionForm, eventsAnswer, extractiveAnswer, liveRecyclingScheduleAnswer, poolStatusAnswer, relevantActions, sourcedAnswer, unanchoredRecurringScheduleAnswer, usefulSentences };

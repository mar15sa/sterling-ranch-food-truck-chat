const { buildAnswerContract, detectFactConflicts } = require("./community-contracts");
const { answerStatusForCompletion, resolveAnswerCompletion } = require("./community-completion");
const { foodTruckAnswer, isFoodTruckQuestion, isFoodTruckRequest } = require("./community-food-trucks");
const { isWaterUsageAccessRequest, normalizeInterpretation, resolveInterpretationMode } = require("./community-interpretation");
const { claimsFromDraft, verifyStructuredDraft, words } = require("./community-grounding");
const { planCommunitySearch: defaultPlanSearch, synthesizeCommunityAnswer: defaultSynthesize } = require("./community-llm");
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
const { formatDate } = require("./community-waste-schedule");
const { withinConfiguredPoolSeason } = require("./community-pool-status");
const { capturedProjectionCoversPastDate, recurringSeasonCoverage } = require("./community-recurring-schedule");
const { shortcutEligibility } = require("./community-shortcut-eligibility");
const { isFreshnessTrackedSource } = require("./community-source-identity");
const { sourceReviewState } = require("./community-source-answerability");
const { INPUT_CLASSIFICATIONS, classifyRulesInput, hasPromptInjectionSignals, normalizeInput } = require("./rules-input");
const { isStateParksPassQuestion } = require("./rules-intent");
const { composePlainEnglishFallback, naturalizeGroundedDraft } = require("./rules-llm");
const {
  attachApprovedRelatedAction,
  requestedRelatedActionFacet,
  selectApprovedRelatedAction,
} = require("./community-related-action");

function sourceForDisplay(source) {
  return {
    ...source,
    nodeId: source.nodeId || `COMMUNITY_${String(source.id || "SOURCE").toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`,
    sourceName: source.sourceName || "Official community website",
    isOfficialResource: true,
  };
}

// Community identity and navigation are profile data. These boundaries make
// no claim about a person or an unrelated topic.
function communityScopeBoundary(profile = {}) {
  const community = profile.shortName || profile.name || "the community";
  return `I can help with ${community} rules and official community information, but I can’t verify that unrelated request from those sources.`;
}

function personIdentityBoundary(profile = {}) {
  const community = profile.shortName || profile.name || "the community";
  const action = profile.website ? { label: `Open ${community} official website`, url: profile.website, actionType: "information" } : null;
  return [
    "I can verify official community information, but I can’t reliably identify or describe a person from those sources.",
    action?.label || "",
    action ? [action] : [],
  ];
}

function communityScopePrompt(profile = {}) {
  const vocabulary = [...new Set((profile.connectors || []).flatMap((connector) =>
    Object.values(connector.adapter?.vocabulary || {}).flat()
  ).map((term) => String(term).trim()).filter(Boolean))].slice(0, 4);
  return vocabulary.length
    ? `Ask about a community topic, such as ${vocabulary.join(", ")}.`
    : "Ask about a community topic.";
}

function configuredStatusConnector(profile = {}) {
  return (profile.connectors || []).find((connector) => connector.adapter?.capabilities?.includes("status"))
    || (profile.connectors || []).find((connector) => connector.type === "live-status");
}

function configuredEventsConnector(profile = {}) {
  return (profile.connectors || []).find((connector) => connector.adapter?.capabilities?.includes("events")
    && connector.adapter?.endpoints?.some((endpoint) => endpoint.purpose === "official-calendar"))
    || (profile.connectors || []).find((connector) => connector.type === "civicplus-calendar");
}

function configuredEventsEndpoint(adapter = {}) {
  return adapter.endpoints?.find((endpoint) => endpoint.purpose === "official-calendar") || adapter.endpoints?.[0];
}

function configuredFoodTruckCalendar(profile = {}) {
  const connector = (profile.connectors || []).find((item) => item.adapter?.foodTruck && item.adapter?.capabilities?.includes("events"));
  return connector?.adapter?.endpoints?.find((endpoint) => endpoint.purpose === "official-food-truck-schedule")?.url || profile.website;
}

function withheldSourceAnswer(source, intent, requested = [], routingPlan = null, question = "") {
  const requestedDetails = [...new Set(requested)].filter(Boolean);
  const requestedLabel = requestedDetails.map(detailLabel).join(" and ");
  const accessRequest = routingPlan?.goal === "account-access"
    || (routingPlan?.goals || []).includes("account-access")
    || /\b(?:access|access card|membership|amenity card|sign up)\b/i.test(question);
  const unavailable = buildAnswerContract({
    directAnswer: accessRequest
      ? "I can’t currently confirm the access requirements from exact owner-approved claims."
      : requestedDetails.includes("action")
      ? `Open “${source.title || "the controlling official source"}” below for the current instructions. I can’t safely restate those instructions until this source version is reviewed.`
      : requestedLabel
      ? `I couldn’t confirm the ${requestedLabel} from an approved CAB source.`
      : "I couldn’t confirm the current value from an approved CAB source.",
    nextStep: accessRequest
      ? "Check the controlling official page below while its access instructions are being reconfirmed."
      : source.actionEvidenceRequired
        ? "The official community website is the best place to confirm this."
        : "Check the controlling official page below while its information is being reconfirmed.",
    actions: source.actionEvidenceRequired
      ? []
      : [{ label: `Open ${source.title || "the controlling official source"}`, url: source.sourceUrl, actionType: "information" }],
    sources: [sourceForDisplay(source)],
    status: "source-unavailable",
    requestedDetails,
    coveredDetails: [],
    answerMode: accessRequest ? "community-access-withheld" : "community-freshness-withheld",
    confidence: { level: "low", score: 0, reason: "source-review-required" },
  });
  return {
    ...unavailable,
    inputClassification: classifyRulesInput(question).classification,
    communityIntent: intent,
    authorityDecision: "freshness-withheld",
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

function cleanSafeRulesBoundaryText(value = "") {
  const cleaned = cleanAnswerText(value);
  if (!/mentions? the requested project only as an example in a different rule/i.test(cleaned)) return cleaned;
  return cleaned.replace(/\n\nWhat I found:\n[\s\S]*?(?=\n\nBefore you act:|$)/i, "");
}

function isOfficialCommunitySource(source = {}, profile = {}) {
  const validatedRoles = new Set(["governing", "operational", "action"]);
  if (source.isOfficialResource !== true
    || (source.controllingSourceRole && !validatedRoles.has(source.controllingSourceRole))) return false;
  const allowedHosts = new Set((profile.allowedHosts || []).map((host) => String(host).toLowerCase()));
  try {
    if (profile.website) allowedHosts.add(new URL(profile.website).hostname.toLowerCase());
    return !allowedHosts.size || allowedHosts.has(new URL(source.sourceUrl).hostname.toLowerCase());
  } catch {
    return false;
  }
}

const GENERIC_EVIDENCE_TERMS = new Set([
  "account", "answer", "approved", "cab", "community", "contact", "directory", "does", "help", "hoa", "information",
  "home", "list", "listed", "listing", "lost", "number", "official", "phone", "question", "ranch", "restore", "rule", "rules",
  "sterling", "system", "their",
]);

const GENERIC_PROJECT_TERMS = new Set([
  ...GENERIC_EVIDENCE_TERMS,
  "allowed", "approval", "backyard", "before", "build", "building", "could", "home", "house",
  "install", "make", "maximum", "need", "permission", "property", "residential", "there", "want",
  "what", "when", "where", "which", "with", "would", "yard",
  "attached", "book", "detached", "reserve", "space", "hours", "form", "apply", "application",
]);

function hasDistinctiveCommunityEvidence(question, sources = []) {
  const distinctive = tokens(question).filter((token) => token.length >= 4 && !GENERIC_EVIDENCE_TERMS.has(token));
  if (!distinctive.length) return false;
  return sources.some((source) => {
    const evidence = `${source.title || ""} ${source.text || ""}`.toLowerCase();
    return distinctive.some((token) => evidence.includes(token));
  });
}

// A safe hold may point a resident to an official page, but only when that
// page is about the thing they asked about. Search rank alone is not enough:
// broad words such as "yard" or "hours" can otherwise send a resident from a
// helipad or quiet-hours question to an unrelated project document.
function hasQuestionSpecificHandoffEvidence(question, sources = []) {
  const query = String(question || "").toLowerCase();
  const evidence = sources.map((source) =>
    `${source.title || ""} ${source.text || source.excerpt || ""} ${source.section || ""}`.toLowerCase()
  ).join(" ");
  if (!evidence) return false;

  const compoundSubjects = ["food truck", "quiet hours"];
  for (const phrase of compoundSubjects) {
    if (query.includes(phrase)) return evidence.includes(phrase);
  }

  // A current contact directory is a useful discovery handoff for a contact
  // request. It still cannot establish a phone or email that the source does
  // not actually publish.
  if (/\b(?:contact|phone|call|email|number)\b/i.test(query)
    && /\bcontact\b/i.test(evidence)) return true;

  const subjectTerms = tokens(question).filter((token) =>
    token.length >= 4 && !GENERIC_PROJECT_TERMS.has(token)
  );
  return subjectTerms.some((token) => evidence.includes(token));
}

// Unapproved pages deliberately lose their body text before they reach the
// answer path. That prevents an unreviewed page from supplying a resident
// fact, but it also means a semantic check cannot always see that a plainly
// titled official facility page was the relevant, withheld result. Keep this
// narrow: only a structured facilities request may use a facilities page
// whose title itself identifies it as a rental or amenity resource. The page
// remains a handoff only; it never restores its instructions, availability,
// access requirements, or prices to the answer.
function isFacilitySpecificAccessRequest(question, routingPlan = null, facilityTerms = []) {
  const plan = routingPlan || {};
  const goals = [plan.goal, ...(plan.goals || [])].filter(Boolean);
  return facilityTerms.length > 0
    && /\b(?:access|card|membership|sign\s*up)\b/i.test(question)
    && (goals.includes("account-access") || !routingPlan);
}

function isFacilitySpecificOperationalRequest(question, routingPlan = null, facilityTerms = []) {
  const plan = routingPlan || {};
  const goals = [plan.goal, ...(plan.goals || [])].filter(Boolean);
  const asksForFacilityDetail = /\b(?:book|reserve|rent|rental|availability|cost|price|fee|access|card|membership|sign\s*up)\b/i.test(question);
  return facilityTerms.length > 0
    && !asksExplicitGoverningRule(question, routingPlan)
    && (plan.intent === "facilities"
      || goals.some((goal) => ["booking", "cost", "permission", "account-access"].includes(goal))
      || (!routingPlan && asksForFacilityDetail));
}

// A home lease is governed by residential-property rules even when a planner
// notices the shared word “rental” and proposes a facility route. This is a
// topic boundary, not a list of individual questions: it covers durations,
// leasing, and the common short-term lodging terms used by residents.
function isResidentialPropertyRentalRequest(question = "") {
  return /\b(?:short|long)[-\s]?term\s+(?:rental|lease|leasing|lodging)\b|\b(?:residential|property|home|house)\s+(?:rental|lease|leasing)\b|\b(?:airbnb|vrbo|vacation rental|short[-\s]?term lodging)\b/i.test(question);
}

// "Facility" has two meanings in the community corpus: a reservable amenity
// and a one-time utility charge. A withheld rental page is a useful handoff
// for the former, but it must not outrank the reviewed utility schedule for
// the latter. Require both a price question and an infrastructure signal so
// an otherwise ambiguous facility-fee question still keeps its cautious
// facility handoff.
function isUtilityInfrastructureFeeRequest(question = "") {
  return /\b(?:fee|fees|cost|costs|charge|charges|price|prices|rate|rates)\b|\bhow much\b/i.test(question)
    && /\b(?:utility|utilities|tap|taps|connection|connections|connect(?:ed|ion)?|water|sewer|sanitary|stormwater)\b/i.test(question);
}

function hasSafeWithheldHandoffEvidence(question, sources = [], routingPlan = null) {
  // Preserve a pending or conflicted utility source as the controlling
  // boundary. The precedence exception applies only to a withheld amenity
  // rental page whose generic “facility” wording collides with a utility
  // schedule question.
  if (isUtilityInfrastructureFeeRequest(question) && sources.some((source) =>
    source?.sourceType === "facilities"
    && /\b(?:rent(?:al)?|clubhouse|great hall|pavilion|amenity|park|shelter)\b/i.test(`${source.title || ""} ${source.text || source.excerpt || ""}`)
  )) return false;
  const plan = routingPlan || {};
  const goals = [plan.goal, ...(plan.goals || [])].filter(Boolean);
  // A neighborhood name such as “Overlook” can appear on several facilities.
  // In a structured facility request, prefer the actual facility noun from
  // the question or planned subject, so an Overlook pool page cannot become
  // the handoff for an Overlook clubhouse price question.
  const facilityTerms = [...new Set(tokens(`${question} ${plan.subject || ""}`).filter((term) =>
    ["pool", "clubhouse", "hall", "pavilion", "park", "shelter", "court", "amenity"].includes(term)
  ))];
  const facilityAccessRequest = isFacilitySpecificAccessRequest(question, routingPlan, facilityTerms);
  const facilityOperationalRequest = isFacilitySpecificOperationalRequest(question, routingPlan, facilityTerms);
  if (!facilityOperationalRequest && !facilityAccessRequest) return hasQuestionSpecificHandoffEvidence(question, sources);
  if (!goals.some((goal) => ["booking", "cost", "permission", "account-access"].includes(goal)) && !facilityAccessRequest && routingPlan) {
    // Schedule requests retain the established question-specific evidence
    // check. This lets a stale dated-hours source produce its stronger
    // freshness boundary before generic retrieval can take over.
    return hasQuestionSpecificHandoffEvidence(question, sources);
  }
  if (facilityTerms.length) {
    const exactFacilityMatch = sources.some((source) => {
      const evidence = `${source.title || ""} ${source.text || source.excerpt || ""}`.toLowerCase();
      return facilityTerms.some((term) => evidence.includes(term));
    });
    if (exactFacilityMatch) return true;
  }
  return sources.some((source) => source?.sourceType === "facilities"
    && /\b(?:rent(?:al)?|facility|amenity|park|shelter)\b/i.test(String(source.title || "")));
}

function hasIndependentRulesEvidence(rulesAnswer = {}, withheldSource = {}) {
  const withheldUrl = String(withheldSource.sourceUrl || "").replace(/\/$/, "").toLowerCase();
  return (rulesAnswer.sources || []).some((source) => {
    const sourceUrl = String(source.sourceUrl || "").replace(/\/$/, "").toLowerCase();
    return sourceUrl && sourceUrl !== withheldUrl;
  });
}

function isSafeRulesBoundaryAnswer(rulesAnswer = {}) {
  return rulesAnswer.answerMode === "source-evidence-boundary"
    && /\b(?:does not|do not|doesn't|don't)\b.{0,120}\b(?:establish|state|specify|show|provide|publish|name|identify|list|contain|cover|confirm)\b/i.test(String(rulesAnswer.answer || ""));
}

function asksApprovedProviderDirectory(question = "") {
  return /\b(?:list|directory)\b.{0,40}\b(?:approved|pre[- ]approved)\b.{0,40}\b(?:providers?|companies|contractors?|landscapers?)\b|\b(?:approved|pre[- ]approved)\b.{0,40}\b(?:providers?|companies|contractors?|landscapers?)\b/i.test(question);
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

function safeRulesAnswerHasSupportedPart(question, rulesAnswer = {}) {
  if (!isSafeRulesBoundaryAnswer(rulesAnswer)) return false;
  if (rulesAnswerHasQuestionSpecificEvidence(question, rulesAnswer)) return true;
  if (rulesAnswer.confidence?.reason === "named-project-not-supported-by-cited-evidence"
    && /selected official rules do not name .+ specifically/i.test(String(rulesAnswer.answer || ""))
    && (rulesAnswer.sources || []).some(governingRuleSource)) return true;
  if (/\badditional species will be considered\b/i.test(String(rulesAnswer.answer || ""))
    && (rulesAnswer.sources || []).some((source) => /preapproved plant list/i.test(source.title || ""))) return true;
  if (/\b(?:required|allowed)\b/i.test(question)
    && /resident choice in the question is required or allowed/i.test(String(rulesAnswer.answer || ""))
    && (rulesAnswer.sources || []).some((source) => /\bInternet and networking\b/i.test(source.title || ""))) return true;
  // A tree lawn is the official term for the landscaped strip between a lot
  // and the street.  An ownership question can therefore receive the useful
  // limited distinction between maintenance and ownership even when the
  // resident uses everyday sidewalk/landscaping wording.
  return /\b(?:own|owner|ownership)\b/i.test(question)
    && /\b(?:maintenance responsibility|responsible for (?:the )?(?:irrigation|maintenance))\b/i.test(String(rulesAnswer.answer || ""))
    && (rulesAnswer.sources || []).some((source) => /\b(?:tree lawn|street)\b/i.test(`${source.title || ""} ${source.excerpt || ""} ${source.section || ""}`));
}

function actionsForDisplayedRuleEvidence(rulesAnswer = {}) {
  const evidenceUrls = new Set((rulesAnswer.sources || [])
    .map((source) => String(source.sourceUrl || "").replace(/\/$/, "").toLowerCase())
    .filter(Boolean));
  return (rulesAnswer.actions || []).filter((action) =>
    evidenceUrls.has(String(action?.url || "").replace(/\/$/, "").toLowerCase())
  );
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

function configuredCommunityResource(index = {}, profile = {}, candidates = [], question = "") {
  const current = candidates.find((source) => source?.sourceUrl
    && isOfficialCommunitySource(source, profile)
    && source.lifecycle === "current"
    && (source.canonicalScopedProjection === true || source.answerableProjection === true)
    && hasQuestionSpecificHandoffEvidence(question, [source]));
  if (current) return sourceForDisplay(current);
  const website = profile?.website || index?.website;
  if (!website) return null;
  return {
    title: `${profile?.name || index?.communityName || "Community"} official website`,
    sourceUrl: website,
    text: "Official community website",
    excerpt: "Official community website",
    isOfficialResource: true,
  };
}

function genericEvidenceBoundary(question, rulesAnswer = {}, index = {}, profile = {}, candidates = []) {
  // Preserve an explicit no-source decision from the governing answer path.
  // A later presentation layer must not decorate that decision with a merely
  // discoverable homepage, source, or action. Independently approved
  // operational evidence is resolved before this fallback is reached.
  const explicitNoSourceBoundary = rulesAnswer.answerMode === "source-evidence-boundary"
    && rulesAnswer.confidence?.canAnswer === false
    && !(rulesAnswer.sources || []).length
    && !(rulesAnswer.actions || []).length
    && !(rulesAnswer.claims || []).length;
  const resource = explicitNoSourceBoundary
    ? null
    : configuredCommunityResource(index, profile, candidates, question);
  const actions = resource?.sourceUrl ? [{ label: `Open ${resource.title}`, url: resource.sourceUrl, actionType: "information" }] : [];
  const boundary = buildAnswerContract({
    directAnswer: "I couldn’t find a current official answer for that.",
    nextStep: resource ? "Open the official community source below to keep looking." : "",
    actions,
    sources: resource ? [resource] : [],
    status: "could-not-verify",
    requestedDetails: requestedDetails(question),
    answerMode: "source-evidence-boundary",
  });
  return {
    ...boundary,
    answerVerdict: "unverified",
    inputClassification: rulesAnswer.inputClassification || "rules-question",
    confidence: { canAnswer: false, confidence: "high", reason: rulesAnswer.confidence?.reason || "no-exact-official-evidence" },
    reviewNeeded: false,
  };
}

function asksExplicitGoverningRule(question = "", routingPlan = null) {
  return routingPlan?.intent === "rules"
    || /\b(?:rules?|regulations?|prohibited|prohibition|violation|drc|design review|approval)\b/i.test(question);
}

function isOperationalFacilityQuestion(question = "", routingPlan = null) {
  const normalized = String(question).toLowerCase().replace(/pickle\s+ball/g, "pickleball");
  return /\b(?:court|pickleball|tennis|pool|clubhouse|pavilion|shelter|facility|amenity|recreation)\b/i.test(normalized)
    && !asksExplicitGoverningRule(normalized, routingPlan)
    && !/\b(?:build|construct|install|private|backyard|on my (?:lot|property)|drc|design review|approval|violation)\b/i.test(normalized);
}

function isPublicPickleballOperationsQuestion(question = "") {
  const normalized = String(question).toLowerCase().replace(/pickle\s+ball/g, "pickleball");
  return /\bpickleball\b/.test(normalized)
    && (/\b(?:community|neighborhood|public)\b/.test(normalized)
      || /\b(?:play|hours|open play|reserve|reservation)\b/.test(normalized))
    && !/\b(?:build|construct|install|add|put|create|private|backyard|rear yard|on my (?:lot|property)|at my (?:home|house)|drc|design review|approval)\b/.test(normalized);
}

function operationalFacilitySource(question, sources = []) {
  if (!isOperationalFacilityQuestion(question) && !isPublicPickleballOperationsQuestion(question)) return null;
  return sources.find((source) => source.sourceType === "facilities"
    && source.canonicalScopedProjection === true
    && hasDistinctiveCommunityEvidence(question, [source])) || null;
}

function isWasteStorageRuleQuestion(question = "") {
  const text = String(question);
  return /\b(?:trash|garbage|recycling|waste|bins?|carts?|containers?)\b/i.test(text)
    && (/(?:bring|take)(?:\s+\w+){0,4}\s+(?:in|back)\b/i.test(text)
      || /\b(?:store|stored|storage|leave|left|overnight|curb|bring back|take back|taking|put out|outside|exact hour|what time)\b/i.test(text))
    && !/\b(?:pickup|pick up|collection|schedule|which day|what day)\b/i.test(text);
}

function isOfficialInformationPageRequest(question = "", routingPlan = null) {
  const text = String(question).toLowerCase();
  const planGoals = new Set([routingPlan?.goal, ...(routingPlan?.goals || [])].filter(Boolean));
  const asksToNavigate = /\bwhere\s+(?:can|could|do|would)\s+(?:i|we)\s+(?:find|look|go)|\bwhere\s+is\b|\b(?:open|show|find)\b.{0,36}\b(?:info(?:rmation)?|page|website|site|resource|details?)\b|\b(?:info(?:rmation)?|page|website|site|resource)\s*(?:link)?\s*[?.!]*$/i.test(text);
  const asksForDifferentFacet = /\b(?:when|today|tomorrow|week|date|day|schedule|pickup|pick up|collection|delay|late|holiday|hours?|closed|status|contact|phone|email|call|report|complaint|concern|missed|form|apply|submit|sign up|subscribe|notification|cost|price|fee|allowed|permission|approval|required|rule|regulation|violation|store|stored|storage|screen|screened|curb|bring|take|put out|outside|enclosure|paint|build|install)\b/i.test(text);
  return asksToNavigate
    && !asksForDifferentFacet
    && (!routingPlan || routingPlan.intent !== "rules")
    && (!planGoals.size || planGoals.has("information"));
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
  return top?.sourceUrl && !top.actionEvidenceRequired
    ? [{ label: `Open official ${top.title}`, url: top.sourceUrl, actionType: "information" }]
    : [];
}

function isWastePickupScheduleRequest(question = "", plan = null) {
  const text = `${question} ${plan?.subject || ""} ${(plan?.searchQueries || []).join(" ")}`;
  if (!/\b(?:trash|garbage|recycling|waste)\b/i.test(text)) return false;
  if (/\b(?:bins?|cans?|carts?|containers?|curb|store|stored|storage|bring\s+(?:it|them|the)|put\s+(?:it|them|the))\b/i.test(question)) return false;
  return /\b(?:week|next|date|today|tomorrow|pickup|pick up|collection|schedule|delayed|delay|holiday)\b/i.test(text)
    || /\bwhen\s+(?:is|are)\s+(?:the\s+)?(?:next\s+)?(?:trash|garbage|recycling)\b/i.test(text);
}

function isRecurringWasteDayQuestion(question = "") {
  if (!/\b(?:trash|garbage|recycling|waste)\b/i.test(question)) return false;
  if (/\b(?:next|today|tomorrow|this week|next week|recycling week|which week|specific date|holiday|delay(?:ed)?|late|on time)\b/i.test(question)) return false;
  return /\b(?:what|which) days?\b/i.test(question)
    || /\b(?:regular|recurring|weekly)\b/i.test(question)
    || /\bwhen are\b[\s\S]*\b(?:picked up|collected)\b/i.test(question);
}

function needsExactRecurringDate(question = "") {
  return /\brecycling\b/i.test(question) && isWastePickupScheduleRequest(question);
}

function liveWasteScheduleAnswer(question, schedule) {
  const envelope = schedule?.evidence;
  const service = schedule.service === "garbage" ? "trash" : "recycling";
  const requestedArea = (schedule?.serviceAreas || []).find(({ label }) =>
    new RegExp(`\\b${String(label || "").replace(/ Village$/i, "").replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`, "i").test(question)
  );
  const dateClaim = envelope?.claims?.find((claim) => claim.facet === "date" && claim.text === schedule?.date);
  const dateEvidence = envelope?.evidence?.find((source) => source.evidenceId === dateClaim?.controllingEvidenceId);
  const dateIsFresh = dateEvidence?.checkedAt && dateEvidence?.staleAfter
    && new Date(dateEvidence.checkedAt).getTime() <= Date.now()
    && new Date(dateEvidence.staleAfter).getTime() >= Date.now();
  const liveDateIsProven = envelope?.degradation?.state === "healthy"
    && envelope?.coverage?.requested?.length === 1
    && envelope.coverage.requested[0] === "date"
    && envelope?.coverage?.covered?.includes("date")
    && dateClaim?.controllingSourceRole === "operational"
    && dateEvidence?.controllingSourceRole === "operational"
    && dateIsFresh;
  const actions = (envelope?.actions || []).map((action) => ({ label: action.label, url: action.url, actionType: action.type }));
  if (!liveDateIsProven) {
    return buildAnswerContract({
      directAnswer: requestedArea
        ? `I couldn’t confirm a current ${service} pickup date for ${requestedArea.label}.`
        : "I couldn’t confirm a current pickup date from the live calendar.",
      nextStep: actions[0]?.label || "",
      actions,
      status: "source-unavailable",
      requestedDetails: ["date"],
      coveredDetails: [],
      answerMode: requestedArea ? "community-live-waste-area-unavailable" : "community-live-waste-unavailable",
    });
  }
  const hasFreshDateClaim = (date) => envelope.claims.some((claim) => claim.facet === "date"
    && claim.text === date
    && claim.controllingSourceRole === "operational"
    && claim.controllingEvidenceId === dateEvidence.evidenceId);
  const dates = (requestedArea ? [requestedArea] : schedule.serviceAreas).filter((area) => hasFreshDateClaim(area.date));
  if (requestedArea && !dates.length) {
    return buildAnswerContract({
      directAnswer: `I couldn’t confirm a current ${service} pickup date for ${requestedArea.label}.`,
      nextStep: actions[0]?.label || "",
      actions,
      status: "source-unavailable",
      requestedDetails: ["date"],
      coveredDetails: [],
      answerMode: "community-live-waste-area-unavailable",
    });
  }
  const directAnswer = requestedArea && dates.length
      ? `${requestedArea.label}'s next ${service} pickup is ${formatDate(requestedArea.date)}—${schedule.timing}.`
      : `${service[0].toUpperCase()}${service.slice(1)} pickup is ${formatDate(schedule.date)}—${schedule.timing}.`;
  const keyDetails = dates.map(({ label, date }) => `${label}: ${formatDate(date)}`);
  const sources = [{
    id: dateEvidence.evidenceId,
    title: "Live pickup calendar",
    sourceUrl: dateEvidence.sourceUrl,
    text: `The live calendar lists ${service} for ${schedule.anchorDate}.`,
    excerpt: `Upcoming ${service} service anchored on ${formatDate(schedule.anchorDate)}.`,
    checkedAt: dateEvidence.checkedAt,
    staleAfter: dateEvidence.staleAfter,
    authorityScore: 1,
    isOfficialResource: true,
  }];
  return { ...buildAnswerContract({
    directAnswer,
    keyDetails,
    actions,
    sources,
    status: "verified",
    checkedAt: schedule.checkedAt,
    requestedDetails: ["date"],
    coveredDetails: ["date"],
    answerMode: `community-live-${service}`,
  }), _connectorDiagnostics: { sourceOutcome: "ok", beforeFilterCount: schedule.serviceAreas?.length || 0, afterFilterCount: dates.length, appliedFilters: requestedArea ? [{ field: "location", value: requestedArea.label }] : [] } };
}

function unavailableWasteScheduleAnswer(question, profile = {}, plan = {}, candidate = null) {
  const connector = (profile.connectors || []).find((item) => item.type === "live-waste-schedule");
  const calendarEndpoint = connector?.adapter?.endpoints?.find((endpoint) => endpoint.id === "pickup-calendar");
  const configuredAction = (connector?.adapter?.wasteSchedule?.actionLinks || []).find((action) => action.id === "pickup-calendar");
  const fallbackLabel = connector?.adapter?.labels?.sourceTitle;
  const action = configuredAction || (calendarEndpoint?.url && fallbackLabel ? {
    type: "information",
    label: fallbackLabel,
    url: calendarEndpoint.url,
  } : null);
  const requested = [...new Set(plan.requestedDetails || requestedDetails(question))];
  const hasVerifiedDate = candidate?.answerStatus === "verified"
    && candidate?.directAnswer
    && (candidate.sources || []).length;
  const directAnswer = hasVerifiedDate
    ? candidate.directAnswer
    : "I couldn’t find a current official pickup date.";
  return {
    ...buildAnswerContract({
      directAnswer,
      keyDetails: hasVerifiedDate ? candidate.keyDetails : [],
      nextStep: action?.label || "",
      actions: hasVerifiedDate && (candidate.actions || []).length
        ? candidate.actions
        : action ? [{ label: action.label, url: action.url, actionType: action.type }] : [],
      sources: hasVerifiedDate ? candidate.sources : [],
      status: "source-unavailable",
      requestedDetails: requested,
      coveredDetails: hasVerifiedDate ? ["date"] : [],
      answerMode: hasVerifiedDate ? "community-live-waste-status-unavailable" : "community-live-waste-unavailable",
      confidence: { level: "low", score: 0, reason: "live-pickup-status-unavailable" },
    }),
    communityIntent: "services",
    _connectorDiagnostics: { sourceOutcome: hasVerifiedDate ? "partial" : "unavailable", appliedFilters: [], beforeFilterCount: null, afterFilterCount: null },
  };
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
  const wasteStatus = !foodTruck && /\b(?:delay(?:ed)?|late|on\s+time|holiday)\b/i.test(question);
  const goal = foodTruck && plan.goal === "status"
    ? "schedule"
    : !foodTruck && plan.goal === "information"
      ? wasteStatus ? "status" : "schedule"
      : plan.goal;
  const goals = foodTruck
    ? [...new Set((plan.goals || [plan.goal]).map((item) => item === "status" ? "schedule" : item).filter(Boolean))]
    : [...new Set((plan.goals || [plan.goal]).map((item) => item === "information" ? goal : item).filter(Boolean))];
  const requestedDetails = foodTruck
    // “Who is here today?” describes a dated listing even when the planner
    // calls it current status. Keep the resident's date range, but translate
    // that one connector facet to the evidence the live calendar can prove.
    ? [...new Set((plan.requestedDetails || []).map((item) => item === "status" ? "date" : item).filter(Boolean))]
    : [...new Set([...(plan.requestedDetails || []), wasteStatus ? "status" : "date"])];
  return { ...plan, intent, goal, goals, requestedDetails, scope: "community", needsClarification: false, clarificationQuestion: "" };
}

async function approvedRecurringWasteDayAnswer(question, plan = {}, options = {}) {
  if (!isRecurringWasteDayQuestion(question)) return null;
  const recurringPlan = {
    ...plan,
    scope: "community",
    intent: "services",
    goal: "information",
    goals: ["information"],
    subject: plan.subject || "trash and recycling pickup days",
    requestedDetails: [],
    dateRange: null,
    needsClarification: false,
    clarificationQuestion: "",
  };
  const result = searchCommunityIndexWithQueries(question, [
    ...(plan.searchQueries || []),
    "trash recycling recurring collection days",
  ], {
    index: options.index,
    indexPath: options.indexPath,
    communityId: options.communityId,
    intent: "services",
    interpretation: recurringPlan,
    limit: 20,
    now: options.now,
  });
  const source = result.sources.find((candidate) => candidate.canonicalScopedProjection
    && (candidate.facts || []).some((fact) => fact.approvalClaim === "trash-recurring-service-guidance"));
  const leadFact = (source?.facts || []).find((fact) => fact.approvalClaim === "trash-recurring-service-guidance");
  const pickupAction = (source?.actions || []).find((action) => action.approvalClaim === "trash-wasteconnect-app-route");
  if (!source || !leadFact) return null;
  result.sources = [source];
  result.requestedDetails = [];
  const answer = await composeApprovedOperationalProjection(question, result, {
    ...options,
    routingPlan: recurringPlan,
    preferredLeadFact: leadFact,
    excludePreferredLeadFromDetails: true,
    preferredAction: pickupAction,
  });
  if (!answer) return null;
  let livePresentation = null;
  let liveAnswer = null;
  if (/\brecycling\b/i.test(question) && options.getWasteSchedule && options.communityProfile) {
    try {
      const schedule = await options.getWasteSchedule({
        question: "When is the next recycling pickup?",
        routingPlan: { ...recurringPlan, goal: "schedule", goals: ["schedule"], requestedDetails: ["date"] },
        profile: options.communityProfile,
      });
      const candidate = liveWasteScheduleAnswer(question, schedule);
      if (candidate.answerStatus === "verified" && candidate.keyDetails?.length === 3) {
        liveAnswer = candidate;
        livePresentation = {
          kind: "waste-schedule",
          nextPickupLabel: "Next recycling pickup",
          nextPickups: candidate.keyDetails,
        };
      }
    } catch {
      livePresentation = null;
      liveAnswer = null;
    }
  }
  const actions = liveAnswer?.actions?.length
    ? [...liveAnswer.actions, ...(answer.actions || [])].filter((action, index, all) => all.findIndex((candidate) => candidate.url === action.url) === index).slice(0, 3)
    : answer.actions;
  const nextStep = actions?.[0]?.label || answer.nextStep;
  const residentAnswer = [
    answer.directAnswer,
    livePresentation ? `${livePresentation.nextPickupLabel}:\n${livePresentation.nextPickups.map((detail) => `- ${detail}`).join("\n")}` : "",
    ...(answer.keyDetails || []),
  ].filter(Boolean).join("\n\n");
  return {
    ...answer,
    answer: residentAnswer,
    nextStep,
    actions,
    sources: liveAnswer ? [...(answer.sources || []), ...(liveAnswer.sources || [])] : answer.sources,
    claims: liveAnswer ? [...(answer.claims || []), ...(liveAnswer.claims || [])] : answer.claims,
    checkedAt: liveAnswer?.checkedAt || answer.checkedAt,
    ...(livePresentation ? { presentation: livePresentation } : {}),
    communityIntent: "services",
    routingPlan: recurringPlan,
    routingDecision: plan ? "ai-planned" : "source-led",
  };
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
    ...(scheduleSource ? [{ label: scheduleSource.title, url: scheduleSource.sourceUrl, actionType: "information" }] : []),
  ].filter((action, index, all) => all.findIndex((candidate) => candidate.url === action.url) === index).slice(0, 3);
  const scheduleSummary = scheduleFacts.slice(0, 3).map((fact) => conciseRecurringSchedule(fact.value));

  return buildAnswerContract({
    directAnswer: `The published recurring schedule doesn’t show whether this pickup is this week or next: ${scheduleSummary.join("; ")}.`,
    keyDetails: scheduleSummary,
    nextStep: actions[0]?.label || "",
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
    if (detail === "action") return actions.length > 0 || facts.some((fact) =>
      fact.type === "information" && /\b(?:go|open|select|register|sign in|log in|submit|visit|use)\b/i.test(fact.context || fact.value || "")
    );
    if (detail === "price") return facts.some((fact) => fact.type === "money");
    if (detail === "contact") return facts.some((fact) => ["phone", "email"].includes(fact.type));
    if (detail === "date") return facts.some((fact) => ["date", "schedule"].includes(fact.type)) || sources.some((source) => source.sourceType === "events");
    if (detail === "hours") return !isHolidayHoursRequest(question) && facts.some((fact) =>
      fact.type === "time" || (fact.type === "schedule" && /\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)/i.test(fact.context || fact.value || ""))
    );
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
      fact,
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
  const selectedContextTokens = tokens(best.context || "").filter((token) =>
    token.length >= 4 && !["call", "contact", "email", "phone"].includes(token)
  );
  const values = ["phone", "email"].map((type) => (best.source.facts || [])
    .filter((fact) => fact.type === type)
    .map((fact) => ({
      fact,
      score: queryTokens.reduce((score, token) => score + (String(fact.context || "").toLowerCase().includes(token) ? 3 : 0), 0)
        + (selectedContextTokens.some((token) => String(fact.context || "").toLowerCase().includes(token)) ? 5 : 0),
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
  return `For ${label}, ${[phone ? `call ${phone}` : "", email ? `email ${email}` : ""].filter(Boolean).join(" or ")}.`;
}

function missingRequestedOrganization(question, sources = []) {
  const requestedOrganizations = [...new Set(String(question).match(/\b[A-Z]{2,8}\b/g) || [])];
  const evidence = sources.map((source) => `${source.title || ""} ${source.text || source.excerpt || ""}`).join(" ");
  return requestedOrganizations.find((organization) => !new RegExp(`\\b${organization}\\b`, "i").test(evidence)) || "";
}

function missingContactAnswer(organization, routingPlan, options = {}) {
  const contactCandidates = (options.sources || []).filter((source) =>
    /\bcontact\b/i.test(source.title || "") || (source.actions || []).some((action) => action.actionType === "contact" || action.type === "contact")
  );
  const contactDirectory = configuredCommunityResource(options.index, options.profile, contactCandidates, options.question);
  const boundary = buildAnswerContract({
    directAnswer: `I couldn’t find a current official phone number for ${organization}.`,
    nextStep: contactDirectory?.sourceUrl ? `Open ${contactDirectory.title}` : "",
    actions: contactDirectory?.sourceUrl ? [{ label: `Open ${contactDirectory.title}`, url: contactDirectory.sourceUrl, actionType: "contact" }] : [],
    sources: contactDirectory ? [contactDirectory] : [],
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
      directAnswer: "I couldn’t find a current official answer for that.",
      nextStep: communityScopePrompt(options.communityProfile || { name: result.index?.communityName }),
      sources: result.index ? [{ title: `${result.index.communityName} official website`, sourceUrl: result.index.website, text: "Official community website", excerpt: "Official community website", isOfficialResource: true }] : [],
      status: "could-not-verify",
      answerMode: "community-no-source",
    });
  }
  const recurringSchedule = unanchoredRecurringScheduleAnswer(question, { ...result, sources });
  if (recurringSchedule) return recurringSchedule;
  if (result.requestedDetails.includes("contact") || options.routingPlan?.goal === "contact") {
    const missingOrganization = missingRequestedOrganization(question, sources);
    if (missingOrganization) return missingContactAnswer(missingOrganization, options.routingPlan, { index: result.index, profile: options.communityProfile, sources, question });
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
    ? [options.preferredAction.label, sentences[0]].filter(Boolean).join(" ")
    : result.requestedDetails.includes("date") && scheduleFacts.length
    ? scheduleFacts[0]?.context || scheduleFacts[0]?.value || sources[0].title
    : result.intent === "events" && actions.length
    ? `Use the official ${sources[0].title} link below to find current community events.`
    : result.intent === "forms" && actions.length
    ? `Use the official ${sources[0].title} source below to open the current form or application.`
    : result.requestedDetails.includes("contact") && (bestContactContext(question, sources) || sentences[0])
      ? contactDirectAnswer(bestContactContext(question, sources) || sentences[0], sources[0].title, question, sources[0])
    : sentences[0] || sources[0].title;
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
    nextStep: actions[0]?.label || sources[0].title,
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
  // Ranking words such as “list”, “directory”, or “approved” are not enough
  // to pair a resident request with an operational projection. Require the
  // requested topic itself to appear in the approved projection before any
  // fact or action from it can become the answer.
  if (!sources.length || !hasDistinctiveCommunityEvidence(question, sources)) return null;
  const actions = relevantActions(question, sources, 3, options.routingPlan);
  const broadFacilityOverview = !result.requestedDetails.length
    && /\b(?:rules?|guidelines?|what should i know|overview)\b/i.test(question)
    && sources[0]?.sourceType === "facilities";
  if (broadFacilityOverview) {
    const source = sources[0];
    const sourceForAnswer = sourceForDisplay(source);
    const hours = (source.facts || []).find((fact) => fact.facet === "facility-hours" && /\b(?:weekday|weekend|monday|saturday|sunday)\b/i.test(fact.context || ""))?.context || "";
    const sourceText = String(source.text || source.excerpt || "").replace(/\s+/g, " ");
    const reservationLimit = sourceText.match(/[^.]*reservations?[^.]*\b(?:maximum|up to)\b[^.]*\b(?:hours?|minutes?)\b[^.]*\./i)?.[0]?.trim() || "";
    const bookingAction = actions.find((action) => action.actionType === "booking")
      || (source.actions || []).find((action) => action.actionType === "booking");
    if (hours && reservationLimit && bookingAction?.url) {
      return buildAnswerContract({
        directAnswer: hours,
        keyDetails: [reservationLimit],
        nextStep: bookingAction.label,
        actions: [bookingAction],
        sources: [sourceForAnswer],
        status: "verified",
        requestedDetails: [],
        coveredDetails: [],
        checkedAt: source.checkedAt,
        answerMode: "community-approved-operational-overview",
        claims: [hours, reservationLimit].map((text) => ({
          text,
          evidenceSourceIds: [sourceForAnswer.id],
        })),
      });
    }
  }
  // A generic “open this page” link is a safe next step, but it is not a
  // claim-scoped action and must not replace an approved fact as the answer.
  const preferredAction = options.preferredAction || actions.find((action) =>
    sources.some((source) => (source.actions || []).some((candidate) => candidate.url === action.url))
  );
  if (options.routingPlan?.goal && ACTION_GOALS.has(options.routingPlan.goal) && !preferredAction) return null;
  const displayedSources = sources.map(sourceForDisplay);
  const displayedIds = new Set(displayedSources.map((source) => source.id));
  const details = displayedSources.flatMap((source) => (source.facts || []).map((fact) => ({
    text: String(fact.context || "").trim(),
    factId: fact.id,
    sourceId: source.id,
    approvalClaimIds: fact.approvalClaim ? [fact.approvalClaim] : [],
  }))).filter((detail) => detail.text && displayedIds.has(detail.sourceId));
  const requestedLeadFact = options.preferredLeadFact;
  const detailCandidates = requestedLeadFact && options.excludePreferredLeadFromDetails
    ? details.filter((detail) => detail.factId !== requestedLeadFact.id)
    : details;
  const groupedDetails = [];
  for (const detail of detailCandidates) {
    const current = groupedDetails[groupedDetails.length - 1];
    if (current && current.sourceId === detail.sourceId && `${current.text} ${detail.text}`.length <= 400) {
      current.text = `${current.text} ${detail.text}`;
      current.approvalClaimIds = [...new Set([...current.approvalClaimIds, ...detail.approvalClaimIds])];
    } else if (groupedDetails.length < 3) groupedDetails.push({ ...detail });
  }
  const actionEvidenceSourceIds = preferredAction ? displayedSources.filter((source) => (source.actions || []).some((action) =>
    (preferredAction.id && action.id === preferredAction.id) || action.url === preferredAction.url
  )).map((source) => source.id) : [];
  const actionApprovalClaimIds = preferredAction?.approvalClaim ? [preferredAction.approvalClaim] : [];
  const requestedLeadSource = requestedLeadFact
    ? displayedSources.find((source) => (source.facts || []).some((fact) => fact.id === requestedLeadFact.id))
    : null;
  const processLead = requestedLeadFact && requestedLeadSource ? {
    text: String(requestedLeadFact.context || "").trim(),
    sourceId: requestedLeadSource.id,
    approvalClaimIds: requestedLeadFact.approvalClaim ? [requestedLeadFact.approvalClaim] : [],
  } : null;
  const directDetail = processLead || (preferredAction ? null : groupedDetails.shift());
  if (!preferredAction && !directDetail?.text) return null;
  const directAnswer = processLead
    ? processLead.text
    : preferredAction
    ? `Use “${preferredAction.label}” below to continue.`
    : directDetail.text;
  const covered = coveredDetails(result.requestedDetails, displayedSources, preferredAction ? [preferredAction] : [], question);
  if (covered.length !== result.requestedDetails.length) return null;
  const directEvidenceSourceIds = processLead
    ? [processLead.sourceId]
    : preferredAction ? actionEvidenceSourceIds : directDetail ? [directDetail.sourceId] : [];
  if (!directEvidenceSourceIds.length) return null;
  const answer = buildAnswerContract({
    directAnswer,
    keyDetails: groupedDetails.map((detail) => detail.text),
    nextStep: preferredAction?.label || displayedSources[0].title,
    actions: preferredAction ? [preferredAction] : [],
    sources: displayedSources,
    status: "verified",
    requestedDetails: result.requestedDetails,
    coveredDetails: covered,
    checkedAt: displayedSources[0].checkedAt,
    answerMode: "community-approved-operational",
    claims: [
      { text: directAnswer, evidenceSourceIds: directEvidenceSourceIds, approvalClaimIds: processLead ? processLead.approvalClaimIds : preferredAction ? actionApprovalClaimIds : (directDetail?.approvalClaimIds || []) },
      ...groupedDetails.map((detail) => ({ text: detail.text, evidenceSourceIds: [detail.sourceId], approvalClaimIds: detail.approvalClaimIds })),
    ],
    ...(options.routingPlan ? { routingPlan: options.routingPlan, routingDecision: "ai-planned" } : {}),
  });
  if (answer.confidence?.canAnswer !== true) return null;
  if (!approvedDraftCoversEveryFacet(question, {
    directAnswer,
    keyDetails: groupedDetails.map((detail) => detail.text),
    nextStep: answer.nextStep,
  }, answer.claims || [], displayedSources, result.requestedDetails)
    || !preservesRequestedContactValues({
      directAnswer,
      keyDetails: groupedDetails.map((detail) => detail.text),
      nextStep: answer.nextStep,
    }, displayedSources, result.requestedDetails)) return null;
  return {
    ...answer,
    authorityDecision: "exact-version-approved-claims",
  };
}

function approvedCompositionSources(sources = []) {
  return sources.filter((source) => source.canonicalScopedProjection).map((source) => ({
    id: source.id,
    title: source.title,
    sourceType: source.sourceType,
    checkedAt: source.checkedAt,
    staleAfter: source.staleAfter,
    text: source.text,
    excerpt: source.excerpt,
    facts: (source.facts || []).map((fact) => ({
      type: fact.type,
      value: fact.value,
      context: fact.context,
      facet: fact.facet,
      approvalClaim: fact.approvalClaim,
    })),
    actions: (source.actions || []).map((action) => ({
      id: action.id,
      label: action.label,
      url: action.url,
      actionType: action.actionType,
      context: action.context,
      approvalClaim: action.approvalClaim,
    })),
    canonicalScopedProjection: true,
    isOfficialResource: true,
  }));
}

function claimTextCoversDetail(text = "", detail = "") {
  const checks = {
    action: /\b(?:apply|book|click|continue|log in|open|pay|register|renew|reserve|select|sign in|submit|use|visit)\b/i,
    contact: /(?:@|\b(?:call|contact|email|phone)\b|\d{3}[-.)\s]\d{3})/i,
    date: /\b(?:date|day|week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)\b/i,
    hours: /\b(?:hours?|open|closed|a\.m\.|p\.m\.)\b/i,
    methods: /\b(?:method|option|pay|payment|ach|card|check|money order|bank|phone|email|text|online)\b/i,
    permission: /\b(?:allowed|approval|may|must|permitted|prohibited|required)\b/i,
    price: /(?:\$|%|\b(?:cost|fee|free|price|rate)\b)/i,
    specification: /\b(?:color|dimension|distance|finish|height|material|setback|size)\b/i,
    status: /\b(?:available|closed|currently|open|status|unavailable)\b/i,
  };
  return checks[detail]?.test(String(text)) === true;
}

function approvedDraftCoversEveryFacet(question, draft, claims, sources, requested = []) {
  const requestedDetails = [...new Set(requested)].filter(Boolean);
  if (!requestedDetails.length) return true;
  return requestedDetails.every((detail) => claims.some((claim) => {
    if (!claimTextCoversDetail(claim.text, detail)) return false;
    const cited = sources.filter((source) => claim.evidenceSourceIds.includes(source.id));
    const citedActions = cited.flatMap((source) => source.actions || []);
    return coveredDetails([detail], cited, citedActions, question).includes(detail);
  }));
}

function preservesRequestedContactValues(draft, sources, requested = []) {
  if (!requested.includes("contact")) return true;
  const answerText = [draft.directAnswer, ...(draft.keyDetails || []), draft.nextStep].filter(Boolean).join(" ").toLowerCase();
  const contactValues = sources.flatMap((source) => (source.facts || [])
    .filter((fact) => ["phone", "email"].includes(fact.type))
    .map((fact) => String(fact.value || "").trim().toLowerCase())
    .filter(Boolean));
  return contactValues.length > 0 && contactValues.every((value) => answerText.includes(value));
}

function approvedClaimsStayWithinProjection(claims, sources) {
  return claims.every((claim) => {
    const cited = sources.filter((source) => claim.evidenceSourceIds.includes(source.id || source.nodeId));
    if (!cited.length) return false;
    const evidence = cited.map((source) => [
      source.text,
      source.excerpt,
      ...(source.facts || []).flatMap((fact) => [fact.value, fact.context]),
      ...(source.actions || []).flatMap((action) => [action.label, action.context]),
    ].filter(Boolean).join(" ")).join(" ").toLowerCase();
    const materialWords = words(claim.text);
    if (!materialWords.length) return false;
    const evidenceWords = new Set(words(evidence));
    return materialWords.every((word) => evidenceWords.has(word));
  });
}

async function composeApprovedOperationalProjection(question, result, options = {}) {
  const fallback = approvedOperationalProjectionAnswer(question, result, options);
  if (!fallback) return null;
  // This overview is already assembled from approved facility facts and the
  // approved booking action. Optional prose rewriting cannot add coverage.
  if (fallback.answerMode === "community-approved-operational-overview") return fallback;
  const synthesize = options.synthesizeCommunityAnswer === false
    ? null
    : (options.synthesizeCommunityAnswer || defaultSynthesize);
  if (!synthesize) return fallback;
  const sources = approvedCompositionSources(result.sources || []);
  if (!sources.length) return fallback;
  const routingPlan = options.routingPlan || null;
  const requested = result.requestedDetails || routingPlan?.requestedDetails || [];
  const draft = await synthesize(question, sources, {
    ...(options.llmOptions || {}),
    routingPlan,
    approvedProjectionOnly: true,
    requiredDetails: requested,
  });
  const verified = verifyStructuredDraft(draft, sources, { question, routingPlan });
  if (!verified.valid
    || !directlyAnswersQuestionForm(question, verified.draft)
    || !approvedClaimsStayWithinProjection(verified.claims, sources)
    || !approvedDraftCoversEveryFacet(question, verified.draft, verified.claims, sources, requested)
    || !preservesRequestedContactValues(verified.draft, sources, requested)) return fallback;
  const composed = buildAnswerContract({
    directAnswer: verified.draft.directAnswer,
    keyDetails: verified.draft.keyDetails,
    nextStep: verified.draft.nextStep || fallback.nextStep,
    actions: fallback.actions,
    sources: fallback.sources,
    status: "verified",
    requestedDetails: requested,
    coveredDetails: requested,
    checkedAt: fallback.checkedAt,
    answerMode: "community-approved-operational-grounded-ai",
    claims: verified.claims,
    ...(routingPlan ? { routingPlan, routingDecision: "ai-planned" } : {}),
  });
  if (composed.confidence?.canAnswer !== true) return fallback;
  return { ...composed, authorityDecision: "exact-version-approved-claims" };
}

async function approvedOperationalActionAnswer(question, routingPlan, options = {}) {
  if (!routingPlan || !ACTION_GOALS.has(routingPlan.goal)) return null;
  const result = searchCommunityIndexWithQueries(question, routingPlan.searchQueries, {
    index: options.index,
    indexPath: options.indexPath,
    communityId: options.communityId,
    intent: routingPlan.intent,
    interpretation: routingPlan,
    allowPartialRequestedDetails: true,
    includeActionOnlyProjections: true,
    limit: 20,
    now: options.now,
  });
  result.intent = routingPlan.intent;
  const approvedSources = result.sources.filter((source) => source.canonicalScopedProjection);
  const goalSources = approvedSources.filter((source) => sourceSupportsGoal(source, routingPlan.goal));
  let actionSource = goalSources.find((source) => source.canonicalScopedProjection
    && (source.actions || []).some((action) => actionSupportsGoal(action, routingPlan.goal))
  );
  let preferredAction = actionForGoal(actionSource, routingPlan.goal);
  let preferredLeadFact = null;
  let primaryProcessSource = null;
  const isWaterPayment = routingPlan.goal === "payment"
    && /\b(?:water|utility)\b/i.test(`${question} ${routingPlan.subject || ""}`);
  if (isWaterPayment) {
    const directActionSource = approvedSources.find((source) => (source.actions || []).some((action) =>
      action.reviewDecisionId === "water-payment-direct-link"
        && action.approvalClaim === "direct-water-payment-link"
        && actionSupportsGoal(action, routingPlan.goal)
    ));
    primaryProcessSource = approvedSources.find((source) => (source.facts || []).some((fact) =>
      fact.reviewDecisionId === "water-payment-primary-page"
        && fact.approvalClaim === "primary-current-water-payment-page"
        && /\bPay Online\b/i.test(String(fact.context || ""))
    ));
    preferredLeadFact = (primaryProcessSource?.facts || []).find((fact) =>
      fact.reviewDecisionId === "water-payment-primary-page"
        && fact.approvalClaim === "primary-current-water-payment-page"
        && /\bPay Online\b/i.test(String(fact.context || ""))
    ) || null;
    if (directActionSource && primaryProcessSource && preferredLeadFact) {
      actionSource = directActionSource;
      preferredAction = actionForGoal(actionSource, routingPlan.goal);
    } else {
      preferredLeadFact = null;
      primaryProcessSource = null;
    }
  }
  const requested = routingPlan.requestedDetails || [];
  const selectedSources = [primaryProcessSource, actionSource];
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
  return composeApprovedOperationalProjection(question, result, { ...options, routingPlan, preferredAction, preferredLeadFact });
}

function approvedInstructionAction(source, fact, candidates = []) {
  const factText = String(fact?.context || fact?.value || "");
  const directUrl = factText.match(/https?:\/\/[^\s)]+/i)?.[0]?.replace(/[.,;:]+$/, "");
  if (directUrl) {
    const action = {
      label: `Open official ${source.title}`,
      url: directUrl,
      actionType: "information",
      approvalClaim: fact.approvalClaim,
    };
    Object.defineProperty(action, "directInstruction", { value: true });
    return action;
  }
  const contextualAction = candidates.flatMap((candidate) => candidate.actions || [])
    .find((action) => /\bif\b/i.test(String(action.context || ""))
      && tokens(factText).filter((token) => token.length >= 4).some((token) => String(action.context || "").toLowerCase().includes(token)));
  return contextualAction || null;
}

function conditionalInstructionMatchesQuestion(question, fact = {}) {
  const generic = new Set(["approval", "application", "architectural", "controlling", "design", "drc", "fee", "fees", "how", "needed", "need", "pay", "required", "resident", "residents", "review", "rule", "send", "submit", "where"]);
  // Normalize ordinary plural and compound wording before matching the
  // project subject. This lets a resident say “rainwater harvesting barrels”
  // while an approved projection says “rain-barrel”, without making generic
  // action words sufficient to activate a conditional process.
  const normalizeSubjectToken = (token) => String(token || "").toLowerCase()
    .replace(/^rainwater$/, "rain")
    .replace(/ies$/, "y")
    .replace(/s$/, "");
  const subjectTokens = tokens(question)
    .map(normalizeSubjectToken)
    .filter((token) => token.length >= 4 && !generic.has(token));
  const evidenceTokens = new Set(tokens(`${fact.context || ""} ${fact.value || ""}`)
    .flatMap((token) => token.split(/[-/]/).map(normalizeSubjectToken)));
  return subjectTokens.some((token) => evidenceTokens.has(token));
}

function isAccountAccessInstruction(source = {}, fact = {}) {
  const evidence = `${source.title || ""} ${fact.context || ""} ${fact.value || ""}`;
  return /\b(?:access|account|alert|monitor|portal|registration|threshold|usage)\b/i.test(evidence)
    && !/\b(?:pay online|payment options?|water billing)\b/i.test(evidence);
}

async function approvedOperationalInstructionAnswer(question, routingPlan, options = {}) {
  const requested = [...new Set(routingPlan?.requestedDetails || requestedDetails(question))];
  if (!requested.includes("action")) return null;
  // A conditional operational source can explain the next step, but it
  // cannot decide whether approval is needed. Let the governing-rule path
  // run first whenever the resident is also asking that permission question.
  if (requested.includes("permission") && options.answerRulesQuestion) return null;
  const accountAccess = routingPlan?.goal === "account-access" || isWaterUsageAccessRequest(question);
  const intent = routingPlan?.intent || classifyCommunityIntent(question);
  // Retrieval is intentionally claim-complete here. This helper will choose
  // only an exact approved instruction fact below, while the general action
  // path continues to require an approved link/submission claim.
  const queryPlan = { ...(routingPlan || {}), requestedDetails: [] };
  // The resident's project wording may differ from the approved projection
  // (for example, “rainwater harvesting barrels” versus “rain-barrel”).
  // Pair the resident query with generic process queries, then require the
  // distinctive project match below before a conditional instruction can be
  // used. This keeps retrieval broad without making the answer broad.
  const queries = [...new Set([question, "submit", "application", "conditional"])];
  const searches = [...new Set([intent, "forms", "services", "facilities"])].flatMap((candidateIntent) => queries.map((query) =>
    searchCommunityIndex(query, {
      index: options.index,
      indexPath: options.indexPath,
      communityId: options.communityId,
      intent: candidateIntent,
      interpretation: queryPlan,
      allowPartialRequestedDetails: true,
      includeActionOnlyProjections: true,
      limit: 20,
      now: options.now,
    })
  ));
  const candidates = searches.flatMap((result) => result.sources.map((source) => ({ source, result })))
    .filter(({ source }) => source.canonicalScopedProjection)
    .sort((left, right) => Number(right.source.score || 0) - Number(left.source.score || 0));
  const selected = candidates.find(({ source }) => {
    const fact = (source.facts || []).find((candidate) => candidate.type === "information"
      && /\b(?:go|open|select|register|sign in|log in|submit|visit|use)\b/i.test(candidate.context || candidate.value || ""));
    const conditional = /^\s*if\b/i.test(fact?.context || fact?.value || "");
    return fact && (accountAccess ? isAccountAccessInstruction(source, fact) : conditional && conditionalInstructionMatchesQuestion(question, fact))
      && Number(source.score || 0) >= 24 && hasDistinctiveCommunityEvidence(question, [source]);
  });
  if (!selected) return null;

  const source = sourceForDisplay(selected.source);
  const fact = (source.facts || []).find((candidate) => candidate.type === "information"
    && /\b(?:go|open|select|register|sign in|log in|submit|visit|use)\b/i.test(candidate.context || candidate.value || ""));
  if (!fact?.context) return null;
  const relatedSources = [...new Map(candidates.map(({ source: candidate }) => {
    const displayed = sourceForDisplay(candidate);
    return [displayed.id, displayed];
  })).values()];
  const action = approvedInstructionAction(source, fact, relatedSources);
  const details = (source.facts || []).filter((candidate) => candidate !== fact && candidate.type === "information")
    .map((candidate) => ({ text: String(candidate.context || candidate.value || "").trim(), claim: candidate.approvalClaim }))
    .filter((candidate) => candidate.text)
    .slice(0, 2);
  const actionSourceIds = action?.directInstruction
    ? [source.id]
    : action?.url
    ? relatedSources.filter((candidate) => candidate.sourceUrl === action.url || (candidate.actions || []).some((item) => item.url === action.url)).map((candidate) => candidate.id)
    : [];
  const claims = [
    { text: String(fact.context).trim(), evidenceSourceIds: [source.id], approvalClaimIds: fact.approvalClaim ? [fact.approvalClaim] : [] },
    ...details.map((detail) => ({ text: detail.text, evidenceSourceIds: [source.id], approvalClaimIds: detail.claim ? [detail.claim] : [] })),
  ];
  if (action?.context && actionSourceIds.length) {
    claims.push({ text: String(action.context).trim(), evidenceSourceIds: actionSourceIds, approvalClaimIds: action.approvalClaim ? [action.approvalClaim] : [] });
  }
  const instructionResponse = buildAnswerContract({
    directAnswer: String(fact.context).trim(),
    keyDetails: details.map((detail) => detail.text),
    nextStep: action?.label || source.title,
    actions: action ? [action] : [],
    sources: [source, ...relatedSources.filter((candidate) => actionSourceIds.includes(candidate.id) && candidate.id !== source.id)],
    status: "verified",
    // A conditional process source tells the resident how to proceed if a
    // separate governing rule requires approval; it cannot itself resolve
    // that permission question.
    requestedDetails: accountAccess ? requested : ["action"],
    coveredDetails: ["action"],
    checkedAt: source.checkedAt,
    answerMode: "community-approved-operational-instruction",
    claims,
    ...(routingPlan ? { routingPlan, routingDecision: "ai-planned" } : {}),
  });
  return instructionResponse.confidence?.canAnswer === true && approvedClaimsStayWithinProjection(instructionResponse.claims || [], instructionResponse.sources)
    ? { ...instructionResponse, authorityDecision: "exact-version-approved-claims" }
    : null;
}

function approvedOperationalSubmissionAnswer(question, routingPlan, options = {}) {
  const requested = [...new Set(routingPlan?.requestedDetails || requestedDetails(question))];
  const intent = routingPlan?.intent || classifyCommunityIntent(question);
  if (intent !== "forms" || !requested.includes("action")) return null;
  if (routingPlan && requested.includes("permission")) return null;
  if (!/\b(?:drc|design review)\b/i.test(question)
    || !/\b(?:submit|submission|send|email|drop off|deliver|turn in)\b/i.test(question)) return null;

  // Read the approved process claims without requiring every page in the
  // process to answer the action facet on its own. A directory link may live
  // on a separate page from the approved submission instructions, but both
  // must share the owner's exact review decision before they can be combined.
  const result = searchCommunityIndex(question, {
    index: options.index,
    indexPath: options.indexPath,
    communityId: options.communityId,
    intent,
    interpretation: { ...(routingPlan || {}), requestedDetails: [] },
    limit: 20,
    now: options.now,
  });
  const primary = result.sources.find((source) => source.canonicalScopedProjection
    && Number(source.score || 0) >= 24
    && hasDistinctiveCommunityEvidence(question, [source])
    && (source.facts || []).some((fact) => /\b(?:submit|email(?:ed)?|drop off|deliver)\b/i.test(fact.context || fact.value || ""))
  );
  if (!primary || !result.index) return null;
  const reviewState = sourceReviewState(result.index, new Date(options.now || Date.now()).getTime());
  const primaryDecisionIds = new Set(reviewState.entriesFor(primary)
    .map((entry) => entry.reviewDecisionId).filter(Boolean));
  if (!primaryDecisionIds.size) return null;
  const actionSource = (result.index.sources || []).find((source) => {
    if (source.communityId !== (options.communityId || result.index.communityId)) return false;
    const entries = reviewState.entriesFor(source).filter((entry) =>
      entry.factType === "link" && primaryDecisionIds.has(entry.reviewDecisionId)
    );
    return (source.actions || []).some((action) => entries.some((entry) =>
      entry.approvalClaim === action.approvalClaim && entry.normalizedValue === action.url
    ));
  });
  const action = actionSource && (actionSource.actions || []).find((candidate) => {
    const entries = reviewState.entriesFor(actionSource);
    return entries.some((entry) => entry.factType === "link"
      && entry.approvalClaim === candidate.approvalClaim
      && entry.normalizedValue === candidate.url
      && primaryDecisionIds.has(entry.reviewDecisionId));
  });
  if (!action) return null;

  const source = sourceForDisplay(primary);
  const actionEvidence = sourceForDisplay(actionSource);
  const facts = (source.facts || []).filter((fact) =>
    /\b(?:submit|email(?:ed)?|drop off|deliver)\b/i.test(fact.context || fact.value || "")
  ).slice(0, 2);
  if (!facts.length) return null;
  const displayAction = {
    id: action.id,
    label: action.label,
    url: action.url,
    actionType: action.actionType,
    approvalClaim: action.approvalClaim,
  };
  const claims = facts.map((fact) => ({
    text: String(fact.context || fact.value).trim(),
    evidenceSourceIds: [source.id],
    approvalClaimIds: fact.approvalClaim ? [fact.approvalClaim] : [],
  }));
  if (action.context) claims.push({
    text: String(action.context).trim(),
    evidenceSourceIds: [actionEvidence.id],
    approvalClaimIds: action.approvalClaim ? [action.approvalClaim] : [],
  });
  const answer = buildAnswerContract({
    directAnswer: String(facts[0].context || facts[0].value).trim(),
    keyDetails: facts.slice(1).map((fact) => String(fact.context || fact.value).trim()),
    nextStep: `Use “${displayAction.label}” below.`,
    actions: [displayAction],
    sources: [source, actionEvidence],
    status: "verified",
    requestedDetails: ["action"],
    coveredDetails: ["action"],
    checkedAt: source.checkedAt,
    answerMode: "community-approved-operational-submission",
    claims,
    ...(routingPlan ? { routingPlan, routingDecision: "ai-planned" } : {}),
  });
  return answer.confidence?.canAnswer === true && approvedClaimsStayWithinProjection(answer.claims || [], answer.sources)
    ? { ...answer, authorityDecision: "exact-version-approved-claims" }
    : null;
}

async function approvedOperationalContactAnswer(question, routingPlan, options = {}) {
  const requested = [...new Set(routingPlan?.requestedDetails || requestedDetails(question))];
  const asksForContact = requested.includes("contact") || routingPlan?.goal === "contact";
  if (!asksForContact) return null;

  const requestedType = /\bemail\b/i.test(question)
    ? "email"
    : /\b(?:phone|call|number)\b/i.test(question) ? "phone" : "";
  const contactInterpretation = { ...(routingPlan || {}), requestedDetails: ["contact"] };
  // A broad “who do I contact?” is still a contact-facet lookup. Adding the
  // facet term only for retrieval makes an approved email/phone projection
  // discoverable without changing the resident's question or inventing a
  // topic-specific shortcut.
  const contactQuery = requestedType ? question : `${question} email`;
  // A current, claim-scoped operational contact is more specific than a
  // general governing-document contact. Search the operational domains on
  // purpose: a rules-shaped question (for example, “What is the DRC email?”)
  // must not keep an older rulebook address simply because the word DRC also
  // appears in governing rules. The normal exact-version gate still removes
  // this candidate as soon as its approved source version changes.
  const operationalIntents = [...new Set([routingPlan?.intent, "forms", "services", "facilities"].filter(Boolean))];
  const candidates = operationalIntents.flatMap((intent) => {
    const result = searchCommunityIndex(contactQuery, {
      index: options.index,
      indexPath: options.indexPath,
      communityId: options.communityId,
      intent,
      interpretation: contactInterpretation,
      limit: 20,
      now: options.now,
    });
    return result.sources
      .filter((source) => source.canonicalScopedProjection)
      .filter((source) => (source.facts || []).some((fact) =>
        ["email", "phone"].includes(fact.type) && (!requestedType || fact.type === requestedType)
      ))
      .map((source) => ({ source, result }));
  }).sort((left, right) => Number(right.source.score || 0) - Number(left.source.score || 0));

  const selected = candidates.find(({ source }) =>
    Number(source.score || 0) >= 24 && hasDistinctiveCommunityEvidence(question, [source])
  );
  if (!selected) return null;

  // Preserve a single current operational source for a contact response.
  // This avoids presenting an unrelated second contact as equally valid.
  const source = sourceForDisplay(selected.source);
  const fact = bestContactCandidate(question, [source])?.fact;
  if (!fact?.value || !fact.context) return null;
  const contactPageAction = source.sourceUrl
    ? [{ label: source.title, url: source.sourceUrl, actionType: "contact" }]
    : [];
  const covered = requested.includes("action") ? ["contact", "action"] : ["contact"];
  const contactResponse = buildAnswerContract({
    directAnswer: String(fact.context).trim(),
    nextStep: contactPageAction[0]?.label || source.title,
    actions: contactPageAction,
    sources: [source],
    status: "verified",
    requestedDetails: requested,
    coveredDetails: covered,
    checkedAt: source.checkedAt,
    answerMode: "community-approved-operational-contact",
    claims: [{
      text: String(fact.context).trim(),
      evidenceSourceIds: [source.id],
      approvalClaimIds: fact.approvalClaim ? [fact.approvalClaim] : [],
    }],
    ...(routingPlan ? { routingPlan, routingDecision: "ai-planned" } : {}),
  });
  const renderedContact = [contactResponse.directAnswer, ...(contactResponse.keyDetails || []), contactResponse.nextStep].join(" ").toLowerCase();
  // A page can publish several service contacts. This approved projection
  // intentionally answers with the single fact that matched the resident's
  // requested service, so do not require unrelated contacts on that page to
  // appear in the response.
  if (contactResponse.confidence?.canAnswer !== true || !renderedContact.includes(String(fact.value).toLowerCase())) return null;
  return { ...contactResponse, authorityDecision: "exact-version-approved-claims" };
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

function dateWeekday(date = "") {
  const value = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(value.getTime()) ? value.getUTCDay() : -1;
}

const NAMED_HOLIDAY_PATTERN = /\b(?:Labor Day|Memorial Day|Independence Day|New Year(?:'s|s)? Day|Christmas(?: Day)?|Thanksgiving(?: Day)?|Martin Luther King(?: Jr\.?)? Day|Presidents?' Day|Juneteenth)\b/i;

function holidayNameFromText(value = "") {
  return String(value).match(NAMED_HOLIDAY_PATTERN)?.[0] || "";
}

function isHolidayHoursRequest(value = "") {
  return /\bholidays?\b/i.test(String(value)) || NAMED_HOLIDAY_PATTERN.test(String(value));
}

function namedHolidayDate(holidayName = "", now = Date.now()) {
  const reference = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(reference.getTime()) || !holidayName) return "";
  const name = holidayName.toLowerCase();
  const dateForYear = (year) => {
    const format = (month, day) => `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const nthWeekday = (month, weekday, occurrence) => {
      const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
      return 1 + ((weekday - firstWeekday + 7) % 7) + (occurrence - 1) * 7;
    };
    const lastWeekday = (month, weekday) => {
      const lastDay = new Date(Date.UTC(year, month + 1, 0));
      return lastDay.getUTCDate() - ((lastDay.getUTCDay() - weekday + 7) % 7);
    };
    if (/new year/.test(name)) return format(0, 1);
    if (/martin luther king/.test(name)) return format(0, nthWeekday(0, 1, 3));
    if (/presidents?/.test(name)) return format(1, nthWeekday(1, 1, 3));
    if (/memorial/.test(name)) return format(4, lastWeekday(4, 1));
    if (/juneteenth/.test(name)) return format(5, 19);
    if (/independence/.test(name)) return format(6, 4);
    if (/labor/.test(name)) return format(8, nthWeekday(8, 1, 1));
    if (/thanksgiving/.test(name)) return format(10, nthWeekday(10, 4, 4));
    if (/christmas/.test(name)) return format(11, 25);
    return "";
  };
  const year = reference.getUTCFullYear();
  const current = dateForYear(year);
  const referenceDate = reference.toISOString().slice(0, 10);
  return current && current < referenceDate ? dateForYear(year + 1) : current;
}

function explicitHolidayHours(text = "", holidayName = "") {
  if (!holidayName) return "";
  const escaped = holidayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const start = String(text).search(new RegExp(`\\b${escaped}\\b\\s*(?:hours?)?\\s*[:–-]\\s*`, "i"));
  if (start < 0) return "";
  let segment = String(text).slice(start, start + 320);
  const sentenceEnd = segment.search(/\.(?:\s|$)/);
  if (sentenceEnd > 0) segment = segment.slice(0, sentenceEnd + 1);
  return /\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)/i.test(segment)
    ? segment.replace(/\s+/g, " ").trim()
    : "";
}

function regularScheduleForDate(text = "", date = "") {
  const weekday = dateWeekday(date);
  if (weekday < 0) return null;
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const labels = weekday === 6 ? ["Saturday", "Weekends"] : weekday === 0 ? ["Sunday", "Weekends"] : [dayNames[weekday], "Monday-Friday", "Monday to Friday", "Weekdays"];
  const labelPattern = (item) => item === "Monday-Friday" ? "Monday\\s*[-–]\\s*Friday" : item.replace(/ /g, "\\s+");
  const label = labels.find((item) => new RegExp(`\\b${labelPattern(item)}\\s*:`, "i").test(text));
  if (!label) return null;
  const start = text.search(new RegExp(`\\b${labelPattern(label)}\\s*:`, "i"));
  const laterLabels = label === dayNames[weekday]
    ? [...dayNames.filter((item) => item !== label), "Guest Passes", "Rules to Remember"]
    : weekday === 6 ? ["Sunday"] : weekday === 0 ? ["Guest Passes", "Rules to Remember"] : ["Saturday"];
  const tail = text.slice(start);
  const endMatches = laterLabels.map((item) => tail.search(new RegExp(`\\b${item.replace(/ /g, "\\s+")}\\b`, "i"))).filter((index) => index > 0);
  let segment = tail.slice(0, endMatches.length ? Math.min(...endMatches) : 700);
  if (weekday !== 2 && weekday !== 4) segment = segment.replace(/Tuesday\s*(?:&|and)\s*Thursday\s*[-:]?\s*[^.]*?\./i, "");
  if (!/\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)/i.test(segment)) return null;
  return {
    detail: segment.replace(/\s+/g, " ").trim(),
    labelForResident: /^(?:Monday-Friday|Monday to Friday|Weekdays)$/i.test(label) ? "weekday" : label,
  };
}

function holidayFacilityHoursAnswer(question, result, options = {}) {
  if (!isHolidayHoursRequest(question)) return null;
  const requested = options.routingPlan?.requestedDetails || result.requestedDetails || [];
  if (!requested.includes("hours") && !/\bhours?\b/i.test(question)) return null;
  const holidayName = holidayNameFromText(options.routingPlan?.dateRange?.label || question);
  const holidayDate = options.routingPlan?.dateRange?.start || namedHolidayDate(holidayName, options.now);
  const dateLabel = holidayDate
    ? formatDate(holidayDate)
    : holidayName || "the requested holiday";
  const suppliedNow = options.now ?? Date.now();
  const answerNow = typeof suppliedNow === "string" ? Date.parse(suppliedNow) : Number(suppliedNow);

  for (const source of result.sources || []) {
    if (source.canonicalScopedProjection !== true) continue;
    const text = String(source.text || source.excerpt || "").replace(/\s+/g, " ").trim();
    const publishedHolidayHours = explicitHolidayHours(text, holidayName);
    const season = recurringSeasonCoverage(text, holidayDate);
    const stale = isFreshnessTrackedSource(source) && source.staleAfter && new Date(source.staleAfter).getTime() < answerNow;
    const historicalCapture = capturedProjectionCoversPastDate(
      source,
      holidayDate,
      suppliedNow,
      options.communityProfile?.timezone || "UTC",
      Boolean(publishedHolidayHours) || (season.declared && season.covers)
    );
    if (stale && !historicalCapture) continue;
    const sourceForAnswer = sourceForDisplay(source);
    if (publishedHolidayHours) {
      const directAnswer = `For ${dateLabel}, the published ${holidayName} hours are: ${publishedHolidayHours}`;
      return buildAnswerContract({
        directAnswer,
        keyDetails: [],
        nextStep: `Open ${source.title}`,
        actions: [{ label: `Open official ${source.title}`, url: source.sourceUrl, actionType: "information" }],
        sources: [sourceForAnswer],
        status: "verified",
        requestedDetails: requested,
        coveredDetails: requested.filter((detail) => ["hours", "date"].includes(detail)),
        checkedAt: source.checkedAt,
        answerMode: "community-dated-facility-holiday-hours",
        claims: [{ text: directAnswer, evidenceSourceIds: [sourceForAnswer.id] }],
      });
    }

    const holidayContext = season.statement || text.split(/(?<=[.!?])\s+/).find((sentence) =>
      (!holidayName || sentence.toLowerCase().includes(holidayName.toLowerCase()))
        && /\b(?:open|season|through)\b/i.test(sentence)
    ) || "";
    const regularSchedule = !season.declared || season.covers ? regularScheduleForDate(text, holidayDate) : null;
    const directAnswer = season.declared && !season.covers
      ? `${season.statement} ${dateLabel} falls outside that published recurring season, so I can’t verify facility hours for that date.`
      : holidayContext
      ? `${holidayContext} The approved source does not publish separate ${holidayName || "holiday"} hours, so I can’t verify the holiday schedule for ${dateLabel}.`
      : `The approved source does not publish hours specifically for ${holidayName || dateLabel}, so I can’t verify the holiday schedule.`;
    const keyDetails = regularSchedule
      ? [`For reference, the regular ${regularSchedule.labelForResident.toLowerCase()} schedule shown on that page is: ${regularSchedule.detail}`]
      : [];
    return buildAnswerContract({
      directAnswer,
      keyDetails,
      nextStep: `Open ${source.title}`,
      actions: [{ label: `Open official ${source.title}`, url: source.sourceUrl, actionType: "information" }],
      sources: [sourceForAnswer],
      status: "verified-incomplete",
      requestedDetails: requested,
      coveredDetails: holidayContext && requested.includes("date") ? ["date"] : [],
      checkedAt: source.checkedAt,
      answerMode: "community-dated-facility-hours-holiday-boundary",
      claims: [holidayContext, ...keyDetails].filter(Boolean).map((claim) => ({ text: claim, evidenceSourceIds: [sourceForAnswer.id] })),
    });
  }
  return null;
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
    const approvedText = source.canonicalScopedProjection === true
      ? String(source.text || source.excerpt || "").replace(/\s+/g, " ").trim()
      : "";
    const holidayName = holidayNameFromText(plan.dateRange.label || question);
    const holidayHours = explicitHolidayHours(approvedText, holidayName);
    const season = recurringSeasonCoverage(approvedText, plan.dateRange.start);
    const historicalCapture = capturedProjectionCoversPastDate(
      source,
      plan.dateRange.start,
      suppliedNow,
      options.communityProfile?.timezone || "UTC",
      Boolean(holidayHours) || (season.declared && season.covers)
    );
    if (stale && !historicalCapture) {
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
        nextStep: `Open ${source.title}`,
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
    // Current hours may be rendered only from an exact, owner-approved claim
    // projection. A raw page body can still identify the official page for a
    // safe fallback, but it cannot silently become a resident-facing schedule.
    if (source.canonicalScopedProjection !== true) continue;
    const text = approvedText;
    const holidayRequest = isHolidayHoursRequest(plan.dateRange.label || question);
    const sourceForAnswer = sourceForDisplay(source);
    if (holidayHours) {
      const directAnswer = `For ${dateLabel}, the published ${holidayName} hours are: ${holidayHours}`;
      return buildAnswerContract({
        directAnswer,
        keyDetails: [],
        nextStep: `Open ${source.title}`,
        actions: [{ label: `Open official ${source.title}`, url: source.sourceUrl, actionType: "information" }],
        sources: [sourceForAnswer],
        status: "verified",
        requestedDetails: plan.requestedDetails,
        coveredDetails: ["hours", "date"],
        checkedAt: source.checkedAt,
        answerMode: "community-dated-facility-holiday-hours",
        claims: [{ text: directAnswer, evidenceSourceIds: [sourceForAnswer.id] }],
      });
    }
    if (season.declared && !season.covers) {
      const directAnswer = `${season.statement} ${dateLabel} falls outside that published recurring season, so I can’t verify facility hours for that date.`;
      return buildAnswerContract({
        directAnswer,
        keyDetails: [],
        nextStep: `Open ${source.title}`,
        actions: [{ label: `Open official ${source.title}`, url: source.sourceUrl, actionType: "information" }],
        sources: [sourceForAnswer],
        status: "verified-incomplete",
        requestedDetails: plan.requestedDetails,
        coveredDetails: plan.requestedDetails.includes("date") ? ["date"] : [],
        checkedAt: source.checkedAt,
        answerMode: "community-dated-facility-hours-season-boundary",
        claims: [{ text: season.statement, evidenceSourceIds: [sourceForAnswer.id] }],
      });
    }
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
    const detail = segment.replace(/\s+/g, " ").trim();
    const labelForResident = /^(?:Monday-Friday|Monday to Friday|Weekdays)$/i.test(label) ? "weekday" : label;
    if (holidayRequest) {
      const holidayContext = text.split(/(?<=[.!?])\s+/).find((sentence) =>
        (!holidayName || sentence.toLowerCase().includes(holidayName.toLowerCase()))
          && /\b(?:open|season|through)\b/i.test(sentence)
      ) || "";
      const directAnswer = holidayContext
        ? `${holidayContext} The approved source does not publish separate ${holidayName || "holiday"} hours, so I can’t verify that its regular ${labelForResident.toLowerCase()} schedule applies on ${dateLabel}.`
        : `The approved source does not publish hours specifically for ${holidayName || dateLabel}, so I can’t verify the holiday schedule.`;
      const regularSchedule = `For reference, the regular ${labelForResident.toLowerCase()} schedule shown on that page is: ${detail}`;
      return buildAnswerContract({
        directAnswer,
        keyDetails: [regularSchedule],
        nextStep: `Open ${source.title}`,
        actions: [{ label: `Open official ${source.title}`, url: source.sourceUrl, actionType: "information" }],
        sources: [sourceForAnswer],
        status: "verified-incomplete",
        requestedDetails: plan.requestedDetails,
        coveredDetails: holidayContext ? ["date"] : [],
        checkedAt: source.checkedAt,
        answerMode: "community-dated-facility-hours-holiday-boundary",
        claims: [holidayContext, regularSchedule].filter(Boolean).map((claim) => ({ text: claim, evidenceSourceIds: [sourceForAnswer.id] })),
      });
    }
    const directAnswer = `For ${dateLabel}, the published ${labelForResident.toLowerCase()} hours are: ${detail}`;
    return buildAnswerContract({
      directAnswer,
      keyDetails: ["These are the published hours for that weekday."],
      nextStep: `Open ${source.title}`,
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
      directAnswer: "The current official sources don’t agree, so I can’t safely choose one value.",
      nextStep: `Open the official ${sources[0].title} source below or contact the CAB to confirm the current value.`,
      actions: relevantActions(question, sources, 3, options.routingPlan),
      sources,
      status: "conflicting-sources",
      conflicts,
      requestedDetails: result.requestedDetails,
      answerMode: "community-source-conflict",
    });
  }
  const holidayHours = holidayFacilityHoursAnswer(question, { ...result, sources }, options);
  if (holidayHours) return holidayHours;
  const datedHours = datedFacilityHoursAnswer(question, result, options);
  if (datedHours) return datedHours;

  const approvedProjection = await composeApprovedOperationalProjection(question, result, {
    ...options,
    routingPlan: options.routingPlan,
  });
  if (approvedProjection) return approvedProjection;

  // Contact details outside an exact owner-approved projection remain on the
  // deterministic path so a general synthesis cannot omit or paraphrase them.
  if (result.requestedDetails.includes("contact") || options.routingPlan?.goal === "contact") {
    const missingOrganization = missingRequestedOrganization(question, sources);
    if (missingOrganization) return missingContactAnswer(missingOrganization, options.routingPlan, { index: result.index, profile: options.communityProfile, sources, question });
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
    answerVerdict: ["verified", "verified-incomplete"].includes(composed.answerStatus)
      ? rulesAnswer.answerVerdict
      : "unverified",
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

function residentStatusText(status = {}) {
  return String(status.summary || status.headline || "")
    .replace(/^The official\s+[^:]+\s+status is\s+[^:]+:\s*/i, "")
    .trim()
    .replace(/^([a-z])/, (letter) => letter.toUpperCase());
}

function poolStatusAnswer(status, requested = ["status"], options = {}) {
  const requestedDetails = Array.isArray(requested) && requested.length ? [...new Set(requested)] : ["status"];
  const envelope = status.evidenceEnvelope;
  const activeCommunityId = options.communityId || options.communityProfile?.communityId;
  const nowValue = typeof options.now === "function" ? options.now() : (options.now || Date.now());
  const now = new Date(nowValue).getTime();
  const statusEvidence = envelope?.evidence?.find((item) => item?.evidenceId && item.communityId === activeCommunityId);
  const statusClaim = envelope?.claims?.find((claim) => claim?.facet === "status" && claim.controllingEvidenceId === statusEvidence?.evidenceId);
  const staleEvidence = !statusEvidence?.staleAfter || Number.isNaN(new Date(statusEvidence.staleAfter).getTime()) || new Date(statusEvidence.staleAfter).getTime() <= now;
  const healthyEnvelope = Boolean(activeCommunityId && envelope && (
    envelope.communityId === activeCommunityId
    && envelope.connectorFamily === "live-status"
    && envelope.degradation?.state === "healthy"
    && envelope.coverage?.covered?.includes("status")
    && statusEvidence
    && statusClaim
    && statusClaim.text === status.headline
    && !staleEvidence
  ));
  if (!healthyEnvelope || status.stale) return null;
  const coveredDetails = requestedDetails.includes("status") ? ["status"] : [];
  const evidence = statusEvidence;
  const poolConnector = configuredStatusConnector(options.communityProfile);
  const poolActionLabel = status.actionLabel || poolConnector?.adapter?.labels?.openAction || "";
  const statusSource = { title: poolConnector?.adapter?.labels?.calendarTitle || poolActionLabel || options.communityProfile?.shortName || options.communityProfile?.name || "", sourceUrl: status.sourceUrl, text: `${status.headline}. ${status.summary}`, excerpt: status.summary, authorityScore: 1, checkedAt: status.checkedAt, isOfficialResource: true, connectorType: envelope.connectorFamily, sourceType: "status", capabilities: ["status"], ...(evidence ? { id: evidence.evidenceId, communityId: envelope.communityId, staleAfter: evidence.staleAfter, controllingSourceRole: evidence.controllingSourceRole, authorityFacets: ["status"] } : {}) };
  const residentStatus = residentStatusText(status);
  return { ...buildAnswerContract({
    directAnswer: residentStatus || status.headline,
    keyDetails: status.stale ? ["The latest refresh failed, so this may be an older status."] : [],
    nextStep: status.residentAction,
    actions: poolActionLabel ? [{ label: poolActionLabel, url: status.actionUrl || status.sourceUrl, actionType: "status" }] : [],
    sources: [statusSource],
    status: "verified",
    requestedDetails,
    coveredDetails,
    checkedAt: status.checkedAt,
    answerMode: "community-live-status",
    claims: [
      { text: status.headline, evidenceSourceIds: [statusSource.id] },
    ],
  }), evidenceEnvelope: envelope, _connectorDiagnostics: { sourceOutcome: "ok", beforeFilterCount: 1, afterFilterCount: 1, appliedFilters: [] } };
}

function isPoolSeasonReopeningRequest(question = "", routingPlan = {}) {
  const text = String(question).replace(/\s+/g, " ").trim();
  const context = `${text} ${routingPlan?.subject || ""} ${routingPlan?.filters?.facility || ""}`;
  if (!/\bpool\b/i.test(context)) return false;
  if (/\b(?:build|building|construct|construction|planned|new)\s+(?:community\s+)?pool\b/i.test(text)) return false;
  if (/\b(?:reopen|reopens|reopening|open again)\b/i.test(text)) return true;
  if (/\bpool\b.{0,60}\b(?:next summer|next season|closed for (?:the )?season|until (?:next )?(?:summer|season))\b/i.test(text)) return true;
  if (/\b(?:when|what date)\b.{0,60}\bpool\b.{0,30}\bopen\b/i.test(text)
    && !/\b(?:what time|hours?|daily|each day|today|tomorrow)\b/i.test(text)) return true;
  return false;
}

function approvedPoolSeasonProjection(index = {}, options = {}) {
  const activeCommunityId = options.communityId || options.communityProfile?.communityId || index.communityId;
  const poolStatusConfig = configuredStatusConnector(options.communityProfile)?.adapter?.poolStatus;
  const approvalClaim = String(poolStatusConfig?.approvedSeasonProjection?.approvalClaim || "").trim();
  const reviewDecisionId = String(poolStatusConfig?.approvedSeasonProjection?.reviewDecisionId || "").trim();
  const season = poolStatusConfig?.season;
  if (!approvalClaim || !reviewDecisionId || !season?.kind || !season.startLabel || !season.endLabel) return null;
  const nowValue = typeof options.now === "function" ? options.now() : (options.now || Date.now());
  const now = new Date(nowValue).getTime();
  const source = (index.sources || []).find((item) => item?.communityId === activeCommunityId
    && item.lifecycle === "current"
    && (item.facts || []).some((fact) => fact.approvalClaim === approvalClaim));
  const staleAfter = new Date(source?.staleAfter || "").getTime();
  if (!source || !Number.isFinite(staleAfter) || staleAfter <= now) return null;
  const entry = sourceReviewState(index, now).entriesFor(source).find((item) =>
    item.approvalClaim === approvalClaim
      && item.reviewDecisionId === reviewDecisionId
      && item.sourceVersion === source.contentHash
      && String(item.supportingText || "").toLowerCase().includes(`${season.startLabel} through ${season.endLabel}`.toLowerCase())
  );
  if (!entry) return null;
  const seasonText = `The official recurring pool season runs from ${season.startLabel} through ${season.endLabel}.`;
  return {
    text: seasonText,
    source: sourceForDisplay({
      ...source,
      text: entry.supportingText,
      excerpt: entry.supportingText,
      actions: [],
      facts: (source.facts || []).filter((fact) => fact.approvalClaim === approvalClaim
        && fact.sourceVersion === source.contentHash),
      authorityFacets: ["facility-hours"],
    }),
    approvalClaim: entry.approvalClaim,
    season,
  };
}

function poolSeasonReopeningAnswer(status, seasonProjection = null, options = {}) {
  const current = poolStatusAnswer(status, ["status", "date"], options);
  if (!current) return null;
  const nowValue = typeof options.now === "function" ? options.now() : (options.now || Date.now());
  const outsideApprovedSeason = seasonProjection
    && withinConfiguredPoolSeason(nowValue, seasonProjection.season) === false;
  const residentStatus = residentStatusText(status);
  const currentStatus = status.state === "closed" && outsideApprovedSeason
    ? "The pool is closed for the season."
    : residentStatus;
  const exactDateBoundary = "I can’t confirm next summer’s exact opening date from the current approved CAB information.";
  const sources = [...current.sources, ...(seasonProjection ? [seasonProjection.source] : [])];
  const statusSourceId = current.sources[0]?.id || current.sources[0]?.nodeId;
  const seasonSourceId = seasonProjection?.source?.id || seasonProjection?.source?.nodeId;
  return {
    ...buildAnswerContract({
      directAnswer: `${currentStatus} ${exactDateBoundary}`,
      keyDetails: seasonProjection ? [seasonProjection.text] : [],
      nextStep: current.nextStep,
      actions: current.actions,
      sources,
      status: "verified-incomplete",
      requestedDetails: ["status", "date"],
      coveredDetails: ["status"],
      checkedAt: status.checkedAt,
      answerMode: "community-live-pool-season-reopening",
      claims: [
        ...(statusSourceId ? [{ text: status.headline, evidenceSourceIds: [statusSourceId] }] : []),
        ...(seasonSourceId ? [{ text: seasonProjection.text, evidenceSourceIds: [seasonSourceId], approvalClaimIds: [seasonProjection.approvalClaim] }] : []),
      ],
      completionEvidence: {
        missingDetails: [{ key: "date", reason: "missing-evidence" }],
      },
    }),
    communityIntent: "status",
    evidenceEnvelope: status.evidenceEnvelope,
    _connectorDiagnostics: current._connectorDiagnostics,
  };
}

function readableEventDate(dateValue, range = {}, checkedAt = "") {
  if (dateValue === range.start && range.start === range.end && /^(?:today|tomorrow|yesterday)$/i.test(range.label || "")) {
    return range.label.toLowerCase();
  }
  const match = String(dateValue || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(dateValue || "");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const checkedYear = new Date(checkedAt || Date.now()).getUTCFullYear();
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    ...(date.getUTCFullYear() === checkedYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  }).format(date);
}

function readableEventTime(timeValue) {
  const match = String(timeValue || "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return String(timeValue || "");
  const hour24 = Number(match[1]);
  const hour = hour24 % 12 || 12;
  const minutes = match[2] === "00" ? "" : `:${match[2]}`;
  return `${hour}${minutes} ${hour24 < 12 ? "a.m." : "p.m."}`;
}

function eventsAnswer(result, requested = [], routingPlan = {}) {
  const requestedDetails = Array.isArray(requested) ? [...new Set(requested)] : [];
  const eventDetail = (event) => {
    const date = readableEventDate(event.date, result.range, result.checkedAt);
    const time = readableEventTime(event.time);
    const detail = `${event.title} is ${date}${time ? ` at ${time}` : ""}${event.location ? ` in ${event.location}` : ""}`;
    return /[.!?]$/.test(detail) ? detail : `${detail}.`;
  };
  const details = result.events.map(eventDetail);
  const diagnostics = result.diagnostics || {};
  const envelope = result.evidenceEnvelope;
  const calendarEvidence = envelope?.evidence?.[0];
  const eventDateClaims = new Map((envelope?.claims || []).filter((claim) => claim.facet === "event-date").map((claim) => [claim.id, claim]));
  const healthy = diagnostics.parserHealthy !== false
    && diagnostics.sourceOutcome !== "partial"
    && diagnostics.sourceOutcome !== "unavailable"
    && envelope?.degradation?.state !== "degraded";
  const coveredDetails = requestedDetails.filter((detail) => {
    if (!healthy) return false;
    if (detail === "date") return !envelope || envelope.coverage?.covered?.includes("date");
    if (detail === "examples") return true;
    if (detail === "action") {
      return routingPlan.goal === "registration" && (envelope?.actions || []).some((action) => action.type === "registration");
    }
    return false;
  });
  const calendarSource = {
    title: result.calendarLabel || "Official community calendar",
    sourceUrl: result.sourceUrl,
    text: "Official current community calendar",
    excerpt: "Official current community calendar",
    authorityScore: 1,
    checkedAt: result.checkedAt,
    isOfficialResource: true,
    ...(calendarEvidence ? {
      id: calendarEvidence.evidenceId,
      communityId: calendarEvidence.communityId,
      connectorType: envelope.connectorFamily,
      sourceType: "events",
      staleAfter: calendarEvidence.staleAfter,
      controllingSourceRole: calendarEvidence.controllingSourceRole,
      authorityFacets: ["event-date"],
      canonicalScopedProjection: false,
    } : {}),
  };
  const eventSource = (event) => ({
    id: calendarEvidence ? `${calendarEvidence.evidenceId}:event-${event.id}` : undefined,
    communityId: calendarEvidence?.communityId,
    title: event.title,
    sourceUrl: event.url,
    text: eventDetail(event),
    excerpt: eventDetail(event),
    authorityScore: 1,
    checkedAt: result.checkedAt,
    staleAfter: calendarEvidence?.staleAfter,
    connectorType: envelope?.connectorFamily,
    sourceType: "events",
    controllingSourceRole: calendarEvidence?.controllingSourceRole,
    authorityFacets: eventDateClaims.has(`event-${event.id}`) ? ["event-date"] : [],
    canonicalScopedProjection: false,
    isOfficialResource: true,
  });
  const calendarAction = { label: result.calendarActionLabel || calendarSource.title, url: result.sourceUrl, actionType: "calendar" };
  if (!details.length) {
    if (!diagnostics.parserHealthy) {
      return { ...buildAnswerContract({
        directAnswer: `I couldn’t read the official calendar for ${result.range.label} just now.`,
        nextStep: calendarAction.label,
        actions: [calendarAction],
        sources: [calendarSource],
        status: "source-unavailable",
        requestedDetails,
        coveredDetails: [],
        checkedAt: result.checkedAt,
        answerMode: "community-live-events",
      }), _connectorDiagnostics: diagnostics };
    }
    if (diagnostics.appliedFilters?.length && result.alternatives?.length) {
      const filterLabel = [...new Set(diagnostics.appliedFilters.map((filter) => filter.value))].join(" and ");
      const alternatives = result.alternatives.map(eventDetail);
      const actions = [
        ...result.alternatives.map((event) => ({ label: event.title, url: event.url, actionType: "event" })),
        calendarAction,
      ];
      return { ...buildAnswerContract({
        directAnswer: `I couldn’t find an event matching “${filterLabel}” for ${result.range.label}. The official calendar has ${result.alternatives.length} other ${result.alternatives.length === 1 ? "event" : "events"}.`,
        keyDetails: alternatives,
        nextStep: actions[0]?.label || calendarAction.label,
        actions,
        sources: [calendarSource, ...result.alternatives.map(eventSource)],
        status: healthy && coveredDetails.length === requestedDetails.length ? "verified" : "verified-incomplete",
        requestedDetails,
        coveredDetails,
        checkedAt: result.checkedAt,
        answerMode: "community-live-events",
      }), _connectorDiagnostics: diagnostics };
    }
    return { ...buildAnswerContract({
      directAnswer: `The official calendar doesn’t list any events for ${result.range.label}.`,
      nextStep: calendarAction.label,
      actions: [calendarAction],
      sources: [calendarSource],
      status: healthy && coveredDetails.length === requestedDetails.length ? "verified" : "verified-incomplete",
      requestedDetails,
      coveredDetails,
      claims: calendarEvidence ? [{ text: `The official calendar doesn’t list any events for ${result.range.label}.`, evidenceSourceIds: [calendarEvidence.evidenceId] }] : [],
      checkedAt: result.checkedAt,
      answerMode: "community-live-events",
    }), _connectorDiagnostics: diagnostics };
  }
  const actions = result.events.map((event) => ({ label: event.title, url: event.url, actionType: "event" }));
  return { ...buildAnswerContract({
    directAnswer: `The official calendar has ${details.length} ${details.length === 1 ? "event" : "events"} ${result.range.label}.`,
    keyDetails: details,
    nextStep: "Open an event below for details or registration information.",
    actions,
    sources: calendarEvidence ? [calendarSource, ...result.events.map(eventSource)] : result.events.map(eventSource),
    claims: calendarEvidence ? result.events.map((event) => eventDateClaims.get(`event-${event.id}`)).filter(Boolean).map((claim) => ({
      text: claim.text,
      kind: "event-date",
      evidenceSourceIds: [claim.controllingEvidenceId],
      verified: true,
    })) : [],
    status: healthy && coveredDetails.length === requestedDetails.length ? "verified" : "verified-incomplete",
    requestedDetails,
    coveredDetails,
    checkedAt: result.checkedAt,
    answerMode: "community-live-events",
  }), _connectorDiagnostics: diagnostics, ...(calendarEvidence ? {
    authorityDecision: "dynamic-calendar-event-date-only",
    facetAuthority: { "event-date": [calendarEvidence.evidenceId] },
    claimAuthorityBoundary: { dynamicClaims: ["event-date"], staticClaims: "exact-version-approval-required" },
  } : {}) };
}

function eventFailureActions(options = {}) {
  const connector = configuredEventsConnector(options.communityProfile);
  const adapter = connector?.adapter;
  const endpoint = configuredEventsEndpoint(adapter);
  const url = endpoint?.url || connector?.baseUrl || options.communityProfile?.website || options.index?.website;
  if (!url) return [];
  return [{ label: adapter?.labels?.openAction || connector?.id || "", url, actionType: "calendar" }];
}

function configuredCalendarAccessAnswer(question, options = {}) {
  if (!/\bcalendar\b/i.test(question) || !/\b(?:access|open|view|find|see)\b/i.test(question)) return null;
  const connector = configuredEventsConnector(options.communityProfile);
  const endpoint = configuredEventsEndpoint(connector?.adapter || {});
  const url = endpoint?.url || connector?.baseUrl;
  const title = connector?.adapter?.labels?.calendarTitle;
  const label = connector?.adapter?.labels?.openAction;
  if (!url || !title || !label) return null;
  const source = sourceForDisplay({
    id: `${options.communityProfile?.communityId || "community"}-${connector.id}-resource`,
    communityId: options.communityProfile?.communityId || "",
    title,
    sourceUrl: url,
    sourceType: "events",
    connectorType: connector.type,
    text: title,
    excerpt: title,
  });
  return buildAnswerContract({
    directAnswer: `Use the ${title} link below.`,
    nextStep: label,
    actions: [{ label, url, actionType: "calendar" }],
    sources: [source],
    status: "verified",
    requestedDetails: ["action"],
    coveredDetails: ["action"],
    answerMode: "official-resource",
  });
}

function connectorActionAuthorityMatches(question, plan = {}, envelope = null) {
  if (!envelope || !(plan.requestedDetails || []).includes("action")) return true;
  const text = `${question || ""} ${plan.subject || ""} ${(plan.searchQueries || []).join(" ")}`;
  const requestedType = plan.goal === "booking" || /\b(?:book|booking|reserve|reservation|rent|rental)\b/i.test(text)
    ? "booking"
    : plan.goal === "payment" || /\b(?:pay|payment|billing|bill)\b/i.test(text)
      ? "payment"
      : plan.goal === "application" || /\b(?:apply|application|submit|submission|form)\b/i.test(text)
        ? "form"
        : plan.goal === "registration" || /\b(?:register|registration|sign up|enroll)\b/i.test(text)
          ? "registration"
          : plan.goal === "account-access" || /\b(?:log ?in|sign ?in|account|password|portal)\b/i.test(text)
            ? "account"
            : "";
  return !requestedType || (envelope.actionTypes || []).includes(requestedType);
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
    source.sourceType === "rules"
      || /library\.municode\.com/i.test(source.sourceUrl || "")
      || (/^\s*(?:\(?[a-z]\)?\(?\d+\)?|Sec\.)/i.test(source.title || "")
        && /\b(?:allowed|approval|required|prohibited|may|must)\b/i.test(source.excerpt || source.text || ""))
  );
  const hasPermissionConclusion = ["allowed", "prohibited", "conditional"].includes(answer?.answerVerdict)
    || /\b(?:allowed|approval is required|prohibited|may not|must)\b/i.test(answer?.answer || "");
  const isScopedToControllingEvidence = answer?.controllingSourceOnly === true
    || answer?.authorityDecision === "rulebook-controls-binding-claim"
    || ((answer?.sources || []).length === 1 && /\b(?:allowed|approval|required|prohibited|may|must)\b/i.test(answer.sources[0]?.excerpt || answer.sources[0]?.text || ""));
  return answer?.confidence?.canAnswer === true
    && hasPermissionConclusion
    && hasControllingRuleSource
    && isScopedToControllingEvidence;
}

function fenceSpecificationMatchesQuestion(question = "", answerText = "") {
  if (!/\bfenc(?:e|es|ing)\b/i.test(question) || !/\b(?:paint|stain|color|colour|finish)\b/i.test(question)) return true;
  const wantsWood = /\b(?:wood|cedar|three[- ]rail|3[- ]rail|interior lot|gate)\b/i.test(question);
  const wantsConcrete = /\b(?:concrete|perimeter)\b/i.test(question);
  const hasWoodFinish = /(?:#\s*3002\b.{0,60}\bBelvedere Tan\b|\bBelvedere Tan\b.{0,60}#\s*3002\b)/i.test(answerText);
  const hasConcreteFinish = /(?:#\s*338\b.{0,60}\bEarthen\b|\bEarthen\b.{0,60}#\s*338\b)/i.test(answerText);
  if (wantsWood && !wantsConcrete) return hasWoodFinish;
  if (wantsConcrete && !wantsWood) return hasConcreteFinish;
  // A generic "fence color" question has more than one valid answer. Treat it
  // as resolved only when the response distinguishes both common fence types;
  // one product code by itself is an unsafe shortcut.
  return hasWoodFinish && hasConcreteFinish;
}

const RULE_ACTION_TERMS = new Set([
  "action", "application", "apply", "approval", "book", "booking", "build",
  "facility", "form", "forms", "install", "need", "permission", "place", "process", "put",
  "rent", "rental", "request", "reserve", "reservation", "submit", "submission",
]);

function governingRuleSource(source = {}) {
  return source.sourceType === "rules"
    || /library\.municode\.com/i.test(source.sourceUrl || "")
    || /^\s*(?:Sec\.|Chapter\s+\d+)/i.test(source.title || "");
}

function explicitRuleEvidence(question = "", source = {}) {
  const subjectTerms = tokens(question)
    .filter((term) => term.length >= 4 && !RULE_ACTION_TERMS.has(term));
  if (!subjectTerms.length) return [];

  const normalizedTitle = String(source.title || "").toLowerCase();
  if (!subjectTerms.some((term) => normalizedTitle.includes(term))) return [];

  const text = String(source.text || source.excerpt || "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const permissionLanguage = /\b(?:allowed|permitted|prohibited|not permitted|do not require approval|does not require approval|approval is required|require(?:s|d)? (?:DRC )?approval|must|shall|may not)\b/i;
  const decisivePermissionLanguage = /\b(?:allowed|permitted|prohibited|not permitted|do not require approval|does not require approval|approval is required|require(?:s|d)? (?:DRC )?approval)\b/i;
  return text
    .split(/(?<=[.!?])\s+|;\s+(?=\d+\.)/)
    .map((sentence) => sentence.replace(/^\s*(?:\(?\d+\)?|[a-z])\.\s*/i, "").trim())
    .filter((sentence) => sentence.length >= 15 && sentence.length <= 520)
    .map((sentence, position) => {
      const normalized = sentence.toLowerCase();
      const matches = subjectTerms.filter((term) => normalized.includes(term));
      const strength = decisivePermissionLanguage.test(sentence) ? 20 : 10;
      const score = matches.length * 8
        + strength
        + (/\b(?:if|when|unless|provided|condition)\b/i.test(sentence) ? 2 : 0)
        - position / 1000;
      return { sentence, matches, score, strength, position };
    })
    .filter((candidate) =>
      permissionLanguage.test(candidate.sentence)
        && (candidate.matches.length > 0
          || (source.isInlineTopic === true && candidate.strength >= 20 && candidate.position <= 2))
    )
    .sort((left, right) => left.position - right.position);
}

function partialGoverningRuleAnswer(question, rulesAnswer, requested = [], routingPlan = null) {
  if (!requested.includes("permission") || !requested.includes("action")) return null;
  const sources = (rulesAnswer?.sources || []).filter(governingRuleSource);
  const candidates = sources.flatMap((source) =>
    explicitRuleEvidence(question, source).map((candidate) => ({ ...candidate, source }))
  );
  if (!candidates.length) return null;

  const uniqueCandidates = candidates
    .filter((candidate, index, all) =>
      all.findIndex((other) => other.sentence.toLowerCase() === candidate.sentence.toLowerCase()) === index
    );
  const primary = uniqueCandidates.find((candidate) => candidate.strength >= 20) || uniqueCandidates[0];
  const selected = [
    primary,
    ...uniqueCandidates
      .filter((candidate) => candidate !== primary)
      .sort((left, right) => right.strength - left.strength || right.score - left.score || left.position - right.position),
  ].slice(0, 3);
  const displayedSources = [...new Map(selected.map(({ source }) => [source.nodeId || source.sourceUrl || source.title, sourceForDisplay(source)])).values()];
  const directAnswer = selected[0].sentence;
  const keyDetails = selected.slice(1).map((candidate) => candidate.sentence);
  const partialAction = displayedSources[0]?.sourceUrl
    ? { label: `Open ${displayedSources[0].title}`, url: displayedSources[0].sourceUrl, actionType: "information" }
    : null;
  const unverifiedActionStep = "I couldn’t confirm the application or submission step from a current approved source.";
  const partial = buildAnswerContract({
    directAnswer,
    keyDetails,
    nextStep: partialAction ? `${unverifiedActionStep} ${partialAction.label}.` : unverifiedActionStep,
    actions: partialAction ? [partialAction] : [],
    sources: displayedSources,
    claims: selected.map((candidate) => ({ text: candidate.sentence, evidenceSourceIds: [candidate.source.id || candidate.source.nodeId] })),
    status: "verified-incomplete",
    requestedDetails: requested,
    coveredDetails: ["permission"],
    answerMode: "community-rule-partial",
    ...(routingPlan ? { routingPlan, routingDecision: "ai-planned" } : {}),
  });
  return {
    ...partial,
    answerVerdict: "conditional",
    confidence: { canAnswer: true, confidence: "high", reason: "controlling-rule-partial-facet" },
    authorityDecision: "rulebook-controls-binding-claim",
    controllingSourceOnly: true,
    claimAuthorityBoundary: {
      bindingClaim: "rulebook-only",
      supportingEvidence: "non-controlling",
      completion: "not-derived-by-this-slice",
    },
    qualityChecks: { requestedFacetCoverage: false, issues: ["requested-action-missing"] },
  };
}

function conditionalOperationalCompletion(question, rulesAnswer, routingPlan, options = {}) {
  const requested = [...new Set(routingPlan?.requestedDetails || requestedDetails(question))];
  const initialRuleSources = (rulesAnswer?.sources || []).filter(governingRuleSource);
  const hasControllingPermission = initialRuleSources.some((source) => {
    const evidence = `${source.title || ""} ${source.text || source.excerpt || ""}`;
    return conditionalInstructionMatchesQuestion(question, { context: evidence })
      && /\b(?:allowed|permitted|prohibited|approval|require(?:s|d)?|may not)\b/i.test(evidence);
  });
  if (!requested.includes("permission") || !requested.includes("action") || !hasControllingPermission) return null;

  const intent = routingPlan?.intent || classifyCommunityIntent(question);
  // Pair the resident wording with process-oriented retrieval queries, then
  // use the distinctive project match below as the admission boundary.
  const queries = [...new Set([question, "submit", "application", "conditional"])];
  const searches = [...new Set([intent, "forms", "services", "facilities"])].flatMap((candidateIntent) => queries.map((query) =>
    searchCommunityIndex(query, {
      index: options.index,
      indexPath: options.indexPath,
      communityId: options.communityId,
      intent: candidateIntent,
      interpretation: { ...(routingPlan || {}), requestedDetails: [] },
      allowPartialRequestedDetails: true,
      includeActionOnlyProjections: true,
      limit: 20,
      now: options.now,
    })
  ));
  const candidates = searches.flatMap((result) => result.sources)
    .filter((source) => source.canonicalScopedProjection)
    .sort((left, right) => Number(right.score || 0) - Number(left.score || 0));
  const selected = candidates.find((source) => {
    const fact = (source.facts || []).find((candidate) => candidate.type === "information"
      && /^\s*if\b/i.test(candidate.context || candidate.value || "")
      && /\b(?:submit|email|drop off|open|use|visit)\b/i.test(candidate.context || candidate.value || "")
      && conditionalInstructionMatchesQuestion(question, candidate));
    return fact && Number(source.score || 0) >= 24;
  });
  if (!selected) return null;

  const instructionSource = sourceForDisplay(selected);
  const instructionFact = (instructionSource.facts || []).find((candidate) => candidate.type === "information"
    && /^\s*if\b/i.test(candidate.context || candidate.value || "")
    && /\b(?:submit|email|drop off|open|use|visit)\b/i.test(candidate.context || candidate.value || "")
    && conditionalInstructionMatchesQuestion(question, candidate));
  if (!instructionFact) return null;
  const relatedSources = [...new Map(candidates.map((candidate) => {
    const displayed = sourceForDisplay(candidate);
    return [displayed.id, displayed];
  })).values()];
  const action = approvedInstructionAction(instructionSource, instructionFact, relatedSources);
  if (!action) return null;
  const actionSourceIds = action.directInstruction
    ? [instructionSource.id]
    : relatedSources
      .filter((source) => source.sourceUrl === action.url || (source.actions || []).some((item) => item.url === action.url))
      .map((source) => source.id);
  if (!actionSourceIds.length) return null;

  const ruleSources = (rulesAnswer.sources || []).filter(governingRuleSource).map(sourceForDisplay);
  if (!ruleSources.length) return null;
  const sources = [...ruleSources, instructionSource, ...relatedSources.filter((source) => actionSourceIds.includes(source.id))]
    .filter((source, index, all) => all.findIndex((candidate) => authoritySourceId(candidate) === authoritySourceId(source)) === index);
  const ruleClaims = (rulesAnswer.claims || []).filter((claim) =>
    (claim.evidenceSourceIds || []).some((id) => ruleSources.some((source) => source.id === id || source.nodeId === id))
  );
  const ruleDirectAnswer = String(rulesAnswer.directAnswer || rulesAnswer.answer || "")
    .replace(/^Short answer:\s*/i, "")
    .split(/\n\s*\n(?:What I found|Before you act):/i)[0]
    .trim();
  const controllingRuleId = ruleSources[0]?.id || ruleSources[0]?.nodeId;
  if (ruleDirectAnswer && controllingRuleId && !ruleClaims.length) {
    ruleClaims.push({ text: ruleDirectAnswer, evidenceSourceIds: [controllingRuleId] });
  }
  const claims = [
    ...ruleClaims,
    {
      text: String(instructionFact.context || instructionFact.value).trim(),
      evidenceSourceIds: [instructionSource.id],
      approvalClaimIds: instructionFact.approvalClaim ? [instructionFact.approvalClaim] : [],
    },
  ];
  if (action.context) {
    claims.push({
      text: String(action.context).trim(),
      evidenceSourceIds: actionSourceIds,
      approvalClaimIds: action.approvalClaim ? [action.approvalClaim] : [],
    });
  }
  const completed = buildAnswerContract({
    directAnswer: ruleDirectAnswer || rulesAnswer.directAnswer || cleanAnswerText(rulesAnswer.answer),
    // Keep the requested approved action in the bounded resident detail set;
    // source-derived rule details follow it and remain available in the rule
    // contract without crowding out the step the resident explicitly asked for.
    keyDetails: [String(instructionFact.context || instructionFact.value).trim(), ...(rulesAnswer.keyDetails || [])],
    nextStep: `Use “${action.label}” below if the controlling rule requires approval for your installation.`,
    actions: [...(rulesAnswer.actions || []), action].filter((item, index, all) => item?.url && all.findIndex((candidate) => candidate.url === item.url) === index),
    sources,
    status: "verified",
    requestedDetails: requested,
    coveredDetails: ["permission", "action"],
    checkedAt: instructionSource.checkedAt,
    answerMode: "community-rule-conditional-action",
    claims,
  });
  if (completed.confidence?.canAnswer !== true || !approvedClaimsStayWithinProjection(completed.claims || [], sources)) return null;
  return {
    ...completed,
    answerVerdict: "conditional",
    authorityDecision: "per-facet-rule-and-conditional-action",
    facetAuthority: {
      permission: ruleSources.map(authoritySourceId),
      action: [instructionSource.id, ...actionSourceIds.filter((id) => id !== instructionSource.id)],
    },
    claimAuthorityBoundary: {
      bindingClaim: "rulebook-only",
      supportingEvidence: "conditional operational action only",
      completion: "per-facet",
    },
    qualityChecks: { requestedFacetCoverage: completed.completion?.outcome === "complete", issues: [] },
  };
}

function hasAuthoritativeSpecification(answer, question = "") {
  const text = String(answer?.answer || "");
  const explicitlyScoped = (answer?.sources || []).some((source) => (source.authorityFacets || []).includes("specification"));
  const governingRuleSource = (answer?.sources || []).some((source) =>
    source.sourceType === "rules" || /library\.municode\.com/i.test(source.sourceUrl || "")
  );
  const explicitNoNumericLimit = /\b(?:current\s+)?(?:rule|code|standard|amendment)\b.{0,100}\b(?:does not|doesn't)\s+(?:set|specify|establish|impose)\b.{0,80}\b(?:numeric|maximum|minimum|height|size|dimension|setback|distance|limit)\b/i.test(text);
  const rendered = /#[0-9]{2,}\b|\b(?:\d+(?:[ -]\d+\/\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s*(?:feet|foot|inches|inch|ft\.?|in\.?)\b|\b(?:color|colour|paint|stain|finish|material|height|size|dimension|setback|distance)\b.{0,180}\b(?:approved|required|requires|must|match|prohibited|not allowed|no more than|at least|feet|foot|inches|#[0-9]{2,})\b/i.test(text);
  const admittedMissing = /\b(?:does not|doesn't|could not|couldn't)\b.{0,100}\b(?:provide|publish|expose|include|list|name|specify|state|set|identify)\b.{0,80}\b(?:color|colour|paint|stain|finish|material|height|size|dimension|setback|distance|product|maximum|limit)\b|\bwithout\b.{0,80}\b(?:identifying|listing|naming|specifying|stating)\b.{0,80}\b(?:color|colour|paint|stain|finish|material|height|size|dimension|setback|distance|product|maximum|limit)\b/i.test(text);
  return answer?.confidence?.canAnswer === true
    && fenceSpecificationMatchesQuestion(question, text)
    && ((governingRuleSource && explicitNoNumericLimit) || ((explicitlyScoped || governingRuleSource) && rendered && !admittedMissing));
}

function alreadyExplainsMissingSpecification(answer = "") {
  return /\b(?:does not|doesn't|could not|couldn't)\b.{0,100}\b(?:provide|publish|expose|include|list|name|specify|state|set|identify)\b.{0,100}\b(?:color|colour|paint|stain|finish|material|height|size|dimension|setback|distance|product|maximum|limit)\b|\bwithout\b.{0,80}\b(?:identifying|listing|naming|specifying|stating)\b.{0,100}\b(?:color|colour|paint|stain|finish|material|height|size|dimension|setback|distance|product|maximum|limit)\b/i.test(String(answer));
}

function missingDetailsFromQuality(requested, issues = [], answer = {}, question = "") {
  return requested.filter((detail) => {
    if (detail === "permission" && hasAuthoritativePermissionDecision(answer)) return false;
    if (detail === "specification") return !hasAuthoritativeSpecification(answer, question);
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

function renderPartialGap(answer, completion, question = "") {
  const current = String(answer || "");
  const specificationOnly = completion?.missingDetails?.length > 0
    && completion.missingDetails.every((detail) => detail.key === "specification");
  if (["verified-partial", "missing-evidence"].includes(completion?.outcome)
    && specificationOnly
    && !alreadyExplainsMissingSpecification(current)) {
    const requestedAttribute = /\b(?:paint|color|colour|stain|finish)\b/i.test(question)
      ? "paint color or finish"
      : /\b(?:height|high|tall)\b/i.test(question)
        ? "height"
        : /\b(?:setback|distance)\b/i.test(question)
          ? "setback or distance"
          : /\bmaterial\b/i.test(question) ? "material" : "specification";
    const scaffoldedCurrent = /^Short answer\s*:/i.test(current) ? current : `Short answer: ${current}`;
    return scaffoldedCurrent.replace(/^Short answer:\s*([^\n]+)/i, (_, groundedDirectAnswer) =>
      `Short answer: The cited current rules do not name one exact ${requestedAttribute} for this request. ${groundedDirectAnswer}`
    );
  }
  if (!["verified-partial", "missing-evidence"].includes(completion?.outcome) || !completion.missingDetails.length
    || /\b(?:could not|couldn't|couldn’t|cannot|can't|can’t)\b.{0,100}\b(?:find|verify|confirm|safely restate)\b/i.test(current)
    || /\b(?:official passages?|selected official passages?|rules?|sources?)\b.{0,100}\b(?:do not|don't|does not|doesn't)\b.{0,80}\b(?:contain|cover|establish|identify|list|name|state|specify|show|provide|publish)\b/i.test(current)
    || (completion.missingDetails.every((detail) => detail.key === "specification") && alreadyExplainsMissingSpecification(current))) return current;
  const missingSentence = `I couldn’t confirm the ${completion.missingDetails.map((detail) => detailLabel(detail.key)).join(" and ")} from the current official information.`;
  const move = completion.nextBestMove.label
    ? `Use “${completion.nextBestMove.label}” below if you need to confirm it.`
    : "Ask the CAB if you need to confirm it.";
  return `${cleanAnswerText(current)}\n\nWhat’s still unclear: ${missingSentence} ${move}`;
}

function ensureAnswerCompletion(question, answer) {
  if (!answer || ["safety-rejected", "out-of-scope"].includes(answer.answerStatus)) return answer;
  // Every completion outcome remains a complete response contract. A safe
  // missing-evidence result may have no usable citation, but callers can
  // always inspect an empty sources list without special handling.
  if (!Array.isArray(answer.sources) || !Array.isArray(answer.actions)) {
    const sources = Array.isArray(answer.sources) ? answer.sources : [];
    const actions = Array.isArray(answer.actions) ? answer.actions : [];
    answer = { ...answer, sources, actions };
  }
  if (!answer.actions.length && answer.sources.length) {
    // Only sources explicitly approved as official resident resources may be
    // projected into action links. A URL by itself does not grant that role.
    answer = {
      ...answer,
      actions: (answer.sources || [])
        .filter((source) => source.isOfficialResource === true && !source.actionEvidenceRequired && /^https?:\/\//i.test(source.sourceUrl || ""))
        .map((source) => ({ label: source.title, url: source.sourceUrl, actionType: source.actionType || "information" })),
    };
  }
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
      return { ...answer, completion, answer: renderPartialGap(answer.answer, completion, question) };
    }
    return { ...answer, answer: renderPartialGap(answer.answer, answer.completion, question) };
  }
  const requested = requestedDetails(question);
  const issues = answer.qualityChecks?.issues || [];
  const missingDetails = missingDetailsFromQuality(requested, issues, answer, question);
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
  const qualityChecks = hasAuthoritativePermissionDecision(answer) && requested.includes("permission")
    ? {
        ...(answer.qualityChecks || {}),
        requestedFacetCoverage: completion.outcome === "complete",
        issues: issues.filter((issue) => !/direct-permission-answer-missing/.test(String(issue))),
      }
    : answer.qualityChecks;
  return {
    ...answer,
    answer: renderPartialGap(answer.answer, completion, question),
    answerStatus,
    // A partial answer can still carry a valid verdict for the facet that was
    // independently resolved (for example, fence permission while the exact
    // finish remains withheld). Do not erase that controlling rule decision
    // merely because a separate requested detail is unavailable.
    answerVerdict: ["complete", "verified-partial"].includes(completion.outcome)
      ? answer.answerVerdict
      : "unverified",
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
      nextStep: communityScopePrompt(options.communityProfile),
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
      nextStep: communityScopePrompt(options.communityProfile),
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
      nextStep: communityScopePrompt(options.communityProfile),
      status: "could-not-verify",
      answerMode: "conversation",
    }), inputClassification: "unclear" };
  }

  const intent = classifyCommunityIntent(question);
  const interpretationMode = resolveInterpretationMode(options.interpretationMode);
  let searchPlan = null;
  let planningAttempted = false;
  let routingPlan = null;
  let interpretationOutcome = "legacy";
  let shadowPlan = null;
  const requestedQuestionDetails = requestedDetails(question);
  const broadResidentFeeQuestion = /\bfees?\b/i.test(question) && /\bresidents?\b/i.test(question);
  const asksForAction = requestedQuestionDetails.includes("action") && !broadResidentFeeQuestion;
  const asksForOperationalContact = requestedQuestionDetails.includes("contact");
  const asksForLikelyFacilityCost = (requestedQuestionDetails.includes("price") || /\bhow much\b/i.test(question))
    && !/\b(?:residents?|water|utility|assessment|development|late)\b/i.test(question);
  const looksLikeCompleteQuestion = /\?\s*$/.test(question)
    && question.trim().split(/\s+/).length >= 4
    && !/\b(?:section|sec\.?|article)\s*[\w.-]+/i.test(question);
  const shouldInterpret = interpretationMode === "structured"
    || interpretationMode === "shadow"
    || asksForAction
    || asksForOperationalContact
    || asksForLikelyFacilityCost
    || isWaterUsageAccessRequest(question)
    || isOperationalFacilityQuestion(question)
    || (looksLikeCompleteQuestion && classifiedInput.classification !== INPUT_CLASSIFICATIONS.RULES_QUESTION);
  if (shouldInterpret && options.planCommunitySearch !== false) {
    const planner = options.planCommunitySearch || defaultPlanSearch;
    planningAttempted = true;
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
  // The same authority boundary applies when AI planning is disabled or
  // unavailable. Build a fact-free deterministic plan so this clear access
  // request cannot fall into the generic payment-action fallback.
  if (!routingPlan && isWaterUsageAccessRequest(question)) {
    routingPlan = normalizedRoutingPlan({
      intent: "services",
      goal: "account-access",
      goals: ["account-access"],
      subject: question,
      requestedDetails: ["action"],
      searchQueries: [question],
      scope: "community",
    }, question, { now: options.now });
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
      directAnswer: communityScopeBoundary(options.communityProfile),
      nextStep: communityScopePrompt(options.communityProfile),
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
  const fallbackShortcutPlan = routingPlan || fallbackStructuredInterpretation(question, intent, { now: options.now });
  const shortcutPlan = supportsKnownLiveCommunityRequest(question, fallbackShortcutPlan)
    ? normalizeKnownLiveCommunityPlan(question, fallbackShortcutPlan)
    : fallbackShortcutPlan;
  const sourceAnswerPlan = routingPlan || (isHolidayHoursRequest(question) ? shortcutPlan : null);

  const calendarAccessAnswer = configuredCalendarAccessAnswer(question, options);
  if (calendarAccessAnswer) {
    return {
      ...calendarAccessAnswer,
      communityIntent: routingPlan?.intent || intent,
      ...(routingPlan ? { routingPlan, routingDecision: "configured-resource" } : {}),
    };
  }

  if (isOfficialInformationPageRequest(question, routingPlan)) {
    const informationIntent = routingPlan?.intent || intent;
    const informationQueries = routingPlan?.searchQueries?.length ? routingPlan.searchQueries : [question];
    const informationSearch = searchCommunityIndexWithQueries(question, informationQueries, {
      index: options.index,
      indexPath: options.indexPath,
      communityId: options.communityId,
      intent: informationIntent,
      interpretation: routingPlan,
      limit: 10,
      now: options.now,
    });
    const plannedTopic = [question, routingPlan?.subject, ...informationQueries].filter(Boolean).join(" ");
    const navigationTerms = new Set(["details", "find", "info", "information", "look", "official", "open", "page", "resource", "service", "site", "website", "where"]);
    const topicTerms = tokens(plannedTopic).filter((term) => term.length >= 4 && !navigationTerms.has(term));
    const resource = informationSearch.sources.filter((source) => source.sourceUrl
      && source.lifecycle === "current"
      && source.canonicalScopedProjection === true
      && hasDistinctiveCommunityEvidence(plannedTopic, [source]))
      .sort((left, right) => {
        const titleScore = (source) => topicTerms.filter((term) => String(source.title || "").toLowerCase().includes(term)).length;
        return titleScore(right) - titleScore(left) || Number(right.score || 0) - Number(left.score || 0);
      })[0];
    if (resource) {
      const displayedSource = sourceForDisplay(resource);
      const directAnswer = `You’ll find the official information on the ${resource.title} page.`;
      const action = { label: `Open ${resource.title}`, url: resource.sourceUrl, actionType: "information" };
      return {
        ...buildAnswerContract({
          directAnswer,
          nextStep: action.label,
          actions: [action],
          sources: [displayedSource],
          status: "verified",
          requestedDetails: ["action"],
          coveredDetails: ["action"],
          checkedAt: resource.checkedAt,
          answerMode: "community-approved-information-resource",
          claims: [{ text: directAnswer, evidenceSourceIds: [displayedSource.id] }],
        }),
        communityIntent: informationIntent,
        authorityDecision: "current-official-resource",
        ...(routingPlan ? { routingPlan, routingDecision: "ai-planned" } : {}),
      };
    }
    const informationWithheld = (informationSearch.withheldSources || []).find((source) => hasSafeWithheldHandoffEvidence(plannedTopic, [source], routingPlan));
    if (informationWithheld) {
      return withheldSourceAnswer(informationWithheld, informationIntent, ["action"], routingPlan, question);
    }
  }

  const approvedInstructionAnswer = await approvedOperationalInstructionAnswer(question, routingPlan, options);
  if (approvedInstructionAnswer) {
    return {
      ...approvedInstructionAnswer,
      communityIntent: routingPlan?.intent || intent,
      ...(routingPlan ? { routingPlan, routingDecision: "ai-planned" } : {}),
    };
  }

  const approvedSubmissionAnswer = approvedOperationalSubmissionAnswer(question, routingPlan, options);
  if (approvedSubmissionAnswer) {
    return {
      ...approvedSubmissionAnswer,
      communityIntent: routingPlan?.intent || intent,
      ...(routingPlan ? { routingPlan, routingDecision: "ai-planned" } : {}),
    };
  }

  const approvedActionAnswer = await approvedOperationalActionAnswer(question, routingPlan, options);
  if (approvedActionAnswer) {
    return { ...approvedActionAnswer, communityIntent: routingPlan.intent, routingPlan, routingDecision: "ai-planned" };
  }

  const approvedContactAnswer = await approvedOperationalContactAnswer(question, routingPlan, options);
  if (approvedContactAnswer) {
    return {
      ...approvedContactAnswer,
      communityIntent: routingPlan?.intent || intent,
      ...(routingPlan ? { routingPlan, routingDecision: "ai-planned" } : {}),
    };
  }

  if (routingPlan?.goal === "account-access" && isWaterUsageAccessRequest(question)) {
    const accessRoutingDecision = interpretationOutcome === "ai" ? "ai-planned" : "deterministic-fallback";
    const accessSearch = searchCommunityIndexWithQueries(question, routingPlan.searchQueries, {
      index: options.index,
      indexPath: options.indexPath,
      communityId: options.communityId,
      intent: routingPlan.intent,
      interpretation: routingPlan,
      limit: 20,
      now: options.now,
    });
    const controllingPendingSource = (accessSearch.withheldSources || []).filter((source) => {
      if (source.connectorType === "official-action") return false;
      // Withheld projections intentionally remove unreviewed prose. Use the
      // matching raw record only to decide which pending page controls this
      // topic; withheldSourceAnswer never exposes that raw text to residents.
      const rawSource = (accessSearch.index?.sources || []).find((candidate) => candidate.id === source.id);
      const evidence = `${rawSource?.title || source.title || ""} ${rawSource?.text || rawSource?.excerpt || ""}`;
      return /\bmonitor\b.{0,80}\bwater (?:usage|consumption)\b|\bwater (?:usage|consumption)\b.{0,80}\b(?:monitor|threshold|alert|log ?in|register)\b/i.test(evidence);
    }).sort((left, right) =>
      Number(/[?&]cat=\d+/i.test(right.sourceUrl || "")) - Number(/[?&]cat=\d+/i.test(left.sourceUrl || ""))
      || Number(right.score || 0) - Number(left.score || 0)
    )[0];
    if (controllingPendingSource) {
      return {
        ...withheldSourceAnswer(controllingPendingSource, routingPlan.intent, routingPlan.requestedDetails, routingPlan, question),
        communityIntent: routingPlan.intent,
        routingPlan,
        routingDecision: accessRoutingDecision,
      };
    }
    const communityHome = {
      title: `${accessSearch.index?.communityName || "Community"} official website`,
      sourceUrl: accessSearch.index?.website || "",
      text: "Official community website",
      excerpt: "Official community website",
      isOfficialResource: true,
    };
    return {
      ...withheldSourceAnswer(communityHome, routingPlan.intent, routingPlan.requestedDetails, routingPlan, question),
      communityIntent: routingPlan.intent,
      routingPlan,
      routingDecision: accessRoutingDecision,
      authorityDecision: "source-approval-required",
    };
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
      includeActionOnlyProjections: true,
      limit: 20,
    });
    const actionSource = fallbackResult.sources.find((source) => source.connectorType === "official-action" || source.canonicalScopedProjection);
    const fallbackGoal = [...ACTION_GOALS].find((goal) => actionForGoal(actionSource, goal));
    // If none of the reviewed actions matches a known transaction goal, do
    // not turn the first navigation link into a generic answer. This matters
    // for subfacility directories: opening Great Hall is useful navigation,
    // but it is not evidence that an Overlook space can be reserved.
    const fallbackAction = fallbackGoal ? actionForGoal(actionSource, fallbackGoal) : null;
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
      && fallbackAction
      && hasDistinctiveCommunityEvidence(question, fallbackResult.sources)) {
      const preferredAction = fallbackAction;
      const fallbackPlan = routingPlan || { intent, goal: fallbackGoal, requestedDetails: fallbackResult.requestedDetails, subject: question, searchQueries: [question] };
      const approvedProjection = await composeApprovedOperationalProjection(question, fallbackResult, {
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
      const candidate = { ...foodTruckAnswer(connectorResult, { profile: options.communityProfile, routingPlan: shortcutPlan }), communityIntent: "food-trucks", _connectorDiagnostics: { sourceOutcome: connectorResult.menuEnrichment?.status === "degraded" ? "partial" : "ok", appliedFilters: [], beforeFilterCount: null, afterFilterCount: null } };
      const decision = shortcutEligibility("food-truck", { question, plan: shortcutPlan, candidate, connectorResult });
      if (decision.eligible) return candidate;
      if (candidate.evidenceEnvelope?.coverage?.covered?.includes("date")) return candidate;
      recordShortcutRejection(options, "food-truck", decision);
    } catch {
      const foodTruckConnector = (options.communityProfile?.connectors || []).find((connector) => connector.adapter?.foodTruck && connector.adapter?.capabilities?.includes("events"));
      const calendarUrl = configuredFoodTruckCalendar(options.communityProfile);
      const actions = calendarUrl && foodTruckConnector?.adapter?.labels?.calendarAction
        ? [{ label: foodTruckConnector.adapter.labels.calendarAction, url: calendarUrl, actionType: "calendar" }]
        : [];
      const unavailable = buildAnswerContract({
        directAnswer: "I couldn’t check the live food-truck schedule just now.",
        nextStep: actions[0]?.label || "",
        actions,
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
  if (wasteScheduleRequested && isRecurringWasteDayQuestion(question)) {
    const recurringAnswer = await approvedRecurringWasteDayAnswer(question, structuredActive ? routingPlan : shortcutPlan, options);
    if (recurringAnswer) return recurringAnswer;
  }
  if (wasteScheduleRequested && wasteRequestDecision.eligible && options.getWasteSchedule) {
    try {
      const connectorResult = await options.getWasteSchedule({ question, routingPlan: structuredActive ? routingPlan : shortcutPlan, profile: options.communityProfile });
      const candidate = { ...liveWasteScheduleAnswer(question, connectorResult), communityIntent: "services" };
      if (candidate.answerMode === "community-live-waste-area-unavailable") return candidate;
      const decision = shortcutEligibility("waste-schedule", { question, plan: shortcutPlan, candidate, connectorResult });
      if (decision.eligible) return candidate;
      const retainsProvenDate = !decision.reasons.includes("date-range-not-covered")
        && !decision.reasons.includes("filters-not-covered")
        && (decision.reasons.includes("requested-status-missing") || decision.reasons.includes("goal-not-covered"));
      return unavailableWasteScheduleAnswer(question, options.communityProfile, shortcutPlan, retainsProvenDate ? candidate : null);
    } catch {
      if (options._interpretationState) options._interpretationState.connectorDiagnostics = { sourceOutcome: "unavailable", appliedFilters: [], beforeFilterCount: null, afterFilterCount: null };
      return unavailableWasteScheduleAnswer(question, options.communityProfile, shortcutPlan);
    }
  } else if (wasteScheduleRequested && !wasteRequestDecision.eligible) recordShortcutRejection(options, "waste-schedule", wasteRequestDecision);

  if (
    classifiedInput.classification === INPUT_CLASSIFICATIONS.UNRELATED
    && !supportsKnownLiveCommunityRequest(question, routingPlan || shortcutPlan)
    && ["known-unrelated-topic", "person-identity"].includes(classifiedInput.reason)
  ) {
    const identity = classifiedInput.reason === "person-identity" ? personIdentityBoundary(options.communityProfile) : null;
    const unrelated = buildAnswerContract({
      directAnswer: identity?.[0] || communityScopeBoundary(options.communityProfile),
      nextStep: identity?.[1] || communityScopePrompt(options.communityProfile),
      actions: identity?.[2] || [],
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
  const poolSeasonReopeningRequested = isPoolSeasonReopeningRequest(question, routingPlan || shortcutPlan);
  if (poolSeasonReopeningRequested && options.getPoolStatus) {
    try {
      const connectorResult = await options.getPoolStatus({ question, routingPlan: structuredActive ? routingPlan : shortcutPlan, profile: options.communityProfile });
      const seasonProjection = approvedPoolSeasonProjection(options.index || {}, options);
      const candidate = poolSeasonReopeningAnswer(connectorResult, seasonProjection, options);
      if (candidate) return candidate;
    } catch {
      if (options._interpretationState) options._interpretationState.connectorDiagnostics = { sourceOutcome: "unavailable", appliedFilters: [], beforeFilterCount: null, afterFilterCount: null };
    }
    const unavailable = genericEvidenceBoundary(question, {}, options.index, options.communityProfile);
    return { ...unavailable, answerMode: "community-live-pool-season-reopening", communityIntent: "status", _connectorDiagnostics: { sourceOutcome: "unavailable", appliedFilters: [], beforeFilterCount: null, afterFilterCount: null } };
  }
  const poolRequestDecision = shortcutEligibility("pool-status", { question, plan: shortcutPlan });
  if (activeIntent === "status" && poolRequestDecision.eligible && options.getPoolStatus) {
    try {
      const connectorResult = await options.getPoolStatus({ question, routingPlan: structuredActive ? routingPlan : shortcutPlan, profile: options.communityProfile });
      const candidate = poolStatusAnswer(connectorResult, routingPlan?.requestedDetails || shortcutPlan?.requestedDetails || ["status"], options);
      if (!candidate) throw new Error("Live pool-status evidence was unavailable or degraded.");
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
      const candidate = eventsAnswer(connectorResult, routingPlan?.requestedDetails || shortcutPlan?.requestedDetails || [], routingPlan || shortcutPlan);
      const decision = shortcutEligibility("events", { question, plan: shortcutPlan, candidate, connectorResult });
      const actionAuthorityMatches = connectorActionAuthorityMatches(question, shortcutPlan, connectorResult.evidenceEnvelope);
      if (decision.eligible && actionAuthorityMatches) return candidate;
      if (!actionAuthorityMatches) decision.reasons.push("connector-action-authority-mismatch");
      recordShortcutRejection(options, "events", decision);
    } catch {
      if (structuredActive) {
        const actions = eventFailureActions(options);
        return { ...buildAnswerContract({
          directAnswer: "I couldn’t check the official community calendar just now.",
          nextStep: actions[0]?.label || "",
          actions,
          status: "source-unavailable",
          answerMode: "community-live-events",
        }), communityIntent: "events", _connectorDiagnostics: { sourceOutcome: "unavailable", appliedFilters: [], beforeFilterCount: null, afterFilterCount: null } };
      }
    }
  } else if (activeIntent === "events" && !eventsRequestDecision.eligible) recordShortcutRejection(options, "events", eventsRequestDecision);

  const operationalSearch = searchCommunityIndex(question, {
    index: options.index,
    indexPath: options.indexPath,
    communityId: options.communityId,
    intent: isOperationalFacilityQuestion(question) || isPublicPickleballOperationsQuestion(question) ? "facilities" : activeIntent,
    interpretation: routingPlan,
    limit: 5,
    now: options.now,
  });
  const residentialPropertyRental = isResidentialPropertyRentalRequest(question);
  const topWithheld = operationalSearch.withheldSources?.[0];
  const relevantWithheld = !residentialPropertyRental && (operationalSearch.withheldSources || []).find((source) =>
    hasSafeWithheldHandoffEvidence(question, [source], routingPlan)
  );
  const withheld = relevantWithheld || topWithheld;
  const withheldControls = !residentialPropertyRental && withheld
    // A withheld page cannot override a distinct, claim-scoped projection
    // that has already passed the exact canonical decision gate.
    && !operationalSearch.sources.some((source) => source.canonicalScopedProjection)
    && Number(withheld.score || 0) >= Number(operationalSearch.sources[0]?.score || 0)
    && hasSafeWithheldHandoffEvidence(question, [withheld], routingPlan);
  if (withheldControls) {
    const staleDatedHours = datedFacilityHoursAnswer(question, { sources: [withheld] }, { ...options, routingPlan });
    if (staleDatedHours) return { ...staleDatedHours, communityIntent: intent, authorityDecision: "freshness-withheld" };
    // For booking, access, permission, and price requests, a known relevant
    // facility page that has not passed its exact approval gate is itself the
    // reason the answer is unavailable. Do not send that request through a
    // broader prose fallback that could either invent an answer or obscure
    // the source-review boundary.
    if ((activeIntent === "facilities" && !routingPlan?.requestedDetails?.includes("permission"))
      || (relevantWithheld?.sourceType === "facilities" && isOperationalFacilityQuestion(question))
      || (relevantWithheld?.sourceType === "facilities"
        && isFacilitySpecificOperationalRequest(question, routingPlan, ["facility"]))
      || (relevantWithheld?.sourceType === "facilities"
        && isFacilitySpecificAccessRequest(question, routingPlan, ["facility"]))) {
      return withheldSourceAnswer(withheld, intent, routingPlan?.requestedDetails || operationalSearch.requestedDetails, routingPlan, question);
    }
  }
  // A current facility page controls public operating details. Select it by
  // source type and question-specific evidence, then use the same approved
  // projection composer as every other operational topic. Private projects
  // continue to the governing-rule path below.
  const facilitySource = operationalFacilitySource(question, operationalSearch.sources);
  if (facilitySource && Number(facilitySource.score || 0) >= 24) {
    const facilityResult = { ...operationalSearch, sources: [facilitySource] };
    const facilityAnswer = await composeApprovedOperationalProjection(question, facilityResult, {
      ...options,
      routingPlan: sourceAnswerPlan,
    });
    if (facilityAnswer) {
      return {
        ...facilityAnswer,
        communityIntent: intent,
        authorityDecision: "current-facility-operations",
      };
    }
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
      if (withheldControls) return withheldSourceAnswer(withheld, intent, routingPlan?.requestedDetails || operationalSearch.requestedDetails, routingPlan, question);
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
    const requested = routingPlan?.requestedDetails || operationalSearch.requestedDetails;
    // The rules engine has a deliberate, specific boundary for this request.
    // A broad operational search must not replace it with a generic source
    // review notice, because doing so loses the reason we withheld a
    // permission conclusion in the first place.
    if (rulesAnswer?.confidence?.reason === "no-food-truck-specific-rule") {
      return {
        ...genericEvidenceBoundary(question, rulesAnswer, operationalSearch.index || options.index, options.communityProfile),
        communityIntent: intent,
      };
    }
    // Contact requests need an exact approved contact. Keep the established
    // missing-contact response instead of allowing unrelated rule hits to turn
    // into a generic answer or expose another organization’s number.
    if (rulesAnswer?.confidence?.reason === "missing-requested-contact-info"
      && (requested.includes("contact") || /\b(?:contact|phone|call|email|number)\b/i.test(question))) {
      const organization = missingRequestedOrganization(question, rulesAnswer.sources || []) || "requested";
      return {
        ...missingContactAnswer(organization, routingPlan, {
          index: operationalSearch.index || options.index,
          profile: options.communityProfile,
          sources: rulesAnswer.sources || [],
          question,
        }),
        communityIntent: intent,
      };
    }
    // No-claim answers may offer only a question-specific official handoff.
    // When search found a different topic, return the neutral discovery
    // boundary instead of attaching that retrieved document or action. A
    // cautious rules answer can still retain its own subject-specific,
    // supported distinction; strip every action except its displayed rule
    // evidence before returning it.
    // A facilities page selected this way is known to be relevant but is not
    // approved to supply a booking, access, availability, or pricing claim.
    // Hold here before the broader rules retry can accidentally turn nearby
    // rental prose into a verified answer.
    if (relevantWithheld && rulesAnswer?.confidence?.canAnswer !== true
      && !operationalSearch.sources.some((source) => source.canonicalScopedProjection)) {
      // A controlling rule may still resolve the permission facet even when
      // the requested application step is withheld. Preserve that supported
      // portion before returning the facilities review boundary.
      const supportedRulePart = partialGoverningRuleAnswer(question, rulesAnswer, requested, routingPlan);
      if (supportedRulePart) return { ...supportedRulePart, communityIntent: intent };
      if (safeRulesAnswerHasSupportedPart(question, rulesAnswer)) {
        return {
          ...rulesAnswer,
          answer: cleanSafeRulesBoundaryText(rulesAnswer.answer),
          actions: actionsForDisplayedRuleEvidence(rulesAnswer),
          communityIntent: intent,
        };
      }
      return withheldSourceAnswer(relevantWithheld, intent, requested, routingPlan, question);
    }
    if (withheld && rulesAnswer?.confidence?.canAnswer !== true
      && !relevantWithheld) {
      if (safeRulesAnswerHasSupportedPart(question, rulesAnswer)) {
        return {
          ...rulesAnswer,
          answer: cleanSafeRulesBoundaryText(rulesAnswer.answer),
          actions: actionsForDisplayedRuleEvidence(rulesAnswer),
          communityIntent: intent,
        };
      }
      return {
        ...genericEvidenceBoundary(question, rulesAnswer, operationalSearch.index || options.index, options.communityProfile),
        communityIntent: intent,
      };
    }
    const relatedActionFacet = requestedRelatedActionFacet(routingPlan || shortcutPlan, rulesAnswer);
    const relatedAction = selectApprovedRelatedAction({
      index: operationalSearch.index || options.index,
      profile: options.communityProfile,
      controllingAnswer: rulesAnswer,
      subject: (routingPlan || shortcutPlan)?.subject || question,
      actionFacet: relatedActionFacet,
      now: options.now,
    });
    if (relatedActionFacet && rulesAnswer?.confidence?.canAnswer === true) {
      rulesAnswer = { ...rulesAnswer, controllingSourceOnly: true, relatedActionFacet };
    }
    rulesAnswer = attachApprovedRelatedAction(rulesAnswer, relatedAction);
    // Permission stays with the controlling rule. A current, exact-approved
    // conditional process may complete only the resident's requested next
    // step, and only when it names the same project subject.
    const conditionalCompletion = conditionalOperationalCompletion(question, rulesAnswer, routingPlan, options);
    if (conditionalCompletion) return { ...conditionalCompletion, communityIntent: intent };
    if (withheldControls) {
      const independentRulesEvidence = hasIndependentRulesEvidence(rulesAnswer, withheld);
      const preserveIndependentRule = independentRulesEvidence
        && rulesAnswer?.confidence?.canAnswer === true
        && activeIntent !== "facilities"
        && !requested.some((detail) => ["contact", "date", "hours", "price", "status"].includes(detail));
      if (independentRulesEvidence && isSafeRulesBoundaryAnswer(rulesAnswer) && !asksApprovedProviderDirectory(question)) {
        const handoff = withheldSourceAnswer(withheld, intent, requested, routingPlan, question);
        const actions = [...(rulesAnswer.actions || []), ...(handoff.actions || [])].filter((action, index, all) =>
          action?.url && all.findIndex((candidate) => candidate?.url === action.url) === index
        );
        return { ...rulesAnswer, answer: cleanSafeRulesBoundaryText(rulesAnswer.answer), actions, communityIntent: intent };
      }
      if (preserveIndependentRule && !requested.includes("action")) {
        return {
          ...rulesAnswer,
          answer: cleanAnswerText(rulesAnswer.answer),
          communityIntent: intent,
          authorityDecision: "rulebook-controls-binding-claim",
          claimAuthorityBoundary: {
            bindingClaim: "rulebook-only",
            supportingEvidence: "non-controlling",
            completion: "not-derived-by-this-slice",
          },
        };
      }
      if (!preserveIndependentRule || requested.includes("action")) {
        const partialRuleAnswer = partialGoverningRuleAnswer(question, rulesAnswer, requested, routingPlan);
        if (partialRuleAnswer) return { ...partialRuleAnswer, communityIntent: intent };
      }
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
      if (!preserveIndependentRule && ((!verifiedRuleFacet && needsBlockedOperationalDetail)
        || rulesAnswer?.confidence?.canAnswer !== true
        || (!verifiedRuleFacet && !independentlySourced))) {
        return withheldSourceAnswer(withheld, intent, requested, routingPlan, question);
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
        const communityAnswer = await sourcedAnswer(question, communityEvidence, { ...options, routingPlan: sourceAnswerPlan });
        return { ...communityAnswer, communityIntent: intent };
      }
      return { ...genericEvidenceBoundary(question, rulesAnswer, communityEvidence.index || options.index, options.communityProfile, communityEvidence.sources), communityIntent: intent };
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
          ...await sourcedAnswer(question, { ...community, sources: preferredSources }, { ...options, routingPlan: sourceAnswerPlan }),
          communityIntent: intent,
        };
      }

      const requestedOperationalDetail = community.requestedDetails.some((detail) => ["contact", "date", "hours", "action"].includes(detail));
      const rulesAdmitsMissingDetail = /does not (?:give|include|list|provide|set|specify|state)|not found in the rulebook|use the .*instructions/i.test(String(rulesAnswer.answer || ""));
      const rulesMissesRequestedDetail = rulesCoverageIssues.some((issue) => /requested-(?:process|action|contact|date|hours)-missing/i.test(String(issue)));
      if (!bindingRule && requestedOperationalDetail && (rulesAdmitsMissingDetail || rulesMissesRequestedDetail) && !isWasteStorageRuleQuestion(question) && Number(community.sources[0]?.score || 0) >= 36) {
        return { ...await sourcedAnswer(question, community, { ...options, routingPlan: sourceAnswerPlan }), communityIntent: routingPlan?.intent || intent };
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
      if (aiOrganizedRulesAnswer && confidenceCameFromAi && !rulesAnswerHasQuestionSpecificEvidence(question, rulesAnswer)) {
        return { ...genericEvidenceBoundary(question, rulesAnswer, community.index || options.index, options.communityProfile, community.sources), communityIntent: intent };
      }

      // A binding answer keeps its rulebook evidence separate from optional
      // process links.  In particular, do not merge a form/facility page into
      // its sources and then present the whole mixed response as verified.
      const extraSources = bindingRule ? [] : community.sources.map(sourceForDisplay);
      const officialRuleActions = (rulesAnswer.sources || [])
        .filter((source) => isOfficialCommunitySource(source, options.communityProfile) && /^https?:\/\//i.test(source.sourceUrl || ""))
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
      return completedRulesAnswer;
    }
    if (intent === "rules") {
      if (pendingStructuredClarification) {
        return structuredClarification(pendingStructuredClarification, interpretationMode, interpretationOutcome);
      }
      // Rules had no verified answer; allow the community retrieval below to
      // look for an independently approved operational answer before fencing.
    }
  }

  // A conflicted community page must never be used, but it also must not mask
  // an independently answerable governing rule. Only fall back to the review
  // notice after the safe rules path above has had a chance to answer.
  if (withheldControls) return withheldSourceAnswer(withheld, intent, routingPlan?.requestedDetails || operationalSearch.requestedDetails, routingPlan, question);

  let result = searchCommunityIndex(question, { index: options.index, indexPath: options.indexPath, communityId: options.communityId, intent: routingPlan?.intent || intent, interpretation: routingPlan });
  if ((!result.sources.length || Number(result.sources[0].score || 0) < 72)
    && options.planCommunitySearch !== false
    && interpretationMode !== "shadow") {
    const planner = options.planCommunitySearch || defaultPlanSearch;
    const plan = planningAttempted ? searchPlan : await planner(question, options.llmOptions || {});
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
    // Search keeps withheld records out of `sources`, by design. Do not let
    // that safety redaction turn a known, relevant official page into the
    // different claim that no source could be identified. This is evaluated
    // at the shared final fallback so an unrelated top-ranked withheld record
    // (for example, a broad FAQ) cannot mask a lower-ranked facility page
    // that actually matches the structured request.
    const relevantWithheld = (result.withheldSources || []).find((source) =>
      hasSafeWithheldHandoffEvidence(question, [source], routingPlan)
    );
    if (relevantWithheld) {
      return withheldSourceAnswer(
        relevantWithheld,
        intent,
        routingPlan?.requestedDetails || result.requestedDetails,
        routingPlan,
        question,
      );
    }
    if (isSafeRulesBoundaryAnswer(rulesFallback) && !asksApprovedProviderDirectory(question)) {
      return {
        ...rulesFallback,
        answer: cleanSafeRulesBoundaryText(rulesFallback.answer),
        answerStatus: result.withheldSources?.length || (rulesFallback.actions || []).some((action) => /^https?:\/\//i.test(action.url || ""))
          ? "source-unavailable"
          : rulesFallback.answerStatus,
        communityIntent: intent,
      };
    }
    if (/conversation|informational/i.test(`${rulesFallback.answerMode} ${rulesFallback.answerVerdict}`) && rulesFallback.inputClassification !== INPUT_CLASSIFICATIONS.UNCLEAR) {
      return { ...rulesFallback, communityIntent: intent };
    }
    return { ...genericEvidenceBoundary(question, rulesFallback, result.index || options.index, options.communityProfile, result.sources), communityIntent: intent };
  }
  const answer = await sourcedAnswer(question, result, { ...options, routingPlan: sourceAnswerPlan });
  if (pendingStructuredClarification && answer.confidence?.canAnswer !== true) {
    return structuredClarification(pendingStructuredClarification, interpretationMode, interpretationOutcome);
  }
  return { ...answer, communityIntent: result.intent || intent };
}

async function answerCommunityQuestion(query, options = {}) {
  const state = {};
  let completedAnswer = ensureAnswerCompletion(query, await answerCommunityQuestionCore(query, { ...options, _interpretationState: state }));
  const supportedRuleAnswer = completedAnswer?.confidence?.canAnswer === true
    && /(?:^|-)rule(?:s)?(?:-|$)|source-derived|^deterministic$|^llm-/i.test(String(completedAnswer.answerMode || ""));
  const hasShortAnswerLabel = /^Short answer\s*:/im.test(String(completedAnswer.answer || ""));
  const retrievalScaffoldedAnswer = hasShortAnswerLabel
    && (/^What I found\s*:/im.test(String(completedAnswer.answer || ""))
      || completedAnswer.answerStatus === "source-unavailable");
  if (supportedRuleAnswer || retrievalScaffoldedAnswer || completedAnswer.naturalFallbackProse) {
    const cleanRuleAnswer = naturalizeGroundedDraft(completedAnswer.answer);
    const proseParts = cleanRuleAnswer.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
    const cleanStructuredPart = (value) => composePlainEnglishFallback(cleanAnswerText(value));
    const directAnswer = cleanStructuredPart(completedAnswer.directAnswer) || proseParts[0] || "";
    const nextStep = cleanStructuredPart(completedAnswer.nextStep);
    const keyDetails = (Array.isArray(completedAnswer.keyDetails) && completedAnswer.keyDetails.length
      ? completedAnswer.keyDetails.map(cleanStructuredPart).filter(Boolean)
      : proseParts.slice(1))
      .filter((detail) => !nextStep || detail.toLowerCase() !== nextStep.toLowerCase());
    const cautiousUnverifiedNextStep = /\b(?:could not|couldn't|couldn’t|cannot|can't|can’t)\b.{0,120}\b(?:verify|confirm)\b/i.test(nextStep);
    const acceptedRulesLlmProse = !completedAnswer.naturalFallbackProse
      && /(?:^|-)llm(?:-|$)/i.test(String(completedAnswer.answerMode || ""));
    // Preserve verified actions in the resident prose. A cautious handoff that
    // explicitly says evidence could not be verified remains available through
    // the structured nextStep without diluting the supported claims.
    const answer = acceptedRulesLlmProse
      ? cleanRuleAnswer
      : supportedRuleAnswer && !completedAnswer.naturalFallbackProse
      ? [directAnswer, ...keyDetails, ...nextStep && !cautiousUnverifiedNextStep ? [nextStep] : []]
        .filter(Boolean)
        .join("\n\n") || cleanRuleAnswer
      : cleanRuleAnswer;
    completedAnswer = { ...completedAnswer, answer, directAnswer, keyDetails, nextStep };
  }
  // `naturalFallbackProse` is an internal presentation hint from the rules
  // engine. Consume it here so it never becomes part of the public API.
  const { naturalFallbackProse: _naturalFallbackProse, ...answer } = completedAnswer;
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

module.exports = { answerCommunityQuestion, approvedPoolSeasonProjection, bestContactContext, cleanAnswerText, composeApprovedOperationalProjection, conciseRecurringSchedule, contactDirectAnswer, datedFacilityHoursAnswer, directlyAnswersQuestionForm, eventFailureActions, eventsAnswer, extractiveAnswer, genericEvidenceBoundary, isPoolSeasonReopeningRequest, liveRecyclingScheduleAnswer, poolSeasonReopeningAnswer, poolStatusAnswer, relevantActions, sourcedAnswer, unanchoredRecurringScheduleAnswer, usefulSentences };

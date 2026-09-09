const { buildAnswerContract } = require("./community-contracts");
const { sourceReviewGate } = require('./community-source-answerability');
const { isFreshnessTrackedSource } = require('./community-source-identity');

const CAB_BASE = "https://sterlingranchcab.com";
const UTILITYHAWK_URL = "https://srcab.utilityhawk.us/login";

function sourcesMatching(index = {}, matcher, limit = 4) {
  const now = index._reviewNow ?? Date.now();
  return (index.sources || []).filter(matcher).filter(sourceReviewGate(index, now))
    .slice(0, limit).map((source) => ({ ...source, isOfficialResource: true }));
}

function sourceUrlIncludes(value) {
  return (source) => String(source.sourceUrl || "").includes(value);
}

function approvedLandscaperExamples(sources = [], limit = 4) {
  const text = sources.map((source) => source.text || "").join(" ");
  const names = [];
  const pattern = /(?:^|\b\d{3}[- ]\d{3}[- ]\d{4}\s+|\bPhone\s+)([A-Z][A-Za-z0-9&'’ .,-]{2,70}?)\s+/g;
  let match;
  while ((match = pattern.exec(text)) && names.length < limit) {
    const name = match[1].replace(/\s+/g, " ").trim();
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

function landscaperAnswer(index) {
  const sources = sourcesMatching(index, (source) => /\/414\/Approved-Landscapers-List|\/DocumentCenter\/View\/1965/i.test(source.sourceUrl || ""), 10);
  const examples = approvedLandscaperExamples(sources);
  const landingSource = sources.find((source) => /\/414\/Approved-Landscapers-List/i.test(source.sourceUrl || ""));
  if (!sources.length) return null;
  if (examples.length < 3 && landingSource) {
    return buildAnswerContract({
      directAnswer: "CAB maintains an official Approved Landscapers List, but I can’t safely repeat company names while the detailed directory source is being reconfirmed.",
      nextStep: "Open the current CAB list below to review the companies directly.",
      actions: [{ label: "Open the current approved landscapers list", url: `${CAB_BASE}/414/Approved-Landscapers-List`, actionType: "list" }],
      sources: [landingSource],
      status: "source-unavailable",
      requestedDetails: ["action"],
      coveredDetails: ["action"],
      checkedAt: landingSource.checkedAt,
      answerMode: "community-proactive-directory-review",
    });
  }
  if (examples.length < 3) return null;
  return buildAnswerContract({
    directAnswer: `Yes. CAB publishes a current landscaper list; examples include ${examples.slice(0, 3).join(", ")}.`,
    keyDetails: [
      "The listed companies have attended Sterling Ranch's required landscape class and are familiar with its water and design requirements.",
      "Being listed is not a CAB endorsement—residents should still compare qualifications, references, insurance, and pricing.",
      "Landscape plans and installation still need to meet the applicable approval requirements.",
    ],
    nextStep: "Open the current list below to compare companies by landscape design, irrigation design, installation services, phone, and email.",
    actions: [
      { label: "Open the current approved landscapers list", url: `${CAB_BASE}/414/Approved-Landscapers-List`, actionType: "list" },
      { label: "Open the detailed company list (PDF)", url: `${CAB_BASE}/DocumentCenter/View/1965/Sterling-Ranch-Approved-Landscapers-`, actionType: "list" },
    ],
    sources,
    status: "verified",
    requestedDetails: ["action"],
    coveredDetails: ["action"],
    checkedAt: sources[0].checkedAt,
    answerMode: "community-proactive-directory",
  });
}

function waterPortalAnswer(index, options = {}) {
  const sources = sourcesMatching(index, (source) => /\/206\/Water-Billing|utilityhawk/i.test(`${source.sourceUrl} ${source.text}`), 4);
  if (!sources.some((source) => /srcab\.utilityhawk\.us/i.test(source.text || source.sourceUrl || ""))) return null;
  return buildAnswerContract({
    directAnswer: options.payment
      ? "Pay your Sterling Ranch water bill through UtilityHawk: sign in, select “Pay Online,” and follow the payment instructions."
      : "Use UtilityHawk to view Sterling Ranch water usage and billing online.",
    keyDetails: [
      "Register or sign in to review account activity and water-consumption history.",
      "You can set daily, weekly, or monthly usage thresholds and receive alerts when usage is trending high.",
      "UtilityHawk also links to online bill payment; ACH is free, while the official page currently lists a 2.95% debit/credit-card processing fee.",
    ],
    nextStep: options.payment
      ? "Open UtilityHawk below, sign in, and select “Pay Online.”"
      : "Open UtilityHawk below and select Registration if this is your first visit.",
    actions: [
      { label: "Open UtilityHawk", url: UTILITYHAWK_URL, actionType: "account" },
      { label: "Open official water-billing instructions", url: `${CAB_BASE}/206/Water-Billing`, actionType: "information" },
    ],
    sources,
    status: "verified",
    requestedDetails: ["action"],
    coveredDetails: ["action"],
    checkedAt: sources[0]?.checkedAt,
    answerMode: "community-proactive-account",
  });
}

function resolvedRentalFacility(question, routingPlan = {}) {
  const text = String(question || "");
  if (/\bpool\s*(?:party|rental|reservation)|(?:party|rental|reservation)\s*(?:at|in)?\s*(?:the\s*)?pool\b/i.test(text)) return null;
  const canonical = String(routingPlan?.filters?.facility || "").trim();
  if (canonical) {
    const kind = /\bpark\b|\bshelter\b/i.test(canonical) ? "park"
      : /\bpavilion\b/i.test(canonical) ? "pavilion"
        : /\bgreat hall\b/i.test(canonical) ? "great-hall"
          : "generic";
    return { value: canonical, evidence: new RegExp(`\\b${canonical.replace(/[.*+?^${}()|[\]\\\\]/g, "\\$&").replace(/\\ /g, "\\s+")}\\b`, "i"), park: kind === "park", kind };
  }
  if (/\bpark\b|\bshelter\b/i.test(text) && !/clubhouse|overlook|great hall|pavilion/i.test(text)) {
    return { value: "park shelter", evidence: /\bpark shelters?\b/i, park: true, kind: "park" };
  }
  const match = text.match(/\b(?:great hall|north pavilion|south pavilion|pavilion)\b/i)
    || text.match(/\b(?:overlook clubhouse|clubhouse|overlook)\b/i);
  if (!match) return null;
  const value = match[0].replace(/\b\w/g, (letter) => letter.toUpperCase());
  const kind = /pavilion/i.test(value) ? "pavilion" : /great hall/i.test(value) ? "great-hall" : "generic";
  return { value, evidence: new RegExp(`\\b${match[0].replace(/[.*+?^${}()|[\]\\\\]/g, "\\$&").replace(/\\ /g, "\\s+")}\\b`, "i"), park: false, kind };
}

function hasCurrentEvidence(source, now) {
  return isFreshnessTrackedSource(source)
    && (!source.staleAfter || Date.parse(source.staleAfter) >= now);
}

function shortcutFacilityEvidence(source, routingPlan = {}) {
  const facility = String(routingPlan?.filters?.facility || "").trim();
  if (!facility) return {};
  const text = `${source.title || ""} ${source.text || ""} ${(source.actions || []).map((action) => action.context || "").join(" ")}`;
  return text.toLowerCase().includes(facility.toLowerCase())
    ? { facility: [{ value: facility, sourceId: source.id }] } : {};
}

function poolPartyAnswer(question, index, routingPlan) {
  if (!/\bpool\b/i.test(question) || !/\b(?:party|rent(?:al)?|reserv(?:e|ation))\b/i.test(question)) return null;
  const source = sourcesMatching(index, (item) => hasCurrentEvidence(item, index._reviewNow)
    && /pool is not available for rental/i.test(item.text || ""), 1)[0];
  if (!source) return null;
  // The published FAQ page also contains guest-pass charges. Those are not
  // evidence for a pool rental question, so present only the exact reviewed
  // rental statement rather than leaking a nearby $5 guest fee into sources.
  const rentalStatement = String(source.text || "").match(/(?:Unfortunately,\s*)?the pool is not available for rental\.[^.!?]*/i)?.[0]
    || "The pool is not available for rental.";
  const scopedSource = {
    ...source,
    text: rentalStatement.trim(),
    excerpt: rentalStatement.trim(),
    facts: [],
    actions: [],
  };
  const asksPrice = /\b(?:cost|price|fee|how much)\b/i.test(question)
    || routingPlan?.goal === "cost" || (routingPlan?.requestedDetails || []).includes("price");
  return { ...buildAnswerContract({
    directAnswer: asksPrice
      ? "There is no pool rental fee because the official pool FAQ says the pool is not available for rental."
      : "No. The official pool FAQ says the pool is not available for rental.",
    keyDetails: ["The FAQ notes that other Overlook spaces may be available for private parties."],
    nextStep: "Open the official pool FAQ below to review the current pool-party guidance.",
    actions: [{ label: "Open official pool-rental FAQ", url: source.sourceUrl, actionType: "information" }],
    sources: [scopedSource], status: "verified", requestedDetails: asksPrice ? ["price", "permission"] : ["permission"], coveredDetails: asksPrice ? ["price", "permission"] : ["permission"],
    ...(asksPrice ? { detailResolutions: { price: { status: "not-applicable", evidenceSourceIds: [scopedSource.id] } } } : {}),
    checkedAt: scopedSource.checkedAt, answerMode: "community-proactive-pool-party",
  }), _shortcutFilterEvidence: shortcutFacilityEvidence(source, routingPlan) };
}

function clubhouseAccessAnswer(question, index, routingPlan) {
  if (!/\b(?:access|access card|sign up|membership|amenity card)\b/i.test(question)
    || !/\b(?:clubhouse|overlook)\b/i.test(question)) return null;
  const current = (item) => hasCurrentEvidence(item, index._reviewNow);
  const evidence = sourcesMatching(index, (item) => current(item)
    && /haven[’']t signed up to get access to the Overlook Clubhouse/i.test(item.text || "")
    && (item.actions || []).some((action) => /resident amenity form/i.test(action.label || "")), 1)[0];
  if (evidence) {
    const action = evidence.actions.find((item) => /resident amenity form/i.test(item.label || ""));
    return { ...buildAnswerContract({
      directAnswer: "To get access to the Overlook Clubhouse, complete the Resident Amenity Form online.",
      keyDetails: ["After signing up, the official instructions say you will receive an email to finish your CivicRec account setup.", "If your setup link is expired, contact the clubhouse using the details on the cited official page."],
      nextStep: "Open the Resident Amenity Form below and complete it to start access setup.",
      actions: [{ label: action.label, url: action.url, actionType: "form" }],
      sources: [evidence], status: "verified", requestedDetails: ["action"], coveredDetails: ["action"],
      checkedAt: evidence.checkedAt, answerMode: "community-proactive-clubhouse-access",
    }), _shortcutFilterEvidence: shortcutFacilityEvidence(evidence, routingPlan) };
  }
  const actionSource = sourcesMatching(index, (item) => current(item)
    && (item.actions || []).some((action) => /resident amenity form/i.test(action.label || "")), 1)[0];
  if (!actionSource) return null;
  const action = actionSource.actions.find((item) => /resident amenity form/i.test(item.label || ""));
  return { ...buildAnswerContract({
    directAnswer: "I can’t currently confirm the access requirements, but the approved Resident Amenity Form is the official next step for clubhouse access setup.",
    nextStep: "Open the Resident Amenity Form below while the access instructions are being reconfirmed.",
    actions: [{ label: action.label, url: action.url, actionType: "form" }],
    sources: [actionSource], status: "source-unavailable", requestedDetails: ["action"], coveredDetails: ["action"],
    checkedAt: actionSource.checkedAt, answerMode: "community-proactive-clubhouse-access-partial",
  }), _shortcutFilterEvidence: shortcutFacilityEvidence(actionSource, routingPlan) };
}

function rentalAnswer(question, index, routingPlan) {
  const facility = resolvedRentalFacility(question, routingPlan);
  if (!facility) return null;
  const park = facility.park;
  const reviewNow = index._reviewNow ?? Date.now();
  const isFreshStaticSource = (source) => source.connectorType === "civicrec"
    || !source.staleAfter || Date.parse(source.staleAfter) >= reviewNow;
  const sources = sourcesMatching(index, park
    ? (source) => /\/311\/Park-Shelters|facility-rentals/i.test(`${source.sourceUrl} ${source.id}`)
    : (source) => /\/269\/Rent-the-Facility|\/257\/Amenity-Rentals|facility-rentals/i.test(`${source.sourceUrl} ${source.id}`), 5)
    .filter(isFreshStaticSource);
  const catalog = sourcesMatching(index, (source) => source.connectorType === "civicrec" && /^https:\/\//i.test(source.sourceUrl || ""), 1)[0];
  if (!sources.length || !catalog) return null;
  const evidenceSource = sources.find((source) => source.connectorType !== "civicrec"
    && facility.evidence.test(`${source.title || ""} ${source.text || ""}`));
  if (!evidenceSource) return null;
  const filterEvidence = { facility: [{ value: facility.value, sourceId: evidenceSource.id }] };
  if (park) {
    const parkSource = sources.find((source) => /\$15(?:\.00)? per hour/i.test(source.text || ""));
    if (!parkSource) return null;
    const asksHow = /^how\s+(?:do|can|should|would|may)\b/i.test(String(question).trim());
    return buildAnswerContract({
      directAnswer: asksHow
        ? `Open the official rental catalog, choose the ${facility.value} you want, select an available date and time, and follow the checkout steps to submit the reservation.`
        : `${facility.value[0].toUpperCase()}${facility.value.slice(1)} rentals are currently listed at $15 per hour. You can check a date and begin the reservation in the official rental catalog.`,
      keyDetails: [
        "CAB park shelters are currently listed at $15 per hour.",
        "The shelter and benches are included; playgrounds and grassy areas are not reserved exclusively.",
        "The public park page does not currently publish a deposit or minimum, so the checkout terms should control before payment.",
      ],
      nextStep: `Open the live catalog to check availability for your date and start the ${facility.value} reservation.`,
      actions: [
        { label: `Check ${facility.value} availability and start a reservation`, url: catalog.sourceUrl, actionType: "booking" },
        { label: `Open official ${facility.value} details`, url: parkSource.sourceUrl, actionType: "information" },
      ],
      sources,
      status: "verified",
      requestedDetails: ["price", "action"],
      coveredDetails: ["price", "action"],
      checkedAt: parkSource.checkedAt,
      answerMode: "community-proactive-rental",
      _shortcutFilterEvidence: filterEvidence,
    });
  }
  const facilitySource = sources.find((source) => /Great Hall[\s\S]*?\$100\.00 per hour/i.test(source.text || ""));
  if (!facilitySource) return null;
  const asksHow = /^how\s+(?:do|can|should|would|may)\b/i.test(String(question).trim());
  const asksCost = /^how much\b|\b(?:cost|price|fee)\b/i.test(question);
  const pavilionPrice = facility.kind === "pavilion"
    ? facilitySource.text.match(/(?:outdoor\s+)?pavilions?[\s\S]{0,900}?Hourly Pricing\s*\$?(\d+(?:\.\d{2})?)\s*per hour/i)?.[1]
    : null;
  const hallPrice = facility.kind === "great-hall"
    ? facilitySource.text.match(/Great Hall[\s\S]{0,900}?Hourly Pricing\s*\$?(\d+(?:\.\d{2})?)\s*per hour/i)?.[1]
    : null;
  const genericChoices = facility.kind === "generic" && asksCost;
  const directAnswer = asksHow
    ? `Open the live rental catalog, choose the ${facility.value} you want, select an available date and time, and follow the checkout steps to submit the reservation.`
    : asksCost
      ? pavilionPrice
        ? `The ${facility.value} is currently listed at $${pavilionPrice} per hour.`
        : genericChoices
          ? `${facility.value} has separately priced spaces: the Great Hall is $100 per hour with a two-hour minimum ($200 minimum rental) and a $250 refundable security deposit; North and South outdoor pavilions are $25 per hour.`
          : `The ${facility.value} is currently listed at $${hallPrice} per hour with a two-hour minimum ($200 minimum rental), plus a $250 refundable security deposit.`
      : `Yes. You can reserve the ${facility.value} through the live rental catalog, subject to availability and the listed rental conditions.`;
  const keyDetails = facility.kind === "great-hall"
    ? ["The Great Hall is $100 per hour with a two-hour minimum ($200 minimum rental), plus a currently listed $250 refundable security deposit.", "Guests must remain in the rented space; additional facility access is not included."]
    : facility.kind === "pavilion"
      ? ["The selected outdoor pavilion is currently listed at $25 per hour.", "Guests must remain in the rented space; additional facility access is not included."]
      : genericChoices
        ? ["Choose the Great Hall or a North or South outdoor pavilion before relying on a rate.", "Guests must remain in the rented space; additional facility access is not included."]
        : ["The official facility page lists separate rentable spaces and conditions.", "Guests must remain in the rented space; additional facility access is not included."];
  return buildAnswerContract({
    directAnswer,
    keyDetails,
    nextStep: `Open the live catalog to check ${facility.value} availability and start the reservation; use the facility contact on the official page if the desired time is not shown.`,
    actions: [
      { label: `Check ${facility.value} availability and start a reservation`, url: catalog.sourceUrl, actionType: "booking" },
      { label: "Open current facility pricing and contact", url: facilitySource.sourceUrl, actionType: "information" },
    ],
    sources,
    status: "verified",
    requestedDetails: asksCost ? ["price", "action"] : ["action"],
    coveredDetails: asksCost ? ["price", "action"] : ["action"],
    checkedAt: facilitySource.checkedAt,
    answerMode: "community-proactive-rental",
    _shortcutFilterEvidence: filterEvidence,
  });
}

function trashReturnAnswer(index) {
  // The current Trash & Recycling page is withheld while its conflicting
  // contact records are reviewed. The official Trash Screening PDF states the
  // same storage rule independently, so it can preserve this answer without
  // exposing any content from the conflicted page version.
  const sources = sourcesMatching(index, sourceUrlIncludes("/DocumentCenter/View/622/Trash-Screening-"), 3);
  const source = sources.find((item) => /must be returned to an appropriately screened location by the end of the pick-up day/i.test(item.text || ""));
  if (!source) return null;
  return buildAnswerContract({
    directAnswer: "Bring trash and recycling containers back to an appropriately screened storage location by the end of pickup day.",
    keyDetails: [
      "Bins may be placed on the street or alley on the morning of collection.",
      "When they are not out for collection, store them in an enclosed structure, garage, or appropriately screened area behind the wing fence.",
    ],
    nextStep: "For the exact collection date, use the live Waste Connections pickup calendar linked below.",
    actions: [{ label: "Check the live pickup calendar", url: "https://www.wasteconnections.com/pickup-schedule-wasteconnect-calendar?areaName=WC-5311#", actionType: "calendar" }],
    sources,
    status: "verified",
    requestedDetails: ["date"],
    coveredDetails: ["date"],
    checkedAt: source.checkedAt,
    answerMode: "community-proactive-trash-storage",
  });
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isoDateInDenver(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function formatDate(isoDate) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${isoDate}T12:00:00Z`));
}

function nextDrcReview(now = new Date()) {
  const today = isoDateInDenver(now);
  for (let offset = 0; offset < 180; offset += 1) {
    const candidate = addDays(today, offset);
    const date = new Date(`${candidate}T12:00:00Z`);
    if (date.getUTCDay() !== 4) continue;
    const month = date.getUTCMonth() + 1;
    const occurrence = Math.ceil(date.getUTCDate() / 7);
    const eligible = month >= 3 && month <= 9 ? [1, 3].includes(occurrence) : occurrence === 1;
    if (!eligible) continue;
    const deadline = addDays(candidate, -6);
    if (deadline >= today) return { meeting: candidate, deadline };
  }
  return null;
}

function drcSubmissionAnswer(index, now) {
  const sources = sourcesMatching(index, (source) => /Design-Review-Documents|Architectural-Community-Standards|Faq\.aspx/i.test(source.sourceUrl || ""), 5);
  const review = nextDrcReview(now);
  if (!sources.length || !review) return null;
  return buildAnswerContract({
    directAnswer: `Choose the application for your project, then email the completed packet to residentsubmit@sterlingranchcab.com. The next normal submission deadline is ${formatDate(review.deadline)} for the ${formatDate(review.meeting)} review meeting.`,
    keyDetails: [
      "Include the project checklist plus the site plan, dimensions, materials, colors, product information, and photos requested for the improvement.",
      "Applications received after the Friday deadline normally move to the following meeting agenda.",
      "Wait for written approval before starting work.",
    ],
    nextStep: "Open the application page below, choose the project-specific packet, and submit the completed materials by email.",
    actions: [
      { label: "Choose the correct DRC application", url: `${CAB_BASE}/201/Design-Review-Documents`, actionType: "form" },
      { label: "Open DRC submission instructions", url: `${CAB_BASE}/Faq.aspx?QID=88`, actionType: "information" },
    ],
    sources,
    status: "verified",
    requestedDetails: ["action", "date", "contact"],
    coveredDetails: ["action", "date", "contact"],
    checkedAt: sources[0].checkedAt,
    answerMode: "community-proactive-drc",
  });
}

function drcEmailAnswer(index) {
  const sources = sourcesMatching(index, (source) =>
    /\/DocumentCenter\/View\/1574\//i.test(source.sourceUrl || "")
    && /Email:\s*residentsubmit@sterlingranchcab\.com/i.test(source.text || ""), 1);
  if (!sources.length) return null;
  return buildAnswerContract({
    directAnswer: "Email completed DRC applications to residentsubmit@sterlingranchcab.com.",
    keyDetails: ["The current General Architectural Improvement application lists this as the submission email."],
    nextStep: "Open the current application below to confirm the required materials before sending it.",
    actions: [{ label: "Open the current DRC application", url: sources[0].sourceUrl, actionType: "form" }],
    sources,
    status: "verified",
    requestedDetails: ["contact"],
    coveredDetails: ["contact"],
    checkedAt: sources[0].checkedAt,
    answerMode: "community-proactive-drc-contact",
  });
}

function establishmentWaterAnswer(question, index, now = new Date()) {
  if (!/\b(?:water|watering|irrigation)\b/i.test(question)
    || !/\b(?:establish\w*|new (?:lawn|sod|turf|plants?|landscap\w*))\b/i.test(question)
    || !/\b(?:discount|bill\w*|charge\w*|cost|exempt\w*|reduc\w*|tier|rates?|price)\b/i.test(question)) return null;
  const sources = sourcesMatching(index, (source) => {
    const text = String(source.text || "");
    return /establishment period \(\d+ days following the installation of turf and plant material\)/i.test(text)
      && /will be billed at the first tier fee rate, and will not count against the water budget/i.test(text)
      && source.staleAfter && new Date(source.staleAfter).getTime() > new Date(now).getTime();
  }, 1);
  if (!sources.length) return null;
  const days = sources[0].text.match(/establishment period \((\d+) days/i)[1];
  return buildAnswerContract({
    directAnswer: `Yes. CAB's water FAQ says water used during the ${days}-day establishment period after installing turf and plant material is billed at the first-tier rate and does not count against your water budget.`,
    keyDetails: ["The water is still billed; this is not a waiver of all water charges."],
    nextStep: "Check the official water FAQ below and confirm with CAB how to have your installation date recorded for billing.",
    sources,
    actions: [{ label: "Open the official water FAQ", url: sources[0].sourceUrl, actionType: "information" }],
    status: "verified",
    requestedDetails: ["cost"], coveredDetails: ["cost"],
    checkedAt: sources[0].checkedAt,
    answerMode: "community-proactive-establishment-water",
  });
}

function trashHolidayAnswer(question, index, now) {
  if (!/\b(?:trash|garbage|recycling|pickup|pick(?:ed)? up|collection)\b/i.test(question)) return null;
  if (!/\b(?:holiday|delay|affect|pickup|pick(?:ed)? up|collection)\b/i.test(question)
    || /\b(?:allowed|permission|store|storage|leave|overnight|fee|cost|price)\b/i.test(question)) return null;
  const named = question.match(/\b(?:Labor Day|Memorial Day|Independence Day|Thanksgiving|Christmas|New Year'?s Day)\b/i)?.[0];
  if (!named) return null;
  const sources = sourcesMatching(index, source => /\/247\/Trash-Recycling(?:[/?#]|$)/i.test(source.sourceUrl || '')
    && Date.parse(source.staleAfter) > new Date(now || Date.now()).getTime(), 4);
  for (const source of sources) {
    const section = String(source.text || '').match(/Holiday Schedule\s+(Trash pickup will be delayed by one day for the following holidays:)\s*([\s\S]*?)(?:Opt-In|New Homeowners|$)/i);
    if (!section || !section[2].toLowerCase().includes(named.toLowerCase())) continue;
    return buildAnswerContract({
      directAnswer: `The official CAB schedule lists ${named} as a holiday when trash pickup is delayed by one day.`,
      keyDetails: [section[1] + ' ' + section[2].replace(/\s+/g, ' ').trim()],
      nextStep: 'Check your regular village pickup day and the official provider schedule for that holiday week.',
      actions: [{ label: 'Open official Trash & Recycling schedule', url: source.sourceUrl, actionType: 'information' }],
      sources: [source], status: 'verified', requestedDetails: ['date'], coveredDetails: ['date'], checkedAt: source.checkedAt,
      answerMode: 'community-proactive-trash-holiday',
    });
  }
  return null;
}

function proactiveCommunityAnswer(question, options = {}) {
  const text = String(question || "");
  const index = { ...(options.index || {}), _reviewNow: new Date(options.now || Date.now()).getTime() };
  const holiday = trashHolidayAnswer(text, index, options.now);
  if (holiday) return holiday;
  if (/\b(?:landscap\w*|yard|irrigation)\b/i.test(text)
    && /\b(?:application|apply|packet|submit|submittal|form)\b/i.test(text)
    && !/\b(?:professional|contractor|class|exemption|inspection|fee|cost|price|deadline|when|how long)\b/i.test(text)) {
    const sources = sourcesMatching(index, source => /\/DocumentCenter\/View\/1964\//.test(source.sourceUrl || "")
      && /LANDSCAPE AND IRRIGATION APPLICATION FOR PROPERTY OWNERS/i.test(source.text || "")
      && /ATTACHMENT B-1/i.test(source.text || "") && /ATTACHMENT B-2/i.test(source.text || "")
      && /residentsubmit@sterlingranchcab\.com/i.test(source.text || "")
      && Date.parse(source.staleAfter) > new Date(options.now || Date.now()).getTime(), 1);
    if (sources.length) return buildAnswerContract({
      directAnswer: "Use CAB's Landscape Submittal Packet for your landscaping and irrigation application.",
      keyDetails: ["Complete the property-owner application and include your landscape and irrigation plans, the signed landscape verification checklist (B-1), and the contractor and fee addendum (B-2).", "The application lists residentsubmit@sterlingranchcab.com for email submission."],
      nextStep: "Open the official packet below, complete the required attachments, and send it to CAB for review before starting the project.",
      sources, actions: [{label:"Open the landscape application packet",url:sources[0].sourceUrl,actionType:"form"}],
      status:"verified",requestedDetails:["action"],coveredDetails:["action"],checkedAt:sources[0].checkedAt,
      answerMode:"community-proactive-landscape-application",
    });
  }
  const establishment = establishmentWaterAnswer(text, index, options.now);
  if (establishment) return establishment;
  const structuredPayment = options.routingPlan?.goal === "payment"
    && /\b(?:water|utility)\b/i.test(options.routingPlan?.subject || "")
    && /\b(?:bill|billing|charge|payment)\b/i.test(options.routingPlan?.subject || "");
  if (structuredPayment) return waterPortalAnswer(index, { payment: true });
  const poolParty = poolPartyAnswer(text, index, options.routingPlan);
  if (poolParty) return poolParty;
  const clubhouseAccess = clubhouseAccessAnswer(text, index, options.routingPlan);
  if (clubhouseAccess) return clubhouseAccess;
  if (/\b(?:approved|pre[- ]approved)\s+(?:landscapers?|landscape companies)|\blist of approved landscapers?\b/i.test(text)) return landscaperAnswer(index);
  if (/\b(?:monitor|view|track|check)\b.{0,35}\bwater (?:usage|use|bill)|\bwater (?:usage|use)\b.{0,35}\b(?:online|internet|login|portal)|\binternet access\b.{0,35}\bwater (?:usage|use)\b|\bUtilityHawk\b/i.test(text)) return waterPortalAnswer(index);
  const plannedFacilityBooking = ["booking", "cost"].includes(options.routingPlan?.goal)
    && String(options.routingPlan?.filters?.facility || "").trim()
    && !/\b(?:access|membership|guest pass|pool)\b/i.test(text);
  if (plannedFacilityBooking || /\b(?:book|reserve|rent|cost|price|fee|check availability)\b.{0,40}\b(?:park|shelter|clubhouse|overlook|great hall|pavilion)\b|\b(?:park|shelter|clubhouse|overlook|great hall|pavilion)\b.{0,40}\b(?:book|reserve|rent|cost|price|fee|check availability)\b|\bhow much\b.{0,45}\b(?:park|shelter|clubhouse|overlook|great hall|pavilion)\b/i.test(text)) return rentalAnswer(text, index, options.routingPlan);
  if (/\b(?:trash|garbage|recycling|bins?|cans?|carts?|containers?)\b/i.test(text)
    && /(?:bring|take)(?:\s+\w+){0,4}\s+(?:in|back)\b|\b(?:end of pickup|return|remove from (?:the )?curb|how long.*curb)\b/i.test(text)) return trashReturnAnswer(index);
  if (/\bDRC\b|\bdesign review\b/i.test(text)
    && /\b(?:email|email address|contact)\b/i.test(text)) return drcEmailAnswer(index);
  if (/\b(?:submit|send|file)\b.{0,35}\b(?:DRC|design review|architectural)\b|\b(?:DRC|design review)\b.{0,35}\b(?:submit|application|apply)\b/i.test(text)
    && !/\b(?:shed|fence|landscape|paint|tree|spa|hot tub|lighting|patio|deck|pool|garden|flag)\b/i.test(text)) return drcSubmissionAnswer(index, options.now);
  return null;
}

function replaceShortAnswer(answer, directAnswer, nextStep) {
  let value = String(answer || "").replace(/^Short answer:\s*[^\n]+/i, `Short answer: ${directAnswer}`);
  if (nextStep) value = /Before you act:/i.test(value)
    ? value.replace(/Before you act:[\s\S]*$/i, `Before you act: ${nextStep}`)
    : `${value}\n\nBefore you act: ${nextStep}`;
  return value;
}

function costAnswerFromDetails(answer = {}) {
  const details = answer.keyDetails?.length
    ? answer.keyDetails
    : [...String(answer.answer || "").matchAll(/^[-•]\s*([^:\n]{2,70}):\s*([^\n]+)/gm)].map((match) => `${match[1]}: ${match[2]}`);
  const priced = (details || []).map((detail) => String(detail).match(/^([^:]{2,70}):\s*(\$\d[^.\n]*(?:\.[0-9]{2})?[^.\n]*)/i)).filter(Boolean).slice(0, 3);
  if (!priced.length) {
    const evidence = (answer.sources || []).map((source) => source.text || "").join(" ");
    const streetlight = evidence.match(/Residential streetlight charge is\s*(\$[\d,.]+)/i)?.[1];
    const trash = evidence.match(/Residential trash charge is\s*(\$[\d,.]+)/i)?.[1];
    if (streetlight && trash) return `Streetlight is ${streetlight}; trash is ${trash}.`;
    return "";
  }
  return priced.map((match) => `${match[1].trim()} is ${match[2].trim()}`).join("; ") + ".";
}

function denverParts(now = new Date()) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", hour12: false }).formatToParts(now)
    .reduce((all, part) => ({ ...all, [part.type]: Number(part.value) || part.value }), {});
}

function enhanceProactiveRulesAnswer(question, answer, options = {}) {
  if (!answer?.answer) return answer;
  const text = String(question || "");
  const parts = denverParts(options.now);
  let directAnswer = "";
  let nextStep = "";
  if (/^(?:how much|what (?:does|will).{0,30}cost|what is the (?:cost|price))/i.test(text)
    && !/\$\d/.test(String(answer.directAnswer || ""))) {
    directAnswer = costAnswerFromDetails(answer);
  }
  if (!directAnswer && /\b(?:when|time|today|now)\b.{0,35}\bwater|\bwater\b.{0,35}\b(?:lawn|irrigat)/i.test(text)) {
    const inSeason = parts.month > 5 && parts.month < 9 || parts.month === 5 && parts.day >= 1 || parts.month === 9 && parts.day <= 30;
    const allowedNow = !inSeason || parts.hour < 10 || parts.hour >= 18;
    directAnswer = inSeason
      ? `The May 1–September 30 watering window is currently in effect. Ordinary irrigation ${allowedNow ? "is allowed right now" : "is not allowed right now"}; during this season it must run before 10 a.m. or after 6 p.m.`
      : "The May 1–September 30 daytime-watering restriction is not currently in effect; ordinary irrigation is otherwise governed by any current CAB restrictions.";
  } else if (!/\bpermanent\b/i.test(text)
    && /\b(?:holiday|christmas|seasonal)\b.{0,25}\blight(?:s|ing)?\b|\blight(?:s|ing)?\b.{0,25}\b(?:holiday|christmas|seasonal)\b/i.test(text)) {
    const summer = parts.month === 6 && parts.day >= 18 || parts.month === 7 && parts.day <= 7;
    const winter = parts.month >= 10 || parts.month === 1;
    directAnswer = summer || winter
      ? "Seasonal decorative lights are currently within an allowed window. They are permitted June 18–July 7 and October 1–January 31, and must be off by 10 p.m."
      : "Seasonal decorative lights are not currently within an allowed window. The next allowed window begins October 1; the full windows are June 18–July 7 and October 1–January 31.";
  } else if (/\b(?:utility )?tap fees?\b/i.test(text)) {
    nextStep = "Tell me the property type, lot size, meter size, and intended use shown on the project documents, and I’ll narrow the current tap and facility charges instead of making you search the fee table.";
  } else if (/\bwater rates?\b|\b(?:estimate|calculate)\b.{0,25}\bwater bill\b/i.test(text)) {
    nextStep = "Tell me whether the usage is indoor or outdoor, the gallons, your meter/property category, and the water-budget percentage or tier shown on the bill, and I’ll calculate the applicable current usage charge.";
  } else if (/\b(?:not pay|unpaid|late|past due|delinquent)\b.{0,30}\bwater bill\b|\bwater bill\b.{0,30}\b(?:late|past due|delinquent)\b/i.test(text)) {
    nextStep = "Tell me the due date printed on the bill and I’ll calculate the courtesy-notice date, possible late-fee date, and the relevant last-Wednesday disconnection milestone.";
  }
  if (!directAnswer && !nextStep) return answer;
  return {
    ...answer,
    ...(directAnswer ? { directAnswer } : {}),
    ...(nextStep ? { nextStep } : {}),
    answer: replaceShortAnswer(answer.answer, directAnswer || String(answer.answer).match(/^Short answer:\s*([^\n]+)/i)?.[1] || "", nextStep),
    residentEffortReduced: true,
  };
}

module.exports = {
  approvedLandscaperExamples,
  costAnswerFromDetails,
  enhanceProactiveRulesAnswer,
  nextDrcReview,
  proactiveCommunityAnswer,
};

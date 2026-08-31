const { buildAnswerContract } = require("./community-contracts");

const CAB_BASE = "https://sterlingranchcab.com";
const CIVICREC_URL = "https://secure.rec1.com/CO/sterling-ranch-community-authority-board-co/catalog";
const UTILITYHAWK_URL = "https://srcab.utilityhawk.us/login";

function sourcesMatching(index = {}, matcher, limit = 4) {
  return (index.sources || []).filter(matcher).slice(0, limit).map((source) => ({ ...source, isOfficialResource: true }));
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
  if (!sources.length || examples.length < 3) return null;
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

function waterPortalAnswer(index) {
  const sources = sourcesMatching(index, (source) => /\/206\/Water-Billing|utilityhawk/i.test(`${source.sourceUrl} ${source.text}`), 4);
  if (!sources.some((source) => /srcab\.utilityhawk\.us/i.test(source.text || source.sourceUrl || ""))) return null;
  return buildAnswerContract({
    directAnswer: "Use UtilityHawk to view Sterling Ranch water usage and billing online.",
    keyDetails: [
      "Register or sign in to review account activity and water-consumption history.",
      "You can set daily, weekly, or monthly usage thresholds and receive alerts when usage is trending high.",
      "UtilityHawk also links to online bill payment; ACH is free, while the official page currently lists a 2.95% debit/credit-card processing fee.",
    ],
    nextStep: "Open UtilityHawk below and select Registration if this is your first visit.",
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

function isWaterPaymentQuestion(question = "") {
  const text = String(question);
  const asksToPay = /\b(?:pay|payment|payment portal|pay online)\b/i.test(text);
  const isWaterBill = /\b(?:water|utility)\b.{0,30}\b(?:bill|billing|account)\b|\b(?:bill|billing|account)\b.{0,30}\b(?:water|utility)\b/i.test(text);
  const asksAboutConsequences = /\b(?:not pay|unpaid|late|past due|delinquent|disconnect|shut ?off|collection|payment plan)\b/i.test(text);
  const asksForAmount = /\b(?:rate|rates|how much|estimate|calculate|amount due|balance)\b/i.test(text);
  return asksToPay && isWaterBill && !asksAboutConsequences && !asksForAmount;
}

function waterPaymentAnswer(index) {
  const sources = sourcesMatching(index, sourceUrlIncludes("/206/Water-Billing"), 2);
  const source = sources.find((item) => /Utility\s*Hawk/i.test(item.text || "")
    && /srcab\.utilityhawk\.us\/login/i.test(item.text || "")
    && /Pay Online/i.test(item.text || ""));
  if (!source) return null;
  const text = String(source.text || "");
  const cardFee = text.match(/processing fee of\s+([0-9]+(?:\.[0-9]+)?%)/i)?.[1];
  const freeAch = /(?:checking\/savings account|ACH)[\s\S]{0,45}free of charge|free of charge[\s\S]{0,45}(?:checking\/savings account|ACH)/i.test(text);
  const company = /American Conservation and Billing Solutions\s*\(\s*AmCoBi\s*\)/i.test(text)
    ? "American Conservation and Billing Solutions (AmCoBi)"
    : /AmCoBi/i.test(text) ? "AmCoBi" : "the community's billing provider";
  const paymentDetails = [
    freeAch ? "Bank-account payments (ACH) are free." : "The official page lists bank-account payment as an option.",
    cardFee ? `Debit and credit cards have a ${cardFee} processing fee charged by Paymentus.` : "The official page says card payments may include a processing fee.",
    `${company} administers the monthly water bill.`,
  ];
  return buildAnswerContract({
    directAnswer: "Pay your Sterling Ranch water bill through UtilityHawk. Sign in, then select “Pay Online.”",
    keyDetails: paymentDetails,
    nextStep: "Open the UtilityHawk sign-in page below. If you do not have an account yet, use its registration option first.",
    actions: [
      { label: "Pay your water bill in UtilityHawk", url: UTILITYHAWK_URL, actionType: "payment" },
      { label: "Open official water-billing instructions", url: `${CAB_BASE}/206/Water-Billing`, actionType: "information" },
    ],
    sources,
    status: "verified",
    requestedDetails: ["action"],
    coveredDetails: ["action"],
    checkedAt: source.checkedAt,
    answerMode: "community-proactive-payment",
  });
}

function rentalAnswer(question, index) {
  const park = /\bpark|shelter\b/i.test(question) && !/clubhouse|overlook|great hall|pavilion/i.test(question);
  const sources = sourcesMatching(index, park
    ? (source) => /\/311\/Park-Shelters|facility-rentals/i.test(`${source.sourceUrl} ${source.id}`)
    : (source) => /\/269\/Rent-the-Facility|\/257\/Amenity-Rentals|facility-rentals/i.test(`${source.sourceUrl} ${source.id}`), 5);
  if (!sources.length) return null;
  if (park) {
    const parkSource = sources.find((source) => /\$15(?:\.00)? per hour/i.test(source.text || ""));
    if (!parkSource) return null;
    const asksHow = /^how\s+(?:do|can|should|would|may)\b/i.test(String(question).trim());
    return buildAnswerContract({
      directAnswer: asksHow
        ? "Open the official rental catalog, choose the park shelter you want, select an available date and time, and follow the checkout steps to submit the reservation."
        : "CAB park shelters are currently listed at $15 per hour. You can check a date and begin the reservation in the official rental catalog.",
      keyDetails: [
        "CAB park shelters are currently listed at $15 per hour.",
        "The shelter and benches are included; playgrounds and grassy areas are not reserved exclusively.",
        "The public park page does not currently publish a deposit or minimum, so the checkout terms should control before payment.",
      ],
      nextStep: "Open the live catalog to check availability for your date and start the reservation.",
      actions: [
        { label: "Check availability and start a reservation", url: CIVICREC_URL, actionType: "booking" },
        { label: "Open official park-shelter details", url: `${CAB_BASE}/311/Park-Shelters`, actionType: "information" },
      ],
      sources,
      status: "verified",
      requestedDetails: ["price", "action"],
      coveredDetails: ["price", "action"],
      checkedAt: parkSource.checkedAt,
      answerMode: "community-proactive-rental",
    });
  }
  const facilitySource = sources.find((source) => /Great Hall[\s\S]*?\$100\.00 per hour/i.test(source.text || ""));
  if (!facilitySource) return null;
  const asksHow = /^how\s+(?:do|can|should|would|may)\b/i.test(String(question).trim());
  const asksCost = /^how much\b|\b(?:cost|price|fee)\b/i.test(question);
  const directAnswer = asksHow
    ? "Open the live rental catalog, choose the Overlook space you want, select an available date and time, and follow the checkout steps to submit the reservation."
    : asksCost
      ? "The Great Hall is $100 per hour with a two-hour minimum ($200 minimum rental), plus a currently listed $250 refundable security deposit."
      : "Yes. You can reserve an Overlook space through the live rental catalog, subject to availability and the listed rental conditions.";
  return buildAnswerContract({
    directAnswer,
    keyDetails: [
      "The Great Hall is $100 per hour with a two-hour minimum ($200 minimum rental), plus a currently listed $250 refundable security deposit.",
      "North and South outdoor pavilions are currently listed at $25 per hour.",
      "A clubhouse rental does not include additional facility or pool access; guests must remain in the rented space.",
    ],
    nextStep: "Open the live catalog to check your date and start the reservation; use the clubhouse contact on the official page if the desired time is not shown.",
    actions: [
      { label: "Check availability and start a reservation", url: CIVICREC_URL, actionType: "booking" },
      { label: "Open current clubhouse pricing and contact", url: `${CAB_BASE}/269/Rent-the-Facility`, actionType: "information" },
    ],
    sources,
    status: "verified",
    requestedDetails: ["price", "action"],
    coveredDetails: ["price", "action"],
    checkedAt: facilitySource.checkedAt,
    answerMode: "community-proactive-rental",
  });
}

function trashReturnAnswer(index) {
  const sources = sourcesMatching(index, sourceUrlIncludes("/247/Trash-Recycling"), 3);
  const source = sources.find((item) => /returned to an appropriately screened location by the end of the pickup day/i.test(item.text || ""));
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

function proactiveCommunityAnswer(question, options = {}) {
  const text = String(question || "");
  const index = options.index || {};
  if (/\b(?:approved|pre[- ]approved)\s+(?:landscapers?|landscape companies)|\blist of approved landscapers?\b/i.test(text)) return landscaperAnswer(index);
  if (isWaterPaymentQuestion(text)) return waterPaymentAnswer(index);
  if (/\b(?:monitor|view|track|check)\b.{0,35}\bwater (?:usage|use|bill)|\bwater (?:usage|use)\b.{0,35}\b(?:online|internet|login|portal)|\binternet access\b.{0,35}\bwater (?:usage|use)\b|\bUtilityHawk\b/i.test(text)) return waterPortalAnswer(index);
  if (/\b(?:book|reserve|rent|cost|price|fee)\b.{0,40}\b(?:park|shelter|clubhouse|overlook|great hall|pavilion)\b|\b(?:park|shelter|clubhouse|overlook|great hall|pavilion)\b.{0,40}\b(?:book|reserve|rent|cost|price|fee)\b|\bhow much\b.{0,45}\b(?:park|shelter|clubhouse|overlook|great hall|pavilion)\b/i.test(text)) return rentalAnswer(text, index);
  if (/\b(?:trash|garbage|recycling|bins?|cans?|carts?|containers?)\b/i.test(text)
    && /(?:bring|take)(?:\s+\w+){0,4}\s+(?:in|back)\b|\b(?:end of pickup|return|remove from (?:the )?curb|how long.*curb)\b/i.test(text)) return trashReturnAnswer(index);
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
  if (!priced.length) return "";
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
    && /\b(?:holiday|christmas|seasonal)\b.{0,25}\blights?\b|\blights?\b.{0,25}\b(?:holiday|christmas|seasonal)\b/i.test(text)) {
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
  isWaterPaymentQuestion,
  nextDrcReview,
  proactiveCommunityAnswer,
  waterPaymentAnswer,
};

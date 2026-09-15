// The release suite runs without calling a paid model. These fixtures stand in
// for the model's structured JSON contract so the same retrieval, grounding,
// action-link, and answer-quality code still receives deterministic inputs.
const PAYMENT_QUESTIONS = new Set([
  "Where can I pay my water bill?",
  "How do I pay my water bill?",
  "Can I pay my water bill online?",
  "What is the water bill payment portal?",
  "Pay utility bill",
  "What's the online place for settling my monthly utility charge?",
]);
const POOL_HOURS_QUESTIONS = new Set([
  "What are the pool hours for Labor Day?",
]);
const INFORMATION_NAVIGATION_QUESTIONS = new Set([
  'Where can I find trash and recycling information?', 'Where is the garbage info page?',
  'Open recycling information', 'trash/recycling info?', 'Where can I find recyling info?',
]);

function isGeneralDrcSubmissionQuestion(question) {
  return /\b(?:drc|design review)\b/i.test(String(question))
    && /\b(?:submit|submission|send|turn in|apply)\b/i.test(String(question));
}

function isCalendarAccessQuestion(question) {
  return /\bcalendar\b/i.test(String(question)) && /\b(?:access|open|view|find|see)\b/i.test(String(question));
}

function hasAiEvalFixture(question) {
  const normalized = String(question).trim();
  return PAYMENT_QUESTIONS.has(normalized) || POOL_HOURS_QUESTIONS.has(normalized) || INFORMATION_NAVIGATION_QUESTIONS.has(normalized)
    || isGeneralDrcSubmissionQuestion(normalized) || isCalendarAccessQuestion(normalized);
}

async function planCommunitySearchFixture(question) {
  // Replay the actual erroneous live plan, not an ideal navigation plan.
  if (INFORMATION_NAVIGATION_QUESTIONS.has(String(question).trim())) return {
    intent: 'services', goal: 'information', goals: ['information'], subject: 'trash and recycling',
    requestedDetails: ['action', 'methods'], searchQueries: ['trash recycling information', 'waste disposal guidelines', 'trash and recycling services'],
    scope: 'community', needsClarification: false,
  };
  if (isGeneralDrcSubmissionQuestion(question)) return {
    intent: "forms",
    goal: "application",
    goals: ["application"],
    subject: "design review submission",
    requestedDetails: ["action"],
    searchQueries: ["DRC application submission", "design review submission"],
    scope: "community",
    needsClarification: false,
  };
  if (isCalendarAccessQuestion(question)) return {
    intent: "events",
    goal: "information",
    goals: ["information"],
    subject: "resident clubs calendar",
    requestedDetails: ["action"],
    searchQueries: ["resident clubs calendar"],
    scope: "community",
    needsClarification: false,
  };
  if (POOL_HOURS_QUESTIONS.has(String(question).trim())) return {
    intent: "status",
    goal: "schedule",
    goals: ["schedule"],
    subject: "pool operating hours on Labor Day",
    requestedDetails: ["hours", "date"],
    dateRange: { kind: "explicit-date", start: "2026-09-07", end: "2026-09-07", label: "Labor Day" },
    filters: { audience: "", category: "", facility: "pool", location: "" },
    searchQueries: ["pool hours Labor Day", "Overlook Outdoor Pool hours"],
    scope: "community",
    needsClarification: false,
    clarificationQuestion: "",
  };
  if (!hasAiEvalFixture(question)) return null;
  return {
    intent: "services",
    goal: "payment",
    subject: "water bill",
    searchQueries: ["pay water bill UtilityHawk", "water bill payment options"],
  };
}

async function synthesizeCommunityAnswerFixture(question) {
  if (POOL_HOURS_QUESTIONS.has(String(question).trim())
    || isGeneralDrcSubmissionQuestion(question) || isCalendarAccessQuestion(question)) return null;
  if (!hasAiEvalFixture(question)) return null;
  return {
    directAnswer: "Pay your Sterling Ranch water bill through UtilityHawk. Sign in, then select “Pay Online.”",
    keyDetails: [
      "Bank-account payments (ACH) are free.",
      "Debit and credit cards have a 2.95% processing fee charged by Paymentus.",
      "American Conservation and Billing Solutions (AmCoBi) administers the monthly water bill.",
    ],
    nextStep: "Open UtilityHawk and sign in to pay your bill.",
    answerMode: "community-grounded-ai",
  };
}

module.exports = { hasAiEvalFixture, planCommunitySearchFixture, synthesizeCommunityAnswerFixture };

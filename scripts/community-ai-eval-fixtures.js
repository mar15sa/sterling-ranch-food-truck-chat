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

function hasAiEvalFixture(question) {
  return PAYMENT_QUESTIONS.has(String(question).trim());
}

async function planCommunitySearchFixture(question) {
  if (!hasAiEvalFixture(question)) return null;
  return {
    intent: "services",
    goal: "payment",
    subject: "water bill",
    searchQueries: ["pay water bill UtilityHawk", "water bill payment options"],
  };
}

async function synthesizeCommunityAnswerFixture(question) {
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

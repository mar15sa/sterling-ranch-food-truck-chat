const { deterministicRequestedDetails } = require("./community-interpretation");

const LEADING_QUESTION = /^(?:what|which|where|when|who|whose|how|is|are|am|was|were|can|could|may|might|must|should|would|will|do|does|did|has|have)\b/i;
const SECOND_QUESTION = /(?:\s*[?;]\s*|\s*,?\s+(?:and|also)\s+)(?=(?:what|which|where|when|who|whose|how|is|are|am|was|were|can|could|may|might|must|should|would|will|do|does|did|has|have)\b)/gi;

function cleanClause(value = "") {
  return String(value).replace(/^[\s,;?]+|[\s,;?]+$/g, "").replace(/\s+/g, " ").trim();
}

function splitResidentNeeds(question = "") {
  const text = cleanClause(question);
  if (!text) return [];
  const clauses = text.split(SECOND_QUESTION).map(cleanClause).filter(Boolean);
  return clauses.length ? clauses : [text];
}

function goalForNeed(text = "", details = [], routingPlan = {}, index = 0, needCount = 1) {
  if (details.includes("permission")) return "permission";
  if (details.includes("price")) return "cost";
  if (details.includes("contact")) return "contact";
  if (details.includes("status")) return "status";
  if (details.includes("date") || /^when\b/i.test(text)) return "schedule";
  if (details.includes("action")) {
    const planned = (routingPlan.goals || []).find((goal) =>
      ["payment", "booking", "application", "registration", "account-access"].includes(goal)
    );
    if (planned && (needCount === 1 || index === 0)) return planned;
    return "information";
  }
  if (needCount > 1 && Array.isArray(routingPlan.goals) && routingPlan.goals[index]) {
    return routingPlan.goals[index];
  }
  if (needCount === 1 && routingPlan.goal) return routingPlan.goal;
  return "information";
}

function detailsForGoal(goal = "") {
  return ({
    permission: ["permission"],
    cost: ["price"],
    contact: ["contact"],
    schedule: ["date"],
    status: ["status"],
    payment: ["action"],
    booking: ["action"],
    application: ["action"],
    registration: ["action"],
    "account-access": ["action"],
  })[goal] || ["information"];
}

function buildResidentRequestContract(question = "", routingPlan = null) {
  const clauses = splitResidentNeeds(question);
  const plan = routingPlan && typeof routingPlan === "object" ? routingPlan : {};
  const needs = clauses.map((text, index) => {
    const explicitDetails = deterministicRequestedDetails(text);
    const goal = goalForNeed(text, explicitDetails, plan, index, clauses.length);
    const requestedDetails = explicitDetails.length ? explicitDetails : detailsForGoal(goal);
    return {
      id: `need-${index + 1}`,
      text,
      goal,
      requestedDetails,
      subjectHint: String(plan.subject || ""),
      dateRange: plan.dateRange || null,
      filters: plan.filters || {},
    };
  });
  return {
    version: "resident-needs-v1",
    originalQuestion: cleanClause(question),
    needCount: needs.length,
    needs,
    complete: needs.length > 0 && needs.every((need) => need.text && LEADING_QUESTION.test(need.text)),
  };
}

module.exports = { buildResidentRequestContract, splitResidentNeeds };

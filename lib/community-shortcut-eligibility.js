const { deterministicRequestedDetails } = require("./community-interpretation");

const ACTION_GOALS = new Set(["payment", "booking", "application", "registration", "account-access"]);

const PROFILES = {
  "pool-status": { intents: ["status"], goals: ["status"], subject: /\bpool\b/i },
  events: {
    intents: ["events"], goals: ["schedule"],
    subject: /\b(?:events?|calendar|activities|classes|meetings?|concerts?|festivals?|markets?|giveaways?)\b/i,
  },
  "waste-schedule": { intents: ["services"], goals: ["schedule", "status"], subject: /\b(?:trash|garbage|recycl(?:e|ing)|waste)\b/i },
  // Retain the original narrow name for callers and collision tests that
  // specifically ask about recycling. New live routing uses waste-schedule.
  recycling: { intents: ["services"], goals: ["schedule"], subject: /\brecycl(?:e|ing)\b/i },
  "food-truck": { intents: ["events", "services"], goals: ["schedule", "cost", "information"], subject: /\bfood\s*trucks?\b/i },
  "facility-operations": {
    intents: ["facilities", "status", "rules", "services"], goals: ["schedule", "status", "cost", "booking", "information"],
    subject: /\b(?:pool|clubhouse|court|pickle\s*ball|tennis|pavilion|shelter|facility|amenity|recreation)\b/i,
  },
  "official-action": { intents: ["services", "facilities", "forms", "events"], goals: [...ACTION_GOALS], subject: /\S/ },
  "grounded-fallback": { subject: /\S/ },
};

const PROACTIVE_PROFILES = {
  "community-proactive-directory": { goals: ["information"], subject: /\blandscap/i },
  "community-proactive-directory-review": { goals: ["information"], subject: /\blandscap/i },
  "community-proactive-account": { goals: ["payment", "account-access", "information"], subject: /\b(?:water|utility).{0,30}\b(?:bill|billing|account|payment|usage)\b|\bUtilityHawk\b/i },
  "community-proactive-rental": { goals: ["booking", "cost"], subject: /\b(?:park|shelter|clubhouse|overlook|great hall|pavilion|facility)\b/i },
  // The planner classifies first-time amenity access as either a permission
  // request or an account-access request. Both use the same approved form;
  // keep that plan vocabulary aligned with the proactive answer contract.
  "community-proactive-clubhouse-access": { goals: ["booking", "permission", "account-access", "information"], subject: /\b(?:clubhouse|overlook)\b/i },
  "community-proactive-clubhouse-access-partial": { goals: ["booking", "permission", "account-access", "information"], subject: /\b(?:clubhouse|overlook)\b/i },
  "community-proactive-pool-party": { goals: ["booking", "permission", "information"], subject: /\bpool\b/i },
  "community-proactive-trash-storage": { goals: ["information", "schedule", "permission"], subject: /\b(?:trash|garbage|recycling).{0,40}\b(?:bins?|cans?|carts?|containers?|curb|store|storage|return|bring)\b|\b(?:bins?|cans?|carts?|containers?).{0,40}\b(?:trash|garbage|recycling)\b/i },
  "community-proactive-drc": { goals: ["application"], subject: /\b(?:DRC|design review|architectural)\b/i },
  "community-proactive-drc-contact": { goals: ["contact"], subject: /\b(?:DRC|design review|architectural)\b/i },
  "community-proactive-establishment-water": { goals: ["cost", "information"], subject: /\b(?:water|watering|irrigation).{0,50}\b(?:establish|new lawn|new sod|new turf|new plants?|new landscap)/i },
  "community-proactive-trash-holiday": { goals: ["schedule", "information"], subject: /\b(?:trash|garbage|recycling|pickup|collection)\b/i },
  "community-proactive-landscape-application": { goals: ["application"], subject: /\b(?:landscap|yard|irrigation)\b/i },
};

function planText(question, plan = {}) {
  return `${question || ""} ${plan.subject || ""} ${(plan.searchQueries || []).join(" ")}`.trim();
}

function answerText(candidate = {}) {
  return [
    candidate.answer,
    candidate.directAnswer,
    ...(candidate.keyDetails || []),
    candidate.nextStep,
    ...(candidate.actions || []).flatMap((action) => [action.label, action.url]),
    ...(candidate.sources || []).map((source) => source.title),
  ].filter(Boolean).join(" ");
}

function requestedDetails(question, plan = {}) {
  return Array.isArray(plan.requestedDetails) ? [...new Set(plan.requestedDetails)] : deterministicRequestedDetails(question);
}

function coversDetail(detail, candidate = {}, plan = {}) {
  const text = answerText(candidate);
  if (detail === "price") return /\$\s?\d|\b(?:free|no (?:charge|fee)|at no cost)\b/i.test(text);
  if (detail === "action") {
    if (!(candidate.actions || []).length) return false;
    if (!ACTION_GOALS.has(plan.goal)) return true;
    const signals = {
      payment: /\b(?:pay|payment|billing|bill|UtilityHawk|e-?pay|ACH)\b/i,
      booking: /\b(?:book|booking|reserve|reservation|rental|availability|catalog)\b/i,
      application: /\b(?:apply|application|submit|submission|packet|form)\b/i,
      registration: /\b(?:register|registration|sign up|enroll)\b/i,
      "account-access": /\b(?:log ?in|sign ?in|account|password|portal|support)\b/i,
    };
    return (candidate.actions || []).some((action) => signals[plan.goal]?.test(`${action.label || ""} ${action.url || ""}`)
      || (["booking", "account-access"].includes(plan.goal) && candidate.answerMode?.startsWith("community-proactive-clubhouse-access")
        && /resident amenity form/i.test(`${action.label || ""} ${action.url || ""}`)));
  }
  if (detail === "date") return /\b20\d{2}-\d{2}-\d{2}\b|\b(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b|\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}\b|\b(?:today|tomorrow|tonight|this weekend|pickup day)\b/i.test(text);
  if (detail === "hours") {
    const requestedOperatingHours = /\b(?:hours?|operating|operation)\b/i.test(`${plan.subject || ""} ${(plan.searchQueries || []).join(" ")}`);
    if (plan.goal === "status" && !requestedOperatingHours && /\b(?:right now|currently|now)\b/i.test(text)) return /\b(?:open|closed|at capacity)\b/i.test(text);
    return /\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b|\b(?:dawn|dusk|sunrise|sunset|24 hours?)\b/i.test(text);
  }
  if (detail === "contact") return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/i.test(text);
  if (detail === "permission") return /\b(?:yes|no|allowed|permitted|prohibited|approval|require[sd]?|must|need(?:ed)? to|bring|return|store|may not|cannot|can\u2019t|can't)\b/i.test(text);
  if (detail === "examples") return (candidate.keyDetails || []).length > 0 || /\b(?:examples? include|such as|listed food trucks? (?:is|are))\b/i.test(text);
  if (detail === "status") return /\b(?:currently|right now|open|closed|at capacity|available|unavailable|delayed)\b/i.test(text);
  return false;
}

function coversGoal(candidate, plan = {}) {
  const goal = plan.goal || "information";
  if (ACTION_GOALS.has(goal)) return coversDetail("action", candidate, plan);
  if (goal === "cost") return coversDetail("price", candidate, plan);
  if (goal === "contact") return coversDetail("contact", candidate, plan);
  if (goal === "permission") return coversDetail("permission", candidate, plan);
  if (goal === "schedule") return coversDetail("date", candidate, plan) || coversDetail("hours", candidate, plan);
  if (goal === "status") return coversDetail("status", candidate, plan);
  return true;
}

function coversDateRange(plan = {}, candidate = {}, connectorResult = {}) {
  if (!plan.dateRange?.start || !plan.dateRange?.end) return true;
  const { start, end, label } = plan.dateRange;
  if (connectorResult.range?.start === start && connectorResult.range?.end === end) return true;
  if (connectorResult.date && start === end && connectorResult.date === start) return true;
  const dates = (connectorResult.villageDates || []).map((item) => item.date).filter(Boolean);
  if (start === end && dates.includes(start)) return true;
  const text = answerText(candidate);
  if (text.includes(start) || text.includes(end)) return true;
  const escapedLabel = String(label || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Boolean(escapedLabel.length > 3 && new RegExp(escapedLabel, "i").test(text));
}

function coversFilters(kind, plan = {}, candidate = {}) {
  const requested = Object.entries(plan.filters || {}).filter(([, value]) => String(value || "").trim());
  if (!requested.length) return true;
  const applied = candidate._connectorDiagnostics?.appliedFilters || [];
  return requested.every(([field, value]) =>
    applied.some((filter) => filter.field === field && String(filter.value).toLowerCase() === String(value).toLowerCase())
      || (kind === "proactive" && /^(?:community-proactive-rental|community-proactive-clubhouse-access(?:-partial)?|community-proactive-pool-party)$/.test(candidate.answerMode || "")
        && candidate._shortcutFilterEvidence?.[field]?.some((evidence) =>
          String(evidence.value || "").toLowerCase() === String(value).toLowerCase()
            && (candidate.sources || []).some((source) => source.id === evidence.sourceId)))
      || (kind !== "events" && answerText(candidate).toLowerCase().includes(String(value).toLowerCase()))
  );
}

function shortcutEligibility(kind, { question = "", plan = null, candidate = null, connectorResult = null } = {}) {
  const effectivePlan = plan || {
    intent: "", goal: "information", requestedDetails: deterministicRequestedDetails(question),
    filters: {}, dateRange: null, subject: question, searchQueries: [question],
  };
  const profile = kind === "proactive" ? PROACTIVE_PROFILES[candidate?.answerMode] : PROFILES[kind];
  if (!profile) return { eligible: false, reasons: ["unknown-shortcut-profile"] };
  const reasons = [];
  if (profile.intents && effectivePlan.intent && !profile.intents.includes(effectivePlan.intent)) reasons.push("intent-not-supported");
  if (profile.goals && effectivePlan.goal && !profile.goals.includes(effectivePlan.goal)) reasons.push("goal-not-supported");
  if (profile.subject && !profile.subject.test(planText(question, effectivePlan))) reasons.push("subject-not-supported");
  if (kind === "food-truck" && effectivePlan.goal === "information"
    && !/\bfood\s*trucks?\b.{0,35}\b(?:menu|listing|schedule|calendar|which|who|coming|here)\b|\b(?:menu|which|who)\b.{0,35}\bfood\s*trucks?\b/i.test(planText(question, effectivePlan))) {
    reasons.push("food-truck-facet-not-supported");
  }
  if (!candidate) return { eligible: reasons.length === 0, reasons };
  const missingDetails = requestedDetails(question, effectivePlan).filter((detail) => !coversDetail(detail, candidate, effectivePlan));
  if (missingDetails.length) reasons.push(...missingDetails.map((detail) => `requested-${detail}-missing`));
  if (!coversGoal(candidate, effectivePlan)) reasons.push("goal-not-covered");
  if (!coversDateRange(effectivePlan, candidate, connectorResult || {})) reasons.push("date-range-not-covered");
  if (!coversFilters(kind, effectivePlan, candidate)) reasons.push("filters-not-covered");
  return { eligible: reasons.length === 0, reasons: [...new Set(reasons)] };
}

module.exports = { answerText, coversDetail, shortcutEligibility };

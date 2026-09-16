"use strict";

const { directlyAnswersQuestionForm } = require("./community-assistant");
const { residentVoiceIssues } = require("./resident-answer-voice");

const VERSION = "resident-quality-rubric-v1-unpublished";
const COMPLETE_OUTCOMES = new Set(["complete", "handled-boundary"]);
const INCOMPLETE_OUTCOMES = new Set(["verified-partial", "missing-evidence", "conflict", "ambiguous", "unassessed"]);
const ACTION_GOALS = new Set(["payment", "booking", "application", "registration", "account-access"]);

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function presentationIssues(answer = "") {
  const value = String(answer || "").trim();
  const issues = [...residentVoiceIssues(value)];
  if (!value) issues.push("missing-answer");
  if (/WidgetSkinID|activeWidgetSkin|WHEREAS|--\s*\d+\s+of\s+\d+\s*--/i.test(value)) issues.push("raw-source-text");
  if (/^Short answer\s*:/im.test(value) && /^What I found\s*:/im.test(value)) issues.push("answer-scaffolding");
  if (value.length > 1800) issues.push("answer-too-long");
  if (value.split(/\n/).some((line) => line.length > 240)) issues.push("line-too-long");
  const paragraphs = value.split(/\n\s*\n/).map((part) => part.trim().toLowerCase()).filter(Boolean);
  if (new Set(paragraphs).size !== paragraphs.length) issues.push("duplicated-paragraph");
  return unique(issues);
}

function validCandidateShape(result = {}) {
  const outcome = result?.completion?.outcome;
  const needs = result?.completion?.needs;
  const contractNeeds = result?._requestContract?.needs;
  return ["need-first-candidate", "need-first-candidate-boundary"].includes(result.answerMode)
    && (COMPLETE_OUTCOMES.has(outcome) || INCOMPLETE_OUTCOMES.has(outcome))
    && Array.isArray(needs) && needs.length > 0
    && Array.isArray(contractNeeds) && contractNeeds.length === needs.length;
}

function needsAction(contractNeeds = []) {
  return contractNeeds.some((need) => ACTION_GOALS.has(need.goal)
    || need.task === "action"
    || (need.requestedDetails || []).includes("action"));
}

function actionIsBoundToNeed(action = {}, needIds = new Set()) {
  const bound = action.retrievedForNeedIds || [];
  return bound.some((id) => needIds.has(id)) && /^https?:\/\//i.test(action.url || "");
}

function scoreDirectness(question, result, outcome) {
  const directAnswer = String(result.directAnswer || String(result.answer || "").split(/\n\s*\n/)[0]).trim();
  if (!directAnswer) return { value: 0, reason: "The response has no direct opening answer." };
  if (outcome === "ambiguous") {
    const useful = /\b(?:one more detail|which|what|where|when|tell me)\b/i.test(directAnswer);
    return { value: useful ? 2 : 0, reason: useful ? "It asks for the missing detail directly." : "It does not ask a usable clarifying question." };
  }
  if (outcome === "missing-evidence" || outcome === "conflict" || outcome === "unassessed") {
    const honest = /\b(?:couldn’t|could not|cannot|can't|conflict|verify|available official evidence)\b/i.test(directAnswer);
    return { value: honest ? 1 : 0, reason: honest ? "It states the evidence limitation directly." : "It neither answers nor clearly states the evidence limitation." };
  }
  if (outcome === "verified-partial") return { value: 1, reason: "It answers a supported part but cannot resolve the full request." };
  const direct = directlyAnswersQuestionForm(question, { directAnswer });
  return { value: direct ? 2 : 1, reason: direct ? "The opening directly addresses the resident’s request." : "The answer is supported but the opening is indirect." };
}

function scoreCoverage(outcome, needs = []) {
  if (COMPLETE_OUTCOMES.has(outcome) && needs.every((need) => ["supported", "handled-boundary"].includes(need.status))) {
    return { value: 2, reason: "Every preserved resident need is resolved or correctly handled." };
  }
  if (outcome === "verified-partial" && needs.some((need) => need.status === "supported" || (need.supportedDetails || []).length > 0)) {
    return { value: 1, reason: "At least one requested part is supported and at least one remains unresolved." };
  }
  if (outcome === "ambiguous") return { value: 1, reason: "The request cannot be completed until the resident supplies the missing subject." };
  return { value: 0, reason: "The resident’s requested outcome remains unresolved." };
}

function scoreSpecificity(outcome, needs = [], claims = []) {
  if (outcome === "ambiguous") return { value: 2, reason: "The clarification identifies the exact missing information instead of guessing." };
  if (outcome === "handled-boundary") return { value: 2, reason: "The boundary is specific to the request and does not add unsupported facts." };
  const supported = needs.filter((need) => need.status === "supported");
  const allProven = supported.length > 0 && supported.every((need) => (need.supportingSourceIds || []).length > 0
    && (need.supportedDetails || []).length > 0);
  const verifiedClaims = claims.filter((claim) => claim?.verified === true && (claim.evidenceSourceIds || []).length > 0);
  if (allProven && verifiedClaims.length >= supported.length) return { value: 2, reason: "The answer includes source-proven details for each supported need." };
  if (supported.length || verifiedClaims.length) return { value: 1, reason: "The answer has some concrete source-proven detail, but its support is incomplete." };
  return { value: 0, reason: "The answer provides no source-proven detail for the request." };
}

function scoreProactivity(result, contractNeeds = []) {
  const required = needsAction(contractNeeds);
  const needIds = new Set(contractNeeds.map((need) => need.id));
  const boundActions = (result.actions || []).filter((action) => actionIsBoundToNeed(action, needIds));
  const writtenStep = /\b(?:next step|open|apply|submit|register|reserve|book|pay|sign in|select)\b/i.test(result.answer || "");
  if (!required) {
    const irrelevant = (result.actions || []).length > 0 && boundActions.length === 0;
    return { value: irrelevant ? 1 : 2, reason: irrelevant ? "It adds an action that is not tied to a requested need." : "No extra task is required, and the answer avoids giving the resident unnecessary work." };
  }
  if (boundActions.length && writtenStep) return { value: 2, reason: "It provides a relevant, usable next step for the requested action." };
  if (boundActions.length || writtenStep) return { value: 1, reason: "It provides part of the requested next step, but the path is not fully usable." };
  return { value: 0, reason: "The resident asked for an action, but the answer does not provide a usable next step." };
}

function scoreHumanFirst(answer = "") {
  const issues = presentationIssues(answer);
  const severe = issues.some((issue) => ["missing-answer", "raw-source-text", "duplicated-paragraph"].includes(issue));
  if (severe) return { value: 0, reason: "The response contains a severe presentation problem.", issues };
  if (issues.length) return { value: 1, reason: "The response is understandable but still contains presentation friction.", issues };
  return { value: 2, reason: "The response is readable, natural, and easy to act on.", issues: [] };
}

function ratingFor({ outcome, total, hardFailures, directness }) {
  if (hardFailures.length) return total >= 4 ? { rating: "Weak", score: 2 } : { rating: "Poor", score: 1 };
  if (COMPLETE_OUTCOMES.has(outcome)) {
    if (total === 10) return { rating: "Excellent", score: 5 };
    if (total >= 7) return { rating: "Good", score: 4 };
    if (total >= 5) return { rating: "Mixed", score: 3 };
    return { rating: "Weak", score: 2 };
  }
  if (outcome === "ambiguous" && directness === 2 && total >= 7) return { rating: "Good", score: 4 };
  if (outcome === "verified-partial" && total >= 5) return { rating: "Mixed", score: 3 };
  if (["missing-evidence", "conflict", "unassessed"].includes(outcome) && total >= 4) return { rating: "Weak", score: 2 };
  return { rating: "Poor", score: 1 };
}

function effortFor(outcome) {
  if (COMPLETE_OUTCOMES.has(outcome)) return { rating: "Resolved", score: 5 };
  if (["verified-partial", "ambiguous"].includes(outcome)) return { rating: "Some work remains", score: 3 };
  return { rating: "High resident effort", score: 1 };
}

function assessCommunityAnswerQuality(question, result = {}) {
  if (!validCandidateShape(result)) {
    return {
      version: VERSION,
      status: "unassessed",
      calibrated: false,
      publishable: false,
      issues: ["need-first-evidence-contract-required"],
    };
  }

  const outcome = result.completion.outcome;
  const needs = result.completion.needs;
  const contractNeeds = result._requestContract.needs;
  const hardFailures = [];
  if (!String(result.answer || "").trim()) hardFailures.push("missing-answer");
  if (COMPLETE_OUTCOMES.has(outcome) && needs.some((need) => !["supported", "handled-boundary"].includes(need.status))) {
    hardFailures.push("false-completion");
  }
  if ((result.claims || []).some((claim) => claim?.verified !== true || !(claim.evidenceSourceIds || []).length)) {
    hardFailures.push("unverified-visible-claim");
  }

  const directness = scoreDirectness(question, result, outcome);
  const coverage = scoreCoverage(outcome, needs);
  const specificity = scoreSpecificity(outcome, needs, result.claims || []);
  const proactivity = scoreProactivity(result, contractNeeds);
  const humanFirst = scoreHumanFirst(result.answer);
  const dimensions = { directness, completeCoverage: coverage, specificity, usefulProactivity: proactivity, humanFirst };
  const total = Object.values(dimensions).reduce((sum, item) => sum + item.value, 0);
  const rated = ratingFor({ outcome, total, hardFailures, directness: directness.value });
  const effort = effortFor(outcome);

  return {
    version: VERSION,
    status: "diagnostic",
    calibrated: false,
    publishable: false,
    outcome,
    rating: rated.rating,
    score: rated.score,
    residentEffort: effort.rating,
    residentEffortScore: effort.score,
    dimensionTotal: total,
    dimensionMaximum: 10,
    dimensions,
    hardFailures: unique(hardFailures),
    issues: unique([...hardFailures, ...(humanFirst.issues || [])]),
  };
}

module.exports = { VERSION, assessCommunityAnswerQuality, presentationIssues };

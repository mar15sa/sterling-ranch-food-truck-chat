"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { assessCommunityAnswerQuality } = require("../lib/community-quality-rubric");
const { qualityAssessmentForLog } = require("../lib/rules-question-log");

function candidate({
  question = "When is recycling pickup and where do the bins go?",
  outcome = "complete",
  answer = "Recycling is Tuesday. Return the bins to a screened location by the end of pickup day.",
  needs = [
    { id: "need-1", goal: "schedule", task: "schedule", requestedDetails: ["date"] },
    { id: "need-2", goal: "information", task: "specification", requestedDetails: ["specification"] },
  ],
  completionNeeds = needs.map((need) => ({ needId: need.id, status: "supported", supportedDetails: need.requestedDetails, supportingSourceIds: [`source-${need.id}`], missingDetails: [] })),
  claims = needs.map((need) => ({ text: `Supported ${need.id}`, verified: true, evidenceSourceIds: [`source-${need.id}`] })),
  actions = [],
} = {}) {
  return { question, result: {
    answerMode: "need-first-candidate",
    answerStatus: outcome === "complete" ? "verified" : "could-not-verify",
    answer,
    directAnswer: answer.split(/\n\s*\n/)[0],
    completion: { outcome, needs: completionNeeds },
    claims,
    actions,
    _requestContract: { needs },
  } };
}

test("a complete, specific, human-first answer earns an unpublished excellent diagnostic", () => {
  const row = candidate();
  const assessment = assessCommunityAnswerQuality(row.question, row.result);
  assert.equal(assessment.rating, "Excellent");
  assert.equal(assessment.score, 5);
  assert.equal(assessment.dimensionTotal, 10);
  assert.equal(assessment.residentEffort, "Resolved");
  assert.equal(assessment.calibrated, false);
  assert.equal(assessment.publishable, false);
});

test("a polished answer cannot outrank missing need coverage", () => {
  const row = candidate({
    outcome: "verified-partial",
    answer: "Recycling is Tuesday. I couldn’t verify where the bins must be stored.",
    completionNeeds: [
      { needId: "need-1", status: "supported", supportedDetails: ["date"], supportingSourceIds: ["source-need-1"], missingDetails: [] },
      { needId: "need-2", status: "missing-evidence", supportedDetails: [], supportingSourceIds: [], missingDetails: ["specification"] },
    ],
    claims: [{ text: "Recycling is Tuesday.", verified: true, evidenceSourceIds: ["source-need-1"] }],
  });
  const assessment = assessCommunityAnswerQuality(row.question, row.result);
  assert.equal(assessment.rating, "Mixed");
  assert.ok(assessment.score <= 3);
  assert.equal(assessment.dimensions.completeCoverage.value, 1);
  assert.equal(assessment.residentEffort, "Some work remains");
});

test("a completed label cannot hide an unresolved resident need", () => {
  const row = candidate({
    outcome: "complete",
    answer: "Recycling is Tuesday. I couldn’t verify where the bins must be stored.",
    completionNeeds: [
      { needId: "need-1", status: "supported", supportedDetails: ["date"], supportingSourceIds: ["source-need-1"], missingDetails: [] },
      { needId: "need-2", status: "missing-evidence", supportedDetails: [], supportingSourceIds: [], missingDetails: ["specification"] },
    ],
    claims: [{ text: "Recycling is Tuesday.", verified: true, evidenceSourceIds: ["source-need-1"] }],
  });
  const assessment = assessCommunityAnswerQuality(row.question, row.result);
  assert.ok(assessment.hardFailures.includes("false-completion"));
  assert.ok(assessment.score <= 2);
});

test("an unverified visible claim is a hard rating failure", () => {
  const row = candidate({
    claims: [{ text: "Recycling is Tuesday.", verified: false, evidenceSourceIds: [] }],
  });
  const assessment = assessCommunityAnswerQuality(row.question, row.result);
  assert.ok(assessment.hardFailures.includes("unverified-visible-claim"));
  assert.ok(assessment.score <= 2);
});

test("a necessary clarification can be good while resident effort remains unresolved", () => {
  const row = candidate({
    question: "How much does it cost?",
    outcome: "ambiguous",
    answer: "I need one more detail before I can check this accurately: what item or service do you mean?",
    needs: [{ id: "need-1", goal: "cost", task: "price", requestedDetails: ["price"] }],
    completionNeeds: [{ needId: "need-1", status: "ambiguous", supportedDetails: [], supportingSourceIds: [], missingDetails: ["subject"] }],
    claims: [],
  });
  const assessment = assessCommunityAnswerQuality(row.question, row.result);
  assert.equal(assessment.rating, "Good");
  assert.equal(assessment.dimensions.directness.value, 2);
  assert.equal(assessment.residentEffort, "Some work remains");
});

test("an action request needs a usable action bound to that need", () => {
  const row = candidate({
    question: "How do I submit a landscaping application?",
    answer: "Use the Landscape Submittal Packet, then submit the application.",
    needs: [{ id: "need-1", goal: "application", task: "action", requestedDetails: ["action"] }],
    completionNeeds: [{ needId: "need-1", status: "supported", supportedDetails: ["action"], supportingSourceIds: ["source-need-1"], missingDetails: [] }],
    claims: [{ text: "Use the Landscape Submittal Packet.", verified: true, evidenceSourceIds: ["source-need-1"] }],
    actions: [],
  });
  const assessment = assessCommunityAnswerQuality(row.question, row.result);
  assert.equal(assessment.dimensions.usefulProactivity.value, 1);
  assert.notEqual(assessment.rating, "Excellent");

  row.result.actions = [{ label: "Submit a DRC Application", url: "https://example.test/apply", retrievedForNeedIds: ["need-1"] }];
  assert.equal(assessCommunityAnswerQuality(row.question, row.result).dimensions.usefulProactivity.value, 2);
});

test("raw source presentation blocks an excellent result", () => {
  const row = candidate({ answer: "WHEREAS the authority hereby states the recycling date is Tuesday." });
  const assessment = assessCommunityAnswerQuality(row.question, row.result);
  assert.equal(assessment.dimensions.humanFirst.value, 0);
  assert.notEqual(assessment.rating, "Excellent");
});

test("legacy answers without the need-first evidence contract stay unassessed", () => {
  const assessment = assessCommunityAnswerQuality("When is pickup?", {
    answerMode: "source-derived-extractive",
    answer: "Tuesday.",
  });
  assert.equal(assessment.status, "unassessed");
  assert.deepEqual(assessment.issues, ["need-first-evidence-contract-required"]);
});

test("the unpublished rubric cannot enter the owner log as a calibrated rating", () => {
  const row = candidate();
  const diagnostic = assessCommunityAnswerQuality(row.question, row.result);
  const logged = qualityAssessmentForLog(row.question, row.result, { qualityAssessment: diagnostic });
  assert.equal(logged.rating, "Not rated");
  assert.equal(logged.residentEffort.rating, "Not rated");
  assert.ok(logged.issues.includes("automatic-rating-calibration-required"));
});

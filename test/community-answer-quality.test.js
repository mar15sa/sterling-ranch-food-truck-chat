const test = require("node:test");
const assert = require("node:assert/strict");
const { handoffIsQuestionSpecific, scoreCommunityAnswer } = require("../lib/community-answer-quality");
const { expectedNoSourceEvidenceBoundary, normalizeEvaluationQuestion, quarantineWithholdsRequiredEvidence, safeHoldSupersedesLegacyBaseline } = require("../scripts/eval-community-assistant");
const authoredCases = require("../scripts/rules-eval-cases.json");

function source(title) {
  return { title, sourceUrl: "https://sterlingranchcab.com/example", text: title };
}

test("a source-backed answer can still rate weak when it misses the question", () => {
  const result = scoreCommunityAnswer("what time is the latest i can do a firepit fire", {
    answer: "Short answer: Permanent outdoor fireplaces and fire pits require DRC approval.\n\nBefore you act: Use these current source details for planning, and open the linked section if you need the complete wording.",
    directAnswer: "Permanent outdoor fireplaces and fire pits require DRC approval.",
    answerMode: "source-derived-extractive",
    answerVerdict: "conditional",
    confidence: { canAnswer: true, reason: "supported" },
    sources: [source("Fire pit approval rules")],
  });
  assert.equal(result.rating, "Weak");
  assert.ok(result.issues.includes("requested-time-missing"));
  assert.equal(result.residentEffort.rating, "High resident effort");
});

test("a well-sourced handoff rates weak when it does not answer a planned-project question", () => {
  const result = scoreCommunityAnswer("are they building a new pool?", {
    answer: "Short answer: The cited pool rules don't cover new construction or planned pool projects.\n\nWhat I found:\n- The rules only address the existing pool.\n\nBefore you act: Check the community's capital plans, contact the CAB directly, or ask at a community meeting.",
    directAnswer: "The cited pool rules don't cover new construction or planned pool projects.",
    answerMode: "grounded-ai-fallback",
    answerVerdict: "verified",
    confidence: { canAnswer: true, reason: "grounded-ai-source-synthesis" },
    sources: [source("Existing pool rules")],
  });
  assert.equal(result.rating, "Weak");
  assert.ok(result.issues.includes("question-unresolved"));
  assert.equal(result.residentEffort.rating, "High resident effort");
});

test("a pool-opening answer rates weak when the resident asked about construction", () => {
  const result = scoreCommunityAnswer("are they building a new community pool?", {
    answer: "Short answer: Open. The pool is currently open for homeowners and guests.\n\nBefore you act: Normal entry rules still apply.",
    directAnswer: "Open. The pool is currently open for homeowners and guests.",
    answerMode: "community-live-status",
    answerVerdict: "informational",
    confidence: { canAnswer: true, reason: "official-source-supported" },
    sources: [source("Official pool status")],
  });
  assert.equal(result.rating, "Weak");
  assert.ok(result.issues.includes("planned-project-answer-missing"));
  assert.equal(result.residentEffort.rating, "High resident effort");
});

test("a no-mention handoff is weak because absence from retrieved sources is not an answer", () => {
  const result = scoreCommunityAnswer("are they building a new community pool?", {
    answer: "Short answer: The sources don't mention any new community pool being built. They only describe the existing pool.\n\nBefore you act: Contact the Community Authority through its General Inquiries form about future construction plans.",
    directAnswer: "The sources don't mention any new community pool being built. They only describe the existing pool.",
    answerMode: "grounded-ai-fallback",
    answerVerdict: "verified",
    confidence: { canAnswer: true, reason: "grounded-ai-source-synthesis" },
    sources: [source("Existing pool rules")],
  });
  assert.equal(result.rating, "Weak");
  assert.ok(result.issues.includes("question-unresolved"));
  assert.equal(result.residentEffort.rating, "High resident effort");
});

test("a clear statement that the rules set no latest time resolves a time question", () => {
  const result = scoreCommunityAnswer("what time is the latest I can use my firepit?", {
    answer: "Short answer: The rules don't set a latest time for firepit use.\n\nWhat I found:\n- Approval and safety rules apply.",
    directAnswer: "The rules don't set a latest time for firepit use.",
    answerMode: "community-grounded-ai",
    answerVerdict: "verified",
    confidence: { canAnswer: true, reason: "supported" },
    sources: [source("Fire pit rules")],
  });
  assert.ok(!result.issues.includes("requested-time-missing"));
});

test("a verified approved contact projection earns Excellent without cosmetic findings text", () => {
  const result = scoreCommunityAnswer("What is the DRC email address?", {
    answer: "Short answer: Submit a completed application by email to ResidentSubmit@SterlingRanchCAB.com.\n\nBefore you act: Open the official Design Review contact and submission page below for the current contact details.",
    directAnswer: "Submit a completed application by email to ResidentSubmit@SterlingRanchCAB.com.",
    answerMode: "community-approved-operational-contact",
    answerVerdict: "verified",
    confidence: { canAnswer: true, reason: "approved-operational-contact" },
    sources: [{ id: "approved-drc-contact-current", title: "Design Review", sourceUrl: "https://sterlingranchcab.com/175/Design-Review" }],
    claims: [{
      text: "Submit a completed application by email to ResidentSubmit@SterlingRanchCAB.com.",
      verified: true,
      evidenceSourceIds: ["approved-drc-contact-current"],
      approvalClaimIds: ["drc-email"],
    }],
  });
  assert.equal(result.rating, "Excellent");
  assert.equal(result.score, 5);
});

test("a verified approved operational instruction earns Excellent when every claim maps to its returned source", () => {
  const sourceId = "approved-utilityhawk-water-monitoring-2026";
  const result = scoreCommunityAnswer("How do I see my water usage online?", {
    answer: "Short answer: Use the approved UtilityHawk water-monitoring portal to view your water use.\n\nBefore you act: Open the official portal below.",
    directAnswer: "Use the approved UtilityHawk water-monitoring portal to view your water use.",
    answerMode: "community-approved-operational-instruction",
    answerVerdict: "verified",
    confidence: { canAnswer: true, reason: "approved-operational-instruction" },
    sources: [{ id: sourceId, title: "UtilityHawk water monitoring", sourceUrl: "https://srcab.utilityhawk.us/" }],
    claims: [
      { text: "Use the approved UtilityHawk water-monitoring portal.", verified: true, evidenceSourceIds: [sourceId] },
      { text: "View your water use online.", verified: true, evidenceSourceIds: [sourceId] },
    ],
  });
  assert.equal(result.rating, "Excellent");
  assert.ok(!result.issues.includes("claim-provenance-mismatch"));
});

test("an approved operational instruction fails when any claim is unverified or mapped to another source", () => {
  const sourceId = "approved-utilityhawk-water-monitoring-2026";
  const result = scoreCommunityAnswer("How do I see my water usage online?", {
    answer: "Short answer: Use the portal.",
    directAnswer: "Use the portal.",
    answerMode: "community-approved-operational-instruction",
    answerVerdict: "verified",
    confidence: { canAnswer: true },
    sources: [{ id: sourceId, title: "UtilityHawk water monitoring", sourceUrl: "https://srcab.utilityhawk.us/" }],
    claims: [
      { text: "Use the portal.", verified: true, evidenceSourceIds: ["another-approved-source"] },
      { text: "Monitor water use.", verified: false, evidenceSourceIds: [sourceId] },
    ],
  });
  assert.equal(result.rating, "Weak");
  assert.ok(result.issues.includes("claim-provenance-mismatch"));
});

test("a safe no-claim hold supersedes a legacy answer built from unrelated evidence", () => {
  const question = "What are the quiet hours?";
  const current = {
    answer: "Short answer: The facility hours are posted online.",
    answerMode: "deterministic",
    confidence: { canAnswer: true },
    sources: [source("Pool operating hours")],
  };
  const upgraded = {
    answer: "Short answer: I could not verify an answer from approved, up-to-date community sources.",
    answerMode: "source-evidence-boundary",
    confidence: { canAnswer: false, reason: "no-exact-official-evidence" },
    sources: [{ title: "Sterling Ranch Community Authority Board official website", sourceUrl: "https://sterlingranchcab.com/" }],
    actions: [{ label: "Open Sterling Ranch Community Authority Board official website", url: "https://sterlingranchcab.com/" }],
    claims: [],
  };
  const currentAssessment = scoreCommunityAnswer(question, current);
  const upgradedAssessment = scoreCommunityAnswer(question, upgraded, { expectation: { shouldRefuse: true } });
  assert.equal(upgradedAssessment.rating, "Good");
  assert.equal(safeHoldSupersedesLegacyBaseline(question, current, currentAssessment, upgraded, upgradedAssessment), true);
});

test("a no-claim hold fails quality when it sends residents to an unrelated source", () => {
  const result = scoreCommunityAnswer("Can I build a helipad in my yard?", {
    answer: "Short answer: I could not safely confirm the permission or approval requirement from approved, up-to-date CAB information.",
    answerMode: "community-freshness-withheld",
    confidence: { canAnswer: false, reason: "source-review-required" },
    sources: [{ title: "Backyard Utility Sheds", sourceUrl: "https://sterlingranchcab.com/DocumentCenter/View/626/Backyard-Utility-Sheds" }],
    actions: [{ label: "Open Backyard Utility Sheds", url: "https://sterlingranchcab.com/DocumentCenter/View/626/Backyard-Utility-Sheds" }],
    claims: [],
  });
  assert.equal(result.rating, "Weak");
  assert.ok(result.issues.includes("irrelevant-handoff-source"));
});

test("handoff matching recognizes spaced and closed compound topic names", () => {
  const handoff = {
    sources: [{ title: "Pickleball Courts", sourceUrl: "https://sterlingranchcab.com/courts" }],
    actions: [{ label: "Open Pickleball Courts", url: "https://sterlingranchcab.com/courts" }],
  };
  assert.equal(handoffIsQuestionSpecific("Pickle ball", handoff), true);
  assert.equal(handoffIsQuestionSpecific("Build a helipad", handoff), false);
});

test("only an exact expected empty evidence boundary is excluded from scoring", () => {
  const expectation = {
    shouldRefuse: true,
    expectedAnswerMode: "source-evidence-boundary",
    expectedNoSources: true,
    expectedReason: "no-single-source-support",
  };
  const hold = {
    answerMode: "source-evidence-boundary",
    confidence: { canAnswer: false, reason: "no-single-source-support" },
    sources: [],
    actions: [],
    claims: [],
  };
  assert.equal(expectedNoSourceEvidenceBoundary(hold, expectation), true);
  assert.equal(expectedNoSourceEvidenceBoundary({ ...hold, sources: [source("Unrelated source")] }, expectation), false);
  assert.equal(expectedNoSourceEvidenceBoundary({ ...hold, confidence: { canAnswer: false, reason: "weak-query-coverage" } }, expectation), false);
  assert.equal(expectedNoSourceEvidenceBoundary(hold, { ...expectation, shouldRefuse: false }), false);
});

test("an authored unsupported named project is an exact safe hold, while unexpected holds still fail", () => {
  const expectation = authoredCases.find((item) => item.question === "Can I build a helipad in my yard?");
  const hold = {
    answerMode: "source-evidence-boundary",
    confidence: { canAnswer: false, reason: "named-project-not-supported-by-cited-evidence" },
    sources: [],
    actions: [],
    claims: [],
  };
  assert.equal(expectedNoSourceEvidenceBoundary(hold, expectation), true);
  assert.equal(expectedNoSourceEvidenceBoundary(hold, { shouldRefuse: true }), false);
  assert.equal(expectedNoSourceEvidenceBoundary({ ...hold, sources: [source("Nearby project rules")] }, expectation), false);
});

test("evaluator expectations match harmless punctuation variants", () => {
  assert.equal(normalizeEvaluationQuestion("What is Atlas WiFi?"), normalizeEvaluationQuestion("What is atlas wifi"));
  assert.notEqual(normalizeEvaluationQuestion("What is Atlas WiFi?"), normalizeEvaluationQuestion("What are pool hours?"));
});

test("release quality excludes only a question-specific hold backed by its exact quarantined source", () => {
  const source = {
    id: "approved-water-monitoring",
    title: "Water usage monitoring",
    sourceUrl: "https://alpha.gov/water-monitoring",
    contentHash: "approved-version",
  };
  const index = {
    sources: [source],
    revalidationQuarantine: {
      mode: "temporary-unavailable-approved-evidence",
      sources: [{ id: source.id, sourceUrl: source.sourceUrl, contentHash: source.contentHash, reason: "fetch-or-extraction-failed" }],
    },
  };
  const result = {
    answer: "I can’t currently confirm the water monitoring access requirements from exact owner-approved claims.",
    answerMode: "community-access-withheld",
    answerStatus: "source-unavailable",
    authorityDecision: "freshness-withheld",
    confidence: { canAnswer: false, reason: "source-review-required" },
    sources: [source],
    claims: [],
  };
  assert.equal(quarantineWithholdsRequiredEvidence("How do I access water usage monitoring?", result, index), true);

  const unrelated = { ...source, id: "pool-hours", title: "Pool hours", sourceUrl: "https://alpha.gov/pool" };
  assert.equal(quarantineWithholdsRequiredEvidence("How do I access water usage monitoring?", { ...result, sources: [unrelated] }, index), false,
    "an unrelated hold remains quality-scored");
  assert.equal(quarantineWithholdsRequiredEvidence("How do I access water usage monitoring?", { ...result, sources: [source, unrelated] }, {
    ...index, sources: [source, unrelated],
  }), false, "a non-quarantined source cannot share the exclusion");
});

test("changed evidence and ordinary weak answers cannot hide behind quarantine", () => {
  const approved = {
    id: "approved-water-monitoring",
    title: "Water usage monitoring",
    sourceUrl: "https://alpha.gov/water-monitoring",
    contentHash: "approved-version",
  };
  const index = {
    sources: [{ ...approved, contentHash: "changed-version" }],
    revalidationQuarantine: {
      mode: "temporary-unavailable-approved-evidence",
      sources: [{ id: approved.id, sourceUrl: approved.sourceUrl, contentHash: approved.contentHash, reason: "fetch-or-extraction-failed" }],
    },
  };
  const held = {
    answer: "I can’t currently confirm the water monitoring access requirements from exact owner-approved claims.",
    answerMode: "community-access-withheld",
    answerStatus: "source-unavailable",
    authorityDecision: "freshness-withheld",
    confidence: { canAnswer: false, reason: "source-review-required" },
    sources: [approved],
    claims: [],
  };
  assert.equal(quarantineWithholdsRequiredEvidence("How do I access water usage monitoring?", held, index), false);
  assert.equal(quarantineWithholdsRequiredEvidence("How do I access water usage monitoring?", {
    ...held,
    answer: "Open the portal.",
    answerMode: "community-approved-operational-instruction",
    answerStatus: "verified",
    confidence: { canAnswer: true, reason: "approved-operational-instruction" },
    claims: [{ text: "Open the portal.", verified: false }],
  }, { ...index, sources: [approved] }), false, "a weak attempted answer remains quality-scored");
});

test("a governing rule remains a relevant handoff when it explicitly says a named project is not listed", () => {
  const result = scoreCommunityAnswer("Can I add a custom enclosure?", {
    answer: "Short answer: The selected official rules do not name custom enclosure specifically.\n\nWhat I found:\n- The governing section describes related accessory structures.\n\nBefore you act: Open the linked official section.",
    answerMode: "source-evidence-boundary",
    confidence: { canAnswer: false, reason: "named-project-not-supported-by-cited-evidence" },
    sources: [{ title: "General community standards", sourceUrl: "https://library.municode.com/example/rules" }],
    actions: [],
    claims: [],
  });
  assert.ok(!result.issues.includes("irrelevant-handoff-source"));
});

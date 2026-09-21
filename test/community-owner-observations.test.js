const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const observations = require("../data/community-owner-observations.json");
const index = require("../data/community-index.json");
const profile = require("../data/communities/sterling-ranch.json");
const communityEvalCases = require("../scripts/community-eval-cases.json");
const rulesEvalCases = require("../scripts/rules-eval-cases.json");
const { answerCommunityQuestion } = require("../lib/community-assistant");
const { scoreCommunityAnswer } = require("../lib/community-answer-quality");
const { buildOwnerObservationSources } = require("../lib/community-owner-observations");
const { communitySourceStatus } = require("../lib/community-source-manager");
const { freshnessSummary } = require("../scripts/check-community-sources");

const rulesBoundary = async () => ({
  answer: "No governing rule resolves this service request.",
  answerMode: "source-evidence-boundary",
  confidence: { canAnswer: false, confidence: "high", reason: "no-exact-official-evidence" },
  sources: [],
});

test("owner-provided onsite facts retain provenance, exact approval, and a finite review window", () => {
  const [source] = buildOwnerObservationSources(observations);
  assert.equal(source.connectorType, "owner-observation");
  assert.equal(source.provenanceType, "owner-observation");
  assert.equal(source.isOfficialResource, false);
  assert.equal(source.facts[0].reviewStatus, "approved");
  assert.equal(source.facts[0].sourceVersion, source.contentHash);
  assert.ok(Date.parse(source.staleAfter) > Date.parse(source.observedAt));
  assert.match(source.text, /Atlas Guest/);
  assert.match(source.text, /GuestWiFi!/);
});

test("Atlas expectations stay separate for the Community and Rules assistants", () => {
  const communityCase = communityEvalCases.find((item) => item.question === "What is Atlas WiFi?");
  const rulesCase = rulesEvalCases.find((item) => item.question === "What is Atlas WiFi?");
  assert.deepEqual(communityCase.answerIncludesAll, ["Atlas Guest", "GuestWiFi!"]);
  assert.equal(communityCase.shouldRefuse, undefined);
  assert.equal(rulesCase.shouldRefuse, true);
  assert.equal(rulesCase.expectedAnswerMode, "source-evidence-boundary");
});

test("Atlas WiFi paraphrases answer from the same reviewed observation", async () => {
  for (const question of [
    "What is Atlas WiFi?",
    "What is atlas wifi",
    "What is atlas coffee wifi?",
    "What is the Atlas coffee WiFi?",
    "What is the WiFi password at Atlas Coffee?",
    "How do I connect to the guest network at Atlas?",
  ]) {
    const result = await answerCommunityQuestion(question, {
      index,
      communityId: "sterling-ranch",
      communityProfile: profile,
      planCommunitySearch: false,
      synthesizeCommunityAnswer: false,
      answerRulesQuestion: rulesBoundary,
      now: Date.parse("2026-09-20T23:30:00.000Z"),
    });
    assert.equal(result.answerStatus, "verified", question);
    assert.equal(result.sources.length, 1, question);
    assert.equal(result.sources[0].provenanceType, "owner-observation", question);
    assert.equal(result.sources[0].isOfficialResource, false, question);
    assert.match(result.answer, /Atlas Guest/, question);
    assert.match(result.answer, /GuestWiFi!/, question);
    const assessment = scoreCommunityAnswer(question, result, {
      expectation: { answerIncludesAll: ["Atlas Guest", "GuestWiFi!"] },
    });
    assert.ok(assessment.contentScore >= 4, `${question}: ${assessment.issues.join(", ")}`);
  }
});

test("the production need-first flow accepts a verified connection instruction", async () => {
  const question = "How do I connect to the guest network at Atlas?";
  const result = await answerCommunityQuestion(question, {
    isTest: true,
    index,
    communityId: "sterling-ranch",
    communityProfile: profile,
    planCommunitySearch: false,
    synthesizeCommunityAnswer: false,
    answerRulesQuestion: rulesBoundary,
    rulesOptions: { searchMode: "legacy", llmMode: "off" },
    requestContractMode: "need-first-candidate",
    needRouterBackend: "current-local",
    now: Date.parse("2026-09-20T23:30:00.000Z"),
  });
  assert.equal(result.answerStatus, "verified");
  assert.equal(result.completion.outcome, "complete");
  assert.match(result.answer, /Atlas Guest/);
  assert.match(result.answer, /GuestWiFi!/);
});

test("an expired onsite observation is withheld without making official-source health stale", async () => {
  const [observation] = buildOwnerObservationSources(observations);
  const now = Date.parse("2026-10-22T00:00:00.000Z");
  const result = await answerCommunityQuestion("What is Atlas WiFi?", {
    index,
    communityId: "sterling-ranch",
    communityProfile: profile,
    planCommunitySearch: false,
    synthesizeCommunityAnswer: false,
    answerRulesQuestion: rulesBoundary,
    now,
  });
  assert.notEqual(result.answerStatus, "verified");
  assert.doesNotMatch(result.answer, /Atlas Guest|GuestWiFi!/);

  const healthIndex = {
    communityId: "alpha",
    failureCount: 0,
    sources: [
      { id: "official", connectorType: "civicplus-pages", checkedAt: "2026-10-21T00:00:00Z", staleAfter: "2026-10-23T00:00:00Z" },
      observation,
    ],
    factLedger: [{
      sourceId: observation.id,
      sourceVersion: observation.contentHash,
      reviewStatus: "approved",
      reviewDecisionId: observation.facts[0].reviewDecisionId,
      reviewedAt: observation.facts[0].reviewedAt,
      reviewedBy: observation.facts[0].reviewedBy,
      staleAfter: observation.staleAfter,
      lifecycle: "current",
    }],
  };
  const status = communitySourceStatus(healthIndex, now);
  assert.equal(status.expiredApprovedSourceCount, 0);
  assert.equal(status.expiredApprovedFactCount, 0);
  assert.equal(status.expiredOwnerObservationCount, 1);
  assert.equal(status.stale, false);
  assert.equal(status.approvedEvidenceCurrent, true);
  assert.equal(freshnessSummary(healthIndex, now).expiredOwnerObservationCount, 1);
});

test("the resident UI labels onsite evidence as community-provided", () => {
  const script = fs.readFileSync(path.join(__dirname, "..", "public", "rules-assistant.js"), "utf8");
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "community-observations", "atlas-wifi.html"), "utf8");
  assert.match(script, /From current community-provided information/);
  assert.match(script, /Observed onsite · community-provided/);
  assert.match(page, /Atlas Guest/);
  assert.match(page, /GuestWiFi!/);
});

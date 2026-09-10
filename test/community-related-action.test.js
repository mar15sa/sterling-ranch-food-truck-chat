const test = require("node:test");
const assert = require("node:assert/strict");
const { answerCommunityQuestion } = require("../lib/community-assistant");
const { answerRulesQuestion } = require("../lib/rules-assistant");
const {
  attachApprovedRelatedAction,
  requestedRelatedActionFacet,
  selectApprovedRelatedAction,
} = require("../lib/community-related-action");
const communityIndex = require("../data/community-index.json");
const communityProfile = require("../data/communities/sterling-ranch.json");

const NOW = new Date("2026-09-09T02:00:00Z");

async function ask(question, index = communityIndex, profile = communityProfile) {
  return answerCommunityQuestion(question, {
    index,
    communityId: index.communityId,
    communityProfile: profile,
    answerRulesQuestion,
    rulesOptions: { searchMode: "legacy", llmMode: "off" },
    planCommunitySearch: false,
    synthesizeCommunityAnswer: false,
    now: NOW,
  });
}

test("delinquency questions keep policy authority and add only an approved current payment action", async () => {
  for (const question of [
    "What happens if I do not pay my water bill?",
    "What happens when my water bill is unpaid?",
    "If my water bill is past due, what happens next?",
  ]) {
    const answer = await ask(question);
    assert.equal(answer.answerStatus, "verified", question);
    assert.match(answer.answer, /three days|past.due|late fee/i, question);
    assert.match(answer.answer, /last Wednesday|disconnection/i, question);
    assert.equal(answer.authorityDecision, "governing-answer-with-approved-operational-action", question);
    assert.deepEqual(answer.claimAuthorityBoundary, {
      policyStagesAndCharges: "governing-source-only",
      residentAction: "exact-approved-operational-action-only",
    });
    assert.equal(answer.sources.length, 1, question);
    assert.match(answer.sources[0].sourceUrl, /DocumentCenter\/View\/2615/i, question);
    assert.equal(answer.actions.length, 1, question);
    assert.equal(answer.actions[0].actionType, "payment", question);
    assert.equal(answer.actions[0].reviewDecisionId, "water-payment-direct-link", question);
    assert.equal(answer.actions[0].approvalClaim, "direct-water-payment-link", question);
    assert.doesNotMatch(JSON.stringify(answer.actionEvidence), /utilityhawk-water-monitoring-2026/i, question);
    assert.equal(answer.completion.nextBestMove.url, answer.actions[0].url, question);
    assert.doesNotMatch(answer.answer, /2\.95%|Utility ?Hawk|ClientCare@/i, question);
  }
});

test("changed action-source versions and unrelated service collisions do not cross the bridge", async () => {
  const paymentIds = new Set([
    "sterling-ranch-water-billing-payment-options-334",
    "sterling-ranch-view-and-pay-water-bill-332",
  ]);
  const changed = {
    ...communityIndex,
    sources: communityIndex.sources.map((source) => paymentIds.has(source.id)
      ? { ...source, contentHash: "f".repeat(64) }
      : source),
  };
  const withdrawn = await ask("What happens if I do not pay my water bill?", changed);
  assert.match(withdrawn.answer, /past.due|late fee|disconnection/i);
  assert.deepEqual(withdrawn.actions || [], []);
  assert.equal(withdrawn.sources.length, 1);
  assert.match(withdrawn.sources[0].sourceUrl, /DocumentCenter\/View\/2615/i);

  const unrelatedSources = communityIndex.sources.filter((source) => source.id === "sterling-ranch-monthly-fee-billing-390");
  const collision = await ask("What happens if I do not pay my water bill?", { ...communityIndex, sources: unrelatedSources });
  assert.deepEqual(collision.actions || [], []);
  assert.match(collision.answer, /past.due|late fee|disconnection/i);
});

function exactActionFixture({ communityId, sourceUrl, actionUrl, hash, subject, actionLabel = "Open account payment" }) {
  const approvalClaim = "current-account-payment-action";
  const source = {
    id: `${communityId}-payment-action`, communityId, title: `${subject} payment options`,
    sourceUrl, sourceType: "services", connectorType: "civicplus-pages", contentHash: hash,
    text: `${subject} account payment instructions.`, excerpt: `${subject} account payment instructions.`,
    lifecycle: "current", staleAfter: "2099-01-01T00:00:00Z", authorityScore: 1, facts: [],
    actions: [{ id: `${communityId}-pay`, label: actionLabel, url: actionUrl, actionType: "payment", approvalClaim }],
  };
  const canonicalSourceLedger = {
    records: [{
      key: `${sourceUrl}#sha256:${hash}`, canonicalUrl: sourceUrl, contentHash: hash,
      approvals: [{ status: "approved", communityId, decisionId: `${communityId}-payment-approved`, scopeKind: "scoped-claims", approvedClaims: [approvalClaim], withheldClaims: [] }],
    }],
  };
  return { source, canonicalSourceLedger };
}

test("allowed hosts remain mandatory even for an exact approved action claim", () => {
  const fixture = exactActionFixture({
    communityId: "alpha", sourceUrl: "https://alpha.example.gov/billing",
    actionUrl: "https://outside.example.test/pay", hash: "a".repeat(64), subject: "utility invoice",
  });
  const index = { communityId: "alpha", sources: [fixture.source], factLedger: [], canonicalSourceLedger: fixture.canonicalSourceLedger };
  const profile = { communityId: "alpha", website: "https://alpha.example.gov/", allowedHosts: ["alpha.example.gov"] };
  const controllingAnswer = { confidence: { canAnswer: true }, answer: "The utility invoice enters collection after it is unpaid.", sources: [] };
  assert.equal(selectApprovedRelatedAction({ index, profile, controllingAnswer, subject: "utility invoice delinquency", actionFacet: "payment", now: NOW }), null);
});

test("the same claim-aware bridge composes a second community without first-community facts", () => {
  const fixture = exactActionFixture({
    communityId: "beta", sourceUrl: "https://beta.example.gov/parking-invoices",
    actionUrl: "https://payments.beta.example.gov/parking", hash: "b".repeat(64), subject: "parking invoice",
    actionLabel: "Open parking invoice payment",
  });
  const index = { communityId: "beta", sources: [fixture.source], factLedger: [], canonicalSourceLedger: fixture.canonicalSourceLedger };
  const profile = {
    communityId: "beta", website: "https://beta.example.gov/",
    allowedHosts: ["beta.example.gov", "payments.beta.example.gov"],
  };
  const controllingAnswer = {
    confidence: { canAnswer: true },
    answer: "An unpaid parking invoice follows the adopted collection stages.",
    sources: [{ sourceUrl: "https://codes.beta.example.gov/collection", title: "Adopted collection policy" }],
  };
  const plan = { goal: "information", subject: "parking invoice non-payment consequences" };
  const facet = requestedRelatedActionFacet(plan, controllingAnswer);
  const selection = selectApprovedRelatedAction({ index, profile, controllingAnswer, subject: plan.subject, actionFacet: facet, now: NOW });
  const completed = attachApprovedRelatedAction(controllingAnswer, selection);
  assert.equal(facet, "payment");
  assert.equal(completed.actions[0].url, "https://payments.beta.example.gov/parking");
  assert.equal(completed.actions[0].reviewDecisionId, "beta-payment-approved");
  assert.deepEqual(completed.sources, controllingAnswer.sources);
  assert.doesNotMatch(JSON.stringify(completed), /Sterling|Utility ?Hawk|srcab/i);
});

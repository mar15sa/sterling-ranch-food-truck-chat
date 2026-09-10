const assert = require("node:assert/strict");
const test = require("node:test");

const { composeApprovedOperationalProjection } = require("../lib/community-assistant");
const { proactiveCommunityAnswer, enhanceProactiveRulesAnswer } = require("../lib/community-proactive");
const { searchCommunityIndex } = require("../lib/community-search");
const { canonicalProjectionEntries, sourceReviewGate, sourceReviewState } = require("../lib/community-source-answerability");

const now = new Date("2026-09-09T18:00:00.000Z");

function fullyApprovedSource(text) {
  return {
    id: "static-page",
    communityId: "portable-community",
    title: "Official community information",
    sourceUrl: "https://portable.example.gov/community/info",
    sourceType: "services",
    connectorType: "civicplus-pages",
    contentHash: "a".repeat(64),
    reviewedSourceVersion: "a".repeat(64),
    reviewStatus: "approved",
    reviewDecisionId: "full-page-decision",
    reviewedAt: "2026-09-09T17:00:00.000Z",
    reviewedBy: "owner",
    checkedAt: "2026-09-09T17:00:00.000Z",
    staleAfter: "2099-01-01T00:00:00.000Z",
    lifecycle: "current",
    authorityScore: 1,
    text,
    excerpt: text,
    facts: [],
    actions: [],
  };
}

test("all retired proactive triggers ignore raw static prose even after full-page approval", () => {
  const cases = [
    ["Can I reserve the pool for a birthday party?", "The pool is not available for rental."],
    ["How do I get access to the clubhouse?", "Complete the Resident Amenity Form to get clubhouse access."],
    ["How much does the Great Hall cost?", "Great Hall Hourly Pricing $100 per hour."],
    ["When do I bring my recycling bins back?", "Return containers by the end of pickup day."],
    ["What is the DRC email address?", "Email residentsubmit@example.gov for DRC applications."],
    ["How do I submit a landscape application?", "Complete attachments B-1 and B-2."],
    ["Is Labor Day a trash holiday?", "Labor Day pickup is delayed by one day."],
    ["Which landscapers are approved?", "Approved Landscapers List: Example Landscaping."],
  ];
  for (const [question, prose] of cases) {
    const source = fullyApprovedSource(prose);
    const answer = proactiveCommunityAnswer(question, {
      now,
      index: { communityId: source.communityId, sources: [source], factLedger: [] },
    });
    assert.equal(answer, null, question);
  }
});

test("full-page approval never authorizes a static body and exact claim approval stays URL/hash scoped", () => {
  const source = {
    ...fullyApprovedSource("Approved renewal details. Unsupported neighboring promise."),
    facts: [{
      type: "information",
      value: "renew-online",
      context: "Renew online with the permit form.",
      approvalClaim: "permit-renewal-process",
    }],
  };
  const canonicalSourceLedger = { records: [{
    key: `${source.sourceUrl}#sha256:${source.contentHash}`,
    canonicalUrl: source.sourceUrl,
    contentHash: source.contentHash,
    approvals: [{
      status: "approved",
      communityId: source.communityId,
      decisionId: "permit-renewal-decision",
      scopeKind: "scoped-claims",
      approvedClaims: ["permit-renewal-process"],
      withheldClaims: ["neighboring-promise"],
    }],
  }] };
  const index = { communityId: source.communityId, sources: [source], factLedger: [], canonicalSourceLedger };

  assert.equal(sourceReviewGate(index, now.getTime())(source), false);
  assert.deepEqual(canonicalProjectionEntries(source, index).map((entry) => entry.approvalClaim), ["permit-renewal-process"]);
  assert.equal(canonicalProjectionEntries({ ...source, contentHash: "b".repeat(64) }, index).length, 0);
  assert.equal(canonicalProjectionEntries({ ...source, sourceUrl: "https://portable.example.gov/community/other" }, index).length, 0);
});

test("dynamic connector authority cannot validate static claims", () => {
  const dynamic = {
    ...fullyApprovedSource("Pool rentals are always free."),
    id: "live-calendar",
    sourceType: "events",
    connectorType: "civicplus-calendar",
    facts: [{ type: "money", value: "$0", context: "Pool rentals are always free.", approvalClaim: "static-pool-price" }],
  };
  const index = { communityId: dynamic.communityId, sources: [dynamic], factLedger: [] };
  assert.equal(sourceReviewGate(index, now.getTime())(dynamic), true);
  assert.deepEqual(sourceReviewState(index, now.getTime()).entriesFor(dynamic), []);
  const result = searchCommunityIndex("What is the pool rental price?", { index, intent: "facilities", now });
  assert.equal(result.sources.length, 0);
});

test("retired rule enhancements cannot add unsupported template conclusions", () => {
  const base = {
    answer: "Short answer: I found the relevant governing section.",
    directAnswer: "I found the relevant governing section.",
    keyDetails: [],
    nextStep: "Open the cited rule.",
    sources: [{ id: "rule", title: "Governing rule", excerpt: "Relevant governing section." }],
  };
  for (const question of [
    "When am I allowed to water my lawn?",
    "When can I put up holiday lights?",
    "How much are trash and streetlight fees?",
    "What happens if my water bill is late?",
  ]) {
    assert.deepEqual(enhanceProactiveRulesAnswer(question, structuredClone(base), { now }), base, question);
  }
});

test("deterministic approved projection retains exact approval claim IDs", async () => {
  const source = {
    id: "permit-guide",
    title: "Permit guide",
    sourceType: "forms",
    checkedAt: now.toISOString(),
    staleAfter: "2099-01-01T00:00:00.000Z",
    canonicalScopedProjection: true,
    text: "Renew online with the permit form.",
    excerpt: "Renew online with the permit form.",
    facts: [{
      type: "information",
      value: "renew-online",
      context: "Renew online with the permit form.",
      approvalClaim: "permit-renewal-process",
    }],
    actions: [],
    score: 50,
  };
  const answer = await composeApprovedOperationalProjection(
    "How do I renew my permit?",
    { sources: [source], requestedDetails: [], intent: "forms" },
    { synthesizeCommunityAnswer: false },
  );
  assert.equal(answer.authorityDecision, "exact-version-approved-claims");
  assert.deepEqual(answer.claims[0].approvalClaimIds, ["permit-renewal-process"]);
});

const assert = require("node:assert/strict");
const test = require("node:test");
const { composeApprovedOperationalProjection } = require("../lib/community-assistant");

const checkedAt = "2026-09-09T12:00:00.000Z";

function fixture() {
  const guide = {
    id: "beta-parking-guide",
    title: "Parking Permit Renewal Guide",
    sourceType: "forms",
    checkedAt,
    staleAfter: "2099-01-01T00:00:00.000Z",
    canonicalScopedProjection: true,
    text: "Renew your parking permit with the online renewal form. For renewal help, email permits@beta.example.gov.",
    excerpt: "Renew your parking permit with the online renewal form.",
    facts: [{
      type: "email",
      value: "permits@beta.example.gov",
      context: "For renewal help, email permits@beta.example.gov.",
      facet: "contact",
      approvalClaim: "permit-renewal-contact",
    }],
    actions: [],
    score: 50,
    rawPageBody: "UNAPPROVED neighboring claim: every permit includes free downtown parking.",
  };
  const action = {
    id: "beta-parking-action",
    title: "Parking Permit Renewal Form",
    sourceType: "forms",
    checkedAt,
    staleAfter: "2099-01-01T00:00:00.000Z",
    canonicalScopedProjection: true,
    text: "Use the official parking permit renewal form.",
    excerpt: "Use the official parking permit renewal form.",
    facts: [],
    actions: [{
      id: "permit-renewal-action",
      label: "Open parking permit renewal form",
      url: "https://permits.beta.example.gov/renew",
      actionType: "application",
      context: "Open parking permit renewal form.",
      approvalClaim: "permit-renewal-action",
    }],
    score: 49,
  };
  return {
    sources: [guide, action],
    requestedDetails: ["action", "contact"],
    intent: "forms",
  };
}

const routingPlan = {
  intent: "forms",
  goal: "application",
  goals: ["application"],
  subject: "parking permit renewal",
  requestedDetails: ["action", "contact"],
  searchQueries: ["parking permit renewal"],
};

test("generic composer answers a second-community non-water question from multiple approved projections", async () => {
  let receivedSources;
  let receivedOptions;
  const answer = await composeApprovedOperationalProjection(
    "How do I renew my parking permit, and who can help?",
    fixture(),
    {
      routingPlan,
      preferredAction: fixture().sources[1].actions[0],
      synthesizeCommunityAnswer: async (_question, sources, options) => {
        receivedSources = sources;
        receivedOptions = options;
        return {
          directAnswer: "Open the parking permit renewal form to renew your permit.",
          keyDetails: ["For renewal help, email permits@beta.example.gov."],
          nextStep: "Use the parking permit renewal form.",
        };
      },
    },
  );

  assert.equal(answer.answerMode, "community-approved-operational-grounded-ai");
  assert.equal(answer.answerStatus, "verified");
  assert.deepEqual(answer.completion.resolvedDetails, ["action", "contact"]);
  assert.deepEqual(answer.actions.map((action) => action.url), ["https://permits.beta.example.gov/renew"]);
  assert.deepEqual(new Set(answer.claims.flatMap((claim) => claim.evidenceSourceIds)), new Set(["beta-parking-guide", "beta-parking-action"]));
  assert.equal(receivedOptions.approvedProjectionOnly, true);
  assert.deepEqual(receivedOptions.requiredDetails, ["action", "contact"]);
  assert.equal(receivedSources.some((source) => "rawPageBody" in source), false);
  assert.doesNotMatch(JSON.stringify(receivedSources), /free downtown parking/i);
});

test("AI unavailability falls back to the complete deterministic approved answer", async () => {
  const data = fixture();
  const answer = await composeApprovedOperationalProjection(
    "How do I renew my parking permit, and who can help?",
    data,
    { routingPlan, preferredAction: data.sources[1].actions[0], synthesizeCommunityAnswer: async () => null },
  );
  assert.equal(answer.answerMode, "community-approved-operational");
  assert.match(answer.answer, /Open parking permit renewal form/);
  assert.match(answer.answer, /permits@beta\.example\.gov/);
});

test("an AI draft missing a requested facet is rejected in favor of the approved fallback", async () => {
  const data = fixture();
  const answer = await composeApprovedOperationalProjection(
    "How do I renew my parking permit, and who can help?",
    data,
    {
      routingPlan,
      preferredAction: data.sources[1].actions[0],
      synthesizeCommunityAnswer: async () => ({
        directAnswer: "Open the parking permit renewal form to renew your permit.",
        keyDetails: [],
        nextStep: "Use the parking permit renewal form.",
      }),
    },
  );
  assert.equal(answer.answerMode, "community-approved-operational");
  assert.match(answer.answer, /permits@beta\.example\.gov/);
});

test("an AI-added unsupported claim is rejected and never reaches the resident", async () => {
  const data = fixture();
  const answer = await composeApprovedOperationalProjection(
    "How do I renew my parking permit, and who can help?",
    data,
    {
      routingPlan,
      preferredAction: data.sources[1].actions[0],
      synthesizeCommunityAnswer: async () => ({
        directAnswer: "Open the parking permit renewal form to renew your permit.",
        keyDetails: [
          "For renewal help, email permits@beta.example.gov.",
          "Every permit includes free downtown parking.",
        ],
        nextStep: "Use the parking permit renewal form.",
      }),
    },
  );
  assert.equal(answer.answerMode, "community-approved-operational");
  assert.doesNotMatch(answer.answer, /free downtown parking/i);
});

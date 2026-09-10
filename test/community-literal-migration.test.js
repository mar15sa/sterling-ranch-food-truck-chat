const assert = require("node:assert/strict");
const test = require("node:test");

const { eventFailureActions, poolStatusAnswer } = require("../lib/community-assistant");

test("live connector handoffs use each community's configured labels", () => {
  const profile = {
    communityId: "ridgeview",
    connectors: [{
      id: "ridge-calendar",
      type: "civicplus-calendar",
      baseUrl: "https://ridgeview.example/calendar",
      adapter: { labels: { openAction: "View Ridgeview events" } },
    }],
  };
  assert.deepEqual(eventFailureActions({ communityProfile: profile }), [{
    label: "View Ridgeview events",
    url: "https://ridgeview.example/calendar",
    actionType: "calendar",
  }]);
});

test("pool status keeps live authority while taking its handoff label from the profile", () => {
  const profile = {
    communityId: "ridgeview",
    connectors: [{ type: "live-status", adapter: { labels: { openAction: "View Ridgeview pool status" } } }],
  };
  const answer = poolStatusAnswer({
    headline: "Open",
    summary: "No current alert.",
    sourceUrl: "https://ridgeview.example/pool",
    checkedAt: "2026-09-10T12:00:00.000Z",
    stale: false,
    evidenceEnvelope: {
      communityId: "ridgeview",
      connectorFamily: "live-status",
      degradation: { state: "healthy" },
      coverage: { covered: ["status"] },
      evidence: [{ evidenceId: "ridge-pool", communityId: "ridgeview", staleAfter: "2026-09-10T12:10:00.000Z", controllingSourceRole: "operational" }],
      claims: [{ facet: "status", text: "Open", controllingEvidenceId: "ridge-pool" }],
    },
  }, ["status"], { communityId: "ridgeview", communityProfile: profile, now: "2026-09-10T12:05:00.000Z" });

  assert.equal(answer.answerStatus, "verified");
  assert.deepEqual(answer.actions, [{ label: "View Ridgeview pool status", url: "https://ridgeview.example/pool", actionType: "status" }]);
  assert.equal(answer.sources[0].controllingSourceRole, "operational");
});

test("pool status does not claim the adjacent facility-hours facet", () => {
  const answer = poolStatusAnswer({
    headline: "Open",
    summary: "No current alert.",
    sourceUrl: "https://ridgeview.example/pool",
    checkedAt: "2026-09-10T12:00:00.000Z",
    stale: false,
    evidenceEnvelope: {
      communityId: "ridgeview",
      connectorFamily: "live-status",
      degradation: { state: "healthy" },
      coverage: { covered: ["status"] },
      evidence: [{ evidenceId: "ridge-pool", communityId: "ridgeview", staleAfter: "2026-09-10T12:10:00.000Z", controllingSourceRole: "operational" }],
      claims: [{ facet: "status", text: "Open", controllingEvidenceId: "ridge-pool" }],
    },
  }, ["hours"], { communityId: "ridgeview", now: "2026-09-10T12:05:00.000Z" });

  assert.equal(answer.completion.outcome, "missing-evidence");
  assert.deepEqual(answer.completion.resolvedDetails, []);
  assert.equal(answer.sources[0].authorityFacets.includes("hours"), false);
});

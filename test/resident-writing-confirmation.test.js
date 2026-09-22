const test = require("node:test");
const assert = require("node:assert/strict");
const { runNeedFirstShadow } = require("../lib/community-need-router");
const { buildResidentRequestContract } = require("../lib/community-request-contract");
const { writingMeaningIssues } = require("../lib/resident-writing-contract");

function fixture() {
  const text = "Turn off courtyard lamps by 9:30 p.m.";
  return { answerStatus: "verified", directAnswer: text, answer: text, keyDetails: [], actions: [], conflicts: [],
    sources: [{ id: "rule", title: "Courtyard lamp rules", text }],
    claims: [{ text, verified: true, evidenceSourceIds: ["rule"] }] };
}

test("a complete focused answer carries the proof status required by the existing page", async () => {
  const contract = buildResidentRequestContract("Can I leave courtyard lamps on all night?");
  const result = await runNeedFirstShadow(contract, async () => fixture());
  assert.equal(result.completion.outcome, "complete");
  assert.equal(result.confidence.canAnswer, true);
  assert.equal(result.confidence.reason, "verified-need-evidence-complete");
});

test("missing evidence and unverified or empty answers cannot acquire a confirmation", async () => {
  const contract = buildResidentRequestContract("Can I leave courtyard lamps on all night?");
  const missing = fixture();
  missing.claims = [];
  const unsupported = fixture();
  unsupported.claims[0].verified = false;
  const detached = fixture();
  detached.claims[0].evidenceSourceIds = ["missing-source"];
  const conflicted = fixture();
  conflicted.answerStatus = "conflicting-sources";
  conflicted.conflicts = [{ factKey: "cutoff", facts: [{ sourceId: "rule" }, { sourceId: "other-rule" }] }];
  for (const answer of [missing, unsupported, detached, conflicted, { sources: [], claims: [], actions: [], conflicts: [] }]) {
    const result = await runNeedFirstShadow(contract, async () => answer);
    assert.equal(result.confidence.canAnswer, false, JSON.stringify(result));
  }
});

test("rewriting cannot soften a requirement into a recommendation", () => {
  const required = "Displays must be appropriate for the season.";
  const recommended = "Displays should be appropriate for the season.";
  const sources = [{ id: "rule", title: "Display rules", text: required }];
  assert.ok(writingMeaningIssues(recommended, required, sources, "What are the display rules?").includes("obligation-weakened"));
  assert.deepEqual(writingMeaningIssues(recommended, recommended, [{ ...sources[0], text: recommended }], "What are the display rules?"), []);
});

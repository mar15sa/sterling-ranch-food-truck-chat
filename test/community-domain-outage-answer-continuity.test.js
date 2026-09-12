const test = require("node:test");
const assert = require("node:assert/strict");
const communityIndex = require("../data/community-index.json");
const communityProfile = require("../data/communities/sterling-ranch.json");
const { answerCommunityQuestion } = require("../lib/community-assistant");
const { scoreCommunityAnswer } = require("../lib/community-answer-quality");
const { answerRulesQuestion } = require("../lib/rules-assistant");
const { runBridge } = require("../scripts/check-approved-community-revalidation");
const { planCommunitySearchFixture, synthesizeCommunityAnswerFixture } = require("../scripts/community-ai-eval-fixtures");

const INCIDENT_NOW = Date.parse("2026-09-11T07:00:56.000Z");

function timeout() {
  const error = new Error("request timed out");
  error.name = "TimeoutError";
  return error;
}

test("a short whole-domain outage preserves useful answers from unchanged exact approved evidence", async () => {
  const dueIndex = structuredClone(communityIndex);
  const recentlyExpired = new Date(INCIDENT_NOW - 6 * 60 * 60 * 1000).toISOString();
  const lastVerifiedAt = new Date(INCIDENT_NOW - 30 * 60 * 60 * 1000).toISOString();
  const dueSourceIds = new Set(dueIndex.sources.filter((source) => {
    try { return new URL(source.sourceUrl).hostname === "sterlingranchcab.com"; } catch { return false; }
  }).map((source) => source.id));
  for (const source of dueIndex.sources) {
    if (!dueSourceIds.has(source.id)) continue;
    source.checkedAt = lastVerifiedAt;
    source.staleAfter = recentlyExpired;
  }
  for (const fact of dueIndex.factLedger || []) {
    if (!dueSourceIds.has(fact.sourceId)) continue;
    fact.lastObservedAt = lastVerifiedAt;
    fact.staleAfter = recentlyExpired;
  }
  const result = await runBridge({
    index: dueIndex,
    baselineIndex: structuredClone(dueIndex),
    now: INCIDENT_NOW,
    auditFn: () => {},
    fetchObservedHashes: async (sourceUrl, approvedSources) => {
      if (new URL(sourceUrl).hostname === "sterlingranchcab.com") throw timeout();
      return { observedHashes: approvedSources.map((source) => source.contentHash), actionMismatch: false };
    },
  });
  assert.equal(result.valid, true);
  assert.equal(result.attestation.status, "passed-with-grace-evidence");
  assert.ok(result.attestation.graced.some((source) => source.sourceUrl.endsWith("/175/Design-Review")));
  assert.ok(result.attestation.graced.some((source) => source.sourceUrl.endsWith("/201/Design-Review-Documents")));
  assert.ok(result.attestation.graced.some((source) => source.sourceUrl.endsWith("/187/Pool")));

  const ask = (question) => answerCommunityQuestion(question, {
    index: result.temporaryIndex,
    communityId: "sterling-ranch",
    communityProfile,
    now: INCIDENT_NOW,
    answerRulesQuestion,
    rulesOptions: { searchMode: "legacy", llmMode: "off" },
    planCommunitySearch: planCommunitySearchFixture,
    synthesizeCommunityAnswer: synthesizeCommunityAnswerFixture,
  });

  const rainBarrel = await ask("I need to submit for a rainwater harvesting barrels");
  assert.match(rainBarrel.answer, /55[- ]gallon/i);
  assert.doesNotMatch(rainBarrel.answer, /could not verify the application or submission step/i);
  assert.ok(rainBarrel.actions.some((action) => /design review|application/i.test(action.label)));

  const designReview = await ask("I need to submit something to the DRC. How do I do that?");
  assert.match(designReview.answer, /email|drop off/i);
  assert.doesNotMatch(designReview.answer, /can(?:not|'t) safely restate/i);
  assert.ok(designReview.actions.some((action) => /design review|application/i.test(action.label)));

  const poolHours = await ask("What are the pool hours for Labor Day?");
  assert.match(poolHours.answer, /5:00 am|8:45 pm/i);
  assert.match(poolHours.answer, /does not publish separate Labor Day hours/i);

  for (const [question, answer] of [
    ["I need to submit for a rainwater harvesting barrels", rainBarrel],
    ["I need to submit something to the DRC. How do I do that?", designReview],
    ["What are the pool hours for Labor Day?", poolHours],
  ]) {
    const assessment = scoreCommunityAnswer(question, answer);
    assert.ok(assessment.score >= 4, `${question}\n${JSON.stringify(assessment, null, 2)}\n${answer.answer}`);
    assert.notEqual(assessment.residentEffort.rating, "High resident effort", question);
  }
});

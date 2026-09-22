const test = require("node:test");
const assert = require("node:assert/strict");
const { answerCommunityQuestion } = require("../lib/community-assistant");
const { answerRulesQuestion } = require("../lib/rules-assistant");
const { buildResidentRequestContract, assessResidentNeeds } = require("../lib/community-request-contract");
const { runNeedFirstShadow } = require("../lib/community-need-router");
const { answerCoverageIssues } = require("../lib/rules-intent");
const { writingMeaningIssues } = require("../lib/resident-writing-contract");
const { synthesizeCommunityAnswer } = require("../lib/community-llm");

function fixture(time) {
  const details = ["Courtyard lamps are allowed from November 2 through February 4.",
    "Courtyard lamps must be removed outside the seasonal period.", `Turn off courtyard lamps by ${time}.`];
  const source = { id: "rule", nodeId: "rule", title: "Courtyard lamp rules", sourceUrl: "https://example.org/rules",
    text: details.join(" "), authorityRole: "governing-rule" };
  return { answerStatus: "verified", directAnswer: details[0], keyDetails: details.slice(1), answer: details.join("\n\n"),
    sources: [source], actions: [], conflicts: [], claims: details.map(text => ({ text, evidenceSourceIds: [source.id], verified: true })) };
}

test("overnight permission preserves a source-derived cutoff ahead of seasonal topic matches", async () => {
  const contract = buildResidentRequestContract("Can I leave courtyard lamps on all night?");
  for (const time of ["9:30 p.m.", "11:15 p.m."]) {
    const answer = fixture(time);
    const result = await runNeedFirstShadow(contract, async () => answer);
    assert.ok(result.answer.includes(time), result.answer);
    assert.equal(result.completion.outcome, "complete");
    const missing = { ...answer, keyDetails: [answer.keyDetails[0]], claims: answer.claims.slice(0, 2),
      answer: answer.claims.slice(0, 2).map(claim => claim.text).join(" ") };
    assert.equal(assessResidentNeeds(contract, missing).outcome, "missing-evidence");
  }
});

test("clock cutoffs satisfy overnight duration and plain imperative permission wording", () => {
  const answer = fixture("9:30 p.m.");
  const issues = answerCoverageIssues("Can courtyard lamps stay on all night?", answer.keyDetails[1], answer.sources);
  assert.ok(!issues.includes("requested-duration-missing"), JSON.stringify(issues));
  assert.ok(!issues.includes("direct-permission-answer-missing"), JSON.stringify(issues));
});

test("the actual composition validator accepts ordinary permission wording with an unchanged clock cutoff", async () => {
  const original = fixture("9:30 p.m.");
  for (const directAnswer of ["No. You need to turn off courtyard lamps by 9:30 p.m.", "Turn off courtyard lamps by 9:30 p.m."]) {
    const diagnostics = [];
    const result = await synthesizeCommunityAnswer("Can I leave courtyard lamps on all night?", original.sources, {
      apiKey: "fixture-key", model: directAnswer,
      routingPlan: { goal: "permission", requestedDetails: ["permission"] },
      writingContract: { version: "overnight-test" }, onDiagnostic: item => diagnostics.push(item),
      fetchImpl: async () => ({ ok: true, json: async () => ({ content: [{ type: "text", text: JSON.stringify({ directAnswer, keyDetails: [], nextStep: "" }) }] }) }),
    });
    assert.ok(result, JSON.stringify(diagnostics));
    assert.equal(result.directAnswer, directAnswer);
  }
});

test("sentence-leading prepositions are not names but changed names and values remain rejected", () => {
  const original = "For Winterfest Festival, lights are allowed from November 2 through February 4. Turn off lights by 9:30 p.m.";
  const sources = [{ id: "rule", title: "Lighting rules", sourceUrl: "https://example.org/rules", text: original }];
  const rewritten = "Winterfest Festival lights are allowed from November 2 through February 4. Turn off lights by 9:30 p.m.";
  assert.deepEqual(writingMeaningIssues(rewritten, original, sources, "When can Winterfest lights be used?"), []);
  assert.ok(writingMeaningIssues(rewritten.replace("Winterfest", "Springfest"), original, sources, "When can Winterfest lights be used?").length);
  assert.ok(writingMeaningIssues(rewritten.replace("9:30", "10:30"), original, sources, "When can Winterfest lights be used?").length);
});

test("the real audited production path retains overnight light restrictions before writing", async () => {
  const options = { isTest: true, now: new Date("2026-09-18T18:00:00Z"),
    requestContractMode: "need-audited-candidate", needRouterBackend: "current-local", needFirstResidentRelease: true,
    planCommunitySearch: false, synthesizeCommunityAnswer: false, answerRulesQuestion,
    rulesOptions: { llmMode: "off", searchMode: "legacy" }, index: require("../data/community-index.json"),
    communityId: "sterling-ranch", communityProfile: require("../data/communities/sterling-ranch.json") };
  for (const question of ["Can I leave my Halloween lights on all night?", "Can I leave my Christmas lights on all night?", "Can I leave my under-eave lights on overnight?"]) {
    const result = await answerCommunityQuestion(question, options);
    assert.match(result.answer, /10(?::00)? p\.m\./i, `${question}: ${result.answer}`);
    assert.match(result.answer, /turn(?:ed)? off/i, result.answer);
    assert.equal(result._requestContract.assessment.outcome, "complete", question);
  }
});

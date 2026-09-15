const test = require("node:test");
const assert = require("node:assert/strict");
const { answerRulesQuestion, buildRulesEvidenceClaims } = require("../lib/rules-assistant");

test("rules evidence claims reject changed permission and numeric details", () => {
  const sources = [{
    id: "shed-rule",
    title: "Backyard shed rule",
    text: "DRC approval is required. Backyard sheds must not exceed eight feet in height.",
  }];
  assert.deepEqual(buildRulesEvidenceClaims({
    directAnswer: "DRC approval is not required.", answer: "DRC approval is not required.", sources,
  }), []);
  assert.deepEqual(buildRulesEvidenceClaims({
    directAnswer: "Backyard sheds may be ten feet in height.", answer: "Backyard sheds may be ten feet in height.", sources,
  }), []);
  assert.deepEqual(buildRulesEvidenceClaims({
    directAnswer: "A fence requires DRC approval.", answer: "A fence requires DRC approval.",
    sources: [{ id: "shed-only", title: "Shed rule", text: "A backyard shed requires DRC approval." }],
  }), []);
});

test("a scoped source-absence statement keeps typed proof to the inspected source", () => {
  const claims = buildRulesEvidenceClaims({
    directAnswer: "The selected controlling source does not give a specific curb-placement or removal time.",
    answer: "The selected controlling source does not give a specific curb-placement or removal time.",
    residentQuestion: "Does CAB set an exact hour for taking bins back from the curb?",
    sources: [{ id: "trash-rule", title: "Trash containers", text: "Containers must be stored in the garage." }],
  });
  assert.deepEqual(claims, [{
    text: "The selected controlling source does not give a specific curb-placement or removal time.",
    evidenceSourceIds: ["trash-rule"],
    verified: true,
    kind: "source-scope-boundary",
  }]);
  assert.deepEqual(buildRulesEvidenceClaims({
    directAnswer: "The selected controlling source does not give a specific curb-placement or removal time.",
    answer: "The selected controlling source does not give a specific curb-placement or removal time.",
    residentQuestion: "Does CAB set an exact hour for taking bins back from the curb?",
    sources: [{ id: "timed-trash-rule", title: "Trash containers", text: "Containers must return by 7:00 p.m." }],
  }), []);
});

test("the deterministic shed answer maps rendered limits and official form links", async () => {
  const result = await answerRulesQuestion("Which application form do I use for a backyard shed?", {
    searchMode: "legacy",
    llmMode: "off",
  });
  const displayedIds = new Set(result.sources.map((source) => source.id || source.nodeId));
  assert.ok(result.claims.some((claim) => /eight feet, six inches/i.test(claim.text)));
  assert.ok(result.claims.some((claim) => /Backyard Utility Sheds One-Sheet/i.test(claim.text)));
  assert.ok(result.claims.every((claim) => claim.verified === true
    && claim.evidenceSourceIds.every((id) => displayedIds.has(id))));
});

test("the deterministic lighting answer resolves permanent installation versus seasonal settings", async () => {
  const result = await answerRulesQuestion(
    "Regarding permanent seasonal lights approved for holiday use: Can those stay up all year?",
    { searchMode: "legacy", llmMode: "off" }
  );
  assert.match(result.directAnswer, /stay installed year-round/i);
  assert.match(result.directAnswer, /non-holiday settings/i);
  assert.ok(result.claims.some((claim) => /stay installed year-round/i.test(claim.text)));
  assert.ok(result.claims.every((claim) => claim.verified === true));
});

test("deterministic direct answers keep proof across headings, wrappers, dates, and fee schedules", async () => {
  const checks = [
    ["Do I need approval for solar panels?", /DRC approval is required/i],
    ["Do I need approval for a greenhouse?", /Greenhouses: DRC approval is required/i],
    ["What is the holiday lighting season?", /June 18 to July 7.*October 1 through January 31/i],
    ["What are trash fees?", /Residential trash charge is \$14\.17/i],
  ];
  for (const [question, expectedClaim] of checks) {
    const result = await answerRulesQuestion(question, {
      searchMode: "legacy", llmMode: "off", needFirstEvidenceContract: true,
    });
    assert.ok(result.claims.some((claim) => expectedClaim.test(claim.text)), question);
    assert.ok(result.claims.every((claim) => claim.verified === true && claim.evidenceSourceIds.length), question);
  }
});

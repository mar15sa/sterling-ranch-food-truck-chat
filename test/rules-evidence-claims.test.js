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

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

test("plain-language dimensions and exclusion wording keep proof", () => {
  const source = {
    id: "screen-rule",
    title: "Landscape screens",
    text: [
      "Landscape screens. DRC approval is required.",
      "Five-foot maximum overall height for exposed landscape screen from grade.",
      "Landscape screens are only allowed in rear or side yards and are not allowed in easements.",
      "A maximum of three screens are allowed if lot square footage permits.",
    ].join(" "),
  };
  const expected = [
    "You'll need DRC approval for landscape screens.",
    "The maximum height is 5 feet, measured from ground level.",
    "Landscape screens must be in rear or side yards and outside easements.",
    "Up to 3 screens are allowed if the lot has enough room.",
  ];
  const claims = buildRulesEvidenceClaims({
    directAnswer: expected[0],
    keyDetails: expected.slice(1),
    answer: expected.join(" "),
    residentQuestion: "What are the backyard privacy-screen rules?",
    sources: [source],
  });
  assert.deepEqual(claims.map((claim) => claim.text), expected);
});

test("a numbered rule item keeps the obligation from its parent heading", () => {
  const claim = "Vegetable garden boxes must be located a minimum of five feet from all property lines.";
  const claims = buildRulesEvidenceClaims({
    directAnswer: claim,
    answer: claim,
    residentQuestion: "Can I install garden boxes behind my house?",
    sources: [{
      id: "garden-rule",
      title: "Vegetable gardens",
      text: [
        "Vegetable garden boxes shall:",
        "1. Complement the architectural style of the house;",
        "2. Be screened from view of adjacent homes and public areas;",
        "3. Not cover more than 50 percent of the rear or side yard;",
        "4. Be maintained in good condition; and",
        "5. Be located a minimum of five feet from all property lines.",
      ].join(" "),
    }],
  });
  assert.deepEqual(claims.map((item) => item.text), [claim]);
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
  assert.match(result.directAnswer, /hardwired soffit installed lighting.*returned to the settings allowed/is);
  assert.ok(result.claims.some((claim) => /returned to the settings allowed/i.test(claim.text)));
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

test("a multi-source resident fee overview keeps each sentence tied to its own schedule", async () => {
  const result = await answerRulesQuestion("What fees do residents pay?", {
    searchMode: "legacy", llmMode: "off", needFirstEvidenceContract: true,
  });
  assert.ok(result.claims.some((claim) => /water \$50\.20.*sewer \$44\.95.*stormwater \$18\.80/i.test(claim.text)));
  assert.ok(result.claims.some((claim) => /streetlight \$9\.90.*trash \$14\.17/i.test(claim.text)));
  assert.ok(result.claims.every((claim) => claim.verified === true && claim.evidenceSourceIds.length));
  assert.doesNotMatch(result.answer, /charges is\b/i);
});

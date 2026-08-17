const assert = require("node:assert/strict");
const {
  searchRulesIndex,
  sourceLifecycleStatus,
  sourceDerivedAnswerParts,
  summaryHasVolatileFacts,
} = require("../lib/rules-assistant");

assert.equal(
  summaryHasVolatileFacts("Short answer: The monthly fee is $50.20."),
  true,
  "Money in a summary must use the source-derived path."
);
assert.equal(
  summaryHasVolatileFacts("Short answer: The limit is four domestic animals."),
  true,
  "Number words in a summary must use the source-derived path."
);
assert.equal(
  summaryHasVolatileFacts("Short answer: DRC approval is required."),
  false,
  "A summary without changing dates, amounts, or limits can remain deterministic."
);

const changedSource = [
  {
    title: "Current service fee schedule",
    id: "resolution-2027-fees",
    effectiveDate: "2027-01-01",
    sourceUrl: "https://example.test/resolution-2027-fees",
    summaryText: "The old hand-written summary says the fee is $50.20.",
    text: "The current monthly residential service fee is $61.75, effective January 1, 2027.",
    excerpt: "Current fee schedule.",
  },
];
const changed = sourceDerivedAnswerParts("What is the monthly residential service fee?", changedSource);
assert.equal(changed.available, true);
assert.match(changed.sources[0].excerpt, /\$61\.75/);
assert.match(changed.sources[0].excerpt, /January 1, 2027/i);
assert.ok(changed.sources[0].structuredFacts.length >= 2);
assert.equal(changed.sources[0].structuredFacts[0].sourceId, "resolution-2027-fees");
assert.equal(changed.sources[0].structuredFacts[0].effectiveDate, "2027-01-01");
assert.doesNotMatch(changed.answer, /\$50\.20/);
assert.doesNotMatch(changed.sources[0].excerpt, /\$50\.20/);

const missing = sourceDerivedAnswerParts("What is the fee?", [
  {
    title: "Incomplete fee notice",
    text: "Contact the CAB for the current schedule.",
    excerpt: "Contact the CAB for the current schedule.",
  },
]);
assert.equal(missing.available, false, "Missing current facts must fail closed.");

const changedPetLimit = sourceDerivedAnswerParts(
  "How many dogs can I keep?",
  [
    {
      title: "Current pets rule",
      text: "Household pets are allowed, with an aggregate limit of five domestic animals.",
      excerpt: "Current pets rule.",
    },
  ],
  "Short answer: Yes, household pets such as cats and dogs are allowed. The rule has an aggregate limit of four domestic animals."
);
assert.match(changedPetLimit.answer, /household pets such as cats and dogs are allowed/i);
assert.doesNotMatch(changedPetLimit.answer, /four domestic animals/i);
assert.match(changedPetLimit.sources[0].excerpt, /five domestic animals/i);

assert.equal(sourceLifecycleStatus({ effectiveDate: "2020-01-01" }), "current");
assert.equal(sourceLifecycleStatus({ effectiveDate: "2099-01-01" }), "future");
assert.equal(sourceLifecycleStatus({ expirationDate: "2020-01-01" }), "expired");
assert.equal(sourceLifecycleStatus({ supersededBy: "New policy" }), "superseded");

const lifecycleIndex = {
  documents: [
    {
      id: "current-fee",
      nodeId: "current-fee",
      title: "Current pet fee",
      text: "The current pet fee is $10.00.",
      isSupplemental: true,
      effectiveDate: "2026-01-01",
      sourcePriority: 100,
    },
    {
      id: "expired-fee",
      nodeId: "expired-fee",
      title: "Expired pet fee",
      text: "The expired pet fee was $99.00.",
      isSupplemental: true,
      effectiveDate: "2024-01-01",
      expirationDate: "2025-01-01",
      sourcePriority: 500,
    },
    {
      id: "future-fee",
      nodeId: "future-fee",
      title: "Future pet fee",
      text: "The future pet fee will be $77.00.",
      isSupplemental: true,
      effectiveDate: "2099-01-01",
      sourcePriority: 500,
    },
  ],
};
const currentResults = searchRulesIndex(lifecycleIndex, "pet fee", 5);
assert.deepEqual(currentResults.map((result) => result.id), ["current-fee"]);
const historicalResults = searchRulesIndex(lifecycleIndex, "2024 pet fee", 5);
assert.ok(historicalResults.some((result) => result.id === "expired-fee"));

console.log("Source-derived rules fact checks passed.");

const assert = require("node:assert/strict");
const {
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
    text: "The current monthly residential service fee is $61.75, effective January 1, 2027.",
    excerpt: "Current fee schedule.",
  },
];
const changed = sourceDerivedAnswerParts("What is the monthly residential service fee?", changedSource);
assert.equal(changed.available, true);
assert.match(changed.sources[0].excerpt, /\$61\.75/);
assert.match(changed.sources[0].excerpt, /January 1, 2027/i);
assert.doesNotMatch(changed.answer, /\$50\.20/);

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

console.log("Source-derived rules fact checks passed.");

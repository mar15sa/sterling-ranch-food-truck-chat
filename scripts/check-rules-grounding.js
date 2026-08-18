const assert = require("node:assert/strict");

const { claimPolarityIssues, groundednessIssues } = require("../lib/rules-grounding");
const { currentSourceConflicts } = require("../lib/rules-assistant");

function source(text) {
  return [{ title: "Official test section", text, excerpt: text }];
}

const cases = [
  {
    name: "allowed reversed to prohibited",
    answer: "Short answer: Gemstone and Jellyfish lighting systems are not allowed.",
    sources: source("Gemstone and Jellyfish systems are the approved systems."),
  },
  {
    name: "prohibited reversed to allowed",
    answer: "Short answer: Backyard poultry is allowed.",
    sources: source("No livestock, fowl, or poultry shall be kept."),
  },
  {
    name: "approval requirement removed",
    answer: "Short answer: A car cover does not require DRC approval.",
    sources: source("Car covers require DRC approval."),
  },
  {
    name: "approval invented",
    answer: "Short answer: Rear ornaments require DRC approval.",
    sources: source("Rear yard DRC approval is not required for ornaments three feet tall or less."),
  },
  {
    name: "required changed to optional",
    answer: "Short answer: You may choose whether to replace the dead tree.",
    sources: source("Dead trees must be replaced."),
  },
  {
    name: "exception omitted",
    answer: "Short answer: Aboveground pools are prohibited.",
    sources: source("Aboveground pools are prohibited except for a small splash pool under the stated limits."),
  },
];

for (const testCase of cases) {
  const issues = claimPolarityIssues(testCase.answer, testCase.sources);
  assert.ok(issues.length, `${testCase.name} was not rejected`);
}

assert.deepEqual(
  claimPolarityIssues(
    "Short answer: Gemstone and Jellyfish are approved systems, but DRC approval is required.",
    source("Gemstone and Jellyfish systems are the approved systems. Installation requires DRC approval.")
  ),
  []
);

assert.deepEqual(
  claimPolarityIssues(
    "Short answer: Aboveground pools are prohibited, except for a small splash pool under the stated limits.",
    source("Aboveground pools are prohibited except for a small splash pool under the stated limits.")
  ),
  []
);

assert.deepEqual(
  groundednessIssues("Short answer: The calculated subtotal is $140.00.", [
    {
      title: "Official test section",
      text: "The listed charges are $50.00 and $90.00.",
      derivedFacts: ["Calculated subtotal: $140.00."],
    },
  ]),
  [],
  "A controlled, source-derived calculation should be grounded."
);
assert.ok(
  groundednessIssues("Short answer: The calculated subtotal is $999.00.", [
    {
      title: "Official test section",
      text: "The listed charges are $50.00 and $90.00.",
      derivedFacts: ["Calculated subtotal: $140.00."],
    },
  ]).some((issue) => /999/.test(issue)),
  "An amount outside the source and controlled calculations must still be rejected."
);

const conflictingSources = currentSourceConflicts([
  {
    title: "Current policy A",
    sourceUrl: "https://example.test/a",
    isSupplemental: true,
    effectiveDate: "2026-01-01",
    replacesSections: ["13-179"],
  },
  {
    title: "Current policy B",
    sourceUrl: "https://example.test/b",
    isSupplemental: true,
    effectiveDate: "2026-02-01",
    replacesSections: ["13-179"],
  },
]);
assert.equal(conflictingSources.length, 1, "two current replacements should fail closed");
assert.deepEqual(
  currentSourceConflicts([
    {
      title: "Old policy",
      sourceUrl: "https://example.test/old",
      isSupplemental: true,
      effectiveDate: "2025-01-01",
      supersededBy: "Current policy",
      replacesSections: ["13-179"],
    },
    {
      title: "Current policy",
      sourceUrl: "https://example.test/current",
      isSupplemental: true,
      effectiveDate: "2026-01-01",
      replacesSections: ["13-179"],
    },
  ]),
  [],
  "a superseded replacement should not conflict with the current one"
);

console.log(`Rules contradiction checks passed for ${cases.length} deliberate reversals, 2 supported controls, and source-conflict safeguards.`);

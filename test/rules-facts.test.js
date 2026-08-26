const test = require("node:test");
const assert = require("node:assert/strict");

const { extractStructuredFacts } = require("../lib/rules-facts");
const { buildRulesFactCatalog } = require("../scripts/build-rules-fact-catalog");

test("changing facts carry normalized values, stable keys, scope, lifecycle dates, and source identity", () => {
  const facts = extractStructuredFacts(
    "The monthly charge is $51.25 effective January 1, 2027 and the limit is 30 days.",
    {
      id: "current-fee-rule",
      title: "Current fee rule",
      chapter: "Chapter 13",
      effectiveDate: "2027-01-01",
      expirationDate: "2027-12-31",
      sourceUrl: "https://example.test/current-fee-rule",
      sourceTextHash: "abc123",
    }
  );
  const money = facts.find((fact) => fact.kind === "money");
  assert.deepEqual(money.normalizedValue, { amount: 51.25, currency: "USD" });
  assert.match(money.factKey, /^current-fee-rule:money:/);
  assert.equal(money.scope, "Chapter 13 > Current fee rule");
  assert.equal(money.effectiveDate, "2027-01-01");
  assert.equal(money.expirationDate, "2027-12-31");
  assert.equal(money.sourceHash, "abc123");
});

test("the generated catalog covers both the rulebook and adopted supplements", () => {
  const catalog = buildRulesFactCatalog();
  assert.equal(catalog.schemaVersion, 1);
  assert.ok(catalog.factCount > 500);
  assert.equal(catalog.factCount, catalog.facts.length);
  assert.match(catalog.sourceFiles.rulesIndex.sha256, /^[a-f0-9]{64}$/);
  assert.match(catalog.sourceFiles.supplements.sha256, /^[a-f0-9]{64}$/);
  assert.ok(catalog.facts.some((fact) => fact.kind === "money" && fact.sourceUrl));
  assert.ok(catalog.facts.some((fact) => fact.kind === "date"));
  assert.ok(catalog.facts.some((fact) => fact.kind === "duration"));
});

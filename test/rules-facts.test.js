const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

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

test("catalog freshness ignores operating-system line endings", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rules-facts-"));
  const lfIndex = path.join(tempDir, "index-lf.json");
  const crlfIndex = path.join(tempDir, "index-crlf.json");
  const supplements = path.join(tempDir, "supplements.json");
  const indexJson = JSON.stringify({ documents: [{ id: "rule-1", text: "The limit is 3 days." }] }, null, 2);

  try {
    fs.writeFileSync(lfIndex, `${indexJson}\n`);
    fs.writeFileSync(crlfIndex, `${indexJson.replace(/\n/g, "\r\n")}\r\n`);
    fs.writeFileSync(supplements, "[]\n");

    const lfCatalog = buildRulesFactCatalog({ indexPath: lfIndex, supplementsPath: supplements });
    const crlfCatalog = buildRulesFactCatalog({ indexPath: crlfIndex, supplementsPath: supplements });

    assert.equal(lfCatalog.sourceFiles.rulesIndex.sha256, crlfCatalog.sourceFiles.rulesIndex.sha256);
    assert.deepEqual(lfCatalog.facts, crlfCatalog.facts);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

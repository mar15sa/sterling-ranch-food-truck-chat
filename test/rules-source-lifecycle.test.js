const test = require("node:test");
const assert = require("node:assert/strict");

const {
  documentEligibleForQuery,
  extractQueryYears,
  sourceLifecycleStatus,
} = require("../lib/rules-source-lifecycle");

test("source lifecycle keeps current rules primary and allows historical or future rules only when their year is requested", () => {
  const now = Date.parse("2026-08-26T12:00:00Z");
  assert.equal(sourceLifecycleStatus({ effectiveDate: "2026-01-01" }, now), "current");
  assert.equal(sourceLifecycleStatus({ effectiveDate: "2027-01-01" }, now), "future");
  assert.equal(sourceLifecycleStatus({ expirationDate: "2026-01-01" }, now), "expired");
  assert.equal(sourceLifecycleStatus({ supersededBy: "new-rule" }, now), "superseded");
  assert.equal(documentEligibleForQuery({ effectiveDate: "2027-01-01" }, "What is the current fee?", now), false);
  assert.equal(documentEligibleForQuery({ effectiveDate: "2027-01-01" }, "What is the 2027 fee?", now), true);
  assert.deepEqual(extractQueryYears("Compare 2024 with 2026"), [2024, 2026]);
});

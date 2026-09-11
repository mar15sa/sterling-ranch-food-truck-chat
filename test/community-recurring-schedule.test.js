const test = require("node:test");
const assert = require("node:assert/strict");
const { capturedProjectionCoversPastDate, recurringSeasonCoverage } = require("../lib/community-recurring-schedule");

const SOURCE_TEXT = "The facility is open Memorial Day weekend through Labor Day. Monday-Friday: 5:00 am - 9:00 am and 9:00 am - 8:45 pm.";

test("a source-defined recurring season includes its holiday endpoint and excludes the next day", () => {
  const endpoint = recurringSeasonCoverage(SOURCE_TEXT, "2026-09-07");
  assert.equal(endpoint.declared, true);
  assert.equal(endpoint.covers, true);
  assert.equal(endpoint.start, "2026-05-23");
  assert.equal(endpoint.end, "2026-09-07");
  assert.equal(recurringSeasonCoverage(SOURCE_TEXT, "2026-09-08").covers, false);
});

test("expired current evidence can support a past date only when captured on or after that date", () => {
  const source = { canonicalScopedProjection: true, checkedAt: "2026-09-09T21:44:12Z" };
  assert.equal(capturedProjectionCoversPastDate(source, "2026-09-07", "2026-09-11T12:00:00Z", "America/Denver"), true);
  assert.equal(capturedProjectionCoversPastDate(source, "2026-09-10", "2026-09-11T12:00:00Z", "America/Denver"), false);
  assert.equal(capturedProjectionCoversPastDate({ ...source, canonicalScopedProjection: false }, "2026-09-07", "2026-09-11T12:00:00Z", "America/Denver"), false);
});

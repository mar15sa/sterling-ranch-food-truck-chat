const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { checkpointDueAt, questionSetForCheck } = require("../scripts/check-community-application-soak");

test("accelerated soak checkpoints stay anchored to the trial start", () => {
  const startedAt = "2026-09-07T00:00:00.000Z";
  const delayedFirstCheckEnd = "2026-09-07T00:12:00.000Z";
  const intervalMs = 15 * 60 * 1000;
  assert.equal(
    checkpointDueAt({ number: 2, startedAt, lastCheckedAt: delayedFirstCheckEnd, intervalMs, accelerated: true }),
    Date.parse("2026-09-07T00:15:00.000Z")
  );
  assert.equal(
    checkpointDueAt({ number: 2, startedAt, lastCheckedAt: delayedFirstCheckEnd, intervalMs, accelerated: false }),
    Date.parse("2026-09-07T00:27:00.000Z")
  );
});

test("accelerated soak runs and rotates a normal answer set at every checkpoint", () => {
  assert.deepEqual(questionSetForCheck(1, true).map((item) => item.id), ["rules-permission", "facility-cost-book", "forms-application", "security-injection"]);
  assert.deepEqual(questionSetForCheck(2, true).map((item) => item.id), ["service-payment", "service-contact", "service-recycling", "status-pool"]);
  assert.deepEqual(questionSetForCheck(5, true).map((item) => item.id), ["rules-permission", "facility-cost-book", "forms-application", "security-injection"]);
});

test("accelerated workflow preserves soak failures and rejects incomplete evidence", () => {
  const workflow = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "community-accelerated-release-check.yml"), "utf8");
  assert.match(workflow, /set -o pipefail/);
  assert.match(workflow, /--accelerated --duration-hours 1 --checks 5 --interval-ms 900000/);
  assert.match(workflow, /report\.result !== "passed"/);
  assert.match(workflow, /report\.completedChecks !== 5/);
});

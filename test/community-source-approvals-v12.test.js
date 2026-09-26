const test = require("node:test");
const assert = require("node:assert/strict");
const approvals = require("../data/community-source-approvals-v12.json");
const index = require("../data/community-index.json");
const { buildLedger, versionKey } = require("../scripts/build-canonical-source-ledger");

const decision = approvals.decisions[0];
const version = decision.versions[0];

test("CAB News Flash approval remains bound to the exact reviewed version", () => {
  const record = buildLedger().records.find((item) => item.key === versionKey(version));
  assert.ok(record);
  assert.ok(record.approvals.some((item) => item.decisionId === decision.decisionId));
});

test("CAB News Flash remains action-only", () => {
  const source = index.sources.find((item) => item.id === `approved-${decision.decisionId}`);
  assert.ok(source);
  assert.equal(source.contentHash, version.contentHash);
  assert.deepEqual(source.facts, []);
  assert.deepEqual(source.actions.map((action) => [action.label, action.url]), [
    ["Read current CAB news", "https://sterlingranchcab.com/m/newsflash"],
    ["Subscribe to CAB news", "https://sterlingranchcab.com/list.aspx?Mode=Subscribe#newsFlash"],
  ]);
  assert.ok(source.actions.every((action) => action.sourceVersion === version.contentHash));
  assert.equal(source.text, "Read current CAB news Subscribe to CAB news");
  assert.doesNotMatch(source.text, /Roundup|Ranch Life|weekly updates/i);
});

test("CAB News Flash keeps newsletter claims withheld", () => {
  assert.equal(decision.facts.length, 0);
  assert.deepEqual(decision.withheldClaims, [
    "newsletter-contents",
    "current-events",
    "news-posting-date-as-event-date",
  ]);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const approvals = require("../data/community-source-approvals-v11.json");
const index = require("../data/community-index.json");
const { buildLedger, versionKey } = require("../scripts/build-canonical-source-ledger");

test("September 16 water and park decisions remain bound to their exact approved versions", () => {
  const ledger = buildLedger();
  for (const decision of approvals.decisions) {
    const version = decision.versions[0];
    const record = ledger.records.find((item) => item.key === versionKey(version));
    assert.ok(record, decision.decisionId);
    assert.ok(record.approvals.some((item) => item.decisionId === decision.decisionId));
  }
});

test("landscape establishment guidance keeps its narrow 45-day billing boundary", () => {
  const source = index.sources.find((item) => item.id === "approved-owner-source-approval-20260916-979bf37fb8d2");
  assert.ok(source);
  assert.match(source.text, /45 days/i);
  assert.match(source.text, /first tier fee rate/i);
  assert.match(source.text, /will not count against the water budget/i);
  assert.doesNotMatch(source.text, /water is free/i);
});

test("park-pass reimbursement exposes the reviewed form and receipt instruction only", () => {
  const source = index.sources.find((item) => item.id === "approved-owner-source-approval-20260916-fb12d4cd6a4c");
  assert.ok(source);
  assert.match(source.text, /vehicle registration receipt/i);
  assert.equal(source.actions[0].url, "https://sterlingranchcab.com/FormCenter/Parks-Passes-9/Park-Pass-Reimbursement-Form-62");
  assert.doesNotMatch(source.text, /reimbursement amount|processing time|deadline/i);
});

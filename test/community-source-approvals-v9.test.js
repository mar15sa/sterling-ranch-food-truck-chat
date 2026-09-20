const test = require('node:test');
const assert = require('node:assert/strict');
const approvals = require('../data/community-source-approvals-v9.json');
const index = require('../data/community-index.json');
const profile = require('../data/communities/sterling-ranch.json');
const { buildLedger, versionKey } = require('../scripts/build-canonical-source-ledger');

test('September 19 owner decisions are bound to the exact current official versions', () => {
  const ledger = buildLedger();
  for (const decision of approvals.decisions) {
    const version = decision.versions[0];
    const record = ledger.records.find((item) => item.key === versionKey(version));
    assert.ok(record, decision.decisionId);
    assert.ok(record.approvals.some((item) => item.decisionId === decision.decisionId));
  }
});

test('current approved trash guidance includes Parkvale without broadening unrelated claims', () => {
  const source = index.sources.find((item) => item.id === 'approved-trash-recurring-service');
  assert.ok(source);
  const recurring = source.facts.find((fact) => fact.approvalClaim === 'trash-recurring-service-guidance');
  assert.match(recurring.value, /Prospect and Parkvale/);
  assert.doesNotMatch(source.text, /bulk|fee|cart delivery/i);
  const waste = profile.connectors.find((connector) => connector.id === 'waste-schedule');
  assert.ok(waste.adapter.wasteSchedule.serviceAreas.some((area) => area.label === 'Parkvale' && area.serviceWeekday === 4));
});

test('current architecture approval retains the team purpose and retires the removed email', () => {
  const source = index.sources.find((item) => item.id === 'approved-complete-cab-review-20260914-dc4ed3f4a876');
  assert.ok(source);
  assert.match(source.text, /team is here to help residents navigate the requirements/i);
  assert.doesNotMatch(source.text, /info@sterlingranchcab\.com/i);
  assert.equal(source.facts.length, 1);
});

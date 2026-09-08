const test = require('node:test');
const assert = require('node:assert/strict');
const { proactiveCommunityAnswer } = require('../lib/community-proactive');
const now = new Date('2026-09-06T21:00:00Z');
const question = 'Is Labor Day a holiday for trash pickup?';
const source = { id: 'trash', contentHash: 'v1', reviewStatus: 'approved', lifecycle: 'current',
  sourceUrl: 'https://sterlingranchcab.com/247/Trash-Recycling', staleAfter: '2027-01-01',
  text: 'Holiday Schedule Trash pickup will be delayed by one day for the following holidays: Labor Day Thanksgiving Christmas Opt-In for Service Notifications' };
const fact = { sourceId: 'trash', sourceVersion: 'v1', reviewStatus: 'approved', lifecycle: 'current',
  staleAfter: '2027-01-01', claimKey: 'trash:restriction:delay', facet: 'restriction', normalizedValue: 1 };
function ask(facts = [fact], overrides = {}) {
  return proactiveCommunityAnswer(question, { now, index: { sources: [source], factLedger: facts,
    truthStatus: { migrationMode: 'reviewed' }, ...overrides } });
}
test('proactive source prose cannot bypass pending, disputed, future, retired or changed-version fact review', () => {
  assert.ok(ask());
  for (const patch of [{ reviewStatus: 'candidate' }, { reviewStatus: 'escalated' }, { effectiveFrom: '2028-01-01' },
    { effectiveTo: '2025-01-01' }, { staleAfter: '2020-01-01' }, { supersededBy: 'new' }]) {
    assert.equal(ask([{ ...fact, ...patch }]), null, JSON.stringify(patch));
  }
  assert.equal(ask([fact, { ...fact, normalizedValue: 2 }]), null);
  assert.equal(ask([], { sources: [{ ...source, reviewStatus: 'candidate', contentHash: 'new' }] }), null);
  assert.equal(ask([{ ...fact, sourceVersion: 'old' }], { sources: [{ ...source, reviewStatus: undefined }] }), null);
  assert.equal(ask([{ ...fact, sourceVersion: 'old' }]), null);
  assert.equal(ask([], { sources: [{ ...source, facts: [{ type: 'limit', value: '1 day' }] }] }), null);
  assert.equal(ask([fact], { sources: [{ ...source, effectiveFrom: '2028-01-01' }] }), null);
});

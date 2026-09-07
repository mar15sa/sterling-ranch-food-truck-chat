const test = require('node:test');
const assert = require('node:assert/strict');
const { extractFacts } = require('../lib/community-ingest');
const { buildFactLedger, resolveFactLedger } = require('../lib/community-truth');

test('written capital amounts retain decimals, scale and supporting explanation', () => {
  const facts = extractFacts('Debt service: Approximately $1.1 million is needed to fund capital expenditures. A separate project costs $17.1 million.').filter(f => f.type === 'money');
  assert.deepEqual(facts.map(f => [f.value, f.normalizedValue]), [['$1.1 million', 1100000], ['$17.1 million', 17100000]]);
  assert.match(facts[0].context, /fund capital expenditures/);
});

test('fractional rates retain the amount separately from a numeric pricing unit', () => {
  const facts = extractFacts('Rate: $0.125 per 1,000 gallons. Monthly fee: $9.40/month.').filter(f => f.type === 'money');
  assert.deepEqual(facts.map(f => [f.normalizedValue, f.unit]), [[0.125, '1,000 gallons'], [9.4, 'month']]);
});

test('equivalent scaled amounts agree while a changed amount remains a conflict', () => {
  const source = { id: 'capital', title: 'Capital cost', sourceUrl: 'https://example.gov/capital', contentHash: 'v1', facts:
    ['$1.1 million', '$1,100,000', '$1.2 million'].map(value => ({ type: 'money', value, normalizedValue: 1, scopeKey: 'capital-cost' })) };
  const ledger = buildFactLedger({ communityId: 'alpha', sources: [source] }, { trusted: true });
  assert.deepEqual(ledger.map(f => f.normalizedValue), [1100000, 1100000, 1200000]);
  const conflicts = resolveFactLedger(ledger, {}).unresolvedSensitive;
  assert.equal(conflicts.length, 1);
  assert.equal(resolveFactLedger(ledger.slice(0, 2), {}).unresolvedSensitive.length, 0);
});

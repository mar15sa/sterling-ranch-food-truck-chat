const test = require('node:test');
const assert = require('node:assert/strict');
const { scopeFacilityFees } = require('../lib/community-facility-fees');
const { buildFactLedger, resolveFactLedger } = require('../lib/community-truth');
const { extractFacts } = require('../lib/community-ingest');
const profile = require('../data/communities/sterling-ranch.json');
function source(id, url, text) { return { id, sourceUrl: url, text, facts: extractFacts(text), contentHash: id, reviewStatus: 'candidate' }; }

test('facility sections keep hourly prices and deposits distinct across chunk boundaries', () => {
  const url = 'https://sterlingranchcab.com/188/Indoor-Facilities';
  const originals = [source('one', url, 'Great Hall The clubhouse is available. Resident Hourly Fee: $100.00 per hour. Resident Refundable Security deposit: $100.00 Outdoor Pavilions The clubhouse has outdoor spaces. Resident Hourly Fee: $25.00 per hour. Resident Refundable Security deposit: $50.00 Sterling Center The Sterling Center exhibit hall is available.'),
    source('two', url, 'Resident Hourly Fee: $350.00 Resident Refundable Security deposit: $1000.00')];
  const result = scopeFacilityFees(originals);
  const facts = result.flatMap(item => item.facts).filter(fact => fact.subjectKey);
  assert.equal(facts.length, 6);
  assert.deepEqual(facts.filter(fact => fact.subjectKey === 'sterling-center-exhibit-hall').map(fact => fact.normalizedValue), [350, 1000]);
  assert.deepEqual(result.map(item => item.text), originals.map(item => item.text));
  assert.ok(facts.every(fact => fact.reviewStatus === 'candidate'));
});

test('dollarless labeled deposit exposes the real same-facility contradiction', () => {
  const originals = [source('old', 'https://sterlingranchcab.com/188/Indoor-Facilities', 'Great Hall The clubhouse is available. Resident Refundable Security deposit: $100.00'),
    source('new', 'https://sterlingranchcab.com/269/Rent-the-Facility', 'Great Hall The Overlook Clubhouse is available. Hourly Pricing $100.00 per hour. A refundable security deposit of 250.00 will also be due.')];
  const sources = scopeFacilityFees(originals);
  const ledger = buildFactLedger({ communityId: 'sterling-ranch', sources }, { requirePriorReview: true });
  const conflicts = resolveFactLedger(ledger, profile).unresolvedSensitive;
  assert.equal(conflicts.length, 1);
  assert.match(conflicts[0].claimKey, /overlook-great-hall:fee:security-deposit$/);
  assert.deepEqual(conflicts[0].entries.map(item => item.normalizedValue).sort((a,b) => a-b), [100,250]);
});

test('unrelated pages and unlabeled numbers do not acquire rental fees', () => {
  const unrelated = source('x', 'https://example.gov/188/Indoor-Facilities', 'Great Hall The clubhouse has a security deposit of 250.00');
  assert.deepEqual(scopeFacilityFees([unrelated]), [unrelated]);
  const count = source('y', 'https://sterlingranchcab.com/188/Indoor-Facilities', 'Great Hall The clubhouse has 250 guests and a 2026 event.');
  assert.deepEqual(scopeFacilityFees([count]), [count]);
});

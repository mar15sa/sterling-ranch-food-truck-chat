const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const decisions = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'data', 'community-owner-decisions-batch-1-2026-09-08.json'),
  'utf8',
));

function decision(id) {
  return decisions.decisions.find((entry) => entry.id === id);
}

test('Batch 1 owner decisions retain each hard approval boundary', () => {
  assert.equal(decisions.decisions.length, 5);
  assert.equal(decision('water-rates-2026').status, 'approved-with-boundaries');
  assert.match(decision('water-rates-2026').historicalBoundary, /explicitly asks about 2025/i);
  assert.deepEqual(decision('tap-facility-2026').withheldScope, [
    'commercial', 'school', 'irrigation', 'master-meter', 'large-meter', 'pool',
    'clipped-footnote case', 'incomplete or unlabelled row',
  ]);
  assert.deepEqual(decision('cab-fees-effective-date').withheldScope, ['standalone effective-date claim']);
  assert.deepEqual(decision('monthly-fee-overview').withheldScope, ['controlling fee evidence', 'fee amounts']);
  assert.match(decision('delinquency-policy').freshnessBoundary, /newer amendment/i);
});

test('rules supplements reference only the four owner decisions they govern', () => {
  const supplements = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'data', 'rules-supplements.json'),
    'utf8',
  ));
  const reviewed = supplements.filter((entry) => entry.ownerReview);
  assert.deepEqual(reviewed.map((entry) => entry.ownerReview.decisionId).sort(), [
    'cab-fees-effective-date', 'delinquency-policy', 'tap-facility-2026', 'water-rates-2026',
  ]);
  assert.ok(reviewed.every((entry) => entry.ownerReview.withheldScope.length > 0));
});

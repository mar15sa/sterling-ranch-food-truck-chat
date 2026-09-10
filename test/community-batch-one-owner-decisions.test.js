const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { answerRulesQuestion, loadRulesIndex, sourceDerivedAnswerParts } = require('../lib/rules-assistant');

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

test('reviewed supplement sections expose only the approved evidence', async () => {
  const index = await loadRulesIndex();
  const generatedSections = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'rules-supplement-sections.json'), 'utf8'));
  const factCatalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'rules-fact-catalog.json'), 'utf8'));
  const water = index.documents.filter((entry) => entry.parentSupplementId === 'supplement-water-sewer-stormwater-rates-2026::1');
  const tap = index.documents.filter((entry) => entry.parentSupplementId === 'supplement-tap-facility-fees-2026::1');
  const cab = index.documents.filter((entry) => entry.parentSupplementId === 'supplement-cab-service-fees-2026::1');
  const delinquency = index.documents.filter((entry) => entry.parentSupplementId === 'supplement-delinquent-fee-collection-2025-06-20::1');

  assert.ok(water.length && tap.length && cab.length && delinquency.length);
  for (const entry of [...water, ...tap, ...cab, ...delinquency]) assert.equal(entry.ownerReviewApplied, true);
  assert.match(water[0].text, /\$50\.20/);
  assert.doesNotMatch(water.map((entry) => entry.text).join(' '), /master[ -]?meter|nonresidential|construction water|public school|irrigation/i);
  assert.match(tap[0].text, /single-family detached \$27,430/i);
  assert.doesNotMatch(tap.map((entry) => entry.text).join(' '), /commercial|school|irrigation|master[ -]?meter|large[ -]?meter|pool/i);
  assert.match(cab[0].text, /trash charge is \$14\.17/i);
  assert.doesNotMatch(cab.map((entry) => entry.text).join(' '), /effective|take effect/i);
  assert.match(delinquency[0].text, /this resolution's fee schedule/i);
  assert.doesNotMatch(delinquency.map((entry) => entry.text).join(' '), /no newer amendment/i);

  const generatedReviewed = generatedSections.filter((entry) => [
    'supplement-water-sewer-stormwater-rates-2026::1',
    'supplement-tap-facility-fees-2026::1',
    'supplement-cab-service-fees-2026::1',
  ].includes(entry.parentSupplementId));
  assert.ok(generatedReviewed.every((entry) => entry.ownerReviewApplied));
  assert.doesNotMatch(generatedReviewed.map((entry) => entry.text).join(' '), /master[ -]?meter|commercial|nonresidential|irrigation|public school|pool/i);
  const reviewedFacts = factCatalog.facts.filter((fact) => /supplement-(?:water-sewer-stormwater-rates|tap-facility-fees|cab-service-fees)-2026/.test(fact.sourceId || ''));
  assert.doesNotMatch(JSON.stringify(reviewedFacts), /master[ -]?meter|commercial|nonresidential|irrigation|public school|pool/i);
});

test('answers allow approved fee rows and withhold unapproved scopes', async () => {
  const options = { searchMode: 'legacy', llmMode: 'off' };
  const residentialWater = await answerRulesQuestion('What is the residential water base rate?', options);
  assert.match(residentialWater.answer, /\$50\.20/);

  const commercialWater = await answerRulesQuestion('What is the nonresidential water rate?', options);
  assert.equal(commercialWater.answerMode, 'owner-review-scope-unavailable');
  assert.doesNotMatch(commercialWater.answer, /\$\d/);

  const commercialTap = await answerRulesQuestion('What is the commercial tap fee?', options);
  assert.equal(commercialTap.answerMode, 'owner-review-scope-unavailable');
  assert.doesNotMatch(commercialTap.answer, /\$\d/);

  const cabDate = await answerRulesQuestion('When do the 2026 CAB fees take effect?', options);
  assert.equal(cabDate.answerMode, 'owner-review-scope-unavailable');
  assert.match(cabDate.answer, /can.t verify a standalone effective date/i);

  const poolRental = await answerRulesQuestion('What is the pool rental fee?', options);
  assert.notEqual(poolRental.answerMode, 'owner-review-scope-unavailable');
  assert.match(poolRental.answer, /Great Hall|Pavilions/i);
  assert.ok(poolRental.sources.some((source) => /^Sec\. 13-2\. - Community facility use and rental fees/i.test(source.title)));

  const unpaidWater = await answerRulesQuestion('What happens if my water bill is unpaid?', options);
  assert.match(unpaidWater.answer, /Disconnect Notice|last Wednesday/i);
  assert.match(unpaidWater.sources[0].text, /this resolution's fee schedule/i);
  assert.doesNotMatch(unpaidWater.answer, /no newer amendment/i);
});

test('approved owner-reviewed evidence renders the allowed water and delinquency details', async () => {
  const options = { searchMode: 'legacy', llmMode: 'off' };
  const water = await answerRulesQuestion('What are water rates?', options);
  assert.match(water.answer, /2026/i);
  assert.match(water.answer, /\$50\.20/);
  assert.match(water.answer, /\$9\.70/);
  assert.doesNotMatch(water.answer, /master[ -]?meter|nonresidential|irrigation|construction water/i);

  const delinquency = await answerRulesQuestion('What happens if I do not pay my water bill?', options);
  assert.match(delinquency.answer, /three days/i);
  assert.match(delinquency.answer, /seven calendar days/i);
  assert.match(delinquency.answer, /last Wednesday/i);
  assert.doesNotMatch(delinquency.answer, /\bCAB\b/i);
  assert.doesNotMatch(delinquency.answer, /no newer amendment/i);
});

test('money and enforcement wording variants use the reviewed source projections', async () => {
  const options = { searchMode: 'legacy', llmMode: 'off' };
  const cases = [
    ['How much is stormwater each month for a townhome?', /\$17\.50/],
    ['What is the residential water base rate?', /\$50\.20/],
    ['What is the CAB trash charge?', /\$14\.17/],
    ['What is the facility fee for a single-family detached home?', /\$12,395/],
    ['What are utility tap fees?', /\$6,080[\s\S]*\$12,395/],
    ['When does a late fee start for an unpaid monthly bill?', /seven calendar days/i],
    ['What are the first three fine amounts for a continuing violation?', /\$100\.00.*\$250\.00.*\$500\.00/i],
  ];
  for (const [question, expected] of cases) {
    const result = await answerRulesQuestion(question, options);
    assert.match(result.answer, expected, question);
    assert.ok(result.answerMode.startsWith('source-derived'), question);
  }
});

test('a broad residential tap question combines only its approved tap and facility rows', async () => {
  const result = await answerRulesQuestion('What are utility tap fees?', { searchMode: 'legacy', llmMode: 'off' });
  assert.match(result.answer, /Residential stormwater tap is \$6,080 per unit/i);
  assert.match(result.answer, /Residential facilities fees: single-family detached and duplex \$12,395/i);
  assert.doesNotMatch(result.answer, /\$44\.95|\$12\.50|\$18\.80/);
  assert.deepEqual(result.sources.map((source) => source.ownerReview?.decisionId), ['tap-facility-2026']);
});

test('annual schedules and excluded tap rows stay withheld instead of borrowing a related amount', async () => {
  const options = { searchMode: 'legacy', llmMode: 'off' };
  for (const question of [
    'What were the 2025 residential water rates?',
    'What will 2027 residential water rates be?',
    'What is the commercial tap fee?',
    'What is the large-meter tap fee?',
    'What is the pool tap fee?',
  ]) {
    const result = await answerRulesQuestion(question, options);
    assert.equal(result.answerMode, 'owner-review-scope-unavailable', question);
    assert.doesNotMatch(result.answer, /\$\d/, question);
  }
});

test('the source-derived rate composer reads a second community’s reviewed schedule', () => {
  const result = sourceDerivedAnswerParts('What is the water rate?', [{
    title: '2029 water, sanitary sewer, and stormwater rates',
    text: 'Monthly Fee Residential Single Family Detached $62.75. Tier residential and non-residential Fee per 1,000 gallons Tier 1 $7.25.',
  }]);
  assert.equal(result.available, true);
  assert.match(result.answer, /2029/);
  assert.match(result.answer, /\$62\.75/);
  assert.match(result.answer, /\$7\.25/);
  assert.doesNotMatch(result.answer, /\$50\.20|\$9\.70/);
});

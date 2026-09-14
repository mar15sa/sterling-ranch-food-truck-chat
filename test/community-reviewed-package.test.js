const test = require('node:test');
const assert = require('node:assert/strict');
const { sourceHash } = require('../lib/community-approved-revalidation');
const { buildReviewedSources, createReviewPackage, validateReviewRecord } = require('../lib/community-reviewed-package');
const { emptyLedger, upsertObservation, applyExplicitDecision } = require('../lib/canonical-source-ledger');
const { canonicalProjectionEntries } = require('../lib/community-source-answerability');
const { searchCommunityIndex } = require('../lib/community-search');

const record = () => ({
  sourceUrl: 'https://alpha.gov/facility', title: 'Community facility', disposition: 'answer-evidence',
  reason: 'Current facility instructions confirmed against the official current directory.',
  checkedAt: '2026-09-14T00:00:00.000Z', fullText: 'Bring your own equipment. Old launch date: 2020.',
  contentHash: sourceHash('Bring your own equipment. Old launch date: 2020.'), hashScheme: 'page-text-v1',
  verification: { currentness: 'Linked from current official facility directory.', completeness: 'All main content and linked instructions reviewed.' },
  claims: [{ id: 'equipment', text: 'Bring your own equipment.', facet: 'information', type: 'information' }],
  actions: [{ label: 'Open facility', url: 'https://alpha.gov/facility', evidence: { label: 'Open facility', url: 'https://alpha.gov/facility', context: '' } }],
  withheldClaims: ['historical launch date'],
});

test('review package requires complete source proof and grounded claims', () => {
  assert.doesNotThrow(() => validateReviewRecord(record()));
  assert.throws(() => validateReviewRecord({ ...record(), contentHash: '0'.repeat(64) }), /version mismatch/);
  assert.throws(() => validateReviewRecord({ ...record(), verification: { completeness: 'Read full page' } }), /Incomplete review/);
  assert.throws(() => validateReviewRecord({ ...record(), claims: [{ id: 'invented', text: 'Free equipment is provided.', facet: 'information' }] }), /supporting quote/);
  assert.throws(() => validateReviewRecord({ ...record(), claims: [{ id: 'invented', text: 'Free equipment is provided.', supportingQuote: 'Bring your own equipment.', facet: 'information' }] }), /supporting quote/);
  assert.throws(() => validateReviewRecord({ ...record(), disposition: 'safe-link' }), /Link-only review contains facts/);
});

test('reviewed contacts become exact typed values with complete context and matching canonical approvals', () => {
  const fullText = 'Billing support: call 1-833-EXAMPLE or (833) 772-2240. Email Help@Alpha.gov. Historical contact: (303) 555-0199.';
  const context = 'Billing support: call 1-833-EXAMPLE or (833) 772-2240. Email Help@Alpha.gov.';
  const input = { ...record(), fullText, contentHash: sourceHash(fullText), actions: [],
    claims: [{ id: 'billing-help', text: context, type: 'contact', facet: 'contact', scopeKey: 'billing' }] };
  const data = createReviewPackage([input], { communityId: 'alpha', decidedAt: input.checkedAt, decisionId: 'review' });
  const [source] = buildReviewedSources(data);
  assert.deepEqual(source.facts.map(fact => [fact.type, fact.value]), [['phone', '(833) 772-2240'], ['email', 'Help@Alpha.gov']]);
  assert.ok(source.facts.every(fact => fact.context === context && fact.supportingQuote === context));
  assert.ok(source.facts.every(fact => fact.facet === 'contact'));
  assert.doesNotMatch(source.text, /Historical|303|0199/);
  assert.deepEqual(data.decisions[0].approvedClaims, source.facts.map(fact => fact.approvalClaim));
  const { normalizeFactValue } = require('../lib/community-truth');
  assert.deepEqual(source.facts.map(normalizeFactValue), ['8337722240', 'help@alpha.gov']);
  const ledger = emptyLedger();
  const decision = data.decisions[0];
  upsertObservation(ledger, { ...decision.versions[0], communityId: 'alpha', checkedAt: input.checkedAt });
  applyExplicitDecision(ledger, { ...decision, ...decision.versions[0], communityId: 'alpha', decision: 'approve-proposed', decidedAt: data.decidedAt });
  assert.deepEqual(canonicalProjectionEntries(source, { communityId: 'alpha', canonicalSourceLedger: ledger }).map(entry => entry.factType), ['phone', 'email']);
  const result = searchCommunityIndex('billing phone email', {
    intent: 'services', interpretation: { requestedDetails: ['contact'] }, now: '2026-09-14T01:00:00.000Z',
    index: { communityId: 'alpha', canonicalSourceLedger: ledger, factLedger: [], sources: [{ ...source, staleAfter: '2099-01-01T00:00:00Z' }] },
  });
  assert.equal(result.sources.length, 1);
  assert.deepEqual(result.sources[0].facts.map(fact => fact.type), ['phone', 'email']);
});

test('method and process vocabulary use runtime facets and supported action types', () => {
  const fullText = 'Multiply the area by the stated factor. Open the Schedule tab. Read the annual report.';
  const input = { ...record(), fullText, contentHash: sourceHash(fullText),
    claims: [
      { id: 'method', text: 'Multiply the area by the stated factor.', type: 'process-step', facet: 'calculation-method' },
      { id: 'step', text: 'Open the Schedule tab.', type: 'process', facet: 'process' },
      { id: 'report', text: 'Read the annual report.', type: 'informational', facet: 'report-scope' },
    ],
    actions: [
      { label: 'Read guide', url: 'https://alpha.gov/DocumentCenter/View/10/Guide', actionType: 'official-resource', evidence: { label: 'Guide', url: 'https://alpha.gov/DocumentCenter/View/10/Guide' } },
      { label: 'Open support ticket', url: 'https://support.alpha.gov/ticket', actionType: 'official-resource', evidence: { label: 'Ticket', url: 'https://support.alpha.gov/ticket' } },
      { label: 'Open equipment page', url: 'https://alpha.gov/equipment', actionType: 'official-resource', evidence: { label: 'Equipment', url: 'https://alpha.gov/equipment' } },
    ],
  };
  const data = createReviewPackage([input], { communityId: 'alpha', decidedAt: input.checkedAt, decisionId: 'review' });
  const [source] = buildReviewedSources(data);
  assert.deepEqual(source.facts.map(fact => [fact.type, fact.facet]), [['information', 'method'], ['information', 'information'], ['information', 'information']]);
  assert.deepEqual(source.actions.map(action => action.actionType), ['download', 'form', 'information']);
  assert.deepEqual(data.decisions[0].approvedActions.map(action => action.display.actionType), ['download', 'form', 'information']);
  assert.deepEqual(new Set(data.decisions[0].approvedClaims), new Set([...source.facts, ...source.actions].map(item => item.approvalClaim)));
  const ledger = emptyLedger();
  const decision = data.decisions[0];
  upsertObservation(ledger, { ...decision.versions[0], communityId: 'alpha', checkedAt: input.checkedAt });
  applyExplicitDecision(ledger, { ...decision, ...decision.versions[0], communityId: 'alpha', decision: 'approve-proposed', decidedAt: data.decidedAt });
  const result = searchCommunityIndex('calculate area factor', {
    intent: 'services', interpretation: { requestedDetails: ['methods'] }, now: '2026-09-14T01:00:00.000Z',
    index: { communityId: 'alpha', canonicalSourceLedger: ledger, factLedger: [], sources: [{ ...source, staleAfter: '2099-01-01T00:00:00Z' }] },
  });
  assert.equal(result.sources.length, 1);
  assert.deepEqual(result.sources[0].facts.map(fact => fact.facet), ['method']);
});

test('only reviewed claims enter projections; changed versions and other communities get no approval', () => {
  const data = createReviewPackage([record()], { communityId: 'alpha', decidedAt: '2026-09-14T01:00:00.000Z', decisionId: 'review' });
  const [source] = buildReviewedSources(data);
  assert.doesNotMatch(source.text, /2020|launch/);
  assert.match(source.facts[0].context, /Bring your own equipment/);
  assert.equal(source.staleAfter, record().checkedAt, 'new projections must pass exact revalidation before use');
  const ledger = emptyLedger();
  const decision = data.decisions[0];
  upsertObservation(ledger, { ...decision.versions[0], communityId: 'alpha', checkedAt: record().checkedAt });
  applyExplicitDecision(ledger, { ...decision, ...decision.versions[0], communityId: 'alpha', decision: 'approve-proposed', decidedAt: data.decidedAt });
  const index = { communityId: 'alpha', canonicalSourceLedger: ledger };
  assert.equal(canonicalProjectionEntries(source, index).length, 2);
  assert.equal(canonicalProjectionEntries({ ...source, contentHash: 'f'.repeat(64) }, index).length, 0);
  assert.equal(canonicalProjectionEntries(source, { ...index, communityId: 'bravo' }).length, 0);
});

test('exclusions and navigation stay out of factual evidence', () => {
  const excluded = { ...record(), disposition: 'excluded', claims: [], actions: [], reason: 'Replaced by a current official page.' };
  const link = { ...record(), disposition: 'safe-link', claims: [] };
  const data = createReviewPackage([excluded], { communityId: 'alpha', decidedAt: record().checkedAt, decisionId: 'review' });
  assert.deepEqual(buildReviewedSources(data), []);
  const links = createReviewPackage([link], { communityId: 'alpha', decidedAt: record().checkedAt, decisionId: 'review' });
  assert.deepEqual(buildReviewedSources(links)[0].facts, []);
  assert.throws(() => createReviewPackage([record(), record()], { communityId: 'alpha' }), /Duplicate review assignment/);
});

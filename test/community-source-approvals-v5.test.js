const test = require('node:test');
const assert = require('node:assert/strict');
const baseIndex = require('../data/community-index.json');
const ledger = require('../data/canonical-source-ledger.json');
const { approvals } = require('../data/community-source-approvals-v5');
const { applyCommunitySourceApprovalsV5 } = require('../scripts/apply-community-source-approvals-v5');
const { canonicalProjectionEntries } = require('../lib/community-source-answerability');
const { approvedActionProofs, buildApprovedV5Sources } = require('../data/community-source-approvals-v5');
const { selectRevalidationTargetUrls } = require('../lib/community-approved-revalidation');
const { observeCanonicalSource, sourceHash, versionHash } = require('../lib/community-approved-revalidation');
const { pageText, sourceContentHash } = require('../lib/community-ingest');

test('each v5 approval is bound to its exact version and only its listed claims', () => {
  const index = applyCommunitySourceApprovalsV5(structuredClone(baseIndex));
  assert.equal(approvals.decisions.length, 10);
  for (const decision of approvals.decisions) {
    const hash = decision.versions[0].contentHash;
    const record = ledger.records.find(item => item.contentHash === hash && item.canonicalUrl === decision.versions[0].canonicalUrl);
    assert.ok(record, `${decision.decisionId} has its exact canonical version`);
    assert.equal(record.hashScheme, decision.versions[0].hashScheme, `${decision.decisionId} records its version algorithm`);
    const approval = record.approvals.find(item => item.decisionId === decision.decisionId);
    assert.equal(approval.scopeKind, 'scoped-claims');
    assert.deepEqual(approval.approvedClaims, decision.approvedClaims);
    assert.deepEqual(approval.approvedActions, approvedActionProofs[decision.decisionId] || []);
    const source = index.sources.find(item => item.contentHash === hash && item.id.startsWith('approved-'));
    assert.ok(source, `${decision.decisionId} has a resident projection`);
    const projected = canonicalProjectionEntries(source, index);
    assert.deepEqual(new Set(projected.map(item => item.approvalClaim)), new Set(decision.approvedClaims));
    assert.ok(decision.withheldClaims.length > 0, `${decision.decisionId} preserves exclusions`);
  }
});

test('v5 negative controls keep date, availability, contact, and water claims out of projections', () => {
  const index = applyCommunitySourceApprovalsV5(structuredClone(baseIndex));
  const all = index.sources.filter(source => source.id.startsWith('approved-') && approvals.decisions.some(decision => source.contentHash === decision.versions[0].contentHash)).flatMap(source => canonicalProjectionEntries(source, index));
  const text = all.map(entry => `${entry.supportingText} ${entry.normalizedValue}`).join(' ');
  assert.doesNotMatch(text, /missed pickup|bulk item|repair timing|water quality|compliance|guest pass|capacity|office hour/i);
  assert.ok(all.some(entry => entry.approvalClaim === 'trash-recurring-service-guidance'));
  assert.ok(all.some(entry => entry.approvalClaim === 'great-hall-civicrec-route'));
  assert.ok(all.some(entry => entry.approvalClaim === 'water-reports-directory-route'));
});

test('action-only approvals do not create factual answer authority', () => {
  const index = applyCommunitySourceApprovalsV5(structuredClone(baseIndex));
  const state = require('../lib/community-source-answerability').sourceReviewState(index, Date.parse(approvals.decidedAt));
  for (const id of ['approved-great-hall-booking-link', 'approved-overlook-clubhouse-navigation']) {
    const source = index.sources.find(item => item.id === id);
    assert.equal(state.canUseProjection(source), false, `${id} must not establish facts`);
    assert.equal(state.canUseActionProjection(source), true, `${id} keeps its reviewed navigation`);
  }
});

test('a changed exact source version cannot receive a v5 projection', () => {
  const index = structuredClone(baseIndex);
  const source = require('../data/community-source-approvals-v5').buildApprovedV5Sources()[0];
  source.contentHash = 'f'.repeat(64);
  assert.equal(canonicalProjectionEntries(source, index).length, 0);
});

test('every action-bearing decision rejects a substituted resident destination', () => {
  for (const source of buildApprovedV5Sources().filter(source => source.actions.length)) {
    const first = source.actions[0];
    source.actions[0] = { ...first, url: 'https://substitution.example/incorrect-route' };
    assert.throws(() => applyCommunitySourceApprovalsV5({ ...structuredClone(baseIndex), sources: [], factLedger: [] }, { sourceBuilder: () => [source] }), /reviewed action identity/, source.id);
  }
});

test('every v5 projection is immediately due for protected exact revalidation', () => {
  const index = applyCommunitySourceApprovalsV5(structuredClone(baseIndex));
  const v5Sources = index.sources.filter(source => source.id.startsWith('approved-') && approvals.decisions.some(decision => source.contentHash === decision.versions[0].contentHash));
  const due = new Set(selectRevalidationTargetUrls(index, Date.parse(approvals.decidedAt) + 1));
  assert.equal(v5Sources.length, 10);
  for (const source of v5Sources) assert.ok(due.has(source.sourceUrl), source.id);
});

test('v5 uses literal approved subfacility and calendar destinations', () => {
  const sources = buildApprovedV5Sources();
  assert.equal(sources.find(source => source.id === 'approved-overlook-clubhouse-navigation').actions[0].url, 'https://sterlingranchcab.com/Facilities/Facility/Details/-3');
  assert.equal(sources.find(source => source.id === 'approved-landscape-class-calendar').actions[0].url, 'https://sterlingranchcab.com/Calendar.aspx');
});

test('v5 declares the hash scheme that created each approved version', () => {
  const actionInclusive = new Set(['trash-recurring-service', 'streetlight-report-route', 'great-hall-booking-link', 'overlook-clubhouse-navigation']);
  for (const decision of approvals.decisions) {
    assert.equal(decision.versions[0].hashScheme, actionInclusive.has(decision.decisionId) ? 'page-text-actions-v1' : 'page-text-v1');
  }
});

test('the verifier distinguishes display copy from action evidence and supports both declared hash schemes', async () => {
  const url = 'https://alpha.gov/page';
  const html = '<main data-cpRole="mainContentContainer"><p>Exact context.</p><a href="/go">Submit form</a></main>';
  const text = pageText(html);
  const evidence = { label: 'Submit form', url: 'https://alpha.gov/go', context: 'Exact context.' };
  const action = { label: 'Friendly resident label', url: evidence.url, actionType: 'information', evidence, reviewStatus: 'approved' };
  const observedAction = { label: evidence.label, url: evidence.url, actionType: 'form' };
  const textOnly = { id: 'text', sourceUrl: url, contentHash: sourceHash(text), hashScheme: 'page-text-v1', reviewStatus: 'candidate', facts: [{ reviewStatus: 'approved' }], actions: [] };
  const actionInclusive = { id: 'actions', sourceUrl: url, contentHash: sourceContentHash(text, '', [observedAction]), hashScheme: 'page-text-actions-v1', reviewStatus: 'candidate', facts: [], actions: [action] };
  assert.notEqual(textOnly.contentHash, actionInclusive.contentHash);
  assert.equal(versionHash(text, textOnly), textOnly.contentHash);
  assert.equal(versionHash(text, actionInclusive, [observedAction]), actionInclusive.contentHash);
  assert.throws(() => versionHash(text, { hashScheme: 'unknown-v1' }, [observedAction]), /Unknown approved source hash scheme/);
  const observe = body => observeCanonicalSource(url, [textOnly, actionInclusive], { fetchImpl: async () => ({ ok: true, url, text: async () => body }) });
  assert.equal((await observe(html)).actionMismatch, false);
  assert.equal((await observe(html.replace('/go', '/changed'))).actionMismatch, true);
  assert.equal((await observe(html.replace('Submit form', 'Different label'))).actionMismatch, true);
  assert.equal((await observe(html.replace('Exact context.', 'Other context.'))).actionMismatch, true);
});

test('a substituted immutable evidence record is rejected even when resident copy is unchanged', () => {
  const source = buildApprovedV5Sources().find(item => item.id === 'approved-courtreserve-portal');
  source.actions[0] = { ...source.actions[0], evidence: { ...source.actions[0].evidence, label: 'Unreviewed source label' } };
  assert.throws(() => applyCommunitySourceApprovalsV5({ ...structuredClone(baseIndex), sources: [], factLedger: [] }, { sourceBuilder: () => [source] }), /reviewed action identity/);
});

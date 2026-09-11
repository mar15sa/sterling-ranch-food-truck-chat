const test = require('node:test');
const assert = require('node:assert/strict');
const baseIndex = require('../data/community-index.json');
const ledger = require('../data/canonical-source-ledger.json');
const { approvals } = require('../data/community-source-approvals-v5');
const { applyCommunitySourceApprovalsV5 } = require('../scripts/apply-community-source-approvals-v5');
const { canonicalProjectionEntries } = require('../lib/community-source-answerability');
const { approvedActionProofs, buildApprovedV5Sources } = require('../data/community-source-approvals-v5');
const { selectRevalidationTargetUrls } = require('../lib/community-approved-revalidation');

test('each v5 approval is bound to its exact version and only its listed claims', () => {
  const index = applyCommunitySourceApprovalsV5(structuredClone(baseIndex));
  assert.equal(approvals.decisions.length, 10);
  for (const decision of approvals.decisions) {
    const hash = decision.versions[0].contentHash;
    const record = ledger.records.find(item => item.contentHash === hash && item.canonicalUrl === decision.versions[0].canonicalUrl);
    assert.ok(record, `${decision.decisionId} has its exact canonical version`);
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

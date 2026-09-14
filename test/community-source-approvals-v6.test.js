const test = require('node:test');
const assert = require('node:assert/strict');
const baseIndex = require('../data/community-index.json');
const ledger = require('../data/canonical-source-ledger.json');
const { approvals, buildApprovedV6Sources } = require('../data/community-source-approvals-v6');
const { applyCommunitySourceApprovalsV6 } = require('../scripts/apply-community-source-approvals-v6');
const { canonicalProjectionEntries, sourceReviewState } = require('../lib/community-source-answerability');
const { searchCommunityIndex } = require('../lib/community-search');
const { renewExactApprovedEvidence } = require('../lib/community-approved-revalidation');

test('the completed four-category package contains five exact, narrow decisions', () => {
  assert.equal(approvals.decisions.length, 5);
  assert.deepEqual(new Set(approvals.decisions.map(decision => decision.decisionId)), new Set([
    'approved-landscapers-directory-link',
    'recycling-tips-visual-link',
    'providence-elements-fence-specifications',
    'solar-panel-appearance-specifications',
    'chase-drain-adopted-policy',
  ]));
  for (const decision of approvals.decisions) {
    assert.equal(decision.versions.length, 1);
    assert.match(decision.versions[0].contentHash, /^[a-f0-9]{64}$/);
    assert.ok(decision.approvedClaims.length > 0);
    assert.ok(decision.withheldClaims.length > 0);
  }
});

test('every v6 projection is backed by the exact canonical ledger decision', () => {
  const index = applyCommunitySourceApprovalsV6(structuredClone(baseIndex));
  for (const source of buildApprovedV6Sources()) {
    const projected = canonicalProjectionEntries(source, index);
    const decision = approvals.decisions.find(candidate => candidate.decisionId === source.id.replace(/^approved-/, '')
      || candidate.versions[0].contentHash === source.contentHash);
    assert.ok(decision, source.id);
    assert.deepEqual(new Set(projected.map(entry => entry.approvalClaim)), new Set(decision.approvedClaims));
    const record = ledger.records.find(item => item.canonicalUrl === decision.versions[0].canonicalUrl
      && item.contentHash === decision.versions[0].contentHash);
    assert.ok(record?.approvals.some(approval => approval.decisionId === decision.decisionId), decision.decisionId);
  }
});

test('the two outbound documents are action-only and cannot establish facts', () => {
  const index = applyCommunitySourceApprovalsV6(structuredClone(baseIndex));
  const now = Date.parse(approvals.decidedAt);
  for (const id of ['approved-landscapers-directory-link', 'approved-recycling-tips-visual-link']) {
    const source = index.sources.find(candidate => candidate.id === id);
    assert.equal(sourceReviewState(index, now).canUseActionProjection(source), false, 'approval waits for exact-source renewal');
    renewExactApprovedEvidence(index, { sourceUrl: source.sourceUrl, observedHashes: [source.contentHash],
      checkedAt: approvals.decidedAt, staleAfter: new Date(now + 3600000).toISOString(), documentFingerprint: source.documentFingerprint || '' });
    const state = sourceReviewState(index, now);
    assert.equal(state.canUseProjection(source), false);
    assert.equal(state.canUseActionProjection(source), true);
    assert.equal(state.entriesFor(source).every(entry => entry.factType === 'link'), true);
  }
  const text = buildApprovedV6Sources().slice(0, 2).map(source => JSON.stringify(source)).join(' ');
  assert.doesNotMatch(text, /720-\d{3}-\d{4}|@gmail|accepted materials/i);
});

test('only the reviewed fencing, solar, and Chase Drain boundaries cross into evidence', () => {
  const index = applyCommunitySourceApprovalsV6(structuredClone(baseIndex));
  const sources = index.sources.filter(source => source.id.startsWith('approved-')
    && approvals.decisions.some(decision => decision.versions[0].contentHash === source.contentHash));
  const projected = sources.flatMap(source => canonicalProjectionEntries(source, index));
  const text = projected.map(entry => entry.supportingText).join(' ');
  assert.match(text, /46 inches/);
  assert.match(text, /uniform, gridded pattern/);
  assert.match(text, /temporary construction access/);
  assert.doesNotMatch(text, /\$50|\$3,500|first and third Thursday|resale value|annual savings/i);
  assert.equal(projected.some(entry => entry.sourceUrl.includes('/DocumentCenter/View/2398/')), false);
  assert.equal(projected.some(entry => entry.sourceUrl.includes('/DocumentCenter/View/770/')), false);
});

test('a changed source version cannot inherit a v6 approval', () => {
  const source = buildApprovedV6Sources()[2];
  const changed = { ...source, contentHash: 'f'.repeat(64) };
  assert.deepEqual(canonicalProjectionEntries(changed, { communityId: approvals.communityId, canonicalSourceLedger: ledger }), []);
});

test('resident retrieval can reach the approved links and narrow document facts', () => {
  const index = applyCommunitySourceApprovalsV6(structuredClone(baseIndex));
  const now = new Date(Date.parse(approvals.decidedAt) + 1000);
  for (const expected of buildApprovedV6Sources()) {
    const source = index.sources.find(candidate => candidate.id === expected.id);
    renewExactApprovedEvidence(index, { sourceUrl: source.sourceUrl, observedHashes: [source.contentHash],
      checkedAt: now.toISOString(), staleAfter: new Date(now.getTime() + 3600000).toISOString(), documentFingerprint: source.documentFingerprint || '' });
  }
  const options = {
    index,
    communityId: approvals.communityId,
    now,
    limit: 10,
    includeActionOnlyProjections: true,
    allowPartialRequestedDetails: true,
  };
  const cases = [
    ['Which landscapers are approved?', 'approved-landscapers-directory-link'],
    ['Can I see recycling tips?', 'approved-recycling-tips-visual-link'],
    ['What fence is required for Lennar Elements in Providence?', 'approved-providence-elements-fence-specifications'],
    ['What color do solar panels need to be?', 'approved-solar-panel-appearance-specifications'],
    ['Who maintains a Chase Drain?', 'approved-chase-drain-adopted-policy'],
  ];
  for (const [question, expectedId] of cases) {
    const result = searchCommunityIndex(question, options);
    assert.ok(result.sources.some(source => source.id === expectedId), `${question} reaches ${expectedId}`);
  }
});

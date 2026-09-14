const test = require('node:test');
const assert = require('node:assert/strict');
const { CASES, retrievalCaseIssues } = require('../scripts/check-community-retrieval');
const { loadCommunityEvidenceFixture } = require('./helpers/community-evidence');
const { answerCommunityQuestion } = require('../lib/community-assistant');
const { answerRulesQuestion } = require('../lib/rules-assistant');
const index = loadCommunityEvidenceFixture();
const now = new Date('2026-09-14T16:30:00Z');
const reviewedCases = CASES.filter(item => item[3]?.requiredClaims);
const contactCase = CASES.find(item => item[3]?.contactMustRemainMissing);
const answers = new Map();
function answerFor(testCase) {
  if (!answers.has(testCase[0])) answers.set(testCase[0], answerCommunityQuestion(testCase[0], {
    index, now, communityId: index.communityId, isTest: true, answerRulesQuestion,
    rulesOptions: { searchMode: 'legacy', llmMode: 'off' }, planCommunitySearch: false, synthesizeCommunityAnswer: false,
  }));
  return answers.get(testCase[0]);
}

test('the controlling retrieval gate retains all twenty questions and requires the newly approved identities', async () => {
  assert.equal(CASES.length, 20);
  assert.equal(reviewedCases.length, 2);
  for (const item of [...reviewedCases, contactCase]) {
    const answer = await answerFor(item);
    assert.deepEqual(retrievalCaseIssues(answer, item, index, now), [], item[0]);
  }
});

test('newly supported retrieval cannot pass on a title match without exact approved claims', async () => {
  for (const item of reviewedCases) {
    const answer = structuredClone(await answerFor(item));
    answer.claims = [];
    assert.ok(retrievalCaseIssues(answer, item, index, now).includes('missing-exact-approved-claims'));
    answer.claims = [{ text: 'Invented availability', verified: true, evidenceSourceIds: [answer.sources[0].id],
      approvalClaimIds: ['live-court-availability', 'guaranteed-booking'] }];
    assert.ok(retrievalCaseIssues(answer, item, index, now).includes('missing-exact-approved-claims'));
  }
});

test('changed or expired versions and missing approval cannot satisfy the reviewed retrieval cases', async () => {
  for (const item of reviewedCases) {
    const answer = await answerFor(item);
    const sourceId = answer.sources[0].id;
    for (const patch of [{ contentHash: 'f'.repeat(64) }, { staleAfter: '2026-09-01T00:00:00Z' }]) {
      const altered = { ...index, sources: index.sources.map(source => source.id === sourceId ? { ...source, ...patch } : source) };
      assert.ok(retrievalCaseIssues(answer, item, altered, now).includes('missing-exact-approved-claims'));
    }
    const unapproved = { ...index, factLedger: [], canonicalSourceLedger: { records: [] } };
    assert.ok(retrievalCaseIssues(answer, item, unapproved, now).includes('missing-exact-approved-claims'));
  }
});

test('reviewed retrieval rejects substituted actions, private-rule sources, and claimed booking outcomes', async () => {
  for (const item of reviewedCases) {
    const wrongAction = structuredClone(await answerFor(item));
    wrongAction.actions[0].url = 'https://unapproved.example/book';
    assert.ok(retrievalCaseIssues(wrongAction, item, index, now).includes('missing-exact-approved-action'));
    const wrongSource = structuredClone(await answerFor(item));
    wrongSource.sources.push({ title: 'Private sport-court construction', sourceUrl: 'https://rules.example/private-courts' });
    assert.ok(retrievalCaseIssues(wrongSource, item, index, now).includes('unrelated-source-claim'));
    const invented = structuredClone(await answerFor(item));
    invented.answer += ' Your booking is confirmed.';
    assert.ok(retrievalCaseIssues(invented, item, index, now).includes('unsupported-live-outcome'));
  }
});

test('internet remains a specific missing-contact boundary, never a generic-directory or fabricated-contact success', async () => {
  const answer = await answerFor(contactCase);
  for (const patch of [
    { confidence: { canAnswer: true, reason: 'official-source-supported' } },
    { answerMode: 'community-freshness-withheld' },
    { answer: 'Call 303-555-0123 or contact help@example.gov.' },
    { actions: [{ label: 'Important Contact Information', url: 'https://sterlingranchcab.com/Directory.aspx' }] },
  ]) assert.ok(retrievalCaseIssues({ ...answer, ...patch }, contactCase, index, now).length > 0);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { answerCommunityQuestion, composeApprovedOperationalProjection } = require('../lib/community-assistant');
const { answerRulesQuestion } = require('../lib/rules-assistant');
const { loadCommunityEvidenceFixture } = require('./helpers/community-evidence');
const observed = require('./fixtures/reviewed-source-staging-plans-20260914.json');
const communityProfile = require('../data/communities/sterling-ranch.json');

test.describe('complete selected report findings, without unrelated service advice', () => {
  const now = new Date('2026-09-14T16:30:00Z');
  test.beforeEach(context => context.mock.timers.enable({ apis: ['Date'], now }));
  const cases = [
    ['castle-rock-report-identity', ['water-report-castle-rock-2025']],
    ['dominion-report-identity', ['water-report-dominion-2026']],
    ['dated-water-report', ['water-report-cab-2025', 'water-report-dominion-2026', 'water-report-castle-rock-2025']],
    ['compound-report-systems', ['water-report-cab-2025', 'water-report-dominion-2026', 'water-report-castle-rock-2025']],
  ];
  for (const [id, subjects] of cases) {
    test(`${id} renders every approved finding and its full conditions`, async () => {
      const index = loadCommunityEvidenceFixture();
      const saved = observed.rows.find(row => row.id === id);
      const report = index.sources.find(source => source.facts?.some(fact => fact.subjectKey === subjects[0]));
      const selected = report.facts.filter(fact => !fact.subjectKey || subjects.includes(fact.subjectKey));
      let synthesisCalls = 0;
      const answer = await answerCommunityQuestion(saved.question, {
        index, communityId: 'sterling-ranch', communityProfile, now, isTest: true,
        interpretationMode: 'structured', planCommunitySearch: async () => structuredClone(saved.routingPlan),
        answerRulesQuestion, rulesOptions: { searchMode: 'legacy', llmMode: 'off' },
        synthesizeCommunityAnswer: async () => { synthesisCalls++; return { directAnswer: 'Only one finding.', keyDetails: [], nextStep: '' }; },
      });
      assert.equal(answer.confidence.canAnswer, true, answer.answer);
      assert.equal(answer.answerMode, 'community-approved-report-findings');
      assert.equal(synthesisCalls, 0, 'Optional rewriting cannot silently omit selected findings.');
      const rendered = [answer.directAnswer, ...answer.keyDetails].join(' ').replace(/\s+/g, ' ');
      for (const fact of selected) {
        assert.ok(rendered.includes(fact.context.replace(/\s+/g, ' ')), fact.approvalClaim);
        assert.ok(answer.claims.some(claim => claim.verified && claim.approvalClaimIds.includes(fact.approvalClaim)), fact.approvalClaim);
      }
      for (const fact of report.facts.filter(fact => fact.subjectKey && !subjects.includes(fact.subjectKey))) {
        assert.ok(!rendered.includes(fact.context.replace(/\s+/g, ' ')), fact.approvalClaim);
      }
      assert.deepEqual(answer.sources.map(source => source.id), [report.id]);
      assert.ok(answer.actions.every(action => action.url === report.sourceUrl));
      assert.doesNotMatch(rendered, /UtilityHawk|select Registration|laundry|full loads|repair them promptly/);
    });
  }

  test('another community retains more than three finding groups without shared-code facts', async () => {
    const sources = ['roof', 'bridge', 'drain', 'road', 'path'].map((subject, i) => ({
      id: `alpha-${subject}`, communityId: 'alpha', title: `Alpha annual inspection report: ${subject}`,
      sourceUrl: `https://alpha.example.gov/reports/${subject}`, sourceType: 'services',
      canonicalScopedProjection: true, canonicalFactualProjection: true, reviewedSubjectMatch: true,
      checkedAt: now.toISOString(), staleAfter: '2026-09-16T00:00:00Z', actions: [],
      facts: [{ id: `${subject}-finding`, approvalClaim: `${subject}-finding`, subjectKey: `${subject}-2025`,
        type: 'information', context: `The Alpha inspection report recorded ${i + 1} ${subject} findings in 2025 and confirmed follow-up in 2026.`,
        value: `${i + 1} ${subject} findings` }],
    }));
    const answer = await composeApprovedOperationalProjection('What did the Alpha inspection report find?',
      { sources, requestedDetails: [] }, { synthesizeCommunityAnswer: false });
    assert.ok(answer);
    assert.equal(answer.answerStatus, 'verified');
    for (const source of sources) {
      assert.ok(answer.directAnswer.includes(source.facts[0].context));
      assert.ok(answer.claims.some(claim => claim.verified && claim.evidenceSourceIds.includes(source.id)
        && claim.approvalClaimIds.includes(source.facts[0].approvalClaim)));
    }
    assert.doesNotMatch(answer.answer, /Sterling|Dominion|Castle Rock|UtilityHawk/);
  });
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { CASES, answerIssues } = require('../scripts/reviewed-source-release-cases');
const observations = [require('./fixtures/reviewed-source-staging-plans-20260914.json'),
  require('./fixtures/reviewed-source-staging-plans-856c722.json')];
const { loadCommunityEvidenceFixture } = require('./helpers/community-evidence');
const { answerCommunityQuestion } = require('../lib/community-assistant');
const { answerRulesQuestion } = require('../lib/rules-assistant');
const communityProfile = require('../data/communities/sterling-ranch.json');

test.describe('full-inventory replay of the actual marked staging plans', () => {
  const now = new Date('2026-09-14T16:30:00Z');
  test.beforeEach(context => context.mock.timers.enable({ apis: ['Date'], now }));
  for (const observed of observations) for (const item of CASES) {
    test(`${(observed.stagingRevision || observed.observedRevision).slice(0, 7)}: ${item.id}`, async () => {
      const saved = observed.rows.find(row => row.id === item.id);
      assert.equal(saved?.question, item.question);
      assert.equal(observed.isTest, true);
      assert.ok(saved.routingPlan);
      // Keep every competing source, exact approval and expiry. Only the
      // planner is replayed; the real shared rules engine remains active.
      const index = loadCommunityEvidenceFixture();
      const answer = await answerCommunityQuestion(item.question, {
        index, communityId: 'sterling-ranch', communityProfile, now, isTest: true,
        interpretationMode: 'structured', planCommunitySearch: async () => structuredClone(saved.routingPlan),
        answerRulesQuestion, rulesOptions: { searchMode: 'legacy', llmMode: 'off' },
        synthesizeCommunityAnswer: false,
      });
      assert.deepEqual(answerIssues(answer, item), [], `${item.id}: ${answer.answer}`);
    });
  }
});

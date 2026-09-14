const test = require('node:test');
const assert = require('node:assert/strict');
const packageData = require('../data/community-source-approvals-v8.json');
const profile = require('../data/communities/sterling-ranch.json');
const { buildReviewedSources } = require('../lib/community-reviewed-package');
const { emptyLedger, upsertObservation, applyExplicitDecision } = require('../lib/canonical-source-ledger');
const { buildFactLedger } = require('../lib/community-truth');
const { answerCommunityQuestion } = require('../lib/community-assistant');

test.describe('reviewed source entity boundaries', () => {
const now = new Date('2026-09-15T12:00:00.000Z');
test.beforeEach(context => context.mock.timers.enable({ apis: ['Date'], now }));

function fixture() {
  const canonicalSourceLedger = emptyLedger();
  for (const decision of packageData.decisions) {
    const version = decision.versions[0];
    upsertObservation(canonicalSourceLedger, { ...version, communityId: packageData.communityId, checkedAt: packageData.decidedAt });
    applyExplicitDecision(canonicalSourceLedger, { ...decision, ...version, communityId: packageData.communityId,
      decision: 'approve-proposed', decidedAt: packageData.decidedAt });
  }
  const index = { communityId: packageData.communityId, communityName: profile.name, website: profile.website,
    factAuthority: profile.factAuthority, canonicalSourceLedger, pages: [],
    sources: buildReviewedSources(packageData).map(source => ({ ...source, staleAfter: '2026-09-16T12:00:00.000Z' })),
  };
  index.factLedger = buildFactLedger(index);
  return index;
}

const ask = question => answerCommunityQuestion(question, { index: fixture(), now, isTest: true,
  communityId: packageData.communityId, planCommunitySearch: false, synthesizeCommunityAnswer: false,
  answerRulesQuestion: async () => ({ answer: 'No separate governing rule evidence supplied in this source-boundary fixture.',
    answerStatus: 'could-not-verify', sources: [], actions: [], confidence: { canAnswer: false } }),
});

test('CAB coliform answers preserve the specific 2025 follow-up result rather than a cropped problem statement', async () => {
  for (const question of ['What did the CAB water report say about coliform in 2025?',
    'What did the CAB water quality report say about its 2025 coliform result?']) {
    const result = await ask(question);
    assert.equal(result.confidence.canAnswer, true, question);
    assert.match(result.answer, /January 15th, 2025/);
    assert.match(result.answer, /result was .absent. of coliform and e-coli/);
    assert.doesNotMatch(result.answer, /resolved the violation on 4\/24\/2026|faulty instrument was not replaced/);
  }
});

test('Dominion inspection answers use Dominion 2026 findings, not neighboring CAB 2025 findings', async () => {
  for (const question of ['What did the Dominion water quality report say about its 2026 inspection violations?',
    "What did Dominion's 2026 water quality report say about inspection findings?"]) {
    const result = await ask(question);
    assert.equal(result.confidence.canAnswer, true, question);
    assert.match(result.answer, /Dominion/);
    assert.match(result.answer, /2\/13\/2026/);
    assert.match(result.answer, /4\/24\/2026/);
    assert.doesNotMatch(result.answer, /8738 Animas|January 15th, 2025|M610/);
  }
});

test('Castle Rock monitoring answers stay with Castle Rock 2025 findings rather than CAB or Dominion', async () => {
  for (const question of ['What did the Castle Rock water quality report say about 2025 monitoring violations?',
    "What did Castle Rock's 2025 water quality report say about the monitoring instrument?"]) {
    const result = await ask(question);
    assert.equal(result.confidence.canAnswer, true, question);
    assert.match(result.answer, /Castle Rock Water/);
    assert.match(result.answer, /2025/);
    assert.match(result.answer, /FAILURE TO MONITOR|redundant monitoring instrument/i);
    assert.doesNotMatch(result.answer, /8738 Animas|January 15th, 2025|M610|F325/);
  }
});

test('a requested finding period cannot borrow a different year, while publication year stays separate', async () => {
  for (const question of ['What did the CAB water quality report say about coliform in 2024?',
    'What did the CAB water quality report say about coliform in 1999?',
    'What did the Dominion water quality report say about inspection violations in 2025?']) {
    const result = await ask(question);
    assert.notEqual(result.answerStatus, 'verified', `${question}: ${result.answer}`);
    assert.notEqual(result.completion?.outcome, 'complete', question);
  }
  const publication = await ask('What did the 2026 water quality report say about CAB coliform?');
  assert.equal(publication.confidence.canAnswer, true);
  assert.match(publication.answer, /January 15th, 2025/);
  assert.match(publication.answer, /result was .absent. of coliform and e-coli/);
});

test('a matching year for one system cannot complete another requested system period', async () => {
  const result = await ask('What did the CAB and Dominion water quality report say about violations in 2025?');
  assert.notEqual(result.answerStatus, 'verified', result.answer);
  assert.notEqual(result.completion?.outcome, 'complete');
  assert.doesNotMatch(result.answer, /2\/13\/2026|4\/24\/2026|F325|M610/);
  assert.ok((result.actions || []).some(action => /\/DocumentCenter\/View\/2398\//.test(action.url)), JSON.stringify(result.actions));
});

test('a compound report answer represents all three requested systems before extra findings', async () => {
  const result = await ask('What did the CAB, Dominion and Castle Rock water quality report say about violations?');
  assert.equal(result.answerStatus, 'verified', result.answer);
  assert.match(result.answer, /STERLING RANCH CAB/);
  assert.match(result.answer, /Dominion/);
  assert.match(result.answer, /Castle Rock Water/);
  const selectedClaims = result.claims.flatMap(claim => claim.approvalClaimIds || []);
  for (const subject of ['water-report-cab-2025', 'water-report-dominion-2026', 'water-report-castle-rock-2025']) {
    assert.ok(selectedClaims.some(id => id.includes(subject)), `Missing reviewed finding for ${subject}`);
  }
});

test('different finding years stay bound to their own named system clauses', async () => {
  const swapped = await ask('What did the CAB water quality report find in 2026 and Dominion find in 2025?');
  assert.notEqual(swapped.answerStatus, 'verified', swapped.answer);
  assert.notEqual(swapped.completion?.outcome, 'complete');
  assert.doesNotMatch(swapped.answer, /January 15th, 2025|2\/13\/2026|4\/24\/2026/);
  const supported = await ask('What did the CAB water quality report find in 2025 and Dominion find in 2026?');
  assert.equal(supported.answerStatus, 'verified', supported.answer);
  assert.match(supported.answer, /January 15th, 2025/);
  assert.match(supported.answer, /Dominion/);
  assert.match(supported.answer, /2\/13\/2026/);
});

test('caregiver cost and conditions cannot borrow a nonresident membership price', async () => {
  const result = await ask('What does the annual caregiver pass cost and who is eligible?');
  assert.equal(result.confidence.canAnswer, true);
  assert.match(result.answer, /\$300/);
  assert.match(result.answer, /must be with the person|One caregiver can use the pass/);
  assert.doesNotMatch(result.answer, /\$850|\$100|\$25|Great Hall/);
  assert.equal(result.answerStatus, 'verified-incomplete');
  assert.ok(result.completion.missingDetails.some(detail => detail.key === 'eligibility'));
});

test('nonresident membership questions cannot become verified room-rental answers', async () => {
  for (const question of ['Can a nonresident join the Overlook Clubhouse?', 'What does nonresident membership include?']) {
    const result = await ask(question);
    assert.equal(result.confidence.canAnswer, true, question);
    assert.match(result.answer, /non-resident membership|Annual Membership Fee/i);
    assert.match(result.answer, /up to two persons|front desk/);
    assert.doesNotMatch(result.answer, /Great Hall|pavilion|\$100|\$25|2-hour minimum/);
  }
});

test('guest-pass quantities and current water safety remain outside these scoped approvals', async () => {
  const guest = await ask('How many guest passes come with membership?');
  assert.notEqual(guest.answerStatus, 'verified', guest.answer);
  assert.doesNotMatch(guest.answer, /(?:six|6|25) guest passes|\$100/);
  const water = await ask('Is the drinking water safe right now?');
  assert.notEqual(water.answerStatus, 'verified');
  assert.doesNotMatch(water.answer, /(?:water is|it is|it's) safe (?:today|right now|to drink)/i);
});
});

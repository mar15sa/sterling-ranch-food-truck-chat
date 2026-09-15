const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeInterpretation, isOfficialInformationPageRequest } = require('../lib/community-interpretation');
const { answerCommunityQuestion } = require('../lib/community-assistant');
const { scoreCommunityAnswer } = require('../lib/community-answer-quality');
const index = require('../data/community-index.json');
const profile = require('../data/communities/sterling-ranch.json');
const now = new Date('2026-09-14T20:00:00Z');
const plan = (details, subject = 'trash and recycling') => ({ intent: 'services', goal: 'information', goals: ['information'],
  subject, requestedDetails: details, dateRange: null, scope: 'community',
  searchQueries: [subject + ' information', subject + ' guidelines', subject + ' services'] });
const navigationQuestions = ['Where can I find trash and recycling information?', 'Where is the garbage info page?',
  'Open recycling information', 'trash/recycling info?', 'Where can I find recyling info?',
  'Where can we find internet information?', 'Show the water quality information page',
  'Where is the recreation center website?', 'Where could I find landscaping information?',
  'Where can I find information about reservations?', 'Where can I find utility information?'];

test('pure information navigation does not acquire model-invented factual obligations across topics', () => {
  for (const question of navigationQuestions) {
    for (const extra of ['methods', 'date', 'hours', 'contact', 'price', 'examples', 'status']) {
      const result = normalizeInterpretation(plan(['action', extra]), question, { now });
      assert.deepEqual(result.requestedDetails, ['action'], question + ': ' + extra);
    }
  }
});

test('captured live planner mistake and its siblings return the approved resource, not a review hold', async () => {
  for (const question of navigationQuestions.slice(0, 5)) {
    for (const extra of ['methods', 'date', 'price', 'examples']) {
      const answer = await answerCommunityQuestion(question, { index, communityProfile: profile, communityId: profile.id,
        now, interpretationMode: 'structured', synthesizeCommunityAnswer: false,
        planCommunitySearch: async () => plan(['action', extra]) });
      assert.equal(answer.answerMode, 'community-approved-information-resource', question + extra);
      assert.equal(answer.completion.outcome, 'complete');
      assert.ok(answer.actions.some(action => /\/247\/Trash-Recycling/.test(action.url)));
      assert.doesNotMatch(answer.answer, /reviewed|reconfirmed|Monday|Tuesday|Thursday|screened/);
    }
  }
});

test('navigation repair preserves actual methods, rules, schedules and compound requests', () => {
  for (const question of ['Where can I find recycling information and what methods can I use?',
    'Where can I find information about payment methods?', 'Where can I find trash fees?',
    'Where can I find the recycling rules?', 'Where can I find the pickup schedule?',
    'Where can I find pool information and is it open now?', 'Where can I find utility information and how do I pay?',
    'Where can I find information on building a shed?', 'Where can I find information about eligibility?',
    'Where can I find information and compare online versus in-person options?']) {
    assert.equal(isOfficialInformationPageRequest(question, plan(['action', 'methods'])), false, question);
  }
  const mixed = normalizeInterpretation(plan(['action', 'methods', 'price']),
    'Where can I find information about payment methods and what does it cost?', { now });
  assert.ok(mixed.requestedDetails.includes('methods'));
  assert.ok(mixed.requestedDetails.includes('price'));
});

test('a second community uses its own reviewed resource without shared-code facts or URLs', async () => {
  const remap = value => JSON.parse(JSON.stringify(value).replaceAll('sterling-ranch', 'beta')
    .replaceAll('sterlingranchcab.com', 'beta.example.gov').replaceAll('Trash & Recycling', 'Library Information'));
  const evidence = remap({ ...index, sources: index.sources.filter(source => source.id === 'approved-trash-recurring-service'),
    canonicalSourceLedger: require('../data/canonical-source-ledger.json') });
  const answer = await answerCommunityQuestion('Where can I find library information?', {
    index: evidence, communityId: 'beta', communityProfile: { id: 'beta', name: 'Beta', website: 'https://beta.example.gov' },
    now, interpretationMode: 'structured', synthesizeCommunityAnswer: false,
    planCommunitySearch: async () => plan(['action', 'methods'], 'library information'),
  });
  assert.equal(answer.answerMode, 'community-approved-information-resource');
  assert.match(answer.answer, /Library Information/);
  assert.ok(answer.actions.every(action => new URL(action.url).hostname === 'beta.example.gov'));
  assert.doesNotMatch(JSON.stringify(answer), /sterlingranchcab\.com|Sterling Ranch/);
});

test('recurring collection wording reaches approved guidance rather than an unavailable-date hold', async () => {
  for (const question of ['What day is trash collected?', 'Which day is garbage collected?',
    'What day is trash picked up?', 'When are trash and recycling collected?']) {
    const schedule = { ...plan(['date'], question), goal: 'schedule', goals: ['schedule'] };
    const answer = await answerCommunityQuestion(question, { index, communityId: 'sterling-ranch', communityProfile: profile,
      now, interpretationMode: 'structured', synthesizeCommunityAnswer: false, planCommunitySearch: async () => schedule });
    assert.notEqual(answer.answerMode, 'community-freshness-withheld', question);
    assert.match(answer.answer, /Monday|Tuesday|Thursday/, question);
    assert.ok(answer.sources.some(source => source.id === 'approved-trash-recurring-service'), question);
  }
});

test('a specified collection date cannot be answered by the recurring-days projection', async () => {
  for (const question of ['What day is trash collected on September 15?', 'What day is garbage collected on 2026-09-15?',
    'What day is trash collected on 9/15?', 'What day is trash collected tomorrow?']) {
    const answer = await answerCommunityQuestion(question, { index, communityId: 'sterling-ranch', communityProfile: profile,
      now, interpretationMode: 'structured', synthesizeCommunityAnswer: false,
      planCommunitySearch: async () => ({ ...plan(['date'], question), goal: 'schedule', goals: ['schedule'] }),
      getWasteSchedule: async () => { throw new Error('Live source unavailable'); } });
    assert.notEqual(answer.answerStatus, 'verified', question);
    assert.doesNotMatch(answer.answer, /Monday in Providence|Tuesday in Ascent|Thursday in Prospect/, question);
  }
});

test('expired and unapproved resources stay withheld despite corrected navigation intent', async () => {
  for (const unavailable of [new Date('2099-01-01'), now]) {
    const evidence = structuredClone(index);
    if (unavailable === now) {
      evidence.canonicalSourceLedger = { schemaVersion: 1, sources: [] };
      evidence.factLedger = [];
      evidence.sources = evidence.sources.filter(source => !source.id.startsWith('approved-'));
    }
    const answer = await answerCommunityQuestion(navigationQuestions[0], { index: evidence, communityProfile: profile,
      communityId: 'sterling-ranch', now: unavailable, interpretationMode: 'structured', synthesizeCommunityAnswer: false,
      planCommunitySearch: async () => plan(['action', 'methods']) });
    assert.notEqual(answer.answerStatus, 'verified');
    assert.equal(answer.confidence.canAnswer, false);
    assert.equal(answer.claims.length, 0);
    assert.notEqual(scoreCommunityAnswer(navigationQuestions[0], answer).residentEffort.rating, 'Resolved');
  }
});

test('structured incomplete outcomes cannot receive Good or Resolved from a relevant link alone', () => {
  for (const outcome of ['missing-evidence', 'verified-partial', 'conflict', 'ambiguous']) {
    const assessment = scoreCommunityAnswer('Where can I find information?', {
      answer: 'Open the information page. I cannot safely restate the instructions until they are reviewed.',
      directAnswer: 'Open the information page.', answerMode: 'community-freshness-withheld',
      completion: { outcome }, sources: [{ title: 'Information', sourceUrl: 'https://example.org/information' }],
      actions: [{ label: 'Open information', url: 'https://example.org/information' }],
    });
    assert.ok(assessment.score < 4, outcome);
    assert.equal(assessment.contentScore, 4, 'An honest limitation retains its separate content assessment');
    assert.notEqual(assessment.residentEffort.rating, 'Resolved', outcome);
  }
  const legacy = scoreCommunityAnswer('Where can I find information?', {
    answer: 'Open the information page.', directAnswer: 'Open the information page.', answerStatus: 'source-unavailable',
    sources: [{ title: 'Information' }], actions: [{ label: 'Open information', url: 'https://example.org/information' }],
  });
  assert.notEqual(legacy.residentEffort.rating, 'Resolved');
});

test('separate content assessment never excuses wrong sources or a required answer miss', () => {
  const answer = { answer: 'Open the swimming page.', directAnswer: 'Open the swimming page.',
    answerMode: 'community-freshness-withheld', confidence: { canAnswer: false },
    completion: { outcome: 'missing-evidence' }, sources: [{ title: 'Swimming', sourceUrl: 'https://example.org/swimming' }], claims: [] };
  const wrongSource = scoreCommunityAnswer('Where can I find recycling information?', answer);
  assert.ok(wrongSource.contentScore < 4);
  const requiredAnswer = scoreCommunityAnswer('Where can I find swimming information?', answer,
    { expectation: { expectedAnswerMode: 'community-approved-information-resource' } });
  assert.ok(requiredAnswer.contentScore < 4);
  const requiredCompletion = scoreCommunityAnswer('Where can I find swimming information?', answer,
    { expectation: { expectedCompletion: 'complete' } });
  assert.ok(requiredCompletion.contentScore < 4);
});

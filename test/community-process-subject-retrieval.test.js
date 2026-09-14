const test = require('node:test');
const assert = require('node:assert/strict');
const { searchCommunityIndexWithQueries } = require('../lib/community-search');
const { createReviewPackage, buildReviewedSources } = require('../lib/community-reviewed-package');
const { sourceHash } = require('../lib/community-approved-revalidation');
const { emptyLedger, upsertObservation, applyExplicitDecision } = require('../lib/canonical-source-ledger');
const baseIndex = require('../data/community-index.json');
const now = new Date('2026-09-14T18:00:00Z');

function search(index, question, queries = [], details = ['action']) {
  return searchCommunityIndexWithQueries(question, queries, {
    index, communityId: index.communityId, now, intent: 'services',
    interpretation: { requestedDetails: details }, includeActionOnlyProjections: true,
    allowPartialRequestedDetails: true, limit: 20,
  });
}
function fixture(items) {
  const records = items.map(([id, title, quotes]) => {
    const fullText = quotes.join(' ') || title;
    const url = `https://alpha.gov/${id}`;
    return { sourceUrl: url, title, disposition: quotes.length ? 'answer-evidence' : 'safe-link',
      checkedAt: '2026-09-14T00:00:00Z', reason: 'Synthetic reviewed process fixture.',
      fullText, contentHash: sourceHash(fullText), hashScheme: 'page-text-v1',
      verification: { currentness: 'Synthetic current directory.', completeness: 'All fixture content read.' },
      claims: quotes.map((text, i) => ({ id: `${id}-${i}`, text, facet: 'information', type: 'information' })),
      actions: [{ label: `Open ${title}`, url, evidence: { label: title, url, context: title } }], withheldClaims: [],
    };
  });
  const data = createReviewPackage(records, { communityId: 'alpha', decidedAt: '2026-09-14T00:00:00Z', decisionId: 'process-test' });
  const canonicalSourceLedger = emptyLedger();
  for (const decision of data.decisions) {
    upsertObservation(canonicalSourceLedger, { ...decision.versions[0], communityId: 'alpha', checkedAt: data.decidedAt });
    applyExplicitDecision(canonicalSourceLedger, { ...decision, ...decision.versions[0], communityId: 'alpha', decision: 'approve-proposed', decidedAt: data.decidedAt });
  }
  return { communityId: 'alpha', sources: buildReviewedSources(data).map(source => ({ ...source, staleAfter: '2026-09-16T00:00:00Z' })), canonicalSourceLedger, factLedger: [] };
}

test('full inventory inspection searches retain the original object through expanded queries', () => {
  for (const question of ['How do I schedule a landscape inspection?', 'How can I arrange a landscaping inspection?',
    'What are the steps for scheduling a landscape inspection?']) {
    const result = search(baseIndex, question, ['schedule landscape inspection', 'landscape inspection booking', 'how to request landscape inspection']);
    assert.ok(result.sources.length, question);
    assert.ok(result.sources.every(source => source.sourceUrl.includes('/1964/')), JSON.stringify(result.sources.map(s => s.title)));
    assert.match(result.sources.map(source => source.text).join(' '), /residentialinspections@sterlingranchcab\.com/i);
    assert.doesNotMatch(result.sources.map(source => source.text).join(' '), /Rachio|Dominion|tank inspections|ATTACHMENT A-2/i);
  }
});

test('another community uses title plus one approved claim, not unrelated paragraphs', () => {
  const index = fixture([
    ['correct', 'Roof maintenance', ['To schedule an inspection, open the request form.']],
    ['schedule', 'Irrigation maintenance', ['Schedule a watering cycle for your roof garden.']],
    ['long', 'General services', ['Roof repairs use the service form.', 'Tank inspections are scheduled monthly.']],
  ]);
  const result = search(index, 'How do I schedule a roof inspection?', ['tank inspection schedule', 'roof garden schedule']);
  assert.deepEqual(result.sources.map(s => s.sourceUrl), ['https://alpha.gov/correct']);
});

test('genuine compound processes retain each independently grounded subject', () => {
  const index = fixture([
    ['roof', 'Roof maintenance', ['To schedule an inspection, open the request form.']],
    ['solar', 'Solar permits', ['Arrange your permit appointment using this form.']],
    ['tank', 'Water tanks', ['Arrange an inspection appointment.']],
  ]);
  const result = search(index, 'How do I schedule a roof inspection and arrange a solar permit?', ['tank inspection schedule']);
  assert.deepEqual(new Set(result.sources.map(s => s.sourceUrl)), new Set(['https://alpha.gov/roof', 'https://alpha.gov/solar']));
});

test('action-only approved handoffs retain exact subject identity', () => {
  const index = fixture([['route', 'Roof inspection requests', []], ['other', 'Tank inspection requests', []]]);
  const result = search(index, 'How do I schedule a roof inspection?');
  assert.deepEqual(result.sources.map(s => s.sourceUrl), ['https://alpha.gov/route']);
  assert.equal(result.sources[0].facts.length, 0);
  assert.equal(result.sources[0].actions.length, 1);
});

test('online account workflow keeps its approved instruction without borrowing plant calculations', async () => {
  const { answerCommunityQuestion } = require('../lib/community-assistant');
  const answer = await answerCommunityQuestion('How do I see my water usage online?', {
    index: baseIndex, now, communityId: baseIndex.communityId, isTest: true,
    interpretationMode: 'structured', synthesizeCommunityAnswer: false,
    planCommunitySearch: async () => ({ intent: 'services', goal: 'account-access', goals: ['account-access'],
      subject: 'water usage', requestedDetails: ['action'], dateRange: null,
      searchQueries: ['water usage online', 'check water account portal'], scope: 'community' }),
  });
  assert.equal(answer.confidence.canAnswer, true, answer.answer);
  assert.match(answer.answer, /select Registration/);
  assert.doesNotMatch(answer.answer, /full growth|plant irrigated/);
});

test('matching process prose never bypasses stale, unapproved, or changed-version gates', () => {
  const initial = fixture([['roof', 'Roof inspection', ['Use the form to schedule an inspection.']]]);
  for (const kind of ['stale', 'unapproved', 'changed']) {
    const index = structuredClone(initial);
    if (kind === 'stale') index.sources[0].staleAfter = '2026-09-13T00:00:00Z';
    if (kind === 'unapproved') index.canonicalSourceLedger.records = [];
    if (kind === 'changed') index.sources[0].contentHash = '0'.repeat(64);
    assert.equal(search(index, 'How do I schedule a roof inspection?').sources.length, 0, kind);
  }
});

test('process filtering does not turn static instructions into a live date or status', () => {
  const index = fixture([['roof', 'Roof inspection', ['Use the form to schedule an inspection.']]]);
  for (const detail of ['date', 'status']) {
    const result = searchCommunityIndexWithQueries('How do I schedule a roof inspection next Friday?', [], {
      index, now, intent: 'services', interpretation: { requestedDetails: [detail] }, includeActionOnlyProjections: true,
    });
    assert.equal(result.sources.length, 0, detail);
  }
});

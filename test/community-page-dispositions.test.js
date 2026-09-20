const test = require('node:test');
const assert = require('node:assert/strict');
const decisions = require('../data/community-page-dispositions.json');
const { decisionForPageSource, isPageSourceWithheld } = require('../lib/community-page-dispositions');

function fixtureFor(url) {
  const decision = decisions.records.find(record => record.sourceUrl === url);
  assert.ok(decision, `Missing fixture decision for ${url}`);
  return {
    decision,
    source: { communityId: decisions.communityId, sourceUrl: url, connectorType: 'civicplus-pages' },
    index: { communityId: decisions.communityId, pages: [{ canonicalUrl: url, contentFingerprint: decision.versionFingerprint }] },
  };
}

test('the CAB page audit retains every exact version disposition', () => {
  assert.equal(decisions.records.length, 89);
  assert.equal(new Set(decisions.records.map(record => record.sourceUrl)).size, 89);
  assert.ok(decisions.records.every(record => record.categoryId && record.disposition && record.reason && record.versionFingerprint));
  assert.deepEqual(Object.fromEntries([...new Set(decisions.records.map(record => record.disposition))].map(disposition => [disposition, decisions.records.filter(record => record.disposition === disposition).length])), {
    'answer-evidence': 11,
    'safe-link': 30,
    'review-required': 27,
    'live-feed': 1,
    excluded: 20,
  });
});

test('excluded duplicate calendar pages are withheld and changed page versions lose their matching audit status', () => {
  const excluded = fixtureFor('https://sterlingranchcab.com/calendar.aspx?CID=24&view=list');
  assert.equal(decisionForPageSource(excluded.source, excluded.index).versionMatches, true);
  assert.equal(isPageSourceWithheld(excluded.source, excluded.index), true);

  const active = fixtureFor('https://sterlingranchcab.com/334/Water-Billing-Payment-Options');
  assert.equal(isPageSourceWithheld(active.source, active.index), false);
  active.index.pages[0].contentFingerprint = 'changed';
  assert.equal(decisionForPageSource(active.source, active.index).versionMatches, false);
  assert.equal(isPageSourceWithheld(active.source, active.index), false, 'exact claim approval owns factual withholding');
});

test('a live-feed page allows only its dynamic connector source', () => {
  const live = fixtureFor('https://sterlingranchcab.com/calendar.aspx?CID=0&view=list');
  assert.equal(isPageSourceWithheld(live.source, live.index), true);
  live.source.connectorType = 'civicplus-calendar';
  live.source.dynamic = true;
  assert.equal(isPageSourceWithheld(live.source, live.index), false);
});

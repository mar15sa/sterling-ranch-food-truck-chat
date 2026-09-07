const test = require('node:test');
const assert = require('node:assert/strict');
const { fingerprint } = require('../lib/community-release');
const { canonicalPageUrl } = require('../lib/community-ingest');
const { isDynamicSource } = require('../lib/community-source-identity');
const { buildReviewItems } = require('../lib/community-source-review');
const { sourceReviewGate } = require('../lib/community-source-answerability');
const { isFreshnessTrackedSource } = require('../lib/community-source-manager');

test('static event education and meeting documents retain fingerprints and review requirements', () => {
  for (const sourceUrl of ['https://sterlingranchcab.com/372/Energy-Crash-Course-Education-Program',
    'https://sterlingranchcab.com/397/Town-Hall-Meeting-Presentations',
    'https://sterlingranchcab.com/DocumentCenter/View/1975/2024-Annual-Meeting-Presentation-from-November-18-2024']) {
    const source = { id: 'static-event', sourceType: 'events', connectorType: 'civicplus-pages', sourceUrl,
      contentHash: 'old', reviewStatus: 'candidate', lifecycle: 'current', facts: [] };
    assert.equal(isDynamicSource(source), false, sourceUrl);
    assert.equal(isFreshnessTrackedSource(source), true);
    const before = { sources: [source], factLedger: [], truthStatus: { migrationMode: 'reviewed' } };
    const after = { ...before, sources: [{ ...source, contentHash: 'new' }] };
    assert.notEqual(fingerprint(before), fingerprint(after));
    assert.ok(buildReviewItems(before, after).some(item => item.kind === 'source-change'));
    assert.equal(sourceReviewGate(after)(after.sources[0]), false);
  }
});

test('legacy calendar pages remain dynamic without treating event-topic pages as live feeds', () => {
  for (const sourceUrl of ['https://sterlingranchcab.com/Calendar.aspx', 'https://sterlingranchcab.com/calendar.aspx?CID=24&view=list']) {
    assert.equal(isDynamicSource({ sourceType: 'events', connectorType: 'civicplus-pages', sourceUrl }), true);
  }
  assert.equal(isDynamicSource({ sourceType: 'events' }), false);
  assert.equal(isDynamicSource({ sourceType: 'events', sourceUrl: 'not-a-url' }), false);
  assert.equal(isDynamicSource({ connectorType: 'live-status' }), true);
});
test('live calendar changes do not alter the approved static fingerprint', () => {
  const staticSource = { id:'rules', contentHash:'one' };
  const live = { id:'event', contentHash:'today', connectorType:'civicplus-calendar' };
  assert.equal(fingerprint({sources:[staticSource,live]}), fingerprint({sources:[staticSource,{...live,contentHash:'tomorrow'}]}));
  assert.notEqual(fingerprint({sources:[staticSource]}), fingerprint({sources:[{...staticSource,contentHash:'two'}]}));
});
test('FAQ categories stay distinct while tracking parameters are removed', () => {
  assert.notEqual(canonicalPageUrl('https://example.gov/m/faq?cat=16'),canonicalPageUrl('https://example.gov/m/faq?cat=21'));
  assert.equal(canonicalPageUrl('https://example.gov/m/faq?cat=16&utm_source=test#top'),'https://example.gov/m/faq?cat=16');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { crawlCommunity, documentWidgetLinks, extractActions } = require('../lib/community-ingest');

test('document widget discovers selected documents missing from ordinary anchors without promoting actions', () => {
  const html = '<div data-sections="[{&quot;DocumentIDs&quot;:&quot;766,768,1938,&quot;,&quot;SortedDocumentIds&quot;:&quot;755,708,&quot;}]"></div>';
  const links = documentWidgetLinks(html, 'https://example.org/188/Indoor-Facilities');
  assert.deepEqual(links.map(x => x.url), [766, 768, 1938].map(id => `https://example.org/DocumentCenter/View/${id}`));
  assert.deepEqual(extractActions(links.map(x => ({ ...x, label: 'Rental application' }))), []);
});

test('widget discovery rejects malformed selections and injected destinations, and deduplicates IDs', () => {
  const sections = JSON.stringify([{ DocumentIDs: '1938, 1938,https://evil.test/1,../2,0,-3,12345678901,42', FolderIds: '99' }]);
  const html = `<div data-sections='${sections}'></div><div data-sections='invalid'></div><div data-sections='null'></div>`;
  assert.deepEqual(documentWidgetLinks(html, 'https://example.org/page').map(x => x.url), [1938,42].map(id => `https://example.org/DocumentCenter/View/${id}`));
});

test('crawl accounts for unavailable widget documents and documents omitted by the crawl limit', async () => {
  const authority = Object.fromEntries(['rules','facilities','forms','events','alerts','status','services'].map(x => [x, ['civicplus-pages']]));
  const factAuthority = Object.fromEntries(['live-status','facility-hours','reservation-policy','fee','restriction','contact','submission','event-date'].map(x => [x, ['civicplus-pages']]));
  const profile = { communityId: 'alpha', name: 'Alpha', website: 'https://alpha.gov/', allowedHosts: ['alpha.gov'], authority, factAuthority,
    connectors: [{ id: 'site', type: 'civicplus-pages', baseUrl: 'https://alpha.gov/' }] };
  let attempted = 0;
  const result = await crawlCommunity(profile, {
    maxPages: 1, maxDocuments: 1, discoverSitemap: false,
    lookup: async () => [{ address: '203.0.113.10', family: 4 }],
    fetchImpl: async () => new Response('<main>Official community facility reservation information and current resident service information.</main><div data-sections=\'[{"DocumentIDs":"766,768,1938,"}]\'></div>', { headers: { 'content-type': 'text/html' } }),
    extractPdfText: async () => { attempted++; throw new Error('HTTP 404'); },
  });
  assert.equal(attempted, 1);
  for (const id of [766,768,1938]) {
    const url = `https://alpha.gov/DocumentCenter/View/${id}`;
    assert.ok(result.inventory.eligibleUrls.includes(url));
    assert.ok(result.inventory.pendingUrls.includes(url));
  }
  assert.equal(result.inventory.complete, false);
  assert.equal(result.failures.length, 1);
  assert.deepEqual(result.sources.flatMap(x => x.actions), []);
});

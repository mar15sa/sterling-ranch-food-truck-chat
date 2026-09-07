const test = require('node:test');
const assert = require('node:assert/strict');
const {documentTitle, crawlCommunity} = require('../lib/community-ingest');

test('generic PDF rediscovery labels use the current descriptive URL', () => {
  assert.equal(documentTitle('https://example.org/DocumentCenter/View/1574/Attachment-A-3-General-Arch-Improvement-2026', 'Previously discovered official source', 'Old 2023 application'), 'Attachment A 3 General Arch Improvement 2026');
  assert.equal(documentTitle('https://example.org/DocumentCenter/View/1964/Landscape-Submittal-Packet-2026', 'Configured official source'), 'Landscape Submittal Packet 2026');
});

test('PDF refresh keeps descriptive identity while changed bytes get a new unapproved version', async () => {
  const url = 'https://alpha.gov/DocumentCenter/View/1574/General-Application-2026';
  const authority = Object.fromEntries(['rules','facilities','forms','events','alerts','status','services'].map(x => [x, ['civicplus-pages']]));
  const factAuthority = Object.fromEntries(['live-status','facility-hours','reservation-policy','fee','restriction','contact','submission','event-date'].map(x => [x, ['civicplus-pages']]));
  const profile = {communityId:'alpha', name:'Alpha', website:'https://alpha.gov/', allowedHosts:['alpha.gov'], authority, factAuthority,
    connectors:[{id:'site',type:'civicplus-pages',baseUrl:'https://alpha.gov/',seedUrls:[url]}]};
  const options = {maxPages:1,maxDocuments:1,discoverSitemap:false,lookup:async()=>[{address:'203.0.113.10',family:4}],
    fetchImpl:async()=>new Response('<main>Official resident service information and current community application resources for property owners.</main>',{headers:{'content-type':'text/html'}})};
  const pdf = bytes => async (_url, options) => {options.onDocumentFingerprint(bytes); return 'General application for architectural improvements. Submit the completed application to the community office. The application fee is $50.';};
  const first = await crawlCommunity(profile,{...options,extractPdfText:pdf('old-bytes')});
  const old = first.sources.find(s=>s.sourceUrl===url);
  old.reviewedAt='2026-09-01T00:00:00Z'; old.reviewedBy='Owner';
  const next = await crawlCommunity(profile,{...options,previousIndex:first,extractPdfText:pdf('new-bytes')});
  const updated = next.sources.find(s=>s.sourceUrl===url);
  assert.equal(updated.title,'General Application 2026');
  assert.equal(updated.id,old.id);
  assert.notEqual(updated.contentHash,old.contentHash);
  assert.equal(updated.documentFingerprint,'new-bytes');
  assert.equal(updated.reviewedAt,undefined);
});

test('bare PDF IDs retain meaningful prior titles without inventing document names', () => {
  assert.equal(documentTitle('https://example.org/DocumentCenter/View/1574', 'Pending official source', 'General Architectural Application'), 'General Architectural Application');
  assert.equal(documentTitle('https://example.org/DocumentCenter/View/766', 'Official document 766'), 'Official document 766');
  assert.equal(documentTitle('https://example.org/DocumentCenter/View/1191', 'Previously discovered official source'), 'Official document 1191');
  assert.notEqual(documentTitle('https://example.org/DocumentCenter/View/1191', 'Pending official source'), documentTitle('https://example.org/DocumentCenter/View/1281', 'Pending official source'));
  assert.equal(documentTitle('https://example.org/DocumentCenter/View/766/New-Name', 'Current facility agreement', 'Old agreement'), 'Current facility agreement');
});

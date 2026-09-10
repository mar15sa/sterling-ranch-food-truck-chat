const test = require('node:test');
const assert = require('node:assert/strict');
const { reconcileCommunityIndex } = require('../lib/community-source-manager');
const { applyReviewDecisions, buildFactLedger } = require('../lib/community-truth');
const { crawlCommunity } = require('../lib/community-ingest');
const { fingerprint } = require('../lib/community-release');

const crawlProfile = {
  schemaVersion: 1, communityId: 'alpha', name: 'Alpha', shortName: 'Alpha', website: 'https://alpha.gov/',
  platform: 'civicplus-web-central', timezone: 'America/Denver', status: 'active', allowedHosts: ['alpha.gov'], actions: [],
  connectors: [{ id: 'website', type: 'civicplus-pages', baseUrl: 'https://alpha.gov/', refreshMinutes: 1440, maxPages: 1, seedUrls: [] }],
  authority: { rules: ['civicplus-pages'], facilities: ['civicplus-pages'], forms: ['civicplus-pages'], events: ['civicplus-pages'], alerts: ['civicplus-pages'], status: ['civicplus-pages'], services: ['civicplus-pages'] },
  factAuthority: { 'live-status': ['civicplus-pages'], 'facility-hours': ['civicplus-pages'], 'reservation-policy': ['civicplus-pages'], fee: ['civicplus-pages'], restriction: ['civicplus-pages'], contact: ['civicplus-pages'], submission: ['civicplus-pages'], 'event-date': ['civicplus-pages'] },
};

test('refresh preserves exact fact decisions but cannot approve newly interpreted claims', () => {
  const source = { id: 'fees', communityId: 'sterling-ranch', sourceUrl: 'https://example.gov/fees', contentHash: 'v1',
    reviewStatus: 'approved', reviewedAt: '2026-09-01', reviewedBy: 'Owner',
    facts: [{ type: 'money', value: '$20', scopeKey: 'monthly-fee' }] };
  const original = { communityId: 'sterling-ranch', sources: [source] };
  const pendingLedger = buildFactLedger(original, { trusted: true });
  const factLedger = applyReviewDecisions(pendingLedger, [{
    id: 'fee-owner-decision', decision: 'approve-proposed', factId: pendingLedger[0].id,
    sourceVersion: pendingLedger[0].sourceVersion, sourceUrl: pendingLedger[0].sourceUrl,
    reviewer: 'owner', decidedAt: '2026-09-01T00:00:00Z',
  }]).ledger;
  const trusted = { ...original, factLedger };
  const unchanged = reconcileCommunityIndex(trusted, original).index.factLedger;
  assert.equal(unchanged[0].id, factLedger[0].id);
  assert.equal(unchanged[0].reviewStatus, 'approved');
  const revised = { ...trusted, sources: [{ ...source, facts: [{ ...source.facts[0], scopeKey: 'annual-fee' }] }] };
  const changedLedger = reconcileCommunityIndex(revised, revised).index.factLedger;
  assert.equal(changedLedger.length,1);
  assert.equal(changedLedger[0].id,factLedger[0].id);
  assert.equal(changedLedger[0].reviewStatus,'approved');
});

test('unchanged source hashes do not import a proposed ledger or altered facts', () => {
  const source={id:'policy',communityId:'sterling-ranch',sourceUrl:'https://example.gov/policy',contentHash:'same',text:'Approved policy',actions:[],facts:[]};
  const result=reconcileCommunityIndex({communityId:'sterling-ranch',sources:[source],factLedger:[]},
    {communityId:'sterling-ranch',sources:[{...source,facts:[{type:'money',value:'$999'}]}],factLedger:[{id:'injected',reviewStatus:'approved'}]});
  assert.deepEqual(result.index.factLedger,[]);
  assert.deepEqual(result.index.sources[0].facts,[]);
});

test('workflow refresh preserves the reviewed baseline instead of rebuilding every extracted fact', () => {
  const source={id:'policy',communityId:'sterling-ranch',sourceUrl:'https://example.gov/policy',contentHash:'same',
    checkedAt:'2026-09-01',staleAfter:'2026-09-02',text:'Approved policy',actions:[],
    facts:[{type:'money',value:'$20',scopeKey:'reviewed-fee'},{type:'money',value:'$999',scopeKey:'unreviewed-extraction'}]};
  const pendingReviewed=buildFactLedger({...source,communityId:'sterling-ranch',sources:[{...source,facts:[source.facts[0]]}]},{trusted:true})[0];
  const reviewed=applyReviewDecisions([pendingReviewed],[{
    id:'fee-owner-decision',decision:'approve-proposed',factId:pendingReviewed.id,
    sourceVersion:pendingReviewed.sourceVersion,sourceUrl:pendingReviewed.sourceUrl,
    reviewer:'owner',decidedAt:'2026-09-01T00:00:00Z',
  }]).ledger[0];
  const trusted={communityId:'sterling-ranch',sources:[source],factLedger:[reviewed],
    truthStatus:{migrationMode:'trusted-baseline',pendingSensitiveReviewCount:0}};
  const candidate={...trusted,generatedAt:'2026-09-07',sources:[{...source,checkedAt:'2026-09-07',staleAfter:'2026-09-08'}],
    factLedger:buildFactLedger(trusted,{previousLedger:trusted.factLedger,requirePriorReview:true})};

  const result=reconcileCommunityIndex(trusted,candidate).index;
  assert.equal(result.factLedger.length,1);
  const kept=result.factLedger.find(entry=>entry.id===reviewed.id);
  assert.equal(kept.reviewStatus,'approved');
  assert.equal(kept.lastObservedAt,'2026-09-07');
  assert.equal(kept.staleAfter,'2026-09-08');
  assert.equal(new Set(result.factLedger.map(entry=>entry.id)).size,result.factLedger.length);
  assert.equal(result.truthStatus.migrationMode,'trusted-baseline');
  assert.equal(result.truthStatus.pendingSensitiveReviewCount,0);
});
test('freshness follows official URL and content, never a reused title ID', () => {
  const source={ id:'same-title',sourceUrl:'https://example.gov/fees',contentHash:'h',checkedAt:'2026-01-01',staleAfter:'2026-01-02',text:'approved',actions:[] };
  const index={sources:[source]};
  const impostor={...source,sourceUrl:'https://example.gov/unrelated',checkedAt:'2026-09-06',staleAfter:'2026-09-07'};
  assert.equal(reconcileCommunityIndex(index,{sources:[impostor]}).index.sources[0].checkedAt,source.checkedAt);
  const renamed={...source,id:'disambiguated-title',checkedAt:'2026-09-06',staleAfter:'2026-09-07',actions:[{url:'https://example.gov/new-action'}]};
  const refreshed=reconcileCommunityIndex(index,{sources:[renamed]}).index.sources[0];
  assert.equal(refreshed.checkedAt,renamed.checkedAt);
  assert.equal(refreshed.id,source.id);
  assert.deepEqual(refreshed.actions,source.actions);
  assert.equal(reconcileCommunityIndex(index,{sources:[{...renamed,contentHash:'changed'}]}).index.sources[0].checkedAt,source.checkedAt);
});

test('freshness requires one unique canonical URL and exact hash match', () => {
  const source={id:'trusted',sourceUrl:'https://EXAMPLE.gov/fees/?b=2&a=1#old',contentHash:'same',checkedAt:'old',staleAfter:'old-stale',text:'approved',actions:[]};
  const refreshed={...source,id:'new-id',sourceUrl:'https://example.gov/fees?a=1&b=2',checkedAt:'new',staleAfter:'new-stale'};
  assert.equal(reconcileCommunityIndex({sources:[source]},{sources:[refreshed]}).index.sources[0].checkedAt,'new');
  const ambiguous=reconcileCommunityIndex({sources:[source]},{sources:[refreshed,{...refreshed,id:'second'}]}).index.sources[0];
  assert.equal(ambiguous.checkedAt,'old');
  assert.equal(ambiguous.staleAfter,'old-stale');
});

test('crawl never mutates the reviewed snapshot when retained duplicate IDs are disambiguated', async () => {
  const url = 'https://alpha.gov/services';
  const source = (contentHash) => ({
    id: 'alpha-trash-recycling-1', communityId: 'alpha', title: 'Trash and recycling', sourceUrl: url,
    sourceType: 'services', connectorType: 'civicplus-pages', authorityScore: 0.9,
    text: `Official trash service details ${contentHash}.`, excerpt: 'Official trash service details.', actions: [], facts: [],
    contentHash, checkedAt: '2026-09-01T00:00:00.000Z', staleAfter: '2026-09-02T00:00:00.000Z', lifecycle: 'current',
  });
  const trusted = {
    communityId: 'alpha', generatedAt: '2026-09-01T00:00:00.000Z', sources: [source('first'), source('second')], factLedger: [],
    pages: [{ url, canonicalUrl: url, title: 'Trash and recycling', indexed: true, contentFingerprint: 'retained-page', chunkContentHashes: ['first', 'second'], indexedSourceIds: ['alpha-trash-recycling-1'] }],
    inventory: { eligibleUrls: [url], pendingUrls: [], pendingCount: 0 },
  };
  trusted.releaseFingerprint = fingerprint(trusted);
  const original = structuredClone(trusted);
  const originalFingerprint = fingerprint(trusted);

  const candidate = await crawlCommunity(crawlProfile, {
    previousIndex: trusted, maxPages: 1, discoverSitemap: false, now: '2026-09-08T12:00:00.000Z',
    lookup: async () => [{ address: '203.0.113.10', family: 4 }],
    fetchImpl: async () => new Response('Missing', { status: 404 }),
  });

  assert.deepEqual(trusted, original);
  assert.equal(fingerprint(trusted), originalFingerprint);
  assert.ok(candidate.sources.every((item) => item.id !== 'alpha-trash-recycling-1'));
  const reconciled = reconcileCommunityIndex(trusted, candidate);
  assert.ok(reconciled.pendingReview);
  assert.equal(reconciled.index.releaseFingerprint, originalFingerprint);
  assert.equal(fingerprint(reconciled.index), originalFingerprint);
});

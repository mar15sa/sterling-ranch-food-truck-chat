const test = require('node:test');
const assert = require('node:assert/strict');
const { reconcileCommunityIndex } = require('../lib/community-source-manager');
const { buildFactLedger } = require('../lib/community-truth');

test('refresh preserves exact fact decisions but cannot approve newly interpreted claims', () => {
  const source = { id: 'fees', communityId: 'sterling-ranch', sourceUrl: 'https://example.gov/fees', contentHash: 'v1',
    reviewStatus: 'approved', reviewedAt: '2026-09-01', reviewedBy: 'Owner',
    facts: [{ type: 'money', value: '$20', scopeKey: 'monthly-fee' }] };
  const original = { communityId: 'sterling-ranch', sources: [source] };
  const factLedger = buildFactLedger(original, { trusted: true });
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
  const reviewed=buildFactLedger({...source,communityId:'sterling-ranch',sources:[{...source,facts:[source.facts[0]]}]},{trusted:true})[0];
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

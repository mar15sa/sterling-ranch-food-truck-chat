const test = require('node:test');
const assert = require('node:assert/strict');
const { reconcileCommunityIndex } = require('../lib/community-source-manager');
test('unchanged source hashes do not import a proposed ledger or altered facts', () => {
  const source={id:'policy',communityId:'sterling-ranch',sourceUrl:'https://example.gov/policy',contentHash:'same',text:'Approved policy',actions:[],facts:[]};
  const result=reconcileCommunityIndex({communityId:'sterling-ranch',sources:[source],factLedger:[]},
    {communityId:'sterling-ranch',sources:[{...source,facts:[{type:'money',value:'$999'}]}],factLedger:[{id:'injected',reviewStatus:'approved'}]});
  assert.deepEqual(result.index.factLedger,[]);
  assert.deepEqual(result.index.sources[0].facts,[]);
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

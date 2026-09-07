const test = require('node:test');
const assert = require('node:assert/strict');
const { reconcileCommunityIndex } = require('../lib/community-source-manager');
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

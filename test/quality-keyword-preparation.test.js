const test=require('node:test'),assert=require('node:assert/strict');
const {createEligibleKeywordIndex}=require('../scripts/quality-eval/eligible-keyword-index');
test('preparation is reused only for exact current source membership and order across communities',()=>{
 for(const communityId of ['alpha','beta']){
  const docs=[{id:'a',communityId,text:'Approved A',version:'1'},{id:'b',communityId,text:'Approved B',version:'1'}],index={communityId,source:{jobId:1},documents:docs},cache=createEligibleKeywordIndex(docs,communityId);
  const first=cache.get(index,docs);assert.equal(cache.get({...index},[...docs]),first);
  const expired=cache.get(index,[docs[0]]);assert.notEqual(expired,first);assert.deepEqual(expired.documents,[docs[0]]);
  assert.notEqual(cache.get(index,docs),first);assert.notEqual(cache.get(index,[docs[1],docs[0]]),first);
  assert.notEqual(cache.get({...index,source:{jobId:2}},docs),first);
  assert.throws(()=>cache.get({...index,communityId:'other'},docs),/changed/);
  assert.throws(()=>cache.get(index,[{...docs[0]}]),/exact bound/);
  assert.throws(()=>cache.get(index,[docs[0],docs[0]]),/exact bound/);
  docs[0].text='Changed approval';assert.throws(()=>cache.get(index,docs),/corpus changed/);
  assert.equal(cache.stats().retainedEntries,1);cache.clear();assert.equal(cache.stats().retainedEntries,0);
 }
});

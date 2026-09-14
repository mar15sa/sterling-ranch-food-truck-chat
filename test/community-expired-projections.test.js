const test=require('node:test'),assert=require('node:assert/strict');
const {sourceReviewState,canonicalProjectionEntries}=require('../lib/community-source-answerability');
const {searchCommunityIndex}=require('../lib/community-search');
const now=Date.parse('2026-09-14T20:00:00Z');
function fixture(communityId='alpha'){
  const url=`https://${communityId}.example/parking`,contentHash='a'.repeat(64);
  const source={id:'permit',communityId,sourceUrl:url,contentHash,title:'Parking permit',sourceType:'services',connectorType:'civicplus-pages',authorityScore:1,
    lifecycle:'current',staleAfter:'2026-09-15T20:00:00Z',text:'Parking permit costs $12. Apply online.',
    facts:[{type:'money',value:'$12',context:'Parking permit costs $12.',approvalClaim:'permit-fee'}],
    actions:[{label:'Apply for parking permit',url:url+'/apply',actionType:'form',approvalClaim:'permit-form'}]};
  return {communityId,sources:[source],factLedger:[],canonicalSourceLedger:{records:[{key:url+'#sha256:'+contentHash,approvals:[{
    status:'approved',communityId,scopeKind:'scoped-claims',decisionId:'owner-permit',approvedClaims:['permit-fee','permit-form']}]}]}};
}
test('canonical approval inventory survives expiry but facts and actions cannot enter runtime evidence',()=>{
  for(const communityId of ['alpha','beta'])for(const change of [{staleAfter:'2026-09-13T20:00:00Z'},{staleAfter:'invalid'},{lifecycle:'retired'},{effectiveFrom:'2026-10-01'}]){
    const index=fixture(communityId),source=Object.assign(index.sources[0],change),review=sourceReviewState(index,now);
    assert.equal(canonicalProjectionEntries(source,index).length,2);
    assert.equal(review.entriesFor(source).length,0,JSON.stringify(change));
    assert.equal(review.canUseProjection(source),false);assert.equal(review.canUseActionProjection(source),false);
    assert.equal(searchCommunityIndex('parking permit cost',{index,now,includeActionOnlyProjections:true}).sources.length,0);
  }
});
test('current exact projections and legitimately renewed versions retain scoped evidence',()=>{
  const index=fixture(),source=index.sources[0];assert.equal(sourceReviewState(index,now).entriesFor(source).length,2);
  source.staleAfter='2026-09-13';assert.equal(sourceReviewState(index,now).entriesFor(source).length,0);
  source.staleAfter='2026-09-15';assert.equal(sourceReviewState(index,now).entriesFor(source).length,2);
  source.contentHash='b'.repeat(64);assert.equal(sourceReviewState(index,now).entriesFor(source).length,0);
  source.contentHash='a'.repeat(64);assert.equal(sourceReviewState({...index,communityId:'other'},now).entriesFor(source).length,0);
});
test('a later fact deadline cannot override expired parent evidence; dynamic gate remains separate',()=>{
  const index=fixture(),source=index.sources[0];index.canonicalSourceLedger={records:[]};source.staleAfter='2026-09-13';
  index.factLedger=[{sourceId:source.id,sourceVersion:source.contentHash,reviewStatus:'approved',reviewDecisionId:'explicit',reviewedAt:'2026-09-12',reviewedBy:'owner',lifecycle:'current',staleAfter:'2099-01-01',factType:'money',facet:'fee',claimKey:'permit-fee',scopeKey:'permit',normalizedValue:12}];
  const review=sourceReviewState(index,now);assert.equal(review.entriesFor(source).length,0);
  assert.equal(review.canUseSource({id:'calendar',connectorType:'civicplus-calendar',sourceType:'events'}),true);
});

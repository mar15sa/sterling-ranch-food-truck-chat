const test=require('node:test'),assert=require('node:assert/strict');
const {frozenCorpus,eligibleDocuments,rankDense,fuse,bindKeyword}=require('../scripts/quality-eval/community-semantic');
const {coverage}=require('../scripts/quality-eval/summarize-community-semantic');
const now=Date.parse('2026-09-15T00:00:00Z');
function fixture(communityId='alpha'){
 const source={id:'approved-form',communityId,sourceUrl:`https://${communityId}.example/form`,contentHash:'a'.repeat(64),title:'Application form',connectorType:'civicplus-pages',sourceType:'forms',lifecycle:'current',staleAfter:'2026-09-16T00:00:00Z',text:'UNAPPROVED FEE 999',facts:[],actions:[{id:'apply',label:'Open application',url:`https://${communityId}.example/apply`,approvalClaim:'application'}]};
 return {communityId,sources:[source],factLedger:[],canonicalSourceLedger:{records:[{key:source.sourceUrl+'#sha256:'+source.contentHash,approvals:[{status:'approved',communityId,scopeKind:'scoped-claims',decisionId:'owner-application',approvedClaims:['application']}]}]}};
}
test('index and query retain only current exact approved projections across two communities',()=>{
 for(const communityId of ['alpha','beta']){const index=fixture(communityId),corpus=frozenCorpus(index,communityId,now);
  assert.equal(corpus.documents[0].text,'Open application');assert.ok(!JSON.stringify(corpus).includes('UNAPPROVED'));
  assert.throws(()=>eligibleDocuments(corpus,{...index,communityId:'other'},now),/binding/);
  for(const mutate of [s=>s.contentHash='b'.repeat(64),s=>s.staleAfter='2026-09-14',s=>s.lifecycle='retired',s=>s.communityId='other',s=>s.actions[0].approvalClaim='unapproved',s=>s.actions[0].url='https://other.example/changed']){
   const changed=structuredClone(index);mutate(changed.sources[0]);assert.equal(eligibleDocuments(corpus,changed,now).length,0);
  }
  const renewal=structuredClone(index);renewal.sources[0].checkedAt='2026-09-15T00:00:00Z';renewal.sources[0].staleAfter='2026-09-17T00:00:00Z';assert.equal(eligibleDocuments(corpus,renewal,now).length,1);
  renewal.canonicalSourceLedger.records[0].approvals=[];assert.equal(eligibleDocuments(corpus,renewal,now).length,0);
  const changedCorpus=structuredClone(corpus);changedCorpus.documents[0].text='Changed approved wording';assert.throws(()=>eligibleDocuments(changedCorpus,index,now),/Changed frozen/);
 }
});
test('vector match cannot revive stale or changed source, and returns full approved text',()=>{
 const index=fixture(),corpus=frozenCorpus(index,'alpha',now),units=[{documentId:'approved-form',start:0,end:4}],vectors=new Float32Array([1,0,0]),args={corpus,currentIndex:index,now,units,vectors,queryVector:[1,0,0],dimensions:3};
 const result=rankDense(args);assert.equal(result.length,1);assert.equal(result[0].document.text,'Open application');assert.equal(result[0].score,1);
 assert.equal(rankDense({...args,now:Date.parse('2026-09-17')}).length,0);
 for(const change of [{queryVector:[1,NaN,0]},{vectors:new Float32Array([1,0])},{units:[{documentId:'invented',start:0,end:1}]},{units:[{documentId:'approved-form',start:0,end:999}]}])assert.throws(()=>rankDense({...args,...change}),/Invalid/);
});
test('keyword binding and fusion preserve exact source identities and do not count duplicates',()=>{
 const index=fixture(),corpus=frozenCorpus(index,'alpha',now),doc=corpus.documents[0];
 assert.equal(bindKeyword([{...doc,score:2,text:'Narrower projection'}],corpus.documents)[0].document.text,'Open application');
 assert.equal(bindKeyword([{...doc,contentHash:'changed'}],corpus.documents).length,0);
 const row={document:doc,score:2};const combined=fuse([row,row],[row],4);assert.equal(combined.length,1);assert.deepEqual(combined[0].ranks,{keyword:1,semantic:1});assert.equal(combined[0].fusionScore,2/61);
 const other={document:{...doc,communityId:'beta'},score:2};assert.equal(fuse([row],[other],4).length,2);
});
test('source recall requires every declared group in the first four and never scores negative controls as successes',()=>{
 const results=['a','b','c','d','e'].map(id=>({id}));
 assert.deepEqual(coverage(results,[['a','e'],['d']]),{requiredGroups:2,foundGroups:2,allFound:true});
 assert.deepEqual(coverage(results,[['a'],['e']]),{requiredGroups:2,foundGroups:1,allFound:false});
 assert.equal(coverage(results,[]).allFound,null);
});

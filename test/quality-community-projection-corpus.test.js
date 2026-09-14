const test=require('node:test'),assert=require('node:assert/strict');
const {communityProjectionCorpus,stagingFormNavigation}=require('../scripts/quality-eval/community-projection-corpus');
const now=Date.parse('2026-09-14T20:00Z');
function fixture(communityId='alpha'){
 const source={id:'process',communityId,sourceUrl:`https://${communityId}.example/process`,contentHash:'a'.repeat(64),title:'Application process',connectorType:'civicplus-pages',sourceType:'forms',lifecycle:'current',staleAfter:'2026-09-15T20:00Z',text:'RAW UNAPPROVED FEE $999',facts:[],actions:[{id:'apply',label:'Open application',url:`https://${communityId}.example/apply`,approvalClaim:'application'}]};
 const index={communityId,sources:[source],factLedger:[],canonicalSourceLedger:{records:[{key:source.sourceUrl+'#sha256:'+source.contentHash,approvals:[{status:'approved',communityId,scopeKind:'scoped-claims',decisionId:'owner-application',approvedClaims:['application']}]}]}};
 return index;
}
test('semantic process corpus uses exact current approved projections and excludes raw text',()=>{
 for(const communityId of ['alpha','beta']){
  const index=fixture(communityId),a=communityProjectionCorpus(index,{communityId,now});assert.equal(a.length,1);assert.equal(a[0].text,'Open application');assert.equal(a[0].canonicalActionOnlyProjection,true);assert.doesNotMatch(a[0].text,/999|RAW/);
  assert.throws(()=>communityProjectionCorpus(index,{communityId:'other',now}));
  for(const mutate of [s=>s.contentHash='b'.repeat(64),s=>s.staleAfter='2026-09-13',s=>s.communityId='other',s=>s.lifecycle='retired',s=>s.actions[0].approvalClaim='unapproved']){const copy=structuredClone(index);mutate(copy.sources[0]);assert.equal(communityProjectionCorpus(copy,{communityId,now}).length,0);}
 }
});
test('staging form navigation is explicit, narrow, current and bound to all approved versions',()=>{
 const source={id:'form',communityId:'alpha',sourceUrl:'https://alpha.example/form.pdf',contentHash:'a'.repeat(64),documentFingerprint:'f'.repeat(64),title:'General improvement form',connectorType:'official-pdf',lifecycle:'current',staleAfter:'2026-09-15T20:00Z',text:'RAW UNAPPROVED FOR PRODUCTION FEES',facts:[{value:'$999'}]};
 const index={communityId:'alpha',sources:[source]},profile={communityId:'alpha',website:'https://alpha.example'},approval={scope:'staging only',reviewer:'Owner',reviewedAt:'2026-09-12',reviews:[{scope:'staging sources only',reviewedBy:'Owner',reviewedAt:'2026-09-12',documentId:1,url:source.sourceUrl,hashes:[source.contentHash]}]};
 const options={profile,approval,now,enabled:true};
 assert.deepEqual(stagingFormNavigation(index,{...options,enabled:false}),[]);
 const a=stagingFormNavigation(index,options);assert.equal(a.length,1);assert.equal(a[0].stagingOnly,true);assert.deepEqual(a[0].facts,[]);assert.equal(a[0].actions[0].url,source.sourceUrl);assert.doesNotMatch(a[0].text,/FEES|999/);
 for(const mutate of [s=>s.contentHash='b'.repeat(64),s=>s.communityId='beta',s=>s.staleAfter='2026-09-13',s=>s.lifecycle='retired',s=>delete s.documentFingerprint]){const b=structuredClone(index);mutate(b.sources[0]);assert.equal(stagingFormNavigation(b,options).length,0);}
 assert.throws(()=>stagingFormNavigation(index,{...options,profile:{...profile,communityId:'beta'}}));
 assert.equal(stagingFormNavigation(index,{...options,approval:{...approval,reviews:[{...approval.reviews[0],hashes:[source.contentHash,'b'.repeat(64)]}]}}).length,0);
});

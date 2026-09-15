const test=require('node:test'),assert=require('node:assert/strict');
const {makeRetriever}=require('../scripts/quality-eval/flow-evidence');
const {communityProjectionCorpus}=require('../scripts/quality-eval/community-projection-corpus');
const now=Date.parse('2026-09-15T00:00:00Z');
const plan={needs:[{id:'need-1',subject:'project',task:'form',request:'Application form',evidenceKind:'official-action'}]};
function fixture(communityId='alpha'){
 const base='https://rules.example/'+communityId,url='https://'+communityId+'.example/form';
 const source={id:'approved-form',communityId,sourceUrl:url,contentHash:'a'.repeat(64),title:'Application form',connectorType:'civicplus-pages',sourceType:'forms',lifecycle:'current',staleAfter:'2026-09-16',text:'RAW WITHHELD FEE',facts:[],actions:[{id:'apply',label:'Open application',url,approvalClaim:'application',reviewStatus:'approved',reviewDecisionId:'owner',reviewedBy:'owner',sourceVersion:'a'.repeat(64),evidence:{url,sourceUrl:url,context:'SEARCH-ONLY PRIVATE ADDRESS'}}]};
 return {communityId,now,communityMode:'semantic',profile:{communityId,website:'https://'+communityId+'.example',allowedHosts:['rules.example'],connectors:[{type:'municode',baseUrl:base}]},
  communityIndex:{communityId,sources:[source],factLedger:[],canonicalSourceLedger:{records:[{key:url+'#sha256:'+source.contentHash,approvals:[{status:'approved',communityId,scopeKind:'scoped-claims',decisionId:'owner',approvedClaims:['application']}]}]}},
  rulesIndex:{source:{sourceUrl:base},documents:[{id:'r',nodeId:'r',communityId,sourceUrl:base+'?nodeId=r',title:'Project rules',jobId:1,productId:1,text:'Project approval is required.'}]}};
}
test('combined packet preserves governing rules and action links without leaking search-only proof',async()=>{
 for(const tenant of ['alpha','beta']){
  const ctx=fixture(tenant);let queries=0;
  const packet=await makeRetriever({...ctx,ruleSearch:i=>i.documents,communitySearch:async(i,q,limit,opts)=>{queries++;assert.equal(limit,4);assert.equal(opts.now,now);return communityProjectionCorpus(i,{communityId:tenant,now});}})(plan);
  assert.equal(queries,1);assert.equal(packet.sources.length,2);assert.equal(packet.actions.length,1);
  assert.ok(packet.sources.some(s=>s.role==='governing-rule'));assert.ok(packet.sources.some(s=>s.role==='official-action'));
  assert.doesNotMatch(JSON.stringify(packet),/SEARCH-ONLY|PRIVATE ADDRESS|RAW WITHHELD/);
  assert.equal(packet.actions[0].url,ctx.communityIndex.sources[0].sourceUrl);
 }
});
test('semantic packet boundary rejects altered, duplicate, unapproved or expired results',async()=>{
 for(const change of [d=>({...d,text:'forged'}),d=>({...d,communityId:'beta'}),d=>({...d,contentHash:'changed'}),d=>({...d,actions:[]}),d=>({...d,sourceUrl:'https://alpha.example/other'})]){
  const ctx=fixture(),doc=communityProjectionCorpus(ctx.communityIndex,{communityId:'alpha',now})[0];
  await assert.rejects(makeRetriever({...ctx,communitySearch:async()=>[change(doc)]})(plan),/approved evidence/);
 }
 for(const mode of ['withdraw','expire','duplicate','too-many']){
  const ctx=fixture(),doc=communityProjectionCorpus(ctx.communityIndex,{communityId:'alpha',now})[0];
  const retrieve=makeRetriever({...ctx,communitySearch:async()=>{
   if(mode==='withdraw')ctx.communityIndex.canonicalSourceLedger.records[0].approvals=[];
   if(mode==='expire')ctx.communityIndex.sources[0].staleAfter='2026-09-14';
   return mode==='duplicate'?[doc,doc]:mode==='too-many'?Array(5).fill(doc):[doc];
  }});
  await assert.rejects(retrieve(plan),/approved evidence|bounded/);
 }
 assert.throws(()=>makeRetriever(fixture()),/explicit ranker/);
});
test('live needs retain their adapter route and never invoke document search',async()=>{
 const ctx=fixture();let live=0;
 const packet=await makeRetriever({...ctx,communitySearch:()=>{throw Error('Unexpected community search');},ruleSearch:()=>{throw Error('Unexpected rules search');},liveRetrieve:async()=>{live++;return {sources:[],diagnostics:[{reason:'fixture-live-unavailable'}]};}})({needs:[{...plan.needs[0],evidenceKind:'live-operation'}]});
 assert.equal(live,1);assert.equal(packet.sources.length,0);assert.equal(packet.diagnostics[0].reason,'fixture-live-unavailable');
});

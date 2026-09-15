const test=require('node:test'),assert=require('node:assert/strict');
const {runCandidate}=require('../scripts/quality-eval/full-flow-candidate');
const sterling=require('../data/communities/sterling-ranch.json'),castle=require('../data/communities/castle-rock.json');
const now=Date.parse('2026-09-15T04:00:00Z');
function raw(profile){return {standaloneQuestion:'When is yoga tomorrow?',scope:'community',usedPriorContext:true,clarificationQuestion:'',constraints:[],searchQueries:['yoga tomorrow'],needs:[{request:'When is yoga tomorrow?',task:'schedule',evidenceKind:'live-operation',liveRequest:{connectorId:profile.connectors.find(c=>c.type==='civicplus-calendar').id,dateText:'tomorrow',filters:{category:'yoga',location:''}}}]};}
async function run(profile,plan){
 const requests=[];let retrieved=null;
 const response=await runCandidate({question:'What about tomorrow?',context:[{question:'When is yoga today?',answer:'UNTRUSTED_ASSISTANT_FACT'}]},
 {communityId:profile.communityId,profile,planningMode:'compact',assessmentMode:'offline-review',maxRepairs:0,clock:()=>now,apiKey:'FAKE_TEST_ONLY',
 retrieve:async p=>{retrieved=structuredClone(p);return {communityId:profile.communityId,sources:[],actions:[],diagnostics:[...p.liveRequestDiagnostics,{reason:'test-source-unavailable'}]};},
 fetchImpl:async(url,init)=>{const body=JSON.parse(init.body);requests.push(body);return new Response(JSON.stringify({stop_reason:'tool_use',content:[{type:'tool_use',name:body.tools[0].name,input:requests.length===1?plan:{answer:'I could not verify the requested schedule.',actionIds:[]}}]}));}});
 return {response,requests,retrieved};
}
test('compact request reaches retrieval and writing with complete needs, local dates and resident-only context',async()=>{
 for(const profile of [sterling,{...castle,timezone:'Asia/Tokyo'}]){
  const plan=raw(profile),before=JSON.stringify(plan),r=await run(profile,plan);
  assert.equal(r.requests.length,2);assert.equal(r.response.status,'unreviewed-experiment');assert.equal(r.response.completion,undefined);
  assert.equal(r.retrieved.needs[0].request,'When is yoga tomorrow?');assert.equal(r.retrieved.needs[0].id,'need-1');
  assert.equal(r.retrieved.liveRequests['need-1'].dateRange.start,profile.timezone==='Asia/Tokyo'?'2026-09-16':'2026-09-15');
  const payload=JSON.parse(r.requests[1].messages[0].content);assert.deepEqual(payload.requiredNeeds,r.retrieved.needs);assert.equal(payload.question,'What about tomorrow?');
  assert.doesNotMatch(JSON.stringify(r.requests),/UNTRUSTED_ASSISTANT_FACT/);assert.equal(JSON.stringify(plan),before);
  assert.equal(r.requests[0].tools[0].input_schema.properties.needs.items.properties.subject,undefined);assert.equal(r.response.trace[0].planningMode,'compact');
 }
});
test('invalid compact meaning is not fabricated and ambiguous requests do not reach retrieval',async()=>{
 const missing=raw(sterling);delete missing.needs[0].request;const invalid=await run(sterling,missing);
 assert.equal(invalid.requests.length,1);assert.equal(invalid.retrieved,null);assert.equal(invalid.response.reason,'invalid-interpretation');
 const ambiguous={...raw(sterling),scope:'ambiguous',needs:[],searchQueries:[],clarificationQuestion:'Which activity do you mean?'};
 const r=await run(sterling,ambiguous);assert.equal(r.requests.length,1);assert.equal(r.retrieved,null);assert.equal(r.response.answer,ambiguous.clarificationQuestion);
});
test('wrong-role and foreign connector bindings remain explicit gaps in the complete flow',async()=>{
 for(const mutate of [p=>p.needs[0].evidenceKind='official-information',p=>p.needs[0].liveRequest.connectorId='foreign-calendar']){
  const p=raw(sterling);mutate(p);const r=await run(sterling,p);
  assert.deepEqual(r.retrieved.liveRequests,{});assert.equal(r.retrieved.liveRequestDiagnostics[0].reason,'unsupported-live-binding');
  assert.ok(JSON.parse(r.requests[1].messages[0].content).evidenceGaps.some(d=>d.reason==='unsupported-live-binding'));
  assert.equal(r.response.reviewRequired,true);
 }
});
test('compact planning needs an explicit community profile and invalid modes make no provider call',async()=>{
 for(const options of [{planningMode:'compact'},{planningMode:'invented',profile:sterling}])await assert.rejects(()=>runCandidate({question:'Example'},{communityId:'alpha',apiKey:'FAKE_TEST_ONLY',...options,fetchImpl:()=>{throw Error('Must not call provider');}}),/Invalid bounded/);
});

const test=require('node:test'),assert=require('node:assert/strict');
const sterling=require('../data/communities/sterling-ranch.json'),castle=require('../data/communities/castle-rock.json');
const {createLiveEvidenceRetriever,projectLiveResult}=require('../scripts/quality-eval/live-evidence');
const {createConnectorAdapters}=require('../lib/community-connector-adapter');
const {getCommunityEvents,clearCommunityEventsCache}=require('../lib/community-events');
const {makeRetriever}=require('../scripts/quality-eval/flow-evidence');
const {packetIssues,runCandidate,coverageIssues}=require('../scripts/quality-eval/full-flow-candidate');
const now=Date.parse('2026-09-14T15:00:00Z'),clock=()=>now;
const need={id:'need-1',subject:'yoga class',task:'schedule',request:'When is the yoga class tomorrow?',evidenceKind:'live-operation'};
const range={start:'2026-09-15',end:'2026-09-15',label:'tomorrow'};
const html='<a id="eventTitle_42" href="/Calendar.aspx?EID=42"><span>Yoga class</span></a><span itemprop="startDate">2026-09-15T19:00:00</span><span itemprop="location"><span itemprop="name">Town Hall</span></span>';
function request(profile){return {kind:'calendar',connectorId:profile.connectors.find(c=>c.type==='civicplus-calendar').id,dateRange:range,filters:{category:'yoga'}};}
function context(profile,liveRetrieve){const base=profile.connectors.find(c=>c.type==='municode').baseUrl;return {profile,communityId:profile.communityId,communityIndex:{communityId:profile.communityId,sources:[],factLedger:[]},rulesIndex:{source:{sourceUrl:base},documents:[]},now,clock,liveRetrieve};}

test('actual calendar parsers feed scoped live sources and actions into two-community candidate retrieval',async()=>{
 for(const profile of [sterling,castle]){
  clearCommunityEventsCache();const live=createLiveEvidenceRetriever({profile,requests:{'need-1':request(profile)},clock,fetchImpl:async()=>new Response(html)});
  const packet=await makeRetriever(context(profile,live))({needs:[need]});
  assert.deepEqual(packetIssues(packet,profile.communityId,now),[]);assert.equal(packet.sources.length,1);assert.equal(packet.sources[0].role,'live-operation');
  assert.equal(packet.sources[0].communityId,profile.communityId);assert.match(packet.sources[0].text,/Yoga class/);assert.match(packet.sources[0].text,/Town Hall/);
  assert.deepEqual(packet.sources[0].retrievedForNeedIds,['need-1']);assert.equal(packet.actions.length,1);assert.equal(packet.actions[0].sourceId,packet.sources[0].id);
  const shown=require('../scripts/quality-eval/writer-presentation').presentPayload({evidence:require('../scripts/quality-eval/full-flow-candidate').modelEvidence(packet.sources)},packet,{timezone:profile.timezone,now});
  assert.equal(JSON.parse(shown.evidence[0].text).scopeLimit,undefined);assert.match(shown.evidence[0].text,/Yoga class/);assert.match(shown.assistantEvidenceContext[0].scopeLimit,/requested dates/);
 }
});
test('healthy empty calendar is range-limited while malformed/degraded data stays an explicit gap',async()=>{
 clearCommunityEventsCache();const req=request(sterling);
 const empty=await createLiveEvidenceRetriever({profile:sterling,requests:{'need-1':req},clock,fetchImpl:async()=>new Response('No events')})(need);
 assert.equal(JSON.parse(empty.sources[0].text).matchStatus,'no-matches-in-checked-range');assert.deepEqual(empty.sources[0].actions,[]);
 const degraded=await createLiveEvidenceRetriever({profile:sterling,requests:{'need-1':req},clock:()=>now+61*60000,fetchImpl:async()=>new Response('broken calendar')})(need);
 assert.equal(degraded.sources.length,0);assert.equal(degraded.diagnostics[0].reason,'live-evidence-unavailable');
 clearCommunityEventsCache();const failed=await createLiveEvidenceRetriever({profile:sterling,requests:{'need-1':req},clock,fetchImpl:async()=>new Response('Unavailable',{status:503})})(need);
 assert.equal(failed.sources.length,0);assert.match(failed.diagnostics[0].detail,/503/);
});
test('envelope mismatch, substituted URL, filter mismatch and expiry cannot supply live facts',async()=>{
 clearCommunityEventsCache();const req=request(sterling),adapter=createConnectorAdapters(sterling).find(a=>a.connectorId===req.connectorId);
 const result=await getCommunityEvents(req,{profile:sterling,adapter,now:new Date(now),fetchImpl:async()=>new Response(html)});
 const options={now,timezone:sterling.timezone};assert.doesNotThrow(()=>projectLiveResult(result,adapter,req,options));
 for(const mutate of [r=>{r.evidenceEnvelope.communityId='other';},r=>{r.sourceUrl='https://sterlingranchcab.com/unrelated';},r=>{r.evidenceEnvelope.request.filters={category:'music'};},r=>{r.evidenceEnvelope.evidence[0].staleAfter=new Date(now-1).toISOString();}]){
  const bad=structuredClone(result);mutate(bad);assert.throws(()=>projectLiveResult(bad,adapter,req,options));
 }
});
test('actual status parser contributes current status but rejects unsupported request kinds',async()=>{
 const profile=sterling,req={kind:'current-status',connectorId:'pool-status'},statusNeed={...need,subject:'pool',task:'status'};
 const fetchImpl=async()=>new Response('<a class="widgetGraphicLinksLink" href="/187/Pool"><img alt="Green Light"></a>');
 const result=await createLiveEvidenceRetriever({profile,requests:{'need-1':req},clock,fetchImpl})(statusNeed);
 assert.equal(result.sources.length,1);assert.equal(JSON.parse(result.sources[0].text).headline,'Open');assert.match(result.sources[0].text,/does not establish regular hours/);
 const statusPacket={sources:result.sources.map(s=>({...s,role:'live-operation'}))};
 const shown=require('../scripts/quality-eval/writer-presentation').presentPayload({evidence:require('../scripts/quality-eval/full-flow-candidate').modelEvidence(statusPacket.sources)},statusPacket,{timezone:profile.timezone,now});
 assert.equal(JSON.parse(shown.evidence[0].text).headline,'Open');assert.equal(JSON.parse(shown.evidence[0].text).scopeLimit,undefined);assert.match(shown.assistantEvidenceContext[0].scopeLimit,/regular hours/);
 const invalid=await createLiveEvidenceRetriever({profile,requests:{'need-1':{...req,kind:'calendar'}},clock,fetchImpl})(statusNeed);assert.equal(invalid.sources.length,0);
});
test('unresolved live binding never calls a source and mixed static evidence survives live failure',async()=>{
 let calls=0;const live=createLiveEvidenceRetriever({profile:sterling,clock,fetchImpl:async()=>{calls++;throw new Error('unexpected');}});
 const c=context(sterling,live),doc={id:'rule',nodeId:'rule',communityId:sterling.communityId,sourceUrl:c.rulesIndex.source.sourceUrl+'?nodeId=rule',productId:1,jobId:1,title:'Example rule',text:'Approval is required.'};
 c.rulesIndex.documents=[doc];c.ruleSearch=async()=>[doc];
 const packet=await makeRetriever(c)({needs:[need,{...need,id:'need-2',evidenceKind:'governing-rule'}]});
 assert.equal(calls,0);assert.equal(packet.sources.length,1);assert.equal(packet.sources[0].role,'governing-rule');assert.equal(packet.diagnostics[0].reason,'live-request-not-resolved');
});
test('live evidence expiring during writing is withheld even in offline-review mode',async()=>{
 let current=now;const source={id:'live',communityId:'alpha',version:'v1',role:'live-operation',text:'Open',sourceUrl:'https://alpha.example/status',checkedAt:new Date(now).toISOString(),staleAfter:new Date(now+1000).toISOString(),actions:[]};
 const packet={communityId:'alpha',sources:[source],actions:[],diagnostics:[]};
 const plan={standaloneQuestion:'Is the pool open?',scope:'community',usedPriorContext:false,clarificationQuestion:'',needs:[{subject:'pool',task:'status',request:'Current pool status',evidenceKind:'live-operation'}],constraints:[],searchQueries:['pool status']};
 let calls=0;const response=await runCandidate({question:'Is the pool open?'},{communityId:'alpha',apiKey:'synthetic-only',clock:()=>current,retrieve:async()=>packet,assessmentMode:'offline-review',maxRepairs:0,fetchImpl:async(_url,init)=>{
  const body=JSON.parse(init.body);calls++;if(calls===2)current+=1001;
  return new Response(JSON.stringify({stop_reason:'tool_use',content:[{type:'tool_use',name:body.tools[0].name,input:calls===1?plan:{answer:'Open',actionIds:[]}}]}));
 }});
 assert.equal(calls,2);assert.equal(response.answer,null);assert.equal(response.reason,'evidence-expired-during-answer');
 const governingPlan={needs:[{id:'need-1',evidenceKind:'governing-rule'}]},check={outcome:'complete',hardFailures:[],failureDetails:[],actionReviews:[],needs:[{needId:'need-1',request:'Permission',status:'addressed',supportSourceIds:['live']}]};
 assert.ok(coverageIssues(check,governingPlan,packet).includes('missing-governing-support'));
});

test('full candidate passes actual adapter evidence and source failures to the writer with need identity intact',async()=>{
 for(const fail of [false,true]){
  clearCommunityEventsCache();const live=createLiveEvidenceRetriever({profile:sterling,requests:{'need-1':request(sterling)},clock,fetchImpl:async()=>new Response(fail?'Unavailable':html,{status:fail?503:200})});
  const retrieve=makeRetriever(context(sterling,live));
  const {id,...unidentifiedNeed}=need;
  const plan={standaloneQuestion:need.request,scope:'community',usedPriorContext:false,clarificationQuestion:'',needs:[unidentifiedNeed],constraints:[],searchQueries:['yoga class']};
  let calls=0;
  const result=await runCandidate({question:need.request},{communityId:sterling.communityId,apiKey:'synthetic-only',retrieve,clock,assessmentMode:'offline-review',maxRepairs:0,fetchImpl:async(_url,init)=>{
   const body=JSON.parse(init.body);calls++;let output=plan;
   if(calls===2){const payload=JSON.parse(body.messages[0].content);assert.equal(payload.requiredNeeds[0].id,'need-1');
    if(fail){assert.equal(payload.evidence.length,0);assert.equal(payload.evidenceGaps[0].reason,'live-evidence-unavailable');}
    else{assert.equal(payload.evidence[0].role,'live-operation');assert.match(payload.evidence[0].text,/Yoga class/);assert.equal(payload.evidence[0].checkedAt,new Date(now).toISOString());}
    output={answer:fail?'I could not check the calendar.':'Yoga class is listed for tomorrow at Town Hall.',actionIds:payload.actions.map(a=>a.id)};
   }
   return new Response(JSON.stringify({stop_reason:'tool_use',content:[{type:'tool_use',name:body.tools[0].name,input:output}]}));
  }});
  assert.equal(calls,2);assert.equal(result.status,'unreviewed-experiment');assert.equal(result.completion,undefined);assert.equal(result.sources.length,fail?0:1);
 }
});

test('profile-aware interpretation automatically binds and invokes the calendar without a manual request map',async()=>{
 clearCommunityEventsCache();let sourceCalls=0,modelCalls=0;
 const profile=sterling,live=createLiveEvidenceRetriever({profile,clock,fetchImpl:async()=>{sourceCalls++;return new Response(html);}});
 const plan={standaloneQuestion:need.request,scope:'community',usedPriorContext:false,clarificationQuestion:'',constraints:[],searchQueries:['yoga'],needs:[{
  subject:'yoga class',task:'schedule',request:need.request,evidenceKind:'live-operation',liveRequest:{kind:'calendar',connectorId:request(profile).connectorId,dateText:'tomorrow',filters:{category:'yoga',location:''}}
 }]};
 const result=await runCandidate({question:need.request},{communityId:profile.communityId,profile,apiKey:'synthetic-only',retrieve:makeRetriever(context(profile,live)),clock,assessmentMode:'offline-review',maxRepairs:0,fetchImpl:async(_url,init)=>{
  const body=JSON.parse(init.body),payload=JSON.parse(body.messages[0].content);modelCalls++;
  if(modelCalls===1)assert.ok(payload.connectors.some(c=>c.kind==='calendar'));
  else assert.match(payload.evidence[0].text,/2026-09-15/);
  return new Response(JSON.stringify({stop_reason:'tool_use',content:[{type:'tool_use',name:body.tools[0].name,input:modelCalls===1?plan:{answer:'Yoga class is listed tomorrow at Town Hall.',actionIds:payload.actions.map(a=>a.id)}}]}));
 }});
 assert.equal(modelCalls,2);assert.equal(sourceCalls,1);assert.equal(result.status,'unreviewed-experiment');assert.equal(result.plan.liveRequests['need-1'].dateRange.start,'2026-09-15');
});

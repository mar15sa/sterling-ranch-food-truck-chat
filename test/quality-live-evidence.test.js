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

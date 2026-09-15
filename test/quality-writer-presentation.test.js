const test=require('node:test'),assert=require('node:assert/strict');
const {presentWriterRequest,presentPayload,localTime}=require('../scripts/quality-eval/writer-presentation');
const {COMPOSE,modelEvidence,modelActions,compositionSchema,runCandidate,draftIssues,packetIssues}=require('../scripts/quality-eval/full-flow-candidate');
const now=Date.parse('2026-09-15T00:30:00Z');
function fixture(communityId='alpha',timezone='America/Denver',kind='current-status'){
 const scopes={
  'current-status':{headline:'Closed',summary:'No access for guests.'},
  calendar:{requestedRange:{start:'2026-09-15',end:'2026-09-15'},filters:{category:'yoga'},matchStatus:'no-matches-in-checked-range',events:[]},
  'food-truck':{requestedDate:'2026-09-14',trucks:[{name:'Example Kitchen'}],matchStatus:'listings-for-requested-day'},
  'waste-schedule':{service:'recycling',requestedArea:'North Village',startingDate:'2026-09-14',serviceAreas:[{label:'North Village',date:'2026-09-15'}]}
 };
 const data={kind,...scopes[kind],scopeLimit:'Only this requested facet is established; another detail remains unverified.',timezone,observedAt:new Date(now).toISOString()};
 const live={id:'live',communityId,role:'live-operation',version:'v1',sourceUrl:`https://${communityId}.example/live`,title:'Official source',text:JSON.stringify(data),liveScope:data,checkedAt:new Date(now).toISOString(),staleAfter:new Date(now+60000).toISOString(),actions:[]};
 const rule={id:'rule',communityId,role:'governing-rule',version:'v2',sourceUrl:`https://${communityId}.example/rule`,title:'Policy',text:'In general six feet; a 4:12 slope may qualify for a taller design. No variance on restricted lots.',approvalScope:'Adopted policy only',withheldScope:['fees'],actions:[]};
 const sourceAction={label:'Open official source',url:live.sourceUrl,actionType:'information'};live.actions=[sourceAction];
 const packet={communityId,sources:[live,rule],actions:[{id:'live-a0',sourceId:'live',communityId,version:'v1',...sourceAction}],diagnostics:[{needId:'need-2',reason:'source-unavailable'}]};
 const payload={question:'What is the status and policy?',priorResidentQuestions:['Tell me about the facility.'],requiredNeeds:[],constraints:[],evidence:modelEvidence(packet.sources),actions:modelActions(packet.actions),evidenceGaps:packet.diagnostics,previousAttempt:null};
 const body={model:'claude-haiku-4-5',max_tokens:650,thinking:{type:'disabled'},temperature:0,system:COMPOSE,tools:[{name:'compose_requested_answer',strict:true,input_schema:compositionSchema(packet)}],tool_choice:{type:'tool',name:'compose_requested_answer'},messages:[{role:'user',content:JSON.stringify(payload)}]};
 return {packet,body,timezone,payload};
}
test('each live family keeps facts and moves only exact identity-bound internal metadata',()=>{
 for(const kind of ['calendar','current-status','food-truck','waste-schedule'])for(const [communityId,timezone] of [['alpha','America/Denver'],['beta','Asia/Tokyo']]){
  const {packet,body,payload}=fixture(communityId,timezone,kind),before=structuredClone(packet);
  const presented=presentWriterRequest(body,packet,{separateContext:true,timezone,now}),result=JSON.parse(presented.messages[0].content);
  const {kind:originalKind,scopeLimit,observedAt,timezone:sourceTimezone,...facts}=packet.sources[0].liveScope;
  assert.deepEqual(JSON.parse(result.evidence[0].text),facts);assert.deepEqual(result.evidence[1],payload.evidence[1]);
  assert.deepEqual(result.actions,payload.actions);assert.deepEqual(result.evidenceGaps,payload.evidenceGaps);assert.deepEqual(result.requiredNeeds,payload.requiredNeeds);
  const metadata=result.assistantEvidenceContext[0];assert.equal(metadata.scopeLimit,scopeLimit);assert.equal(metadata.connectorKind,kind);assert.equal(metadata.observedAtUtc,observedAt);
  assert.equal(metadata.checkedAtUtc,packet.sources[0].checkedAt);assert.equal(metadata.timezone,timezone);assert.equal(result.writerContext.timezone,timezone);
  assert.equal(result.writerContext.localDate,timezone==='America/Denver'?'2026-09-14':'2026-09-15');assert.deepEqual(packet,before);
  assert.deepEqual(presented.tools,body.tools);assert.equal(presented.model,body.model);assert.equal(presented.max_tokens,body.max_tokens);
 }
});
test('local check time includes date and timezone with winter/summer offsets and UTC audit retained',()=>{
 assert.match(localTime('2026-09-14T23:33:00Z','America/Denver'),/5:33:00 PM MDT/);
 assert.match(localTime('2026-01-14T23:33:00Z','America/Denver'),/4:33:00 PM MST/);
 assert.match(localTime('2026-09-15T00:30:00Z','Asia/Tokyo'),/9:30:00 AM GMT\+9/);
 assert.throws(()=>localTime('invalid','America/Denver'));assert.throws(()=>localTime(new Date(now).toISOString(),'Unknown/Place'));
});
test('mismatched facts, timezone, role and source inventory cannot receive transformed evidence',()=>{
 for(const change of [x=>x.packet.sources[0].liveScope.headline='Open',x=>x.packet.sources[0].liveScope.timezone='Asia/Tokyo',
  x=>x.packet.sources[0].role='official-process',x=>x.packet.sources[0].sourceUrl='https://other.example/live',x=>x.packet.sources.push({...x.packet.sources[0]})]){
  const f=fixture();change(f);assert.throws(()=>presentWriterRequest(f.body,f.packet,{separateContext:true,timezone:f.timezone,now}));
 }
 const f=fixture();assert.throws(()=>presentWriterRequest(f.body,f.packet,{separateContext:true,now}));
});
test('stable strict schema is identical across action inventories and preserves software rejection',()=>{
 const schemas=[];
 for(const count of [0,1,3]){
  const {packet,body}=fixture();packet.actions=Array.from({length:count},(_,i)=>({...packet.actions[0],id:'action-'+i}));
  body.tools[0].input_schema=compositionSchema(packet);const request=presentWriterRequest(body,packet,{stableActionSchema:true});
  schemas.push(request.tools[0].input_schema);assert.equal(request.tools[0].strict,true);assert.deepEqual(request.messages,body.messages);assert.equal(request.system,body.system);
  assert.ok(draftIssues({answer:'Supported answer',actionIds:['invented']},packet).includes('unknown-action'));
  assert.ok(draftIssues({answer:'Supported answer',actionIds:['action-0','action-0']},packet).includes('unknown-action'));
  assert.ok(draftIssues({answer:'Use https://other.example/fake',actionIds:[]},packet).includes('unverified-answer-url'));
 }
 assert.deepEqual(schemas[0],schemas[1]);assert.deepEqual(schemas[1],schemas[2]);
 const {packet}=fixture();packet.actions[0].version='changed';assert.ok(packetIssues(packet,'alpha',now).includes('invalid-action-identity'));
 assert.ok(packetIssues(packet,'beta',now).includes('invalid-evidence-packet'));
});
test('disabled presentation is exact control and static conflict/rule text remains intact',()=>{
 const {packet,body,payload}=fixture();assert.deepEqual(presentWriterRequest(body,packet),body);
 const conflicting={...packet.sources[1],id:'contradiction',text:'An adopted amendment gives a different limit.'};packet.sources.push(conflicting);payload.evidence=modelEvidence(packet.sources);
 const p=presentPayload(payload,packet,{timezone:'America/Denver',now});assert.deepEqual(p.evidence.slice(1),payload.evidence.slice(1));
});
function plan(){return {standaloneQuestion:'Is the facility open?',usedPriorContext:false,scope:'community',clarificationQuestion:'',needs:[{subject:'facility',task:'status',request:'Is the facility open?',evidenceKind:'live-operation'}],constraints:[],searchQueries:['facility status']};}
test('candidate writer, checker and repair share separated metadata and preserve original packet',async()=>{
 const {packet}=fixture(),before=structuredClone(packet),requests=[];
 const badCheck={outcome:'partial',hardFailures:['unsupported-material-claim'],needs:[{needId:'need-1',request:'Facility status',status:'addressed',supportSourceIds:['live']}],actionReviews:[],failureDetails:[{failure:'unsupported-material-claim',reason:'Unconfirmed explanation',statement:'It is closed for maintenance.',actionId:''}]};
 const goodCheck={...badCheck,outcome:'complete',hardFailures:[],failureDetails:[]};
 const outputs=[plan(),{answer:'It is closed for maintenance.',actionIds:[]},badCheck,{answer:'The facility is closed.',actionIds:[]},goodCheck];
 const result=await runCandidate({question:'Is the facility open?'},{communityId:'alpha',apiKey:'test-only',clock:()=>now,retrieve:async()=>packet,
  writerPresentation:{separateContext:true,stableActionSchema:true,timezone:'America/Denver'},fetchImpl:async(_url,init)=>{
   const body=JSON.parse(init.body);requests.push(body);return new Response(JSON.stringify({stop_reason:'tool_use',content:[{type:'tool_use',name:body.tools[0].name,input:outputs[requests.length-1]}]}));
  }});
 assert.equal(requests.length,5);assert.equal(result.completion.outcome,'complete');assert.deepEqual(packet,before);
 for(const request of requests.slice(1)){const p=JSON.parse(request.messages[0].content);assert.ok(p.assistantEvidenceContext[0].scopeLimit);assert.equal(p.writerContext.timezone,'America/Denver');assert.equal(JSON.parse(p.evidence[0].text).scopeLimit,undefined);}
 assert.deepEqual(requests[1].tools,requests[3].tools);
});
test('candidate cannot release expired evidence or unknown action with stable presentation',async()=>{
 for(const fail of ['expiry','action']){
  const {packet}=fixture();let current=now,calls=0;
  const result=await runCandidate({question:'Is the facility open?'},{communityId:'alpha',apiKey:'test-only',clock:()=>current,retrieve:async()=>packet,
   assessmentMode:'offline-review',maxRepairs:0,writerPresentation:{separateContext:true,stableActionSchema:true,timezone:'America/Denver'},fetchImpl:async(_url,init)=>{
    const body=JSON.parse(init.body);calls++;if(calls===2&&fail==='expiry')current+=60001;
    return new Response(JSON.stringify({stop_reason:'tool_use',content:[{type:'tool_use',name:body.tools[0].name,input:calls===1?plan():{answer:'Closed',actionIds:fail==='action'?['invented']:[]}}]}));
   }});
  assert.equal(result.answer,null);assert.equal(result.status,'unresolved-experiment');
 }
});

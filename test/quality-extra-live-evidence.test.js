const test=require('node:test'),assert=require('node:assert/strict');
const sterling=require('../data/communities/sterling-ranch.json');
const {createConnectorAdapters}=require('../lib/community-connector-adapter');
const {liveUnderstandingRequest,resolveLivePlan}=require('../scripts/quality-eval/live-request-plan');
const {fetchExtraLive}=require('../scripts/quality-eval/extra-live-evidence');
const {createLiveEvidenceRetriever,projectLiveResult}=require('../scripts/quality-eval/live-evidence');
const {makeRetriever}=require('../scripts/quality-eval/flow-evidence');
const {runCandidate,packetIssues}=require('../scripts/quality-eval/full-flow-candidate');
const {localToday}=require('../lib/community-interpretation');
const clock=Date.now;
function second(){
 const profile=JSON.parse(JSON.stringify(sterling).replaceAll('sterling-ranch','ridgeview').replaceAll('Sterling Ranch','Ridgeview').replaceAll('sterlingranchcab.com','ridgeview.example').replaceAll('www.wasteconnections.com','collection.example').replaceAll('api.recollect.net','api.schedule.example'));
 const settings=profile.connectors.find(c=>c.adapter?.wasteSchedule).adapter.wasteSchedule;
 delete settings.communityCycleReference;
 settings.serviceAreas=[{label:'North District',officialReferenceLocation:{privacy:'published-service-area-reference',query:'400 Cedar Road',candidateTextPattern:'400\\s+Cedar'}},{label:'South District'}];
 return profile;
}
const profiles=[sterling,second()];
const adapter=(profile,family)=>createConnectorAdapters(profile).find(a=>a.family===family);
function requests(profile){const day=localToday(new Date(),profile.timezone);return {
 food:{kind:'food-truck',connectorId:adapter(profile,'food-truck-schedule').connectorId,dateRange:{start:day,end:day}},
 waste:{kind:'waste-schedule',connectorId:adapter(profile,'live-waste-schedule').connectorId,service:'recycling',serviceArea:profile.communityId==='sterling-ranch'?'Providence Village':'North District',dateRange:{start:day,end:day}}
};}
function sourceFetch(profile,{brokenFood=false,brokenWaste=false,emptyFood=false}={}){return async url=>{
 const text=String(url),day=requests(profile).food.dateRange.start;
 if(text.includes('address-suggest'))return Response.json([{place_id:'A1234567-1234-1234-1234-123456789012',address:profile.communityId==='sterling-ranch'?'7853 Piney River Avenue':'400 Cedar Road'}]);
 if(text.includes('/events?'))return brokenWaste?new Response('unavailable',{status:503}):Response.json({events:[{day,flags:[{name:'Recycling'}]},{day,flags:[{name:'Garbage'}]}]});
 if(brokenFood)return new Response('unreadable calendar');
 const listingDay=emptyFood?new Date(Date.parse(day)+86400000).toISOString().slice(0,10):day;
 return new Response(`${Number(listingDay.slice(5,7))}/${Number(listingDay.slice(8,10))}/${listingDay.slice(0,4)} - Sample Kitchen`);
};}
const need={id:'need-1',subject:'schedule',task:'schedule',request:'Requested schedule',evidenceKind:'live-operation'};
function raw(question,kind,connectorId,dateText,filters){return {standaloneQuestion:question,scope:'community',usedPriorContext:false,clarificationQuestion:'',constraints:[],searchQueries:[question],needs:[{...need,liveRequest:{kind,connectorId,dateText,filters}}].map(({id,...n})=>n)};}

test('planner advertises both dedicated capabilities without exposing public reference addresses',()=>{
 const req=liveUnderstandingRequest({question:'When is recycling?'},'claude-haiku-4-5',sterling);
 const text=JSON.stringify(req),payload=JSON.parse(req.messages[0].content);
 assert.ok(payload.connectors.some(c=>c.kind==='food-truck'));assert.ok(payload.connectors.some(c=>c.kind==='waste-schedule'));
 assert.match(text,/Providence Village/);assert.doesNotMatch(text,/7853|Piney River|candidateTextPattern/);
});
test('food day and copied collection area resolve; adjacent facets and invented or compound areas stay gaps',()=>{
 for(const profile of profiles){
  const r=requests(profile),question=`When is recycling in ${r.waste.serviceArea} today?`;
  const plan=raw(question,'waste-schedule',r.waste.connectorId,'today',{category:'recycling',location:r.waste.serviceArea});
  assert.deepEqual(resolveLivePlan(plan,{question},profile).requests['need-1'],r.waste);
  for(const mutate of [p=>p.needs[0].task='status',p=>p.needs[0].task='permission',p=>p.needs[0].liveRequest.filters.location='Private Address',p=>p.needs[0].liveRequest.filters.category='garbage']){
   const copy=structuredClone(plan);mutate(copy);assert.equal(Object.keys(resolveLivePlan(copy,{question},profile).requests).length,0);
  }
  const foodQuestion='Which food truck is here today?',food=raw(foodQuestion,'food-truck',r.food.connectorId,'today',{category:'',location:''});
  assert.equal(resolveLivePlan(food,{question:foodQuestion},profile).requests['need-1'].dateRange.start,r.food.dateRange.start);
  food.needs[0].liveRequest.dateText='';assert.equal(Object.keys(resolveLivePlan(food,{question:'Which food truck is next?'},profile).requests).length,0);
 }
 const question='Recycling in Providence and Ascent today',plan=raw(question,'waste-schedule','waste-schedule','today',{category:'Recycling',location:'Providence and Ascent'});
 assert.equal(Object.keys(resolveLivePlan(plan,{question},sterling).requests).length,0);
});
test('one need cannot borrow another need date, and food requests cannot omit their date binding',()=>{
 const question='Which food truck is here tomorrow, and when is recycling in Providence Village?';
 const p=raw(question,'food-truck','food-truck-schedule','tomorrow',{category:'',location:''});
 p.needs.push(raw(question,'waste-schedule','waste-schedule','',{category:'recycling',location:'Providence Village'}).needs[0]);
 const now=Date.parse('2026-09-14T18:00:00Z'),r=resolveLivePlan(p,{question},sterling,now);
 assert.equal(r.requests['need-1'].dateRange.start,'2026-09-15');assert.equal(r.requests['need-2'].dateRange.start,'2026-09-14');
 p.needs[0].liveRequest.dateText='';const absent=resolveLivePlan(p,{question},sterling,now);
 assert.equal(absent.requests['need-1'],undefined);assert.equal(absent.requests['need-2'].dateRange.start,'2026-09-14');
});

for(const profile of profiles)test(`${profile.communityId}: actual food and waste parsers contribute scoped current evidence`,async()=>{
 const r=requests(profile),fetchImpl=sourceFetch(profile);
 for(const [key,request] of Object.entries(r)){
  const result=await createLiveEvidenceRetriever({profile,requests:{'need-1':request},fetchImpl,clock})(need);
  assert.deepEqual(result.diagnostics,[]);assert.equal(result.sources.length,1);
  const s=result.sources[0],data=JSON.parse(s.text);assert.equal(s.communityId,profile.communityId);assert.ok(Date.parse(s.staleAfter)>clock());
  if(key==='food'){assert.deepEqual(data.trucks,[{name:'Sample Kitchen'}]);assert.match(data.scopeLimit,/No menu, price/);}
  else {assert.equal(data.service,'recycling');assert.deepEqual(data.serviceAreas,[{label:request.serviceArea,date:request.dateRange.start}]);assert.match(data.scopeLimit,/holiday delay/);}
  assert.ok(s.actions.length);assert.ok(s.actions.every(a=>new URL(a.url).protocol==='https:'));
  const packet={sources:[{...s,role:'live-operation'}]};
  const shown=require('../scripts/quality-eval/writer-presentation').presentPayload({evidence:require('../scripts/quality-eval/full-flow-candidate').modelEvidence(packet.sources)},packet,{timezone:profile.timezone,now:clock()});
  const presented=JSON.parse(shown.evidence[0].text);assert.equal(presented.scopeLimit,undefined);assert.equal(shown.assistantEvidenceContext[0].scopeLimit,data.scopeLimit);
  if(key==='food')assert.deepEqual(presented.trucks,data.trucks);else assert.deepEqual(presented.serviceAreas,data.serviceAreas);
 }
});
test('healthy food absence differs from failed parsing; unavailable areas and providers cannot create dates',async()=>{
 for(const profile of profiles){
  const r=requests(profile);
  const empty=await createLiveEvidenceRetriever({profile,requests:{'need-1':r.food},fetchImpl:sourceFetch(profile,{emptyFood:true}),clock})(need);
  assert.equal(JSON.parse(empty.sources[0].text).matchStatus,'no-listing-for-requested-day');
  for(const [request,fetchImpl] of [[r.food,sourceFetch(profile,{brokenFood:true})],[r.waste,sourceFetch(profile,{brokenWaste:true})]]){
   const failed=await createLiveEvidenceRetriever({profile,requests:{'need-1':request},fetchImpl,clock})(need);assert.equal(failed.sources.length,0);assert.ok(failed.diagnostics.length);
  }
 }
 const profile=second(),r=requests(profile);let calls=0;
 const missing=await createLiveEvidenceRetriever({profile,requests:{'need-1':{...r.waste,serviceArea:'South District'}},fetchImpl:async()=>{calls++;throw Error('must not fetch');},clock})(need);
 assert.equal(calls,0);assert.equal(missing.sources.length,0);
});
test('extra projections reject wrong community, source, dates, service and expired evidence',async()=>{
 for(const [key,family] of [['food','food-truck-schedule'],['waste','live-waste-schedule']]){
  const request=requests(sterling)[key],a=adapter(sterling,family),result=await fetchExtraLive(request,{profile:sterling,adapter:a,fetchImpl:sourceFetch(sterling),clock});
  for(const mutate of [r=>r.evidenceEnvelope.communityId='elsewhere',r=>r.sourceUrl='https://sterlingranchcab.com/wrong',r=>r.evidenceEnvelope.freshness.staleAfter=new Date(clock()-1).toISOString(),r=>r.evidenceEnvelope.request.dateRange.start='2000-01-01',r=>{r.evidenceEnvelope.claims=[];}]){
   const copy=structuredClone(result);mutate(copy);assert.throws(()=>projectLiveResult(copy,a,request,{now:clock(),timezone:sterling.timezone}));
  }
  if(key==='waste')assert.throws(()=>projectLiveResult({...result,service:'garbage'},a,request,{now:clock(),timezone:sterling.timezone}));
 }
});
test('full candidate keeps food and governing evidence while the independent collection source fails',async()=>{
 const profile=sterling,r=requests(profile),question='Which food truck is here today, when is recycling in Providence Village today, and what is the storage rule?';
 const plan=raw(question,'food-truck',r.food.connectorId,'today',{category:'',location:''});
 plan.needs.push(raw(question,'waste-schedule',r.waste.connectorId,'today',{category:'recycling',location:'Providence Village'}).needs[0]);
 plan.needs.push({subject:'storage',task:'permission',request:'Storage rule',evidenceKind:'governing-rule',liveRequest:{kind:'none',connectorId:'',dateText:'',filters:{category:'',location:''}}});
 const base=profile.connectors.find(c=>c.type==='municode').baseUrl,doc={id:'rule',nodeId:'rule',communityId:profile.communityId,sourceUrl:base+'?nodeId=rule',productId:1,jobId:1,title:'Example storage rule',text:'Storage approval is required.'};
 const liveRetrieve=createLiveEvidenceRetriever({profile,fetchImpl:sourceFetch(profile,{brokenWaste:true}),clock});
 const retrieve=makeRetriever({profile,communityId:profile.communityId,communityIndex:{communityId:profile.communityId,sources:[],factLedger:[]},rulesIndex:{source:{sourceUrl:base},documents:[doc]},ruleSearch:async()=>[doc],now:clock(),clock,liveRetrieve});
 let calls=0,packet;
 const result=await runCandidate({question},{communityId:profile.communityId,profile,apiKey:'fixture',clock,assessmentMode:'offline-review',maxRepairs:0,retrieve:async p=>{packet=await retrieve(p);return packet;},fetchImpl:async(_url,init)=>{
  calls++;const body=JSON.parse(init.body),payload=JSON.parse(body.messages[0].content);
  if(calls===2){assert.ok(payload.evidence.some(s=>s.role==='governing-rule'));assert.ok(payload.evidence.some(s=>s.text.includes('Sample Kitchen')));assert.ok(payload.evidenceGaps.some(d=>d.needId==='need-2'));}
  return Response.json({stop_reason:'tool_use',content:[{type:'tool_use',name:body.tools[0].name,input:calls===1?plan:{answer:'Sample Kitchen is listed today. Storage approval is required. The recycling date could not be confirmed.',actionIds:[]}}]});
 }});
 assert.equal(calls,2,JSON.stringify(result));assert.deepEqual(packetIssues(packet,profile.communityId,clock()),[]);assert.equal(result.status,'unreviewed-experiment');
});

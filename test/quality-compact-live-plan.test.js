const test=require('node:test'),assert=require('node:assert/strict');
const {liveUnderstandingRequest}=require('../scripts/quality-eval/live-request-plan');
const {compactRequest,resolveCompactLivePlan}=require('../scripts/quality-eval/compact-live-plan');
const sterling=require('../data/communities/sterling-ranch.json'),castle=require('../data/communities/castle-rock.json');
const now=Date.parse('2026-09-14T18:00:00Z');
function plan(profile,question='Is there yoga tomorrow?'){return {standaloneQuestion:question,scope:'community',usedPriorContext:false,clarificationQuestion:'',constraints:[],searchQueries:['yoga tomorrow'],needs:[{request:question,task:'schedule',evidenceKind:'live-operation',liveRequest:{connectorId:profile.connectors.find(c=>c.type==='civicplus-calendar').id,dateText:'tomorrow',filters:{category:'yoga',location:''}}}]};}
test('compact schema removes duplicated fields and advertises implemented food capability only',()=>{
 const original=liveUnderstandingRequest({question:'Which truck is here today?',context:[{question:'Hi',answer:'Old generated fact'}]},'claude-haiku-4-5',sterling,now),request=compactRequest(original);
 const need=request.tools[0].input_schema.properties.needs.items;
 assert.equal(need.properties.subject,undefined);assert.equal(need.properties.liveRequest.properties.kind,undefined);
 assert.ok(need.required.includes('request'));assert.ok(original.tools[0].input_schema.properties.needs.items.properties.subject);
 const a=JSON.parse(original.messages[0].content),b=JSON.parse(request.messages[0].content);
 assert.deepEqual({...b,connectors:a.connectors},a);assert.doesNotMatch(request.messages[0].content,/Old generated fact/);
 const food=b.connectors.find(c=>c.kind==='food-truck');assert.deepEqual(food.capabilities,['events']);assert.ok(!food.facets.includes('menu')&&!food.facets.includes('price'));
});
test('compact requests derive configured connector kind in two communities without changing full meaning',()=>{
 for(const profile of [sterling,castle]){const raw=plan(profile),r=resolveCompactLivePlan(raw,{question:raw.standaloneQuestion},profile,now);
  assert.deepEqual(r.issues,[]);assert.deepEqual(r.diagnostics,[]);assert.equal(r.requests['need-1'].kind,'calendar');assert.equal(r.requests['need-1'].dateRange.start,'2026-09-15');
  assert.equal(r.plan.needs[0].request,raw.needs[0].request);assert.equal(raw.needs[0].subject,undefined);assert.equal(raw.needs[0].liveRequest.kind,undefined);
 }
});
test('missing request text, extra kind, invented filters, cross-profile IDs and role collisions are not repaired',()=>{
 for(const mutate of [p=>delete p.needs[0].request,p=>p.needs[0].liveRequest.kind='calendar',p=>p.needs[0].liveRequest.connectorId=0,p=>p.needs[0].liveRequest.connectorId='other-community-calendar',p=>p.needs[0].liveRequest.filters.category='invented',p=>p.needs[0].evidenceKind='governing-rule']){
  const raw=plan(sterling);mutate(raw);const r=resolveCompactLivePlan(raw,{question:raw.standaloneQuestion},sterling,now);
  assert.equal(Object.keys(r.requests).length,0);assert.ok(r.issues.length||r.diagnostics.length);
 }
});
test('single follow-up correction and separate date scopes survive compact normalization',()=>{
 const raw=plan(sterling,'What about tomorrow?');raw.usedPriorContext=true;raw.needs[0].request='Yoga tomorrow';raw.needs[0].liveRequest.dateText='today';
 const r=resolveCompactLivePlan(raw,{question:'What about tomorrow?',context:[{question:'Is yoga today?'}]},sterling,now);assert.equal(r.requests['need-1'].dateRange.start,'2026-09-15');
 const question='Which food truck is here tomorrow, and when is recycling in Ascent Village?';
 const p=plan(sterling,question);p.needs=[{request:'Food truck tomorrow',task:'schedule',evidenceKind:'live-operation',liveRequest:{connectorId:'food-truck-schedule',dateText:'tomorrow',filters:{category:'',location:''}}},{request:'Next recycling in Ascent Village',task:'schedule',evidenceKind:'live-operation',liveRequest:{connectorId:'waste-schedule',dateText:'',filters:{category:'recycling',location:'Ascent Village'}}}];
 const mixed=resolveCompactLivePlan(p,{question},sterling,now);assert.deepEqual(mixed.issues,[]);assert.equal(mixed.requests['need-1'].dateRange.start,'2026-09-15');assert.equal(mixed.requests['need-2'].dateRange.start,'2026-09-14');
});

const test=require('node:test'),assert=require('node:assert/strict');
const sterling=require('../data/communities/sterling-ranch.json'),castle=require('../data/communities/castle-rock.json');
const {liveUnderstandingRequest,resolveLivePlan}=require('../scripts/quality-eval/live-request-plan');
const {highConfidenceDateRange,denverToday}=require('../lib/community-interpretation');
const now=Date.parse('2026-09-15T04:00:00Z');
function fixture(profile,question='When is yoga tomorrow?'){
 return {standaloneQuestion:question,scope:'community',usedPriorContext:false,clarificationQuestion:'',constraints:[],searchQueries:['yoga'],needs:[{
  subject:'yoga',task:'schedule',request:question,evidenceKind:'live-operation',liveRequest:{kind:'calendar',connectorId:profile.connectors.find(c=>c.type==='civicplus-calendar').id,dateText:'tomorrow',filters:{category:'yoga',location:''}}
 }]};
}
test('date parser accepts community timezone while preserving existing Denver default',()=>{
 assert.equal(denverToday(new Date(now)),'2026-09-14');
 assert.equal(highConfidenceDateRange('tomorrow',new Date(now)).start,'2026-09-15');
 assert.equal(highConfidenceDateRange('tomorrow',new Date(now),'Asia/Tokyo').start,'2026-09-16');
});
test('profile-aware prompt limits connector choices, copies context without assistant facts and resolves timezone dates',()=>{
 for(const profile of [sterling,{...castle,timezone:'Asia/Tokyo'}]){
  const row={question:'When is yoga tomorrow?',context:[{question:'Hello',answer:'UNTRUSTED_OLD_FACT'}]},req=liveUnderstandingRequest(row,'claude-haiku-4-5',profile,now),payload=JSON.parse(req.messages[0].content);
  assert.equal(payload.timezone,profile.timezone);assert.doesNotMatch(JSON.stringify(req),/UNTRUSTED_OLD_FACT/);
  assert.ok(payload.connectors.some(c=>c.kind==='calendar'));assert.equal(req.tools[0].strict,true);
  const resolved=resolveLivePlan(fixture(profile),row,profile,now);assert.deepEqual(resolved.issues,[]);assert.deepEqual(resolved.diagnostics,[]);
  assert.equal(resolved.requests['need-1'].dateRange.start,profile.timezone==='Asia/Tokyo'?'2026-09-16':'2026-09-15');
  assert.equal(resolved.plan.needs[0].liveRequest,undefined);
 }
});
test('invented filters, cross-profile connectors, unsupported date phrases and long ranges stay gaps',()=>{
 for(const mutate of [p=>{p.needs[0].liveRequest.filters.category='invented filter';},p=>{p.needs[0].liveRequest.connectorId='neighbor-calendar';},p=>{p.needs[0].task='permission';}]){
  const raw=fixture(sterling);mutate(raw);const r=resolveLivePlan(raw,{question:raw.standaloneQuestion},sterling,now);assert.equal(Object.keys(r.requests).length,0);assert.ok(r.diagnostics.length);
 }
 for(const [question,dateText] of [['Yoga next month','next month'],['Yoga 2026-10-01 through 2026-11-15','2026-10-01 through 2026-11-15']]){
  const raw=fixture(sterling,question);raw.needs[0].liveRequest.dateText=dateText;assert.equal(Object.keys(resolveLivePlan(raw,{question},sterling,now).requests).length,0);
 }
});
test('current date correction wins over copied prior date and unused context cannot introduce filters',()=>{
 const question='What about tomorrow?',raw=fixture(sterling,question);raw.usedPriorContext=true;raw.needs[0].liveRequest.dateText='today';
 const row={question,context:[{question:'Is yoga today?'}]};let r=resolveLivePlan(raw,row,sterling,now);
 assert.equal(r.requests['need-1'].dateRange.start,'2026-09-15');
 raw.usedPriorContext=false;r=resolveLivePlan(raw,row,sterling,now);assert.equal(Object.keys(r.requests).length,0);
});
test('current status rejects explicit future dates and cannot satisfy schedule or permission needs',()=>{
 for(const task of ['status','schedule','permission']){
  const raw=fixture(sterling,'Will the pool be open tomorrow?');Object.assign(raw.needs[0],{task,subject:'pool',liveRequest:{kind:'current-status',connectorId:'pool-status',dateText:'',filters:{category:'',location:''}}});
  const r=resolveLivePlan(raw,{question:raw.standaloneQuestion},sterling,now);assert.equal(Object.keys(r.requests).length,0);
 }
});

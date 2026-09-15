const test=require('node:test'),assert=require('node:assert/strict');
const {selectionRequest,applySelection}=require('../scripts/quality-eval/evidence-selection');
const {capturedInput}=require('../scripts/quality-eval/compare-evidence-selection');
const {modelEvidence,modelActions}=require('../scripts/quality-eval/full-flow-candidate');
const {stageFor}=require('../scripts/quality-eval/observe-fetch');
const now=Date.parse('2026-09-14T12:00:00Z');
function fixture(communityId='alpha'){
 const source=(id,role,text)=>({id,communityId,version:'v1',sourceUrl:`https://${communityId}.example/${id}`,title:id,role,text,actions:[]});
 const sources=[source('rule','governing-rule','Apply before installation. Height is limited to six feet, except eight feet with approval.'),source('conflict','official-process','Install first and apply later.'),
  source('form','official-action','Application directory only.'),source('unrelated','official-process','Water billing instructions.'),
  {...source('live','live-operation','The official event calendar has one event.'),checkedAt:new Date(now-1000).toISOString(),staleAfter:new Date(now+1000).toISOString()}];
 sources[2].actions=[{label:'Open application directory',url:`https://${communityId}.example/forms`,actionType:'navigate'}];
 const actions=[{id:'form-a0',sourceId:'form',communityId,version:'v1',...sources[2].actions[0]}];
 const packet={communityId,sources,actions,diagnostics:[{needId:'need-2',reason:'menu-source-unavailable'}],omissions:[{id:'omitted',reason:'original-budget'}]};
 const row={question:'What are the installation requirements and the form?',context:[{question:'I want a garden shelter.',answer:'OLD_ASSISTANT_FACT'}]};
 const plan={needs:[{id:'need-1',subject:'garden shelter',task:'process',request:row.question,evidenceKind:'official-process'}]};
 return {packet,row,plan};
}
test('selection prompt preserves full qualifications/scopes and resident context while excluding old answers',()=>{
 const {packet,row,plan}=fixture();packet.sources[0].approvalScope='Adopted design policy only';packet.sources[0].withheldScope=['fees'];
 for(const model of ['claude-haiku-4-5','claude-sonnet-5']){
  const body=selectionRequest(row,plan,packet,model,now),p=JSON.parse(body.messages[0].content);
  assert.deepEqual(p.evidence,modelEvidence(packet.sources));assert.deepEqual(p.actions,modelActions(packet.actions));
  assert.deepEqual(p.priorResidentQuestions,['I want a garden shelter.']);assert.doesNotMatch(JSON.stringify(body),/OLD_ASSISTANT_FACT/);
  assert.equal(stageFor(body),'evidence-selection');assert.equal(body.thinking.type,'disabled');assert.equal(body.max_tokens,650);
  assert.deepEqual(body.tools[0].input_schema.properties.sourceIds.items.enum,packet.sources.map(s=>s.id));
 }
 assert.throws(()=>selectionRequest(row,plan,packet,'gpt-6-astra',now));
});
test('two communities preserve selected evidence and actions exactly, including process rules, conflict and exception',()=>{
 for(const communityId of ['alpha','beta']){
  const {packet}=fixture(communityId),before=structuredClone(packet);
  const result=applySelection({sourceIds:['rule','conflict','form']},packet,communityId,now);
  assert.deepEqual(result.issues,[]);assert.deepEqual(result.packet.sources,packet.sources.filter(s=>s.id!=='unrelated'));
  assert.deepEqual(result.packet.actions,packet.actions);assert.deepEqual(result.packet.diagnostics,packet.diagnostics);
  assert.deepEqual(result.packet.omissions,packet.omissions);assert.deepEqual(packet,before);assert.equal(result.packet.selection.absenceProven,false);
  result.packet.sources[0].text='changed';assert.equal(packet.sources[0].text,before.sources[0].text);
 }
});
test('empty selection retains bound live evidence and never invents a missing fact or action',()=>{
 const {packet}=fixture();const result=applySelection({sourceIds:[]},packet,'alpha',now);
 assert.deepEqual(result.packet.sources,[packet.sources[4]]);assert.deepEqual(result.packet.actions,[]);
 assert.deepEqual(result.packet.diagnostics,packet.diagnostics);assert.equal(result.packet.selection.absenceProven,false);
 const staticOnly={...packet,sources:packet.sources.slice(0,4)};
 assert.deepEqual(applySelection({sourceIds:[]},staticOnly,'alpha',now).packet.sources,[]);
});
test('malformed or invented selections cannot prune or inject source text',()=>{
 const {packet}=fixture();for(const raw of [null,[],{sourceIds:['rule','rule']},{sourceIds:['unknown']},{sourceIds:[3]},
  {sourceIds:'rule'},{sourceIds:['rule'],text:'Injected fact'},{sourceIds:['rule'],needs:[]}]){
  const result=applySelection(raw,packet,'alpha',now);assert.ok(result.issues.length);assert.equal(result.packet,null);
 }
});
test('stale live packets, community contamination, duplicate sources and action version mismatch are rejected',()=>{
 const {packet}=fixture();assert.equal(applySelection({sourceIds:['rule']},packet,'alpha',now+2000).packet,null);
 assert.equal(applySelection({sourceIds:['rule']},packet,'beta',now).packet,null);
 for(const mutation of [p=>p.sources[0].communityId='beta',p=>p.sources.push({...p.sources[0]}),p=>p.actions[0].version='v2',p=>p.actions[0].url='https://other.example/form']){
  const bad=structuredClone(packet);mutation(bad);assert.equal(applySelection({sourceIds:['rule']},bad,'alpha',now).packet,null);
 }
});
function trial(){
 const {packet,row,plan}=fixture(),payload={question:row.question,priorResidentQuestions:row.context.map(c=>c.question),requiredNeeds:plan.needs,
  evidence:modelEvidence(packet.sources),actions:modelActions(packet.actions),evidenceGaps:packet.diagnostics};
 return {id:'flow-001',isTest:true,variant:'sonnet-compose',...row,response:{status:'unreviewed-experiment',plan,sources:packet.sources},
  calls:[{stage:'composition',startedAt:new Date(now).toISOString(),request:{messages:[{role:'user',content:JSON.stringify(payload)}]}}]};
}
test('historical replay binds original question, complete source inventory and action identities',()=>{
 const original=trial(),input=capturedInput(original);assert.equal(input.now,now);assert.equal(input.packet.sources.length,5);
 assert.deepEqual(input.packet.actions.map(a=>a.id),['form-a0']);
 for(const mutate of [t=>t.isTest=false,t=>t.question='Different question',t=>t.response.sources[0].text='Replacement policy',
  t=>t.response.sources[2].actions[0].url='https://alpha.example/wrong',t=>t.calls[0].startedAt=new Date(now+2000).toISOString(),t=>t.calls.push(t.calls[0])]){
  const bad=structuredClone(original);mutate(bad);assert.throws(()=>capturedInput(bad));
 }
});

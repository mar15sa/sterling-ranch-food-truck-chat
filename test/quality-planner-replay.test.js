const test=require('node:test'),assert=require('node:assert/strict');
const {plannerRequest,upperCost,prepare}=require('../scripts/quality-eval/compare-planners');
const {hash}=require('../scripts/quality-eval/flow-evidence');
const original={model:'claude-haiku-4-5',temperature:0,thinking:{type:'disabled'},max_tokens:1100,system:'Original instructions',tools:[{name:'route_community_question',input_schema:{type:'object'}}],tool_choice:{type:'tool',name:'route_community_question'},messages:[{role:'user',content:'{}'}]};
function fixture(){const profile={communityId:'alpha',timezone:'UTC'};
 const trials=Array.from({length:12},(_,i)=>{const caseId='case-'+Math.floor(i/2),repetition=i%2+1,question='Question '+caseId,context=[{question:'Earlier'}];
  const body=structuredClone(original);body.messages[0].content=JSON.stringify({question,priorResidentQuestions:['Earlier'],timezone:'UTC',today:'2026-09-14'});
  return {id:'trial-'+i,isTest:true,variant:'sonnet-compose',caseId,repetition,question,context,calls:[{stage:'understanding',request:body}]};});
 const manifest={status:'captured',liveMixed:true,repetitions:2,today:'2026-09-14',profileHash:hash(profile),capUsd:5,reservedUpperEstimateUsd:2.7,runs:trials.map(({id,caseId,repetition,variant})=>({id,caseId,repetition,variant}))};return {profile,trials,manifest};
}
test('planner replay changes only model and required temperature compatibility',()=>{
 assert.deepEqual(plannerRequest(original,'claude-haiku-4-5'),original);
 const expected=structuredClone(original);expected.model='claude-sonnet-5';delete expected.temperature;
 assert.deepEqual(plannerRequest(original,'claude-sonnet-5'),expected);assert.equal(original.temperature,0);
 for(const model of ['claude-opus-5','claude-fable-5','gpt-6-astra'])assert.throws(()=>plannerRequest(original,model));
 assert.throws(()=>plannerRequest({...original,tools:[{...original.tools[0],strict:true}]},'claude-sonnet-5'));
 assert.ok(upperCost(expected)>upperCost(original));
});
test('balanced exact inputs are required and the complete design is reserved before calls',()=>{
 const f=fixture(),r=prepare(f.manifest,f.trials,f.profile);assert.equal(r.jobs.length,24);assert.equal(r.capUsd,.8);assert.ok(r.plannedUpper>0&&r.plannedUpper<r.capUsd);
 for(const mutate of [f=>f.trials.pop(),f=>f.trials[1]=structuredClone(f.trials[0]),f=>f.trials[0].question='Changed',f=>f.trials[0].context[0].question='Changed',f=>f.manifest.profileHash='changed',f=>f.manifest.reservedUpperEstimateUsd=4.9999,f=>f.manifest.runs[0].repetition=3]){
  const bad=fixture();mutate(bad);assert.throws(()=>prepare(bad.manifest,bad.trials,bad.profile));
 }
});

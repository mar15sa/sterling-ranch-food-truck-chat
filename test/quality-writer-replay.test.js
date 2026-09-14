const test=require('node:test'),assert=require('node:assert/strict');
const {writerRequest,upperCost,makeJobs}=require('../scripts/quality-eval/compare-writers');
const {modelEvidence,modelActions}=require('../scripts/quality-eval/full-flow-candidate');
const original={model:'claude-haiku-4-5',temperature:0,thinking:{type:'disabled'},max_tokens:650,system:'Same instructions',
 tools:[{name:'compose_requested_answer',input_schema:{type:'object'}}],messages:[{role:'user',content:'Same evidence'}]};
test('paired writers preserve all content and settings except model-specific temperature',()=>{
 for(const model of ['claude-haiku-4-5','claude-sonnet-5','claude-opus-5']){
  const body=writerRequest(original,model),expected=structuredClone(original);expected.model=model;if(!model.includes('haiku'))delete expected.temperature;
  assert.deepEqual(body,expected);body.messages[0].content='changed';assert.equal(original.messages[0].content,'Same evidence');
  assert.ok(upperCost(expected)>0);
 }
 for(const model of ['claude-fable-5','gpt-6-astra','unpriced'])assert.throws(()=>writerRequest(original,model));
 assert.throws(()=>writerRequest({...original,thinking:{type:'adaptive'}},'claude-opus-5'));
});
test('paired jobs validate captured evidence and restore all available actions, not only selected ones',()=>{
 const source={id:'s',communityId:'alpha',version:'v1',title:'Official directory',sourceUrl:'https://alpha.example/forms',role:'official-action',text:'Open the forms directory.',actions:[{label:'Forms',url:'https://alpha.example/forms',actionType:'form'}]};
 const action={id:'a',sourceId:'s',communityId:'alpha',version:'v1',label:'Forms',url:'https://alpha.example/forms',actionType:'form'};
 const body={...original,messages:[{role:'user',content:JSON.stringify({question:'Which form?',evidence:modelEvidence([source]),actions:modelActions([action])})}]};
 const trial={id:'synthetic',caseId:'form',isTest:true,variant:'haiku-compose',response:{status:'unreviewed-experiment',sources:[source],actions:[]},calls:[{stage:'composition',request:body}]};
 const jobs=makeJobs([trial],'alpha');assert.equal(jobs.length,6);assert.equal(jobs[0].packet.actions.length,1);assert.equal(jobs[0].packet.actions[0].version,'v1');
 const tampered=structuredClone(trial);tampered.response.sources[0].text='Changed evidence';assert.throws(()=>makeJobs([tampered],'alpha'));
 assert.throws(()=>makeJobs([{...trial,isTest:false}],'alpha'));
 assert.throws(()=>makeJobs([trial],'beta'));
});

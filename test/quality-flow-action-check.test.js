const test=require('node:test'),assert=require('node:assert/strict');
const {flowCheckIssues,flowAcceptanceRequest}=require('../scripts/quality-eval/flow-acceptance');
const {modelEvidence}=require('../scripts/quality-eval/full-flow-candidate');
const plan={needs:[{id:'need-1'}]},actions=[{id:'a'}];
const check={outcome:'complete',hardFailures:[],needs:[{needId:'need-1',request:'Get application',status:'addressed',supportSourceIds:['source']}],actionReviews:[{actionId:'a',needId:'need-1',fit:'direct',reason:'The requested application.'}],failureDetails:[]};
test('every selected action needs its own relevance check; failure feedback is required for repair',()=>{
 assert.deepEqual(flowCheckIssues(check,plan,['source'],actions),[]);
 for(const mutate of [x=>x.actionReviews=[],x=>x.actionReviews[0].actionId='other',x=>x.actionReviews[0].needId='other',x=>x.actionReviews[0].fit='irrelevant']){const next=structuredClone(check);mutate(next);assert.ok(flowCheckIssues(next,plan,['source'],actions).length);}
 const bad={...check,outcome:'partial',hardFailures:['wrong-action'],actionReviews:[{...check.actionReviews[0],fit:'irrelevant'}]};assert.ok(flowCheckIssues(bad,plan,['source'],actions).includes('unexplained-failure'));
 bad.failureDetails=[{failure:'wrong-action',reason:'This payment link does not provide the requested form.',statement:'',actionId:'a'}];assert.deepEqual(flowCheckIssues(bad,plan,['source'],actions),[]);
 assert.doesNotThrow(()=>flowCheckIssues({...check,hardFailures:'bad'},plan,['source'],actions));
});
test('model projection preserves evidence and restrictions while code retains identity metadata',()=>{
 const source={id:'s',title:'Approved source',role:'official-action',text:'Open the form',sourceUrl:'https://alpha.example/form',version:'internal-hash',matchedSourceIds:['raw-id'],approvalScope:'Navigation only',withheldScope:['fees'],stagingOnly:true};
 const reduced=modelEvidence([source])[0];assert.equal(reduced.text,source.text);assert.equal(reduced.approvalScope,source.approvalScope);assert.deepEqual(reduced.withheldScope,['fees']);assert.equal(reduced.stagingOnly,true);assert.equal(reduced.version,undefined);assert.equal(source.version,'internal-hash');
 const request=flowAcceptanceRequest({question:'Where is the form?',response:{answer:'Here',sources:[reduced],actions}},plan,'claude-sonnet-5');assert.ok(request.tools[0].input_schema.required.includes('actionReviews'));assert.ok(request.tools[0].input_schema.required.includes('failureDetails'));
});

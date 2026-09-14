const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {candidateRequest,validationIssues}=require('../scripts/quality-eval/understanding-candidate');
const {compare}=require('../scripts/quality-eval/compare-understanding');
const candidate={standaloneQuestion:'How do I pay my water bill?',usedPriorContext:false,scope:'community',clarificationQuestion:'',
  needs:[{subject:'water bill',task:'payment',request:'Find payment instructions',evidenceKind:'official-action'}],constraints:[],searchQueries:['water bill payment']};
test('understanding candidate excludes prior generated answers and validates the complete plan contract',()=>{
  const req=candidateRequest({question:'Where is the form?',context:[{question:'I want to change a fence.',answer:'PRIVATE_GENERATED_TEXT',resolvedQuestion:'MACHINE_RESOLVED_TEXT'}]},'claude-haiku-4-5');
  assert.doesNotMatch(JSON.stringify(req),/PRIVATE_GENERATED_TEXT|MACHINE_RESOLVED_TEXT/);
  assert.match(JSON.stringify(req),/change a fence/);
  for(const model of ['claude-sonnet-5','claude-opus-5']){
    const compatible=candidateRequest({question:'Which form do I need?'},model);
    assert.equal(compatible.temperature,undefined);
    assert.deepEqual(compatible.thinking,{type:'disabled'});
  }
  assert.deepEqual(validationIssues(candidate),[]);
  assert.ok(validationIssues({...candidate,standaloneQuestion:42}).length);
  assert.ok(validationIssues({...candidate,scope:'ambiguous'}).includes('missing-clarification'));
  assert.ok(validationIssues({...candidate,needs:[]}).includes('empty-community-plan'));
});
test('provider rejection stops the experiment instead of repeatedly charging or hiding incompatibility',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'understanding-stop-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify({status:'captured',revisionStable:true,before:{deploymentRevision:'fixture'}}));
  fs.writeFileSync(path.join(root,'water-pay.json'),JSON.stringify({id:'water-pay',question:'How do I pay my water bill?',isTest:true}));
  let calls=0;
  const m=await compare({baselineDir:root,outDir:path.join(root,'results'),caseIds:['water-pay'],repetitions:2,
    includeExisting:false,candidateModels:['claude-haiku-4-5'],apiKey:'fixture',fetchImpl:async()=>{calls++;return new Response(JSON.stringify({error:{type:'invalid_request_error',message:'Invalid fixture parameter'}}),{status:400});}});
  assert.equal(calls,1);assert.equal(m.status,'stopped-budget-or-provider');assert.equal(m.costs.estimatedTotalUsd,null);
});
test('comparison captures stage usage, excludes credentials and preserves both current and candidate outputs',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'understanding-eval-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify({status:'captured',revisionStable:true,before:{deploymentRevision:'fixture'}}));
  fs.writeFileSync(path.join(root,'water-pay.json'),JSON.stringify({id:'water-pay',question:'How do I pay my water bill?',isTest:true,context:[]}));
  const output=path.join(root,'results');let calls=0;
  const manifest=await compare({baselineDir:root,outDir:output,caseIds:['water-pay'],repetitions:1,apiKey:'SECRET_FIXTURE',fetchImpl:async(_url,init)=>{
    calls++;const body=JSON.parse(init.body);assert.equal(init.headers['x-api-key'],'SECRET_FIXTURE');
    const current={intent:'services',goal:'payment',goals:['payment'],subject:'water bill',requestedDetails:['action'],dateRange:null,
      filters:{audience:'',category:'',facility:'',location:''},searchQueries:['water bill payment'],scope:'community',needsClarification:false,clarificationQuestion:''};
    return new Response(JSON.stringify({content:[{type:'tool_use',name:'route_community_question',input:body.system.includes('Record only resident-specified')?candidate:current}],usage:{input_tokens:100,output_tokens:50},stop_reason:'tool_use'}),{status:200});
  }});
  assert.equal(calls,4);assert.equal(manifest.status,'captured');assert.equal(manifest.costs.calls,4);assert.equal(manifest.costs.unknownCostCalls,0);
  const artifact=fs.readdirSync(output).map(f=>fs.readFileSync(path.join(output,f),'utf8')).join('\n');assert.doesNotMatch(artifact,/SECRET_FIXTURE|x-api-key/);
  assert.ok(manifest.runs.every(r=>!r.validationIssues.length));
});

const test=require('node:test'),assert=require('node:assert/strict');
const {checkerRequest,prepare}=require('../scripts/quality-eval/compare-captured-acceptance');
const {hash}=require('../scripts/quality-eval/flow-evidence');
function fixture(){const now=Date.parse('2026-09-15T00:00:00Z');
 const source={id:'rule',communityId:'alpha',version:'v1',role:'governing-rule',title:'Policy',sourceUrl:'https://alpha.example/policy',text:'Approval is required.',actions:[]};
 return {communityId:'alpha',timezone:'America/Denver',now,row:{question:'Is approval required?',context:[{question:'For my structure.'}]},plan:{needs:[{id:'need-1',request:'approval',evidenceKind:'governing-rule'}]},packet:{communityId:'alpha',sources:[source],actions:[],diagnostics:[]}};
}
test('checker replay sends unchanged answer/full sources and no labels or writer metadata',()=>{
 const input=fixture(),draft={answer:'Approval is required.',actionIds:[]};
 input.expected='SECRET_LABEL';input.originatingModel='SECRET_WRITER';input.rationale='SECRET_REASON';
 for(const model of ['claude-haiku-4-5','claude-sonnet-5']){
  const body=checkerRequest(input,draft,model),payload=JSON.parse(body.messages[0].content);
  assert.equal(body.model,model);assert.equal(body.max_tokens,850);assert.equal(body.tools[0].strict,true);
  assert.equal(payload.answer,draft.answer);assert.equal(payload.evidence[0].text,input.packet.sources[0].text);
  assert.deepEqual(payload.requiredNeeds,input.plan.needs);assert.deepEqual(payload.priorResidentQuestions,['For my structure.']);
  assert.equal(payload.writerContext.timezone,'America/Denver');assert.ok(!JSON.stringify(body).includes('SECRET_'));
 }
 assert.throws(()=>checkerRequest(input,draft,'claude-fable'));assert.throws(()=>checkerRequest(input,{...draft,actionIds:['invented']},'claude-haiku-4-5'));
 input.communityId='beta';assert.throws(()=>checkerRequest(input,draft,'claude-haiku-4-5'));
});
test('capture preparation enforces original source and draft identity across the whole balanced design',t=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'captured-check-'));t.after(()=>fs.rmSync(directory,{recursive:true}));
 const labels=require('../scripts/quality-eval/captured-acceptance-labels.json');
 const input=fixture(),draft={answer:'Approval is required.',actionIds:[]},request={messages:[{role:'user',content:JSON.stringify({question:input.row.question})}]};
 const m={status:'captured',mode:'controlled-writer-presentation',runs:[],design:[],inputHashes:{sample:hash(input)}};
 for(const label of labels.cases){m.runs.push({id:label.trial});m.design.push({requestHash:hash(request)});
  fs.writeFileSync(path.join(directory,label.trial+'.json'),JSON.stringify({id:label.trial,isTest:true,caseId:'sample',draft,response:{content:[{type:'tool_use',name:'compose_requested_answer',input:draft}]},requestHash:hash(request)}));}
 while(m.runs.length<96){m.runs.push({id:'unused-'+m.runs.length});m.design.push({requestHash:hash(request)});}
 fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(m));fs.writeFileSync(path.join(directory,'sample-input.json'),JSON.stringify(input));
 fs.writeFileSync(path.join(directory,'calls.jsonl'),Array.from({length:96},()=>JSON.stringify({request})).join('\n'));
 const prepared=prepare(directory);assert.equal(prepared.jobs.length,56);assert.ok(prepared.plannedUpperUsd<=5);
 for(const label of labels.cases)assert.equal(prepared.jobs.filter(j=>j.trialId===label.trial).length,4);
 input.packet.sources[0].text='Changed';fs.writeFileSync(path.join(directory,'sample-input.json'),JSON.stringify(input));assert.throws(()=>prepare(directory),/identity mismatch/);
});

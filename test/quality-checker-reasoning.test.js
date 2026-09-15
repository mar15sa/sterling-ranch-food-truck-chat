const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {reasoningRequest,prepare,capture}=require('../scripts/quality-eval/compare-checker-reasoning');
const {hash}=require('../scripts/quality-eval/flow-evidence');
const {analyze}=require('../scripts/quality-eval/summarize-captured-acceptance');
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'reasoning-check-'));t.after(()=>fs.rmSync(dir,{recursive:true}));
 const prior=path.join(dir,'prior'),out=path.join(dir,'out');fs.mkdirSync(prior);
 const input={communityId:'alpha',timezone:'America/Denver',now:Date.parse('2026-09-15T00:00:00Z'),row:{question:'Is approval required?',context:[]},plan:{needs:[{id:'need-1',request:'approval',evidenceKind:'governing-rule'}]},packet:{communityId:'alpha',sources:[{id:'rule',communityId:'alpha',version:'v1',role:'governing-rule',title:'Policy',sourceUrl:'https://alpha.example/policy',text:'Approval is required.',actions:[]}],actions:[],diagnostics:[]}};
 const draft={answer:'Approval is required.',actionIds:[]},request={messages:[{role:'user',content:JSON.stringify({question:input.row.question})}]};
 const manifest={status:'captured',mode:'controlled-writer-presentation',runs:[],design:[],inputHashes:{sample:hash(input)}};
 for(const label of require('../scripts/quality-eval/captured-acceptance-labels.json').cases){manifest.runs.push({id:label.trial});manifest.design.push({requestHash:hash(request)});
  fs.writeFileSync(path.join(prior,label.trial+'.json'),JSON.stringify({id:label.trial,isTest:true,caseId:'sample',draft,response:{content:[{type:'tool_use',name:'compose_requested_answer',input:draft}]},requestHash:hash(request)}));}
 while(manifest.runs.length<96){manifest.runs.push({id:'unused-'+manifest.runs.length});manifest.design.push({requestHash:hash(request)});}
 fs.writeFileSync(path.join(prior,'manifest.json'),JSON.stringify(manifest));fs.writeFileSync(path.join(prior,'sample-input.json'),JSON.stringify(input));
 fs.writeFileSync(path.join(prior,'calls.jsonl'),Array.from({length:96},()=>JSON.stringify({request})).join('\n'));
 return {prior,out,input,draft};
}
function reply(body,usage=true,stop='tool_use'){
 const check={outcome:'complete',hardFailures:[],needs:[{needId:'need-1',request:'approval',status:'addressed',supportSourceIds:['rule']}],actionReviews:[],failureDetails:[]};
 return new Response(JSON.stringify({model:body.model,stop_reason:stop,content:[{type:'tool_use',name:'check_planned_answer_acceptance',input:check}],...(usage?{usage:{input_tokens:100,output_tokens:200,output_tokens_details:{thinking_tokens:body.thinking.type==='adaptive'?100:0}}}:{})}),{status:200});
}
test('reasoning is the only request difference; identities, sources and output cap remain fixed',t=>{
 const {prior,input,draft}=fixture(t),before=hash(input),disabled=reasoningRequest(input,draft,'disabled'),adaptive=reasoningRequest(input,draft,'adaptive');
 assert.deepEqual(adaptive.thinking,{type:'adaptive',display:'omitted'});assert.deepEqual(disabled.thinking,{type:'disabled'});
 const a=structuredClone(adaptive),b=structuredClone(disabled);delete a.thinking;delete b.thinking;assert.deepEqual(a,b);
 assert.equal(a.max_tokens,4096);assert.deepEqual(a.output_config,{effort:'medium'});assert.equal(a.model,'claude-sonnet-5');assert.equal(hash(input),before);
 assert.throws(()=>reasoningRequest(input,draft,'fable'),/Unknown/);
 const p=prepare(prior);assert.equal(p.jobs.length,40);assert.equal(p.inputs.length,10);assert.ok(p.plannedUpperUsd<5);
 for(const j of p.jobs){const payload=JSON.parse(j.body.messages[0].content);assert.equal(payload.answer,draft.answer);assert.equal(payload.evidence[0].text,input.packet.sources[0].text);assert.equal(payload.expected,undefined);assert.equal(payload.trialId,undefined);}
 input.packet.sources[0].text+=' Changed.';fs.writeFileSync(path.join(prior,'sample-input.json'),JSON.stringify(input));assert.throws(()=>prepare(prior),/identity mismatch/);
});
test('complete paired capture freezes requests, records reasoning without double charging, and detects tampering',async t=>{
 const {prior,out}=fixture(t);let count=0;
 const m=await capture({prior,out,apiKey:'FAKE_TEST_ONLY',revision:'offline-test',log:()=>{},fetchImpl:async(url,init)=>{
  const frozen=JSON.parse(fs.readFileSync(path.join(out,'manifest.json'),'utf8'));assert.equal(frozen.design.length,40);assert.equal(frozen.runs.length,count++);
  assert.equal(url,'https://api.anthropic.com/v1/messages');return reply(JSON.parse(init.body));
 }});
 assert.equal(m.status,'captured');assert.equal(count,40);assert.ok(Math.abs(m.costs.estimatedTotalUsd-.088)<1e-9);
 const report=analyze(out);assert.equal(report.completedCalls,40);assert.equal(report.groups.adaptive.calls,20);assert.equal(report.groups.adaptive.reportedThinkingTokens,2000);
 assert.equal(report.groups.disabled.reportedThinkingTokens,0);assert.equal(report.groups.adaptive.negative.accepted,10);assert.equal(report.groups.adaptive.negative.rejected,0);
 const ledger=fs.readFileSync(path.join(out,'calls.jsonl'),'utf8');assert.ok(!ledger.includes('FAKE_TEST_ONLY'));
 const changed=JSON.parse(fs.readFileSync(path.join(out,'manifest.json'),'utf8'));changed.design[0].arm=changed.design[0].arm==='adaptive'?'disabled':'adaptive';fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(changed));assert.throws(()=>analyze(out),/Changed reasoning/);
});
for(const kind of ['unknown-usage','truncated'])test('stops once without retries on '+kind,async t=>{
 const {prior,out}=fixture(t);let count=0;
 const m=await capture({prior,out,apiKey:'FAKE_TEST_ONLY',revision:'offline-test',log:()=>{},fetchImpl:async(url,init)=>{count++;return reply(JSON.parse(init.body),kind!=='unknown-usage',kind==='truncated'?'max_tokens':'tool_use');}});
 assert.equal(m.status,'stopped-error-or-unknown-usage');assert.equal(count,1);assert.equal(m.runs.length,1);
 const report=analyze(out);assert.equal(report.completedCalls,1);assert.equal(report.plannedCalls,40);
 if(kind==='unknown-usage'){assert.equal(report.costs.estimatedTotalUsd,null);assert.equal(report.costs.unknownCostCalls,1);}
 else assert.equal(Object.values(report.groups).reduce((s,g)=>s+g.positive.unassessed+g.negative.unassessed,0),1);
});

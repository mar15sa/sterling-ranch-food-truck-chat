const test=require('node:test'),assert=require('node:assert/strict');
const {dimensions,assessmentRequest,assessmentIssues,assessedDisposition}=require('../scripts/quality-eval/answer-assessment-candidate');
const fixtures=require('../scripts/quality-eval/assessment-fixtures');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {compare}=require('../scripts/quality-eval/compare-answer-assessment');
const good={outcome:'complete',hardFailures:[],needs:[{request:'Find application',status:'addressed',supportSourceIds:['form']}],
  scores:Object.fromEntries(dimensions.map(k=>[k,{value:2,reason:'Meets the requested outcome.'}])),summary:'The requested action is supported.'};
test('assessment validates coverage and evidence references rather than trusting completion metadata',()=>{
  assert.deepEqual(assessmentIssues(good,['form']),[]);
  assert.equal(assessedDisposition(good,['form']).status,'candidate-complete');
  assert.equal(assessedDisposition(good,[]).status,'unassessed');
  assert.equal(assessedDisposition({...good,needs:[{...good.needs[0],status:'unanswered'}]},['form']).status,'unassessed');
  assert.equal(assessedDisposition(null,[]).status,'unassessed');
  assert.equal(assessedDisposition({...good,needs:'malformed'},['form']).status,'unassessed');
  assert.equal(assessedDisposition({...good,needs:[{...good.needs[0],supportSourceIds:[]}]},['form']).status,'unassessed');
  assert.equal(assessedDisposition({...good,outcome:'partial',hardFailures:['missing-core-answer']},['form']).eligibleForGoodOrExcellent,false);
});
test('model assessment never receives expected labels or old quality/confidence flags',()=>{
  const row={...fixtures[0],response:{...fixtures[0].response,quality:'PRIVATE_OLD_RATING'}};
  const request=assessmentRequest(row,'claude-sonnet-5');
  assert.equal(request.temperature,undefined);assert.deepEqual(request.thinking,{type:'disabled'});
  const payload=JSON.parse(request.messages[0].content);
  assert.deepEqual(Object.keys(payload),['question','priorResidentQuestions','answer','actions','evidence']);
  assert.doesNotMatch(JSON.stringify(payload),/PRIVATE_OLD_RATING|mustReject|canAnswer|completion/);
  const strict=assessmentRequest(row,'claude-sonnet-5',{revision:'v2'});
  assert.equal(strict.tools[0].strict,true);
  assert.match(strict.system,/Do not flag missing-core-answer merely/);
});
test('assessment pilot records costs without credentials and stops at the first provider rejection',async t=>{
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'assessment-pilot-'));t.after(()=>fs.rmSync(out,{recursive:true,force:true}));
  let calls=0;
  const result=await compare({outDir:out,fixtures:fixtures.slice(0,2),models:['claude-haiku-4-5'],apiKey:'PRIVATE_FIXTURE_KEY',fetchImpl:async()=>{
    calls++;return new Response(JSON.stringify({error:{type:'invalid_request_error'}}),{status:400});
  }});
  assert.equal(calls,1);assert.equal(result.status,'stopped-budget-or-provider');assert.equal(result.costs.unknownCostCalls,1);
  const saved=fs.readdirSync(out).map(f=>fs.readFileSync(path.join(out,f),'utf8')).join('\n');
  assert.doesNotMatch(saved,/PRIVATE_FIXTURE_KEY|x-api-key/);
});

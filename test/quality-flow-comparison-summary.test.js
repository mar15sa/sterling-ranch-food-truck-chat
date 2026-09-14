const test=require('node:test'),assert=require('node:assert/strict');
const {buildComparison}=require('../scripts/quality-eval/summarize-full-flow');
const manifest={status:'captured',variants:[{id:'a'},{id:'b'}],repetitions:2,runs:[{id:'1',caseId:'x'},{id:'2',caseId:'x'},{id:'3',caseId:'x'},{id:'4',caseId:'x'}]};
const records=['a','a','b','b'].map((variant,i)=>({id:String(i+1),caseId:'x',variant,repetition:i%2+1,durationMs:(i+1)*100,response:{answer:'Example',reviewRequired:variant==='b'},calls:[{model:'claude-haiku-4-5',stage:'composition',usage:{input_tokens:100,output_tokens:10}}]}));
test('comparison counts all attempts without treating unreviewed answers as quality evidence',()=>{
 const r=buildComparison(manifest,records);assert.equal(r.arms.b.unreviewed,2);assert.equal(r.arms.a.medianMs,150);assert.equal(r.arms.a.p95Ms,200);assert.equal(r.total.calls,4);assert.equal(r.arms.a.per1000Usd,.15);
 const unknown=structuredClone(records);delete unknown[0].calls[0].usage;const u=buildComparison(manifest,unknown);assert.equal(u.arms.a.per1000Usd,null);assert.equal(u.arms.a.costs.unknownCostCalls,1);
 assert.throws(()=>buildComparison({...manifest,status:'running'},records));
 assert.throws(()=>buildComparison(manifest,records.slice(1)));
 const duplicate=structuredClone(records);duplicate[1].repetition=1;assert.throws(()=>buildComparison(manifest,duplicate));
 const retrieval={method:'local-semantic-plus-keyword',initializationMs:1200,embeddingApiCostUsd:0,hostingCostUsd:null};
 const semantic=buildComparison({...manifest,retrieval},records);assert.deepEqual(semantic.retrieval,retrieval);assert.equal(semantic.arms.a.medianMs,150);
});

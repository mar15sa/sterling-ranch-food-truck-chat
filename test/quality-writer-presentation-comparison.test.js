const test=require('node:test'),assert=require('node:assert/strict');
const {cases,jobsFor}=require('../scripts/quality-eval/compare-writer-presentation');
const {modelEvidence,compositionSchema}=require('../scripts/quality-eval/full-flow-candidate');
const now=Date.parse('2026-09-15T00:00:00Z');
function inputs(){return cases.map(c=>{
 const packet={communityId:'alpha',sources:[{id:'policy',communityId:'alpha',version:'v1',role:'governing-rule',title:'Policy',sourceUrl:'https://alpha.example/policy',text:'Approval required with a conditional exception.',actions:[]}],actions:[],diagnostics:[]};
 return {caseId:c.id,communityId:'alpha',timezone:'America/Denver',now,packet,originalCompositionRequest:{model:'claude-sonnet-5',max_tokens:650,thinking:{type:'disabled'},
  system:'Unchanged answer instructions',tools:[{name:'compose_requested_answer',strict:true,input_schema:compositionSchema(packet)}],tool_choice:{type:'tool',name:'compose_requested_answer'},
  messages:[{role:'user',content:JSON.stringify({question:'Question '+c.id,priorResidentQuestions:['Prior topic'],evidence:modelEvidence(packet.sources),actions:[],evidenceGaps:[]})}]}};
});}
test('whole comparison contains eight cases, two repeats, two eligible models and three independent arms',()=>{
 const original=inputs(),before=structuredClone(original),design=jobsFor(original);
 assert.equal(design.jobs.length,96);assert.ok(design.plannedUpperUsd>0&&design.plannedUpperUsd<=5);assert.deepEqual(original,before);
 for(const c of cases)for(const repetition of [1,2])for(const model of ['claude-haiku-4-5','claude-sonnet-5']){
  const rows=design.jobs.filter(j=>j.caseId===c.id&&j.repetition===repetition&&j.model===model);assert.deepEqual(rows.map(j=>j.variant),['control','stable','combined']);
  assert.deepEqual(rows[0].body.messages,rows[1].body.messages);assert.equal(rows[0].body.system,rows[1].body.system);
  assert.deepEqual(rows[1].body.tools,rows[2].body.tools);assert.equal(rows[1].body.max_tokens,rows[2].body.max_tokens);
  const a=JSON.parse(rows[1].body.messages[0].content),b=JSON.parse(rows[2].body.messages[0].content);
  assert.equal(a.question,b.question);assert.deepEqual(a.evidence,b.evidence);assert.deepEqual(a.actions,b.actions);assert.equal(b.writerContext.timezone,'America/Denver');
  assert.equal(rows[0].body.thinking.type,'disabled');assert.equal(rows[0].body.temperature,model.includes('haiku')?0:undefined);
 }
});
test('incomplete, duplicate, cross-community and unaffordable designs stop before any provider call',()=>{
 const input=inputs();assert.throws(()=>jobsFor(input.slice(1)));assert.throws(()=>jobsFor([...input.slice(0,7),input[0]]));
 const wrong=structuredClone(input);wrong[0].communityId='beta';assert.throws(()=>jobsFor(wrong));
 assert.throws(()=>jobsFor(input,6));
 const large=structuredClone(input);for(const i of large)i.originalCompositionRequest.system='x'.repeat(100000);
 assert.throws(()=>jobsFor(large),/reservation/);
});

const test=require('node:test'),assert=require('node:assert/strict');
const {requestQueries}=require('../scripts/quality-eval/make-need-queries');
const record={id:'plan-001',caseId:'compound',plan:{scope:'community',standaloneQuestion:'Can I add a structure, and which form do I use?',
  usedPriorContext:false,clarificationQuestion:'',constraints:['commercial property'],searchQueries:['structure rules','structure application'],
  needs:[{subject:'structure',task:'permission',request:'whether the structure is allowed',evidenceKind:'governing-rule'},
    {subject:'structure',task:'form',request:'the actual application form',evidenceKind:'official-action'}]}};
test('per-need queries preserve distinct outcomes and the original withholding context',()=>{
  const result=requestQueries(record,'Can I add a structure on commercial property, and which form do I use?');
  assert.equal(result.cases.length,2);
  assert.deepEqual(result.cases.map(c=>c.need.task),['permission','form']);
  assert.ok(result.cases.every(c=>c.isTest&&/commercial property/.test(c.eligibilityQuestion)));
  assert.match(result.cases[1].query,/actual application form/);
  const contextual=requestQueries(record,'Which form for commercial property?',{queryMode:'task-description'});
  assert.match(contextual.cases[1].query,/application form document to complete and submit/);
  assert.match(contextual.cases[1].query,/structure/);
  assert.match(contextual.cases[1].eligibilityQuestion,/commercial property/);
});
test('ambiguous and inconsistent plans never initiate guessed retrieval',()=>{
  const ambiguous={...record,plan:{...record.plan,scope:'ambiguous',clarificationQuestion:'Which structure?',needs:[],searchQueries:[]}};
  assert.deepEqual(requestQueries(ambiguous,'How much does it cost?').cases,[]);
  assert.equal(requestQueries({...record,plan:{...record.plan,clarificationQuestion:'Which structure?'}},'Which form?').disposition,'inconsistent-plan');
  assert.equal(requestQueries({...record,plan:null},'Which form?').disposition,'invalid-plan');
});

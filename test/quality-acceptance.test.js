const test=require('node:test'),assert=require('node:assert/strict');
const {acceptanceRequest,acceptanceIssues,acceptanceDisposition}=require('../scripts/quality-eval/compact-acceptance-candidate');
const fixtures=require('../scripts/quality-eval/acceptance-fixtures');
const complete={outcome:'complete',hardFailures:[],needs:[{request:'Find application',status:'addressed',supportSourceIds:['form']}]};
test('compact acceptance distinguishes supported, disclosed and skipped requested needs',()=>{
  assert.deepEqual(acceptanceIssues(complete,['form']),[]);
  for(const bad of [null,{...complete,needs:'invalid'},{...complete,needs:[null]},{...complete,needs:[{...complete.needs[0],supportSourceIds:[]}]},
    {...complete,needs:[{...complete.needs[0],status:'disclosed-gap'}]}])assert.equal(acceptanceDisposition(bad,['form']).status,'unassessed');
  assert.equal(acceptanceDisposition(complete,[]).status,'unassessed');
  for(const outcome of ['wrong-topic','clarification','partial','missing-evidence'])assert.equal(acceptanceDisposition({...complete,outcome},['form']).status,'unassessed');
  assert.equal(acceptanceDisposition({...complete,outcome:'partial',needs:[{request:'Roof approval',status:'unanswered',supportSourceIds:[]}]},[]).status,'unassessed');
  const partial={outcome:'partial',hardFailures:[],needs:[complete.needs[0],{request:'Roof approval',status:'disclosed-gap',supportSourceIds:[]}]};
  assert.equal(acceptanceDisposition(partial,['form']).status,'candidate-partial');
  assert.equal(acceptanceDisposition({...partial,hardFailures:['wrong-action']},['form']).eligibleForGoodOrExcellent,false);
});
test('compact acceptance requests omit old outcome and expected labels and require strict structured output',()=>{
  const request=acceptanceRequest(fixtures[0],'claude-haiku-4-5');
  assert.equal(request.tools[0].strict,true);assert.equal(request.max_tokens,450);
  assert.doesNotMatch(request.messages[0].content,/mustReject|canAnswer|completion/);
  assert.equal(Object.hasOwn(request.tools[0].input_schema.properties,'scores'),false);
  assert.match(request.system,/disclosed-gap/);
});

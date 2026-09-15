const test=require('node:test'),assert=require('node:assert/strict');
const {replayPlanIssues,replayPacket}=require('../scripts/quality-eval/broad-retrieval-cases');
const plan=()=>({standaloneQuestion:'Is the pool open?',usedPriorContext:false,scope:'community',clarificationQuestion:'',needs:[{id:'need-1',subject:'pool',task:'status',request:'Is the pool open?',evidenceKind:'live-operation'}],constraints:[],searchQueries:['pool'],liveRequests:{'need-1':{kind:'current-status',connectorId:'pool-status'}}});
test('runtime live plan fields survive replay without weakening need validation',async()=>{
 const p=plan();assert.deepEqual(replayPlanIssues(p),[]);let actual;const result=await replayPacket(p,async x=>{actual=x;return {sources:[]};});assert.equal(actual,p);assert.equal(result.status,'packet-only-unreviewed');
 for(const field of ['id','request']){const bad=plan();delete bad.needs[0][field];assert.equal((await replayPacket(bad,()=>assert.fail('Invalid saved plan retrieved'))).status,'invalid-saved-plan');}
});
test('ambiguous subject never retrieves, including a malformed guessed plan',async()=>{
 const p={...plan(),scope:'ambiguous',clarificationQuestion:'What would you like the cost of?',needs:[],searchQueries:[]};assert.equal((await replayPacket(p,()=>assert.fail('Guessed subject'))).status,'clarification-required');
 p.needs=plan().needs;assert.ok(replayPlanIssues(p).includes('ambiguous-plan-guesses-subject'));assert.equal((await replayPacket(p,()=>assert.fail('Guessed subject'))).status,'invalid-saved-plan');
});
test('malformed saved needs and duplicate identities fail closed',()=>{
 for(const needs of [null,{},[null]])assert.deepEqual(replayPlanIssues({...plan(),needs}),['invalid-needs']);
 const p=plan();p.needs.push({...p.needs[0]});assert.ok(replayPlanIssues(p).includes('missing-or-duplicate-need-id'));
});

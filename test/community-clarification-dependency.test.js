const test=require('node:test'),assert=require('node:assert/strict');
const {answerCommunityQuestion}=require('../lib/community-assistant');
const {resolveConversationQuestion,isContextDependentQuestion}=require('../lib/community-conversation');
const examples=[
 ['How much does it cost?','cost','price'],
 ['How much are those?','cost','price'],
 ['Can I paint it?','permission','permission'],
 ['When can we do that?','schedule','date'],
 ['Where can I put them?','permission','permission'],
];
test('unresolved references retain validated clarification before rules or live retrieval',async()=>{
 for(const communityId of ['alpha','beta'])for(const [question,goal,detail] of examples)for(const interpretationMode of goal==='cost'?['structured','legacy']:['structured']){
  let retrievals=0;
  const wrongTopic=async()=>{retrievals++;return {answer:'An unrelated amount is $123.',answerMode:'deterministic',confidence:{canAnswer:true},sources:[],actions:[]};};
  const result=await answerCommunityQuestion(question,{
   communityId,communityProfile:{communityId,name:communityId,website:'https://'+communityId+'.example',connectors:[]},
   index:{communityId,sources:[],factLedger:[]},interpretationMode,
   planCommunitySearch:async()=>({intent:'rules',goal,goals:[goal],subject:'unidentified subject',requestedDetails:[detail],
    searchQueries:[question],scope:'ambiguous',needsClarification:true,clarificationQuestion:'Which item or activity do you mean?'}),
   answerRulesQuestion:wrongTopic,getWasteSchedule:wrongTopic,getPoolStatus:wrongTopic,getCommunityEvents:wrongTopic,getFoodTruckAnswer:wrongTopic,synthesizeCommunityAnswer:false,
  });
  assert.equal(retrievals,0,communityId+': '+question);
  assert.equal(result.answerMode,'targeted-clarification',question);
  assert.equal(result.completion.outcome,'ambiguous',question);
  assert.equal(result.confidence.canAnswer,false,question);
  assert.doesNotMatch(result.answer,/123/);
 }
});
test('prior resident subject is resolved before the coordinator receives the follow-up',()=>{
 const resolved=resolveConversationQuestion('How much does it cost?',[{question:'Can I install a shed?',answer:'Previous assistant answer is not evidence.'}]);
 assert.equal(resolved.usedPriorContext,true);
 assert.match(resolved.resolvedQuestion,/shed/);
 assert.doesNotMatch(resolved.resolvedQuestion,/Previous assistant answer/);
 assert.equal(isContextDependentQuestion(resolved.resolvedQuestion),false);
 for(const question of ['What fees do residents pay?','How much does a shed cost?','Is it okay to have chickens?','How many months do I have to finish my backyard?']){
  assert.equal(isContextDependentQuestion(question),false,question);
 }
});

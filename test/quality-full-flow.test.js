const test=require('node:test'),assert=require('node:assert/strict');
const {assertBinding,needSearchOptions,makeRetriever}=require('../scripts/quality-eval/flow-evidence');
const {planIssues,packetIssues,draftIssues,coverageIssues,runCandidate}=require('../scripts/quality-eval/full-flow-candidate');
const plan={standaloneQuestion:'May I build a shed?',usedPriorContext:false,scope:'community',clarificationQuestion:'',needs:[{subject:'shed',task:'permission',request:'Permission to build',evidenceKind:'governing-rule'}],constraints:[],searchQueries:['shed approval']};
const packet={communityId:'alpha',sources:[{id:'rule',communityId:'alpha',sourceUrl:'https://alpha.example/rule',version:'v1',text:'Sheds require approval.',role:'governing-rule',actions:[]}],actions:[]};
const check={outcome:'complete',hardFailures:[],needs:[{needId:'need-1',request:'Shed permission',status:'addressed',supportSourceIds:['rule']}]};
const draft={answer:'Sheds require approval.',actionIds:[]};
function provider(outputs){let i=0;const requests=[];return {requests,fetch:async(_url,init)=>{const body=JSON.parse(init.body);requests.push(body);const output=outputs[i++];if(output instanceof Error)throw output;return new Response(JSON.stringify({stop_reason:'tool_use',content:[{type:'tool_use',name:body.tools[0].name,input:output}],usage:{input_tokens:1,output_tokens:1}}));}};}
const opts={communityId:'alpha',apiKey:'test-only-key',retrieve:async()=>structuredClone(packet)};
test('flow snapshots bind each rules URL to its community, including shared hosts',()=>{
  for(const communityId of ['alpha','beta']){const url=`https://rules.example/${communityId}`;const context={communityId,profile:{communityId,connectors:[{type:'municode',baseUrl:url}]},communityIndex:{communityId},rulesIndex:{source:{sourceUrl:url},documents:[]}};
    assert.doesNotThrow(()=>assertBinding(context));
    assert.throws(()=>assertBinding({...context,rulesIndex:{source:{sourceUrl:'https://rules.example/neighbor'},documents:[]}}));
    assert.throws(()=>assertBinding({...context,communityIndex:{communityId:'other'}}));}
  assert.throws(()=>assertBinding({communityId:'alpha',profile:{communityId:'alpha',connectors:[{type:'municode',baseUrl:'https://rules.example/alpha'}]},communityIndex:{communityId:'alpha'},rulesIndex:{source:{sourceUrl:'https://rules.example/alpha'},documents:[{sourceUrl:'https://rules.example/beta?nodeId=1'}]}}));
});
test('flow rejects inconsistent plans, replaced action versions and unsupported coverage roles',()=>{
  assert.deepEqual(needSearchOptions({task:'form',subject:'lighting approval'}),{intent:'forms',interpretation:{requestedDetails:['action']}});
  assert.deepEqual(planIssues(plan),[]);
  assert.ok(planIssues({...plan,scope:'ambiguous',clarificationQuestion:'Which project?'}).length);
  assert.ok(planIssues({...plan,clarificationQuestion:'Which project?'}).length);
  assert.ok(packetIssues({...packet,communityId:'beta'},'alpha').length);
  assert.ok(packetIssues({...packet,actions:[{id:'a',sourceId:'rule',communityId:'alpha',version:'v2'}]},'alpha').length);
  assert.ok(draftIssues({...draft,actionIds:['invented']},packet).length);
  assert.ok(draftIssues({...draft,answer:'Apply at https://alpha.example/fake'},packet).length);
  const mapped={...plan,needs:plan.needs.map(n=>({...n,id:'need-1'}))};
  assert.deepEqual(coverageIssues(check,mapped,packet),[]);
  assert.ok(coverageIssues({...check,needs:[]},mapped,packet).length);
  assert.ok(coverageIssues({...check,needs:[check.needs[0],check.needs[0]]},mapped,packet).length);
  assert.ok(coverageIssues({...check,needs:[{...check.needs[0],needId:'replacement'}]},mapped,packet).length);
  assert.ok(coverageIssues(check,mapped,{...packet,sources:packet.sources.map(s=>({...s,role:'official-action'}))}).length);
});
test('all composed attempts require the same check; one repair can recover a rejected draft',async()=>{
  const bad={outcome:'partial',hardFailures:['missing-core-answer'],needs:[{needId:'need-1',request:'Shed permission',status:'unanswered',supportSourceIds:[]}]};
  const p=provider([plan,draft,bad,draft,check]);const result=await runCandidate({question:'May I build a shed?'},{...opts,fetchImpl:p.fetch});
  assert.equal(p.requests.length,5);assert.equal(result.completion.outcome,'complete');
  assert.equal(result.trace.filter(r=>r.stage==='acceptance').length,2);
  assert.match(p.requests[3].messages[0].content,/missing-core-answer/);
  assert.deepEqual(JSON.parse(p.requests[4].messages[0].content).requiredNeeds.map(n=>n.id),['need-1']);
});
test('composer or checker failure never releases an unchecked draft; failed repair stays unresolved',async()=>{
  const bad={...check,outcome:'partial',hardFailures:['unsupported-material-claim']};
  for(const outputs of [[plan,new Error('composer-timeout')],[plan,draft,new Error('checker-timeout')],[plan,draft,bad,draft,bad]]){
    const p=provider(outputs),result=await runCandidate({question:'May I build a shed?'},{...opts,fetchImpl:p.fetch});
    assert.equal(result.status,'unresolved-experiment');assert.equal(result.answer,null);assert.notEqual(result.completion.outcome,'complete');assert.ok(p.requests.length<=5);
  }
});
test('ambiguous subject never triggers guessed retrieval and prior resident context reaches checking',async()=>{
  const ambiguous={...plan,scope:'ambiguous',needs:[],searchQueries:[],clarificationQuestion:'Which project?'};
  const p=provider([ambiguous,{outcome:'clarification',hardFailures:[],needs:[{request:'unspecified subject',status:'clarification-needed',supportSourceIds:[]}]}]);let retrievals=0;
  const result=await runCandidate({question:'What does it cost?',context:[{question:'Hello',answer:'UNTRUSTED_OLD_FACT'}]},{...opts,retrieve:async()=>{retrievals++;return packet;},fetchImpl:p.fetch});
  assert.equal(retrievals,0);assert.equal(result.completion.outcome,'ambiguous');
  assert.doesNotMatch(JSON.stringify(p.requests),/UNTRUSTED_OLD_FACT/);
});
test('actual retrieval keeps two communities and rule versions separate',async()=>{
  const packets=[];
  for(const [communityId,jobId] of [['alpha',1],['beta',2]]){
    const base=`https://rules.example/${communityId}`;
    const doc={id:'shed::1',nodeId:'shed',communityId,sourceUrl:base+'?nodeId=shed',productId:1,jobId,title:'Shed requirements',text:`A shed requires approval in ${communityId}.`};
    const retrieve=makeRetriever({communityId,profile:{communityId,website:`https://${communityId}.example`,allowedHosts:['rules.example'],connectors:[{type:'municode',baseUrl:base}]},
      communityIndex:{communityId,sources:[],factLedger:[]},rulesIndex:{source:{sourceUrl:base},documents:[doc]}});
    const packet=await retrieve({...plan,needs:plan.needs.map(n=>({...n,id:'need-1'}))});packets.push(packet);
    assert.deepEqual(packetIssues(packet,communityId),[]);assert.equal(packet.sources.length,1);assert.equal(packet.sources[0].communityId,communityId);
    assert.match(packet.sources[0].text,new RegExp(communityId));
  }
  assert.notEqual(packets[0].sources[0].id,packets[1].sources[0].id);
  assert.notEqual(packets[0].sources[0].version,packets[1].sources[0].version);
});
test('alternate rule ranking cannot replace text identity or restore ineligible evidence',async()=>{
 const communityId='alpha',base='https://rules.example/alpha';
 const doc={id:'shed::1',nodeId:'shed',communityId,sourceUrl:base+'?nodeId=shed',productId:1,jobId:1,title:'Shed requirements',text:'A shed requires approval.'};
 const context={communityId,profile:{communityId,website:'https://alpha.example',allowedHosts:['rules.example'],connectors:[{type:'municode',baseUrl:base}]},communityIndex:{communityId,sources:[],factLedger:[]},rulesIndex:{source:{sourceUrl:base},documents:[doc]}};
 for(const replacement of [{...doc,text:'Unapproved replacement text'},{...doc,id:'other-version'},{...doc,communityId:'beta'}]){
  const retrieve=makeRetriever({...context,ruleSearch:async()=>[replacement]});
  await assert.rejects(()=>retrieve({...plan,needs:plan.needs.map(n=>({...n,id:'need-1'}))}));
 }
});

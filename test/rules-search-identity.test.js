const test=require('node:test'),assert=require('node:assert/strict');
const {searchRulesIndex}=require('../lib/rules-assistant');
const {availableSectionContext}=require('../lib/rules-section-context');
const base={communityId:'alpha',nodeId:'policy',sourceUrl:'https://alpha.example/policy',productId:1,jobId:2,
  title:'Community policy',chapter:'Policy',article:'Details',sourceTextHash:'version',isInlineTopic:false};
const first={...base,id:'policy::1',chunkHash:'first',text:'General bicycle introduction and administrative background.'};
const second={...base,id:'policy::2',chunkHash:'second',text:'Bicycle storage requires a secure bicycle rack. Bicycle racks must follow the bicycle storage specification.'};
test('search preserves all identity fields of the strongest passage and enables same-version context',()=>{
  const [selected]=searchRulesIndex({documents:[first,second]},'bicycle storage',3);
  assert.equal(selected.text,second.text);
  assert.equal(selected.id,second.id);
  assert.equal(selected.chunkHash,second.chunkHash);
  const context=availableSectionContext(selected,[first,second]);
  assert.equal(context.expanded,true);
  assert.equal(context.text,first.text+'\n\n'+second.text);
});
test('same node names from another community, source or version never merge ranking support',()=>{
  for(const change of [{communityId:'beta'},{sourceUrl:'https://alpha.example/other'},{jobId:3},{sourceTextHash:'another-version'}]){
    const other={...second,...change,id:'other::1'};
    const results=searchRulesIndex({documents:[second,other]},'bicycle storage',5);
    assert.equal(results.length,2,JSON.stringify(change));
    assert.ok(results.every(r=>r.supportScore===0));
  }
});

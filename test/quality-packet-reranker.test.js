const test=require('node:test'),assert=require('node:assert/strict');
const {rerankOrder,packetSelection}=require('../scripts/quality-eval/rerank-packet');
test('need balancing can retain a second requested part that global ranking crowds out',()=>{
 const candidates=Array.from({length:13},(_,i)=>({id:'s'+i,text:'Exact approved text '+i,version:'v1',actions:[],retrievedForNeedIds:[i===12?'form':'rule']}));
 const needs=[{id:'rule'},{id:'form'}],scores=[candidates.map((_,i)=>i===12?-5:20-i),candidates.map((_,i)=>i===12?1:-20)];
 const before=JSON.stringify(candidates),global=packetSelection(rerankOrder(candidates,needs,scores)),balanced=packetSelection(rerankOrder(candidates,needs,scores,{balanced:true}));
 assert.equal(global.sources.some(s=>s.id==='s12'),false);assert.equal(balanced.sources.some(s=>s.id==='s12'),true);
 assert.equal(balanced.sources.length,12);assert.equal(balanced.omissions.length,1);assert.equal(JSON.stringify(candidates),before);
 for(const s of balanced.sources)assert.deepEqual(s,candidates.find(c=>c.id===s.id));
});
test('invalid score matrices or duplicate identities cannot silently select evidence',()=>{
 const candidates=[{id:'a',text:'A'},{id:'b',text:'B'}],needs=[{id:'n'}];
 for(const scores of [[],[[1]],[[1,NaN]],[[1,Infinity]],[[1,2],[3,4]]])assert.throws(()=>rerankOrder(candidates,needs,scores),/Invalid/);
 assert.throws(()=>rerankOrder([candidates[0],candidates[0]],needs,[[1,2]]),/Duplicate/);
 assert.deepEqual(rerankOrder(candidates,needs,[[1,1]]).map(s=>s.id),['a','b']);
});

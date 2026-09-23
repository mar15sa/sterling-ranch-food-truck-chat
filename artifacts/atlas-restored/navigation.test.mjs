import test from 'node:test';
import assert from 'node:assert/strict';
import {readNavigation,navigationQuery} from './navigation.mjs';
test('a nested stop can return to the exact filtered walk and selected route',()=>{
 const s=readNavigation('?view=place&place=prospect-playground&return=1&returnView=walks&returnWalkArea=Prospect&returnMinutes=30&returnRoute=prospect-loop');
 assert.equal(s.returnMap.view,'walks');assert.deepEqual(s.returnMap.walk,{area:'Prospect',minutes:30,route:'prospect-loop'});
 assert.deepEqual(readNavigation(navigationQuery(s)),s);
});
test('shared walking outing retains area, total-time filter and selected guide',()=>{
 const s=readNavigation('?view=walks&walkArea=Prospect&minutes=30&route=prospect-loop');
 assert.deepEqual(s.walk,{area:'Prospect',minutes:30,route:'prospect-loop'});
 assert.deepEqual(readNavigation(navigationQuery(s)),s);
});
test('future-village sharing preserves wider-plan mode and selected area',()=>{
 const s=readNavigation('?view=future&futureMap=villages&plan=planned-paramount');
 assert.equal(s.future.mode,'villages');assert.equal(s.future.selected,'planned-paramount');
 assert.deepEqual(readNavigation(navigationQuery(s)),s);
});
test('place and amenity sharing retains area, photo and selected detail',()=>{
 const s=readNavigation('?view=place&place=pioneer-play&village=Providence&photo=1&group=2');
 assert.deepEqual(readNavigation(navigationQuery(s)),s);
 assert.equal(s.place,'pioneer-play'); assert.equal(s.photo,true);
});
test('returning map and future states remain distinct from opening a model',()=>{
 for(const query of ['?view=neighborhood&place=high-top&village=Ascent&focus=village&unfold=1&layer=places','?view=future&plan=library&futureArea=Providence']){
  const s=readNavigation(query);assert.deepEqual(readNavigation(navigationQuery(s)),s);
 }
 assert.equal(readNavigation('?place=pioneer').view,'place');
});
test('untrusted URL parameters cannot create malformed navigation state',()=>{
 const s=readNavigation('?view=oops&place=%22%3E&group=-9&village=unknown&zoom=Infinity&lens=oops&layer=no');
 assert.equal(s.view,'neighborhood');assert.equal(s.place,null);assert.equal(s.group,0);assert.equal(s.discovery.village,'all');assert.equal(s.focus.manual,1);assert.equal(s.discovery.layer,'places');
});
test('shared places retain the originating area and unfolded layer',()=>{
 const s=readNavigation('?view=place&place=yard-27&village=Ascent&return=1&returnArea=Ascent&returnUnfold=1&returnFocus=village');
 assert.deepEqual(readNavigation(navigationQuery(s)),s);assert.equal(s.returnMap.discovery.unfolded,true);
 assert.deepEqual(readNavigation('?village=Ascent').focus.target,{kind:'village',name:'Ascent'});
});

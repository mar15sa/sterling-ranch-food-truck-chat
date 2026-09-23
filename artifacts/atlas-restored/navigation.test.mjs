import test from 'node:test';
import assert from 'node:assert/strict';
import {readNavigation,navigationQuery} from './navigation.mjs';
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

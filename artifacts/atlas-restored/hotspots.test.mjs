import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {modelHotspots,hotspotMarkup} from './hotspots.js';
import {mergeCatalog} from './catalog.mjs';
const data=n=>JSON.parse(fs.readFileSync(new URL('data/'+n,import.meta.url),'utf8'));
const places=mergeCatalog(data('places.json'),data('directory.json'),data('visitor-notes.json'),data('area-visit.json'));
test('every illustrated hotspot opens a real current child of that destination',()=>{
 for(const [root,points] of Object.entries(modelHotspots))for(const p of points){
  const place=places.find(x=>x.id===p.id);assert.equal(place.parentId,root);assert.ok(!place.future);
  assert.ok(p.x>0&&p.x<100&&p.y>0&&p.y<100);assert.match(hotspotMarkup(root,p.id,places),/aria-pressed="true"/);
 }
});
test('unseen or future features never become illustration hotspots',()=>{
 assert.equal(hotspotMarkup('primrose',null,places),'');
 assert.equal(hotspotMarkup('pioneer',null,[{id:'pioneer-play',parentId:'pioneer',future:true}]),'');
});

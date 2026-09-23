import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {matchesLens} from './discovery.mjs';
import {illustratedWalk,routeFrame} from './walk-visuals.js';
const t=JSON.parse(fs.readFileSync(new URL('data/trails.json',import.meta.url)));
test('walk inventory retains originals and adds source-backed options in all three mapped villages',()=>{
 assert.equal(t.routes.length,8);for(const id of ['prospect-loop','providence-west','overlook-link'])assert.ok(t.routes.some(r=>r.id===id));
 for(const area of ['Providence','Ascent','Prospect'])assert.ok(t.routes.some(r=>r.area===area));
 for(const r of t.routes){assert.equal(Math.round(r.distanceParts.reduce((a,b)=>a+b,0)*100),Math.round(r.miles*100));assert.deepEqual(r.startPoint,r.paths[0][0]);assert.deepEqual(r.endPoint,r.paths.at(-1).at(-1));for(const [x,y] of r.paths.flat()){assert.ok(x>=0&&x<=1242&&y>=0&&y<=2000);}assert.ok(r.sourceScope);}
});
test('the complete recorded mileage-label inventory preserves distinct repeated labels and verified mileage',()=>{
 assert.equal(t.segments.length,40);assert.equal(new Set(t.segments.map(s=>s.id)).size,40);
 assert.equal(t.segments.filter(s=>s.area==='Prospect').length,8);assert.equal(t.segments.filter(s=>s.area==='Ascent').length,18);assert.equal(t.segments.filter(s=>s.area==='Providence').length,14);
 assert.equal(t.segments.find(s=>s.id==='cab-segment-20').miles,.27);assert.equal(t.segments.filter(s=>s.area==='Prospect'&&s.miles===.53).length,2);
 for(const s of t.segments){assert.equal(s.sourceUrl,t.source.url);assert.ok(s.viewBox.length===4);assert.ok(s.miles===null||s.miles>0);}
});
test('every route is highlighted in source context rather than detached from repeated landscape art',()=>{
 for(const r of t.routes){const h=illustratedWalk(r,t);assert.match(h,/cab-trail-map.png/);assert.doesNotMatch(h,/full-landscape.png|route-shape|Route shape/);assert.match(h,/route-highlight/);assert.match(h,/route-start/);assert.doesNotMatch(h,/NaN|Infinity/);for(const p of r.paths)assert.ok(h.includes(p.map(x=>x.join(',')).join(' ')),'source coordinates are retained without art-space transformation');}
 assert.doesNotMatch(illustratedWalk({name:'<script>'}),/<script>/);
});
test('route frames keep every source point and endpoint inside the visible map',()=>{
 for(const r of t.routes){const [x,y,w,h]=routeFrame(r);assert.ok(x>=0&&y>=0&&x+w<=1242&&y+h<=2000);for(const [px,py]of r.paths.flat()){assert.ok(px>x&&px<x+w&&py>y&&py<y+h);}assert.ok(Math.abs(w/h-1.5)<.001);}
 assert.ok(new Set(t.routes.map(r=>routeFrame(r).join(','))).size>=7,'each guide gets its own geographic context');
});
test('loop shares its start/return marker while one-way routes label both ends',()=>{
 for(const r of t.routes){const h=illustratedWalk(r);assert.equal(h.includes('route-finish'),r.type!=='Loop');assert.match(h,/route-start/);}
});
test('section locator highlights its recorded label without inventing a trail alignment',()=>{
 for(const section of t.segments){const h=illustratedWalk(section);assert.match(h,/section-locator/);assert.ok(h.includes('translate('+section.labelPoint.join(' ')+')'));assert.doesNotMatch(h,/route-highlight/);}
});

test('future park projects are absent from current trail access cards',()=>{
 assert.equal(t.accessPoints.length,6);for(const p of t.accessPoints){assert.ok(p.sourceUrl.startsWith('https://'));assert.ok(!['cultural-trail','sterling-gulch','medley','heritage','outcrop'].includes(p.placeId));}
});

test('all sourced walking access points remain discoverable in the map walking filter',()=>{for(const a of t.accessPoints){const p={id:a.placeId,name:a.name};assert.equal(matchesLens(p,[p],'walks',t),true);}});

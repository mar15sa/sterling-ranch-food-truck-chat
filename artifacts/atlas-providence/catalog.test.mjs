import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {rootOf,inArea,searchPlaces,mergeCatalog} from './catalog.mjs';
import {contains,pointInPolygon} from './spatial.mjs';
const read=name=>JSON.parse(fs.readFileSync(new URL(name,import.meta.url),'utf8'));
const area=read('area.json'),catalog=read('data/places.json'),directory=read('data/directory.json'),notes=read('data/visitor-notes.json'),local=read('data/area-visit.json'),geo=read('data/geography.json');
const places=mergeCatalog(catalog,directory,notes,local),byId=new Map(places.map(p=>[p.id,p])),scoped=inArea(places,area.rootIds);
test('all seven roots retain their exact saved source coordinates inside the crop',()=>{
  assert.equal(area.rootIds.length,7);
  for(const id of area.rootIds){const saved=catalog.places.find(p=>p.id===id),p=byId.get(id);assert.deepEqual(p.coordinates,saved.coordinates,id);assert.ok(contains(p.coordinates,area.bounds),id);}
});
test('detailed models are attached to actual source footprints, not an arbitrary nearby building',()=>{
  for(const item of area.landmarks.filter(p=>p.buildingId)){const feature=geo.features.find(f=>f.id===item.buildingId);assert.equal(feature.kind,'building');assert.ok(pointInPolygon(byId.get(item.id).coordinates,feature.coordinates),item.id);}
  assert.equal(area.landmarks.find(x=>x.id==='primrose').buildingId,undefined);
  assert.equal(geo.features.find(f=>f.id===area.landmarks.find(x=>x.id==='overlook').poolId).kind,'pool');
});
test('nested tenants and amenities resolve to their parent place without duplicate map pins',()=>{
  for(const id of ['atlas-coffee','urgent-care','ranch-playground','cab-office'])assert.equal(rootOf(id,byId).id,'sterling-center');
  assert.equal(rootOf('overlook-pool',byId).id,'overlook');assert.equal(rootOf('mccormick-play',byId).id,'mccormick');
  assert.equal(new Set(scoped.map(p=>p.id)).size,scoped.length);assert.ok(!area.rootIds.includes('ranch-playground'));
});
test('area search finds nested places while excluding out-of-area destinations and future construction',()=>{
  assert.ok(searchPlaces(scoped,'coffee').some(p=>p.id==='atlas-coffee'));
  assert.ok(searchPlaces(scoped,'Great Hall').some(p=>p.id==='overlook-great-hall'));
  assert.ok(searchPlaces(scoped,'playground').some(p=>p.id==='mccormick-play'));
  assert.equal(searchPlaces(scoped,'pickleball').length,0);
  assert.ok(scoped.every(p=>!p.future));assert.ok(!scoped.some(p=>p.id==='school51'));
});
test('all Sterling Center source groups remain exposed and notes cannot alter location precision',()=>{
  for(const group of directory.groups)for(const id of group.placeIds)assert.ok(byId.has(id));
  for(const id of ['overlook','sterling-center','providence-park'])assert.equal(byId.get(id).locationPrecision,catalog.places.find(p=>p.id===id).locationPrecision);
  assert.equal(byId.get('overlook').access,null);assert.match(byId.get('overlook').highlights.join(' '),/front entrance/);
});
test('CAB route traces remain in their documented image coordinate space and future projects have no invented location',()=>{
  const trails=read('data/trails.json');assert.equal(trails.coordinateSpace,'source-image-pixels');
  for(const id of area.routeIds){const route=trails.routes.find(r=>r.id===id);assert.ok(route);assert.ok(Math.abs(route.distanceParts.reduce((a,b)=>a+b,0)-route.miles)<1e-10);assert.match(route.geometryMethod,/schematic/);}
  for(const project of local.projects){assert.equal(project.coordinates,undefined);assert.equal(project.buildingId,undefined);assert.ok(project.url.startsWith('https://'));}
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const core=require('../public/atlas/atlas-core');
const {places}=require('../public/atlas/places.json');
const config=require('../public/atlas/experience.json');

test('open-place navigation retains parent membership across nested businesses and amenities',()=>{
  const park=core.placeFamily(places,'mccormick-play');
  assert.equal(park.parent.id,'mccormick');assert.deepEqual(park.children.map(p=>p.id).sort(),['mccormick-play','mccormick-shelter']);
  const center=core.placeFamily(places,'sterling-center');assert.equal(center.parent.id,'sterling-center');assert.equal(center.children.length,6);
  const coffee=core.placeFamily(places,'atlas-coffee');assert.equal(coffee.parent.id,'ranch-social');assert.deepEqual(coffee.ancestors.map(p=>p.id),['sterling-center']);assert.equal(coffee.children.length,7);
  assert.equal(core.placeFamily(places,'urgent-care').parent.id,'uchealth');
  assert.equal(core.placeFamily(places,'school51').parent.id,'school51');
  assert.equal(core.placeFamily(places,'does-not-exist'),null);
});

test('future reveal preserves existing facilities and never invents project positions',()=>{
  const now=core.mapPlaces(places),next=core.mapPlaces(places,true);
  assert.ok(now.every(p=>!p.future));assert.equal(next.length,100);
  assert.ok(now.some(p=>p.id==='burns-courts'));assert.ok(!now.some(p=>p.id==='burns-next'));
  assert.equal(core.placeFamily(places,'burns-next').parent.id,'burns');
  for(const id of ['school51','library']){assert.ok(next.find(p=>p.id===id).future);assert.equal(next.find(p=>p.id===id).coordinates,undefined);}
  const phase=next.find(p=>p.id==='burns-next');assert.equal(phase.locationPrecision,'area-reference');assert.equal(core.directionsUrl(phase),null);
});

test('illustrated showcase configuration refers only to supported catalog places',()=>{
  const kinds=new Set(['playground','courts','center','park','future']);
  assert.equal(new Set(config.featured.map(p=>p.id)).size,config.featured.length);
  for(const item of config.featured){assert.ok(places.some(p=>p.id===item.id&&!p.parentId));assert.ok(kinds.has(item.art));}
  for(const id of config.futureHighlights)assert.ok(places.find(p=>p.id===id)?.future);
  assert.deepEqual(config,require('../data/atlas/experience.json'));
});

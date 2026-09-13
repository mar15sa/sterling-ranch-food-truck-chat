const {test}=require('node:test');
const assert=require('node:assert/strict');
const {atlasPreviewEnabled,isAtlasPath}=require('../lib/atlas-preview');
const core=require('../public/atlas/atlas-core');
const catalog=require('../public/atlas/places.json');
const geography=require('../public/atlas/geography.json');

test('atlas is unavailable unless the deployment itself is staging',()=>{
  for(const environment of [{},{NODE_ENV:'development'},{RAILWAY_ENVIRONMENT_NAME:'production'},{RAILWAY_ENVIRONMENT_NAME:'preview',ATLAS_ENABLED:'true'},{RAILWAY_PUBLIC_DOMAIN:'staging.example.com'}])assert.equal(atlasPreviewEnabled(environment),false);
  assert.equal(atlasPreviewEnabled({RAILWAY_ENVIRONMENT_NAME:'staging'}),true);
});
test('production guard covers page aliases, direct assets, encoded paths and Windows path variants',()=>{
  for(const path of ['/atlas','/atlas/','/atlas.html','/atlas/index.html','/atlas/places.json','/atlas/geography.json','/ATLAS/atlas.js','/%61tlas/index.html','/atlas%5cplaces.json','/atlas./places.json','/atlas%20/places.json','/other/../atlas/places.json'])assert.equal(isAtlasPath(path),true,path);
  for(const path of ['/','/pool','/openings','/api/community/ask','/society.css'])assert.equal(isAtlasPath(path),false,path);
});
test('staging inventory retains sources, explicit review state and valid geometry',()=>{
  assert.equal(core.validateCatalog(catalog),catalog);
  for(const p of catalog.places){assert.ok(p.checkedAt);assert.equal(p.reviewState,'staging-review');if(p.coordinates){assert.ok(p.locationSource);const[x,y]=core.project(p.coordinates,geography.bounds);assert.ok(x>=0&&x<=1200&&y>=0&&y<=940,p.name);}}
});
test('future browsing keeps planned amenities distinct from existing courts and pools',()=>{
  const upcoming=core.filterPlaces(catalog.places,'future','');
  assert.ok(upcoming.some(p=>p.id==='burns-next'));assert.ok(upcoming.some(p=>p.id==='prospect-next'));
  assert.ok(!upcoming.some(p=>p.id==='burns-courts'||p.id==='overlook-pool'));
  assert.ok(core.filterPlaces(catalog.places,'all','coffee').some(p=>p.id==='atlas-coffee'));
  assert.equal(core.filterPlaces(catalog.places,'parks','coffee').length,0);
  assert.ok(core.filterPlaces(catalog.places,'all','zipline').some(p=>p.id==='zippity'));
});
test('co-located places group without fabricating separate map coordinates',()=>{
  const groups=core.groupPlaces(catalog.places);
  const center=groups.find(g=>g.key==='sterling-center');
  for(const id of ['sterling-center','atlas-coffee','salta','agora','uchealth','lake-family-dental','sterling-eyecare','rave'])assert.ok(center.places.some(p=>p.id===id),id);
  const pat=groups.find(g=>g.key==='pat-gallagher');
  assert.ok(pat.places.some(p=>p.id==='pat-shelter'));
  const groupsFuture=core.groupPlaces(core.filterPlaces(catalog.places,'future',''));
  assert.equal(groupsFuture.find(g=>g.key==='burns').places[0].id,'burns-next');
  assert.ok(!groups.some(g=>g.places.some(p=>!p.coordinates)));
});

test('every audited record is either listed or explicitly held without losing park coverage',()=>{
  const inventory=require('../data/atlas/inventory.json');
  const coverage=require('../data/atlas/coverage.json');
  const listed=new Set(catalog.places.map(p=>p.id)),held=new Set(catalog.coverage.heldIds);
  assert.equal(listed.size+held.size,inventory.records.length);
  for(const r of inventory.records){assert.notEqual(listed.has(r.id),held.has(r.id),r.id);assert.equal(held.has(r.id),r.kind==='candidate',r.id);}
  for(const baseline of coverage.baselines)for(const entry of baseline.entries)assert.ok(listed.has(entry.recordId)||held.has(entry.recordId),entry.label);
  assert.equal(catalog.coverage.listed,listed.size);
  assert.equal(catalog.coverage.exhaustive,false);
  assert.ok(!catalog.places.some(p=>p.category==='makers'));
  for(const p of catalog.places)if(p.parentId)assert.ok(listed.has(p.parentId),p.name);
});

test('pickleball, missing playgrounds and the new school are discoverable with useful details',()=>{
  for(const query of ['pickleball','pickle ball court','pickle-ball'])assert.ok(core.filterPlaces(catalog.places,'all',query).some(p=>p.id==='burns-courts'),query);
  const courts=catalog.places.find(p=>p.id==='burns-courts');
  assert.match(courts.description,/eight|8/i);assert.match(courts.action.url,/courtreserve\.com/);assert.match(courts.visitNotes.join(' '),/paddles/i);
  for(const id of ['school51','peekaboo','prospect-basketball','willow-corridor','pat-shelter','library-childrens'])assert.ok(catalog.places.some(p=>p.id===id),id);
  assert.ok(core.filterPlaces(catalog.places,'services','school').some(p=>p.id==='school51'));
  assert.ok(core.filterPlaces(catalog.places,'future','').some(p=>p.id==='library-childrens'));
  for(const p of catalog.places.filter(p=>['street-area','parent-area'].includes(p.locationPrecision)))assert.equal(core.directionsUrl(p),null,p.id);
});

test('the served staging catalog is reproducible from its source inventory',()=>{
  require('node:child_process').execFileSync(process.execPath,['scripts/build-atlas-preview.js','--check'],{cwd:require('node:path').join(__dirname,'..')});
});
test('directions are restricted to sourced facility addresses, not reference or unknown locations',()=>{
  const byId=id=>catalog.places.find(p=>p.id===id);
  assert.match(core.directionsUrl(byId('atlas-coffee')),/destination=Atlas/);
  for(const id of ['burns-next','prospect-next','pat-gallagher','library','zebulon','broadstone','prose','primrose','john-adams'])assert.equal(core.directionsUrl(byId(id)),null,id);
  assert.equal(core.safeLink('javascript:alert(1)'),null);assert.equal(core.safeLink('//evil.test'),null);assert.equal(core.safeLink('https://user:pass@example.com'),null);
});
test('home business records require opt-in and extra consent for precise home pins',()=>{
  const p={...catalog.places[0],id:'baker',category:'makers'};
  assert.throws(()=>core.validateCatalog({places:[p]}),/permission/);
  p.ownerConsent=true;assert.throws(()=>core.validateCatalog({places:[p]}),/permission/);
  p.coordinates=null;assert.doesNotThrow(()=>core.validateCatalog({places:[p]}));
});
test('aging information is visibly due for review',()=>{
  assert.equal(core.sourceIsDue({checkedAt:'2026-09-13',reviewAfterDays:14},new Date('2026-09-14')),false);
  assert.equal(core.sourceIsDue({checkedAt:'2026-09-13',reviewAfterDays:14},new Date('2026-10-01')),true);
  assert.equal(core.sourceIsDue({checkedAt:'invalid'}),true);
});

test('directory nests every record under one destination and preserves amenity search',()=>{
  const groups=core.directoryGroups(catalog.places);
  const flattened=groups.flatMap(g=>g.matches.map(p=>p.id));
  assert.equal(new Set(flattened).size,catalog.places.length);
  assert.equal(flattened.length,catalog.places.length);
  assert.ok(groups.every(g=>!g.place.parentId));
  const park=groups.find(g=>g.place.id==='mccormick');
  assert.deepEqual(new Set(park.children.map(p=>p.id)),new Set(['mccormick-play','mccormick-shelter']));
  const search=core.directoryGroups(catalog.places,'all','playground');
  assert.ok(search.find(g=>g.place.id==='mccormick').matches.some(p=>p.id==='mccormick-play'));
  const coffee=core.directoryGroups(catalog.places,'businesses','coffee');
  assert.ok(coffee.find(g=>g.place.id==='sterling-center').matches.some(p=>p.id==='atlas-coffee'));
  assert.ok(!core.directoryGroups(catalog.places,'future','').flatMap(g=>g.matches).some(p=>p.id==='burns-courts'));
});

test('trail guides retain schematic provenance, connected segments and honest distance totals',()=>{
  const trails=require('../public/atlas/trails.json');assert.equal(core.validateTrails(trails),trails);
  const registered=new Set(require('../data/atlas/sources.json').sources.map(s=>s.url));assert.ok(registered.has(trails.source.url));
  for(const route of trails.routes){assert.ok(route.sourceScope);assert.ok(route.nearbyPlaceIds.every(id=>catalog.places.some(p=>p.id===id)));}
  const broken=structuredClone(trails);broken.routes.find(r=>r.id==='providence-west').paths[1][0][0]+=30;
  assert.throws(()=>core.validateTrails(broken),/connect/);
  const misleading=structuredClone(trails);misleading.routes[0].miles=2;
  assert.throws(()=>core.validateTrails(misleading),/distance/);
  const unclosed=structuredClone(trails);unclosed.routes[0].paths[0].pop();
  assert.throws(()=>core.validateTrails(unclosed),/close/);
  for(const field of ['steps','nearbyPlaceIds','viewBox','color','startPoint','endPoint']){const missing=structuredClone(trails);delete missing.routes[0][field];assert.throws(()=>core.validateTrails(missing),/review/,field);}
  assert.deepEqual(core.clampTrailView([9999,-999,200,300],[1242,2000]),[1042,0,200,300]);
  assert.deepEqual(core.clampTrailView([-999,9999,200,300],[1242,2000]),[0,1700,200,300]);
});

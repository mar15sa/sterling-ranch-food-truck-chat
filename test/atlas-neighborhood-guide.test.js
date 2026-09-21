const test=require('node:test');
const assert=require('node:assert/strict');
const {build}=require('../public/atlas/opened/neighborhood-guide');
const {merge}=require('../public/atlas/opened/directory-core');
const catalog=require('../public/atlas/places.json');
const trails=require('../public/atlas/trails.json');
const directory=require('../public/atlas/opened/sterling-center-directory.json');
const notes=require('../public/atlas/opened/visitor-notes.json');

test('all 25 current roots appear once across the five guide areas, with mapped and unmapped roots retained',()=>{
  const guide=build(catalog.places,trails);
  const expected=catalog.places.filter(p=>!p.parentId&&!p.future).map(p=>p.id).sort();
  const assigned=guide.areas.flatMap(area=>area.roots.map(p=>p.id));
  assert.equal(expected.length,25);
  assert.deepEqual([...assigned].sort(),expected);
  assert.equal(new Set(assigned).size,expected.length);
  assert.deepEqual(guide.areas.map(area=>area.name),['Providence','Ascent','Parkvale','Prospect','Around the Ranch']);
  assert.equal(guide.mapped.length,18);
  assert.deepEqual(guide.roots.filter(p=>!p.coordinates).map(p=>p.id).sort(),['outcrop','peekaboo','providence-regional','steve-bloom','trailrock','water-plant','willow-corridor']);
});

test('eleven future guide groups retain their source statuses and only three references are located',()=>{
  const guide=build(catalog.places,trails);
  const projects=guide.future.flatMap(group=>group.projects);
  assert.equal(guide.future.length,11);
  assert.deepEqual(Object.fromEntries(projects.map(p=>[p.id,p.status])),{
    'ascent-village-center':'planned','burns-next':'planned','cultural-trail':'planned','heritage':'planned',
    'library':'planned','library-childrens':'planned','library-outdoors':'planned','library-return':'planned','library-rooms':'planned',
    'medley':'planned','prospect-next':'planned','school51':'building','sterling-gulch':'planned','willow-repair':'planned',
    'zebulon':'construction','zebulon-lifestyle':'planned'
  });
  assert.deepEqual(projects.filter(p=>p.coordinates).map(p=>p.id).sort(),['burns-next','prospect-next','willow-repair']);
});

test('the three walking guides preserve their exact sourced distances and nearby destination IDs',()=>{
  const guide=build(catalog.places,trails);
  assert.deepEqual(guide.walks.map(route=>({id:route.id,miles:route.miles,nearby:route.nearbyPlaceIds})),[
    {id:'prospect-loop',miles:0.38,nearby:['prospect-park']},
    {id:'providence-west',miles:1.04,nearby:['sterling-center','pioneer','mccormick']},
    {id:'overlook-link',miles:0.37,nearby:['overlook']}
  ]);
});

test('walking guides reject missing or future nearby destinations',()=>{
  for(const id of ['not-a-place','burns-next']){
    const invalid=structuredClone(trails);
    invalid.routes[0].nearbyPlaceIds=[id];
    assert.throws(()=>build(catalog.places,invalid),/Walking guide references need review/);
  }
});

test('the Sterling Center directory merge keeps every nested child reachable without mutating inputs',()=>{
  const catalogBefore=JSON.stringify(catalog),directoryBefore=JSON.stringify(directory),notesBefore=JSON.stringify(notes);
  const merged=merge(catalog,directory,notes);
  const mergedBefore=JSON.stringify(merged);
  const guide=build(merged.places,trails);
  assert.deepEqual(guide.descendants('sterling-center').map(p=>p.id).sort(),[
    'agora','atlas-coffee','cab-office','food-trucks','info-center','lake-family-dental','living-dream','physical-therapy','primary-care',
    'ranch-patio','ranch-playground','ranch-social','rave','salta','sterling-eyecare','uchealth','urgent-care'
  ]);
  assert.equal(JSON.stringify(catalog),catalogBefore);
  assert.equal(JSON.stringify(directory),directoryBefore);
  assert.equal(JSON.stringify(notes),notesBefore);
  assert.equal(JSON.stringify(merged),mergedBefore);
});

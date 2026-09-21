const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {validate}=require('../public/atlas/opened/landmark-core');
const config=require('../public/atlas/opened/landmark-models.json');
const places=require('../public/atlas/places.json').places;

test('all three destination studies retain their real amenities and exclude future phases',()=>{
  const before=JSON.stringify(places);
  validate(config,places);
  assert.deepEqual(config.models.map(m=>m.id),['overlook','burns','prospect-park']);
  for(const m of config.models){
    assert.deepEqual([...m.features].sort(),places.filter(p=>p.parentId===m.id&&!p.future).map(p=>p.id).sort());
    assert.ok(fs.statSync(path.resolve(__dirname,'../public/atlas/opened',m.image)).size>0);
  }
  assert.equal(config.models.flatMap(m=>m.features).length,15);
  assert.equal(JSON.stringify(places),before);
});

test('a future phase or unrelated destination cannot appear as an existing amenity',()=>{
  for(const id of ['burns-next','prospect-playground','missing-place']){
    const copy=structuredClone(config);copy.models[1].features.push(id);
    assert.throws(()=>validate(copy,places),/amenities/);
  }
});

test('model sources, local image paths and visitor links reject unsafe replacements',()=>{
  const image=structuredClone(config);image.models[0].image='../places.json';
  assert.throws(()=>validate(image,places),/model/);
  const source=structuredClone(config);source.models[0].source.url='javascript:alert(1)';
  assert.throws(()=>validate(source,places),/model/);
  const note=structuredClone(config);note.notes.overlook.actions.push({label:'Unsafe',url:'javascript:alert(1)'});
  assert.throws(()=>validate(note,places),/visitor notes/);
});

test('focus cannot jump to another destination or beyond the constrained illustration',()=>{
  const wrong=structuredClone(config);wrong.models[0].focus.burns=[50,50,1.1];
  assert.throws(()=>validate(wrong,places),/focus/);
  const extreme=structuredClone(config);extreme.models[0].focus['overlook-pool']=[50,50,10];
  assert.throws(()=>validate(extreme,places),/focus/);
});

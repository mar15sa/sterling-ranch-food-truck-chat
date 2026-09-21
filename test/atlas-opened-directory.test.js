const test = require('node:test');
const assert = require('node:assert/strict');
const {merge} = require('../public/atlas/opened/directory-core');
const catalog = require('../public/atlas/places.json');
const directory = require('../public/atlas/opened/sterling-center-directory.json');
const notes = require('../public/atlas/opened/visitor-notes.json');

test('opened preview reconciles every Sterling Center tenant without altering the comparison catalog', () => {
  const before = JSON.stringify(catalog);
  const result = merge(catalog, directory, notes);
  assert.equal(JSON.stringify(catalog), before);
  assert.equal(result.places.length, 101);
  const grouped = result.groups.flatMap(g => g.placeIds);
  assert.deepEqual([...grouped].sort(), ['ranch-social','uchealth','lake-family-dental','sterling-eyecare','rave','info-center','cab-office'].sort());
  const nested = result.places.filter(p => grouped.includes(p.parentId));
  assert.equal(nested.length, 10);
  for (const id of ['atlas-coffee','salta','agora','living-dream','ranch-patio','ranch-playground','food-trucks','primary-care','urgent-care','physical-therapy']) assert.ok(nested.some(p => p.id === id), id);
  assert.equal(result.places.find(p => p.id === 'primrose').parentId, null);
  assert.equal(result.places.find(p => p.id === 'lake-family-dental').locationPrecision, 'parent-area');
  assert.match(result.places.find(p => p.id === 'lake-family-dental').address, /Suite 220/);
});

test('a new direct tenant remains discoverable before a grouping is assigned', () => {
  const updated = structuredClone(directory);
  updated.additions.push({...updated.additions[0],id:'future-directory-addition',name:'Another confirmed service'});
  const result = merge(catalog, updated, notes);
  assert.deepEqual(result.groups.find(g => g.id === 'also-here').placeIds, ['future-directory-addition']);
});

test('invalid directory membership and unsafe visitor actions cannot reach the page', () => {
  const duplicate = structuredClone(directory);
  duplicate.groups[1].placeIds.push('ranch-social');
  assert.throws(() => merge(catalog, duplicate, notes), /grouping/);
  const missing = structuredClone(directory);
  missing.groups[0].placeIds.push('not-a-place');
  assert.throws(() => merge(catalog, missing, notes), /grouping/);
  const unsafe = structuredClone(directory);
  unsafe.updates[0].actions.push({label:'Unsafe',url:'javascript:alert(1)'});
  assert.throws(() => merge(catalog, unsafe, notes), /visitor details/);
});

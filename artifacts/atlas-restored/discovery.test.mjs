import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mergeCatalog } from './catalog.mjs';
import { descendants, features, futureGroups, matchesLens, routesFor } from './discovery.mjs';

const read = (name) => JSON.parse(fs.readFileSync(new URL(name, import.meta.url), 'utf8'));
const catalog = read('data/places.json');
const directory = read('data/directory.json');
const notes = read('data/visitor-notes.json');
const local = read('data/area-visit.json');
const area = read('area.json');
const trails = read('data/trails.json');
const places = mergeCatalog(catalog, directory, notes, local);
const byId = new Map(places.map((place) => [place.id, place]));
const place = (id) => {
  const value = byId.get(id);
  assert.ok(value, `saved catalog must contain ${id}`);
  return value;
};

test('Sterling Center discovers nested coffee and playground amenities', () => {
  const nested = descendants('sterling-center', places).map(({ id }) => id);
  assert.ok(nested.includes('atlas-coffee'), 'Atlas Coffee remains reachable through Ranch Social');
  assert.ok(nested.includes('ranch-playground'), 'Ranch Social playground remains reachable through Ranch Social');

  const keys = features(place('sterling-center'), places).items.map(({ key }) => key);
  assert.ok(keys.includes('coffee'), 'nested Atlas Coffee provides the Coffee discovery feature');
  assert.ok(keys.includes('play'), 'nested Ranch Social playground provides the Playground discovery feature');
  assert.equal(matchesLens(place('sterling-center'), places, 'everyday', trails), true);
  assert.equal(matchesLens(place('sterling-center'), places, 'play', trails), true);
});

test('future amenities do not appear in currently open Prospect features', () => {
  const currentDescendants = descendants('prospect-park', places).map(({ id }) => id);
  assert.ok(!currentDescendants.includes('prospect-next'), 'later Prospect phase is excluded from current descendants');
  assert.equal(features(place('prospect-park'), places).items.some(({ key }) => key === 'swim'), false);
});

test('play discovery excludes private apartment amenities and schools', () => {
  for (const id of ['broadstone', 'prose']) {
    assert.equal(features(place(id), places).privateAmenities, true, `${id} retains its private-amenity classification`);
    assert.equal(matchesLens(place(id), places, 'play', trails), false, `${id} is not public play`);
  }
  for (const id of ['broadstone-pool', 'prose-pool']) {
    assert.equal(matchesLens(place(id), places, 'play', trails), false, `${id} inherits its apartment complex's private access`);
  }
  for (const id of ['john-adams', 'primrose', 'primrose-play']) {
    assert.equal(matchesLens(place(id), places, 'play', trails), false, `${id} is a school-related record, not a public playground`);
  }
});

test('all lens includes the complete saved current-root inventory', () => {
  const currentRoots = places.filter((entry) => !entry.future && !entry.parentId);
  assert.deepEqual(currentRoots.map(({ id }) => id).sort(), [...area.rootIds].sort());
  for (const root of currentRoots) assert.equal(matchesLens(root, places, 'all', trails), true, `${root.id} is discoverable in All`);
});

test('all documented walking-route links remain connected to their places', () => {
  assert.equal(trails.routes.length, 3, 'all three saved walking routes are present');
  for (const route of trails.routes) {
    for (const id of route.nearbyPlaceIds) {
      assert.deepEqual(routesFor(id, trails).map(({ id: routeId }) => routeId).sort().includes(route.id), true, `${route.id} remains linked to ${id}`);
      assert.equal(matchesLens(place(id), places, 'walks', trails), true, `${id} is discoverable in Walking routes`);
    }
  }
});

test('future groups retain all saved future records without promoting them to current amenities', () => {
  const future = places.filter((entry) => entry.future);
  assert.equal(future.length, 16, 'all saved future entries are retained');
  assert.equal(futureGroups(places).length, 11, 'future entries are grouped under eleven top-level listings');
  assert.deepEqual(futureGroups(places).map(({ id }) => id).sort(), [
    'ascent-village-center', 'burns-next', 'cultural-trail', 'heritage', 'library', 'medley',
    'prospect-next', 'school51', 'sterling-gulch', 'willow-repair', 'zebulon',
  ]);
});

test('unlocated current roots stay discoverable without fabricated coordinates', () => {
  const unlocatedRoots = places.filter((entry) => !entry.future && !entry.parentId && !entry.coordinates);
  assert.ok(unlocatedRoots.length >= 7, 'saved unlocated current roots remain available');
  for (const root of unlocatedRoots) {
    assert.equal(matchesLens(root, places, 'all', trails), true, `${root.id} remains discoverable`);
    assert.equal(root.coordinates, undefined, `${root.id} has no invented coordinate`);
  }
});

test('the owner-selected full-area artwork and detailed models remain unchanged', () => {
  const approved = {
    'full-landscape.png':'48d0f998c30233a042415be75022554fcb7ff70ee71ff6c9a2048567a108bc60',
    'sterling-center.png':'9b6295ee2f79a113f9a4a4b80a1c542f0c4c466d59577c0e75956d0310b2db18',
    'overlook-model.png':'0fd0f68140225e2301479a18a090dcec8ac2e55d526048be1a3c1347ab03e12f',
    'burns-model.png':'5e65ca128ad95bb25f6851c36437e8508c21fa14bfac72f5dd275d82586653a1',
    'prospect-model.png':'3c0b0884ea763626aecfd8d74ed11106fb8335c93933f6b5a3d5b4d18ac93c61',
  };
  for (const [file, expected] of Object.entries(approved)) {
    const actual=createHash('sha256').update(fs.readFileSync(new URL('assets/'+file,import.meta.url))).digest('hex');
    assert.equal(actual,expected,`${file}: changing the selected base requires new owner direction and a fresh visual comparison`);
  }
});

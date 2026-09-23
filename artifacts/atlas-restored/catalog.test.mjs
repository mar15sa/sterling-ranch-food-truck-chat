import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mergeCatalog, rootOf, searchPlaces } from './catalog.mjs';

const read = (name) => JSON.parse(fs.readFileSync(new URL(name, import.meta.url), 'utf8'));
const area = read('area.json');
const catalog = read('data/places.json');
const directory = read('data/directory.json');
const notes = read('data/visitor-notes.json');
const local = read('data/area-visit.json');
const trails = read('data/trails.json');
const places = mergeCatalog(catalog, directory, notes, local);
const byId = new Map(places.map((place) => [place.id, place]));

test('full saved catalog retains every record, including future and unlocated places', () => {
  assert.ok(places.length >= 101, `expected at least 101 merged places, got ${places.length}`);
  assert.equal(new Set(places.map((place) => place.id)).size, places.length, 'place IDs must be unique');
  assert.ok(places.some((place) => place.future), 'future places must remain in the catalog');
  const unlocated = places.filter((place) => !place.coordinates);
  assert.ok(unlocated.length >= 7, 'unlocated saved places must remain in the catalog');
  assert.ok(searchPlaces(places, 'elementary school 51').some((place) => place.id === 'school51'));
  assert.ok(searchPlaces(places, 'providence regional').some((place) => place.id === 'providence-regional'));
});

test('area inventory covers all 25 current roots and every documented CAB walk', () => {
  const currentRoots = places.filter((place) => !place.future && !place.parentId).map((place) => place.id).sort();
  assert.ok(currentRoots.length >= 25, `expected at least 25 current roots, got ${currentRoots.length}`);
  assert.deepEqual([...area.rootIds].sort(), currentRoots, 'area roots must be the complete current-root inventory');
  const routeIds = trails.routes.map((route) => route.id).sort();
  for(const id of ['prospect-loop','providence-west','overlook-link']) assert.ok(routeIds.includes(id),'original CAB guide retained: '+id);
  assert.ok(routeIds.length>=8,'expanded current guides retained');
  assert.deepEqual([...area.routeIds].sort(), routeIds, 'area routes must be the complete route inventory');
});

test('nested amenities preserve their parent relationships throughout the full catalog', () => {
  for (const [id, directParent, root] of [['atlas-coffee', 'ranch-social', 'sterling-center'], ['urgent-care', 'uchealth', 'sterling-center'], ['overlook-pool', 'overlook', 'overlook'], ['mccormick-play', 'mccormick', 'mccormick']]) {
    assert.equal(byId.get(id)?.parentId, directParent, `${id} direct parent`);
    assert.equal(rootOf(id, byId)?.id, root, `${id} root`);
  }
});

test('pickleball and Prospect remain represented and searchable', () => {
  assert.equal(byId.get('burns-courts')?.parentId, 'burns');
  assert.ok(searchPlaces(places, 'pickleball').some((place) => place.id === 'burns-courts'));
  assert.equal(byId.get('prospect-park')?.name, 'Prospect Regional Park');
  assert.ok(searchPlaces(places, 'Prospect Park').some((place) => place.id === 'prospect-park'));
});

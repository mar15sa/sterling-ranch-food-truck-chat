import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { mergeCatalog } from './catalog.mjs';
import { connectionScene } from './connections.js';
import { globalSearch, matchesWalk, outing } from './journeys.mjs';
import { navigationQuery, readNavigation } from './navigation.mjs';
import { accessBadges } from './visit-ui.js';
import { walkOverview } from './walk-overview.js';

const read = name => JSON.parse(fs.readFileSync(new URL(name, import.meta.url), 'utf8'));
const trails = read('data/trails.json');
const places = mergeCatalog(read('data/places.json'), read('data/directory.json'), read('data/visitor-notes.json'), read('data/area-visit.json'));

test('a 1.04-mile one-way guide includes the return trip and cannot match 30 minutes', () => {
  const route = trails.routes.find(route => route.id === 'providence-west');
  assert.deepEqual(outing(route), { miles: 2.08, min: 42, max: 62, label: 'Out & back · return included' });
  assert.equal(matchesWalk(route, { minutes: 30 }), false);
});

test('a time filter mutes nonmatching walks but keeps all eight routes in the overview', () => {
  const overview = walkOverview(trails, 'all', { minutes: 30 });
  assert.equal(trails.routes.length, 8);
  for (const route of trails.routes) assert.match(overview, new RegExp(`data-route="${route.id}"`));
  assert.match(overview, /All 8 routes stay on the map/);
  assert.match(overview, /providence-west[\s\S]*?route-muted/);
});

test('global search returns places, walks, and future plans regardless of the active view', () => {
  const found = globalSearch(
    [{ id: 'place', name: 'Atlas Commons', tags: ['atlas'] }],
    [{ id: 'future', name: 'Atlas Library' }],
    [{ id: 'route', name: 'Atlas Walk', description: 'atlas route', area: 'Ascent', type: 'Loop', miles: 0.2 }],
    'atlas',
  );
  assert.deepEqual(new Set(found.map(result => result.resultKind)), new Set(['place', 'route', 'future']));
  for (const view of ['neighborhood', 'place', 'walks', 'future']) assert.equal(globalSearch([{ id: view, name: 'Atlas place' }], [], [], 'atlas').length, 1);
});

test('unsupported suitability never becomes a synthetic search tag', () => {
  const places = [{ id: 'unknown', name: 'Garden', visit: { suitability: [{ label: 'Wheelchair-friendly', supported: false }] } }];
  assert.equal(globalSearch(places, [], [], 'wheelchair').length, 0);
  places[0].visit.suitability.push({ label: 'Stroller-friendly', supported: true });
  assert.equal(globalSearch(places, [], [], 'stroller')[0]?.id, 'unknown');
});

test('access badges identify eligibility without treating missing evidence as public access', () => {
  assert.match(accessBadges({ visit: { access: { kind: 'public' } } }), /Public access/);
  assert.match(accessBadges({ visit: { access: { kind: 'resident' } } }), /Resident access/);
  assert.match(accessBadges({ visit: { access: { kind: 'apartment' } } }), /Apartment amenity/);
  assert.match(accessBadges({}), /Access unconfirmed/);
});

test('older and current links both round-trip to their safe navigation state', () => {
  const old = readNavigation('?place=pioneer&village=Providence&photo=1&group=2');
  assert.deepEqual(readNavigation(navigationQuery(old)), old);
  const current = readNavigation('?view=future&plan=library&futureArea=Providence&futureMap=villages&futureZoom=2&return=1&returnArea=Ascent&returnUnfold=1&returnFocus=village&returnZoom=1.5');
  assert.deepEqual(readNavigation(navigationQuery(current)), current);
});

test('connections show amenity child links separately from route lines and make no geographic promise', () => {
  const scene = connectionScene({
    places: [
      { id: 'park', name: 'Park', village: 'Providence', future: false },
      { id: 'play', name: 'Play area', parentId: 'park', future: false },
    ],
    roots: [{ id: 'park', name: 'Park', village: 'Providence', future: false }],
    trails: { routes: [{ id: 'walk', name: 'Park walk', area: 'Providence', type: 'Loop', miles: 0.2, nearbyPlaceIds: ['park'] }] },
    models: {}, selected: null, village: 'Providence', focusKind: 'village', routeSvg: () => '<svg></svg>',
  });
  assert.match(scene, /data-open="play"/);
  assert.match(scene, /data-route="walk"/);
  assert.doesNotMatch(scene, /data-route="play"/);
  assert.match(scene, /belongs to a place, not a walking path or room position/);
  assert.match(scene, /connecting route or entrance has not been established/);
  assert.doesNotMatch(scene, /data-(?:coordinates|entrance|position)=/);
});

test('all saved future records retain their exact names', () => {
  const future = places.filter(place => place.future === true);
  assert.equal(future.length, 16);
  assert.deepEqual(future.map(place => place.name).sort(), [
    'Ascent Village Center', 'Burns Regional Park: later phases', 'Cultural Trail', 'Elementary School 51',
    'Heritage Regional Park', 'Library children’s area', 'Library drive-through book return',
    'Library study rooms, conference rooms and event hall', 'Library terrace, plaza and children\'s garden',
    'Medley Park', 'Prospect Park: later phases / Beach Club', 'Sterling Gulch Wildlife Corridor',
    'Sterling Ranch Community Library', 'Willow Creek trailhead bike repair station',
    'Zebulon Regional Sports Complex', 'Zebulon area shopping, dining and lodging concept',
  ]);
});

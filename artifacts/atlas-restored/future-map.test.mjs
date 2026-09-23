import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { mergeCatalog } from './catalog.mjs';
import { futureAreas, futureFocus, futureRoot } from './future-map.mjs';

const read = (name) => JSON.parse(fs.readFileSync(new URL(name, import.meta.url), 'utf8'));
const places = mergeCatalog(
  read('data/places.json'),
  read('data/directory.json'),
  read('data/visitor-notes.json'),
  read('data/area-visit.json'),
);
const roots = places.filter((place) => place.future === false && !place.parentId);

test('future areas retain all 16 saved plans under 11 project roots', () => {
  const future = places.filter((place) => place.future === true);
  const areas = futureAreas(places);
  const projects = areas.flatMap((area) => area.projects);

  assert.equal(future.length, 16);
  assert.equal(projects.length, 11);
  assert.deepEqual(projects.map((project) => project.id).sort(), [
    'ascent-village-center', 'burns-next', 'cultural-trail', 'heritage', 'library', 'medley',
    'prospect-next', 'school51', 'sterling-gulch', 'willow-repair', 'zebulon',
  ]);
  assert.equal(areas.find((area) => area.name === 'Providence')?.anchor?.name, 'Providence');
  assert.equal(areas.find((area) => area.name === 'East of current villages')?.anchor, null);
});

test('future grouping accepts only the boolean true flag', () => {
  const areas = futureAreas([
    { id: 'truthy-parent', future: 'planned', village: 'Ascent' },
    { id: 'strict-child', future: true, parentId: 'truthy-parent', village: 'Ascent' },
    { id: 'strict-root', future: true, village: 'Providence' },
    { id: 'false', future: false, village: 'Prospect' },
    { id: 'missing', village: 'Parkvale' },
  ]);

  assert.deepEqual(areas.flatMap((area) => area.projects).map((project) => project.id).sort(), ['strict-child', 'strict-root']);
  assert.equal(futureRoot('truthy-parent', [{ id: 'truthy-parent', future: 'planned' }]), null);
});

test('future children resolve to their planned library, while phases retain their existing parent mapping', () => {
  assert.equal(futureRoot('library-childrens', places)?.id, 'library');
  assert.equal(futureRoot('library-rooms', places)?.id, 'library');
  assert.equal(futureRoot('burns-next', places)?.id, 'burns-next');
  assert.equal(futureRoot('prospect-next', places)?.id, 'prospect-next');
  assert.equal(futureRoot('burns', places), null);
});

test('future focus uses an existing parent location instead of a phase coordinate', () => {
  const calls = [];
  const point = (id) => {
    calls.push(id);
    if (id === 'burns') return [839, 612];
    throw new Error(`future project ${id} must not supply an exact map point`);
  };

  const focus = futureFocus(futureRoot('burns-next', places), roots, point);

  assert.deepEqual(focus, {
    points: [[839, 612]],
    label: 'Burns Regional Park',
    note: 'Approximate parent area · planned footprint unconfirmed',
  });
  assert.deepEqual(calls, ['burns', 'burns']);
});

test('future focus falls back to the village area and leaves unlocated eastern plans unpinned', () => {
  const point = (id) => ({ mccormick: [924, 439] })[id] || null;
  const libraryFocus = futureFocus(futureRoot('library', places), roots, point);

  assert.deepEqual(libraryFocus, {
    points: [[924, 439]],
    label: 'Providence',
    note: 'Village area · exact project site unconfirmed',
  });
  assert.equal(futureFocus(futureRoot('zebulon', places), roots, point), null);
});

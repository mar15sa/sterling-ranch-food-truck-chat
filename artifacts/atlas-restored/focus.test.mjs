import assert from 'node:assert/strict';
import test from 'node:test';
import { cameraFor, futureOnly, inVillage } from './focus.mjs';

test('Prospect focus stays inside the illustration at the lower-left edge', () => {
  const camera = cameraFor({ points: [[374.35878468840383, 932.7819638091605]] });
  assert.ok(camera);
  assert.equal(camera.zoom, 2.55);
  assert.equal(camera.tx, 0, 'the left edge must not expose blank space');
  assert.ok(camera.ty <= 0 && camera.ty >= 100 - 100 * camera.zoom, 'vertical translation stays within the viewport');
  assert.equal(camera.radiusX, 18);
  assert.equal(camera.radiusY, 21);
});

test('unlocated or malformed points do not produce a camera', () => {
  assert.equal(cameraFor({ points: [] }), null);
  assert.equal(cameraFor({ points: [[NaN, 20], [10]] }), null);
  assert.equal(cameraFor({ points: [[, 20]] }), null);
});

test('village camera fits its spread and uses a phone-sized viewport', () => {
  const points = [[325, 860], [396, 834], [374, 933]];
  const desktop = cameraFor({ points });
  const phone = cameraFor({ points, mobile: true });
  for (const camera of [desktop, phone]) {
    assert.ok(camera.zoom >= 1.45 && camera.zoom <= 2.55);
    assert.ok(camera.tx <= 0 && camera.tx >= 100 - 100 * camera.zoom);
    assert.ok(camera.ty <= 0 && camera.ty >= 100 - 100 * camera.zoom);
  }
  assert.ok(phone.zoom >= desktop.zoom, 'phone view keeps the village legible');
  assert.ok(phone.tx < desktop.tx, 'phone view recenters the left-side village');
  assert.ok(desktop.radiusX >= 18 && desktop.radiusY >= 21, 'the visible circle includes the village spread');
});

test('future-only mode retains only strictly future places, including nested children', () => {
  const places = [
    { id: 'current', future: false },
    { id: 'unknown' },
    { id: 'future-root', future: true },
    { id: 'future-child', parentId: 'future-root', future: true }
  ];
  assert.deepEqual(futureOnly(places).map((place) => place.id), ['future-root', 'future-child']);
});

test('village matching accepts its exact, area, and wider-community labels only', () => {
  assert.equal(inVillage({ village: 'Prospect' }, 'Prospect'), true);
  assert.equal(inVillage({ village: 'Prospect area' }, 'Prospect'), true);
  assert.equal(inVillage({ village: 'Prospect / wider community' }, 'Prospect'), true);
  assert.equal(inVillage({ village: 'Prospect Park' }, 'Prospect'), false);
  assert.equal(inVillage({ village: 'Parkvale' }, 'all'), true);
});

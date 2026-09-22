import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  clipLine,
  clipPolygon,
  contains,
  distanceToSegment,
  isCoordinate,
  pointInPolygon,
  project,
  unproject,
} from './spatial.mjs';

const bounds = { west: -105.1, east: -105.0, south: 39.4, north: 39.5 };

test('projects from the bounding-box midpoint with east-positive x and south-positive z', () => {
  assert.deepEqual(project([-105.05, 39.45], bounds), { x: 0, z: 0 });
  assert.ok(project([-105.04, 39.45], bounds).x > 0);
  assert.ok(project([-105.05, 39.44], bounds).z > 0);

  const source = [-105.02731, 39.41379];
  const roundTrip = unproject(project(source, bounds), bounds);
  assert.ok(Math.abs(roundTrip[0] - source[0]) < 1e-12);
  assert.ok(Math.abs(roundTrip[1] - source[1]) < 1e-12);
});

test('clips crossing line edges and never connects separate source edges', () => {
  const crop = { west: 0, east: 10, south: 0, north: 10 };
  assert.deepEqual(clipLine([[-5, 5], [15, 5]], crop), [[[0, 5], [10, 5]]]);
  const detour = clipLine([[1, 1], [-5, 5], [1, 9]], crop);
  assert.equal(detour.length, 2);
  assert.ok(Math.abs(detour[0][1][1] - 5 / 3) < 1e-12);
  assert.ok(Math.abs(detour[1][0][1] - 25 / 3) < 1e-12);
});

test('clips polygons to the bounds and retains only valid finite coordinates', () => {
  const crop = { west: 0, east: 10, south: 0, north: 10 };
  const polygon = clipPolygon([[-4, 4], [5, 14], [14, 4], [5, -4]], crop);
  assert.ok(polygon.length >= 3);
  assert.ok(polygon.every((point) => contains(point, crop)));
  assert.deepEqual(clipPolygon([[0, 0], [Infinity, 1], [1, 1]], crop), []);
});

test('returns empty for real saved area polygons outside the Providence crop', () => {
  const area = JSON.parse(readFileSync(new URL('./area.json', import.meta.url)));
  const geography = JSON.parse(readFileSync(new URL('./data/geography.json', import.meta.url)));
  const closedPolygons = geography.features
    .map((feature) => feature.coordinates)
    .filter((points) => points.length >= 4 && points[0][0] === points.at(-1)[0] && points[0][1] === points.at(-1)[1]);
  const outside = closedPolygons.filter((points) => points.every((point) => !contains(point, area.bounds)));

  assert.ok(outside.length > 0, 'fixture should include saved polygons beyond the Providence crop');
  for (const polygon of outside) assert.deepEqual(clipPolygon(polygon, area.bounds), []);
});

test('handles malformed and degenerate geometry safely', () => {
  assert.equal(isCoordinate([-105, 39]), true);
  assert.equal(isCoordinate([-105, Number.NaN]), false);
  assert.equal(contains(['west', 39], bounds), false);
  assert.equal(project([0, Infinity], bounds), null);
  assert.equal(unproject({ x: 1, z: Number.NaN }, bounds), null);
  assert.deepEqual(clipLine([[0, 0]], { west: 0, east: 1, south: 0, north: 1 }), []);
  assert.equal(pointInPolygon([0, 0], [[0, 0], [1, 1]]), false);
  assert.equal(distanceToSegment([3, 4], [0, 0], [0, 0]), 5);
});

test('detects polygon interiors and boundaries in projected meter coordinates', () => {
  const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
  assert.equal(pointInPolygon([5, 5], square), true);
  assert.equal(pointInPolygon([0, 5], square), true);
  assert.equal(pointInPolygon([15, 5], square), false);
  assert.equal(distanceToSegment([5, 3], [0, 0], [10, 0]), 3);
});

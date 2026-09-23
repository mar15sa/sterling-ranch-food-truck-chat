import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, process.platform === 'win32' ? '' : '/'));
const layout = JSON.parse(fs.readFileSync(path.join(here, 'data/layout.json'), 'utf8'));
const source = JSON.parse(fs.readFileSync(path.join(here, 'data/geography.json'), 'utf8'));
const places = JSON.parse(fs.readFileSync(path.join(here, 'data/places.json'), 'utf8'));
const directory = JSON.parse(fs.readFileSync(path.join(here, 'data/directory.json'), 'utf8'));
const point = ([lng, lat]) => [layout.projection.x.longitude * lng + layout.projection.x.latitude * lat + layout.projection.x.offset, layout.projection.y.longitude * lng + layout.projection.y.latitude * lat + layout.projection.y.offset];
const inverse = ([x, y]) => [layout.projection.inverse.longitude.x * x + layout.projection.inverse.longitude.y * y + layout.projection.inverse.longitude.offset, layout.projection.inverse.latitude.x * x + layout.projection.inverse.latitude.y * y + layout.projection.inverse.latitude.offset];

test('projection is reversible and remains inside the 1536 by 1024 plate', () => {
  assert.deepEqual(layout.imageSize, { width: 1536, height: 1024 });
  for (const root of layout.roots.filter(x => x.sourceCoordinates)) { const q = inverse(root.imagePixels); assert.ok(Math.abs(q[0] - root.sourceCoordinates[0]) < 1e-9); assert.ok(Math.abs(q[1] - root.sourceCoordinates[1]) < 1e-9); const p = point(root.sourceCoordinates); assert.ok(Math.abs(p[0] - root.imagePixels[0]) < 1e-8); assert.ok(Math.abs(p[1] - root.imagePixels[1]) < 1e-8); assert.ok(root.imagePixels[0] >= 0 && root.imagePixels[0] <= 1536 && root.imagePixels[1] >= 0 && root.imagePixels[1] <= 1024); }
});
test('the full saved geography bounds and every current parent source record are retained', () => {
  assert.deepEqual(layout.geographicBounds, { west: -105.077, east: -105.02, south: 39.477, north: 39.518 });
  const sourceCatalog = new Map([...places.places, ...directory.additions].map(x => [x.id, x]));
  const parents = [...sourceCatalog.values()].filter(x => x.kind === 'place' && !x.future && !x.parentId).sort((a,b) => a.id.localeCompare(b.id));
  assert.equal(layout.roots.length, 25);
  for (const parent of parents) { const root = layout.roots.find(x => x.id === parent.id); assert.ok(root, parent.id); assert.deepEqual(root.sourceCoordinates, parent.coordinates ? parent.coordinates.slice(0, 2) : null); assert.deepEqual(root.imagePixels, parent.coordinates ? point(parent.coordinates) : null); }
  assert.equal(layout.roots.filter(x => !x.sourceCoordinates).length, 7);
});
test('north stays up in the rendered plate', () => {
  const northern = layout.roots.find(x => x.id === 'sterling-center');
  const southern = layout.roots.find(x => x.id === 'mccormick');
  assert.ok(northern.sourceCoordinates[1] > southern.sourceCoordinates[1]);
  assert.ok(northern.imagePixels[1] < southern.imagePixels[1]);
});
test('full-area anchors fit and include Burns, Prospect, Willow Creek, and Broadstone', () => {
  for (const id of ['sterling-center','overlook','burns','prospect-park','willow-creek','broadstone']) assert.ok(layout.roots.find(x => x.id === id)?.imagePixels, id);
  const pins = layout.roots.filter(x => x.imagePixels).map(x => x.imagePixels);
  assert.ok(Math.min(...pins.map(x => x[0])) >= 0 && Math.max(...pins.map(x => x[0])) <= 1536);
  assert.ok(Math.min(...pins.map(x => x[1])) >= 0 && Math.max(...pins.map(x => x[1])) <= 1024);
});
test('Sterling Center and Overlook footprints exactly match saved source geometry', () => {
  for (const id of ['sterling-center','overlook']) { const p = layout.roots.find(x => x.id === id); assert.deepEqual(p.footprintCoordinates, source.features.find(x => x.id === p.footprintId).coordinates); }
});
test('road grounding includes actual shared source junctions', () => {
  assert.ok(layout.roadJunctions.length >= 4);
  assert.ok(layout.roadJunctions.every(x => x.roadFeatureIds.length > 1));
});

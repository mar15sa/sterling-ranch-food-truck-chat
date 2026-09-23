/* Deterministic, source-preserving reference plate. Run: node build-reference.cjs */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('C:/Users/mar15/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');

const root = __dirname;
const source = path.resolve(root, '../../../atlas-providence-worktree/artifacts/atlas-providence');
const geography = JSON.parse(fs.readFileSync(path.join(source, 'data/geography.json'), 'utf8'));
const places = JSON.parse(fs.readFileSync(path.join(source, 'data/places.json'), 'utf8'));
const directory = JSON.parse(fs.readFileSync(path.join(source, 'data/directory.json'), 'utf8'));
const area = JSON.parse(fs.readFileSync(path.join(source, 'area.json'), 'utf8'));
const W = 1536, H = 1024;
const bounds = geography.bounds; // Full saved OSM window; no inferred community boundary or white framing.
const center = [(bounds.west + bounds.east) / 2, (bounds.south + bounds.north) / 2];
const cosLat = Math.cos(center[1] * Math.PI / 180);
const scale = Math.min((W * .94) / ((bounds.east - bounds.west) * cosLat), (H * .94) / (bounds.north - bounds.south));
const rotation = -2 * Math.PI / 180; // a gentle eastward lean; geographic north remains visually up.
const a = scale * cosLat * Math.cos(rotation);
const b = -scale * Math.sin(rotation);
const d = scale * cosLat * Math.sin(rotation);
const e = -scale * Math.cos(rotation); // canvas y increases southward, so geographic north is up.
const c = W / 2 - a * center[0] - b * center[1];
const f = H / 2 - d * center[0] - e * center[1];
const projection = { type: 'affine-local-orthographic', coordinateOrder: '[longitude, latitude]', x: { longitude: a, latitude: b, offset: c }, y: { longitude: d, latitude: e, offset: f }, inverse: { determinant: a * e - b * d, longitude: { x: e / (a * e - b * d), y: -b / (a * e - b * d), offset: (b * f - e * c) / (a * e - b * d) }, latitude: { x: -d / (a * e - b * d), y: a / (a * e - b * d), offset: (d * c - a * f) / (a * e - b * d) } } };
const project = ([lng, lat]) => [a * lng + b * lat + c, d * lng + e * lat + f];
const inside = ([lng, lat]) => lng >= bounds.west && lng <= bounds.east && lat >= bounds.south && lat <= bounds.north;
const bbox = (coords) => coords.reduce((o, p) => ({ west: Math.min(o.west, p[0]), east: Math.max(o.east, p[0]), south: Math.min(o.south, p[1]), north: Math.max(o.north, p[1]) }), { west: Infinity, east: -Infinity, south: Infinity, north: -Infinity });
const intersects = (coords) => { const q = bbox(coords); return q.east >= bounds.west && q.west <= bounds.east && q.north >= bounds.south && q.south <= bounds.north; };
const pathFor = (coords, closed = false) => coords.map((p, i) => `${i ? 'L' : 'M'}${project(p).map(n => n.toFixed(2)).join(',')}`).join(' ') + (closed ? 'Z' : '');
const pixelPath = (coords, closed = false) => coords.map((p, i) => `${i ? 'L' : 'M'}${p.map(n => n.toFixed(2)).join(',')}`).join(' ') + (closed ? 'Z' : '');
const esc = (s) => String(s).replace(/[&<>]/g, x => ({ '&':'&amp;','<':'&lt;','>':'&gt;' })[x]);
const footprintIds = new Map([['sterling-center', 675524539], ['overlook', 1285399278], ['pioneer', 914862901], ['pat-gallagher', 914862735], ['mccormick', 1194153472]]);
// Directory additions are part of the current source catalog. Only top-level, non-future places become parent roots.
const catalog = new Map([...places.places, ...(directory.additions || [])].map(place => [place.id, place]));
const roots = [...catalog.values()].filter(place => place.kind === 'place' && !place.future && !place.parentId).sort((left, right) => left.id.localeCompare(right.id));
const parentRecords = roots.map((place) => {
  const { id } = place; const footprintId = footprintIds.get(id) || null;
  const point = Array.isArray(place.coordinates) ? place.coordinates.slice(0, 2) : null;
  if (point && !inside(point)) throw new Error(`Current source point outside full saved bounds: ${id}`);
  const feature = footprintId && geography.features.find(x => x.id === footprintId);
  return { id, sourceCoordinates: point, imagePixels: point ? project(point) : null, sourcePrecision: place.locationPrecision || null, footprintId, footprintCoordinates: feature ? feature.coordinates : null, footprintStatus: feature ? 'source-matched' : 'no-matched-source-footprint' };
});
const featureKinds = new Set(['road','trail','stream','park','water','pool','building']);
const features = geography.features.filter(x => featureKinds.has(x.kind) && Array.isArray(x.coordinates) && x.coordinates.length > 1 && intersects(x.coordinates));
const style = { road:'#f4ebd7', roadEdge:'#cdbd9a', trail:'#dce2c4', stream:'#77a9b0', water:'#8fc3c9', park:'#9daf78', roof:'#786d5d', wall:'#a66a52' };
const svg = [];
svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#cdbf9e"/>`);
// Source-only ground polygons: parks, water and pools remain visually distinct.
for (const x of features.filter(x => ['park','water','pool'].includes(x.kind))) svg.push(`<path d="${pathFor(x.coordinates, true)}" fill="${x.kind === 'park' ? style.park : x.kind === 'pool' ? '#58aab4' : style.water}" stroke="#708b7d" stroke-width="1"/>`);
for (const x of features.filter(x => x.kind === 'stream')) svg.push(`<path d="${pathFor(x.coordinates)}" fill="none" stroke="${style.stream}" stroke-width="2.5" stroke-linecap="round"/>`);
for (const x of features.filter(x => x.kind === 'road')) svg.push(`<path d="${pathFor(x.coordinates)}" fill="none" stroke="${style.roadEdge}" stroke-width="7" stroke-linecap="round"/><path d="${pathFor(x.coordinates)}" fill="none" stroke="${style.road}" stroke-width="5" stroke-linecap="round"/>`);
for (const x of features.filter(x => x.kind === 'trail')) svg.push(`<path d="${pathFor(x.coordinates)}" fill="none" stroke="${style.trail}" stroke-width="1.4" stroke-linecap="round"/>`);
// Small consistent north-west extrusion only decorates the supplied building footprints.
for (const x of features.filter(x => x.kind === 'building')) { const roof = pathFor(x.coordinates, true); const shifted = x.coordinates.map(p => { const q = project(p); return [q[0] - 2.8, q[1] + 4.2]; }); svg.push(`<path d="${pixelPath(shifted, true)}" fill="${style.wall}" opacity=".72"/><path d="${roof}" fill="${style.roof}" stroke="#5c554a" stroke-width=".8"/>`); }
svg.push('</svg>');
const roads = features.filter(x => x.kind === 'road');
const roadNodes = new Map();
for (const road of roads) for (const coordinates of road.coordinates.filter(inside)) {
  const key = coordinates.map(n => n.toFixed(7)).join(',');
  const entry = roadNodes.get(key) || { coordinates, featureIds: new Set() };
  entry.featureIds.add(road.id); roadNodes.set(key, entry);
}
const roadJunctions = [...roadNodes.values()].filter(x => x.featureIds.size > 1).map((x, i) => ({ id: `junction-${i + 1}`, sourceCoordinates: x.coordinates, imagePixels: project(x.coordinates), roadFeatureIds: [...x.featureIds].sort((m, n) => m - n) }));
const layout = { version: 2, imageSize: { width: W, height: H }, geographicBounds: bounds, projection, source: { geometry: area.geometry, crop: 'full saved geography.json bounds; current parent destinations only; no inferred points' }, roots: parentRecords, sourceFootprints: parentRecords.filter(p => p.footprintCoordinates).map(p => ({ id: p.id, featureId: p.footprintId, coordinates: p.footprintCoordinates })), roadJunctions, checkpoints: roads.slice(0, 80).flatMap(x => [x.coordinates[0], x.coordinates[x.coordinates.length - 1]].map((coordinates, index) => ({ id: `road-${x.id}-${index}`, featureId: x.id, sourceCoordinates: coordinates, imagePixels: project(coordinates) }))) };
fs.mkdirSync(path.join(root, 'assets'), { recursive: true }); fs.mkdirSync(path.join(root, 'data'), { recursive: true });
fs.writeFileSync(path.join(root, 'assets/source-layout.svg'), svg.join(''));
fs.writeFileSync(path.join(root, 'data/layout.json'), JSON.stringify(layout, null, 2) + '\n');
sharp(Buffer.from(svg.join(''))).png().toFile(path.join(root, 'assets/source-layout.png')).then(() => console.log('Built atlas reference plate.')).catch(error => { console.error(error); process.exitCode = 1; });

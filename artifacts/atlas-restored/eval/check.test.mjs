import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { baselineRegistryFingerprint, DIMENSIONS, expectedCoverage, REQUIRED_DISCOVERY_STATES, REQUIRED_FOCUS_STATES, REQUIRED_STATES, REQUIRED_TRAIL_STATES, evaluate, runtimeFingerprint } from './check.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
function scores(value) { return Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, value])); }
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'atlas-visual-gate-'));
  mkdirSync(path.join(root, 'eval', 'evidence'), { recursive: true });
  mkdirSync(path.join(root, 'assets'), { recursive: true });
  mkdirSync(path.join(root, 'data'), { recursive: true });
  writeFileSync(path.join(root, 'assets', 'scene.js'), 'rich architecture');
  const rootPlaces = Array.from({ length: 8 }, (_, index) => ({ id: `root-${index}`, parentId: null, future: false, coordinates: [-105.077 + index / 1000, 39.477 + index / 1000] }));
  const places = [...rootPlaces, ...Array.from({ length: 93 }, (_, index) => ({ id: `place-${index}`, parentId: index % 3 === 0 ? null : 'root-0', future: index % 5 === 0, ...(index % 3 === 0 ? {} : { coordinates: [-105.05, 39.5] }) }))];
  const roots = places.filter((place) => !place.future && !place.parentId).map((place) => ({ id: place.id, sourceCoordinates: place.coordinates || null, imagePixels: place.coordinates ? [0, 0] : null }));
  const data = (name, value) => writeFileSync(path.join(root, 'data', name), JSON.stringify(value));
  data('places.json', { places });
  data('directory.json', { additions: [], updates: [] });
  data('visitor-notes.json', { places: {} });
  data('area-visit.json', { places: {} });
  data('trails.json', { routes: [{ id: 'cab-walk-1' }, { id: 'cab-walk-2' }, { id: 'cab-walk-3' }] });
  data('layout.json', { geographicBounds: { west: -105.077, east: -105.02, south: 39.477, north: 39.518 }, roots });
  const states = REQUIRED_STATES.map((name) => {
    const baselinePath = `eval/evidence/${name}-baseline.png`;
    const candidatePath = `eval/evidence/${name}-candidate.png`;
    const baselineBytes = `baseline:${name}`;
    const candidateBytes = `candidate:${name}`;
    writeFileSync(path.join(root, baselinePath), baselineBytes);
    writeFileSync(path.join(root, candidatePath), candidateBytes);
    return { name, actualJudgment: true, baseline: { path: baselinePath, sha256: hash(baselineBytes), provenance: { source: 'reference capture', sourceCommit: name.startsWith('overlook') ? '4184' : '4186', capturedAt: '2026-09-21', recordedBy: 'reviewer' } }, candidate: { path: candidatePath, sha256: hash(candidateBytes) }, baselineScores: scores(4), scores: scores(4) };
  });
  const registry = { version: 1, baselines: states.map((state) => ({ state: state.name, sourceCommit: state.baseline.provenance.sourceCommit, path: state.baseline.path, sha256: state.baseline.sha256 })) };
  writeFileSync(path.join(root, 'eval', 'baselines.json'), JSON.stringify(registry));
  const coverage = expectedCoverage(root);
  const review = { verdict: 'visual-review-pass', reviewer: 'reviewer', reviewerType: 'human', reviewedAt: '2026-09-21', actualComparison: true, functionalChecks: { passed: true, checks: ['opens all named places'] }, coverageChecks: { passed: true, scope: 'full-saved-atlas-area', expectedCurrentRootIds: coverage.currentRootIds, includedCurrentRootIds: coverage.currentRootIds, expectedPlaceIds: coverage.placeIds, includedPlaceIds: coverage.placeIds, expectedRouteIds: coverage.routeIds, includedRouteIds: coverage.routeIds, bounds: { west: -105.077, east: -105.02, south: 39.477, north: 39.518 } }, hardFailures: [], states };
  review.runtimeFingerprint = runtimeFingerprint(root).sha256;
  review.baselineRegistryFingerprint = baselineRegistryFingerprint(registry);
  writeFileSync(path.join(root, 'eval', 'visual-review.json'), JSON.stringify(review));
  return { root, review };
}
function withFixture(run) { const f = fixture(); try { run(f); } finally { rmSync(f.root, { recursive: true, force: true }); } }
function addDiscoveryEvidence(root, review) {
  writeFileSync(path.join(root, 'discovery-ui.js'), 'export const discovery = true;');
  review.discoveryChecks = {
    passed: true,
    states: REQUIRED_DISCOVERY_STATES.map((name) => {
      const candidatePath = `eval/evidence/discovery-${name}.png`;
      const bytes = `discovery:${name}`;
      writeFileSync(path.join(root, candidatePath), bytes);
      return { name, candidate: { path: candidatePath, sha256: hash(bytes) }, actualJudgment: true, passed: true, notes: `Reviewed ${name}.` };
    }),
  };
  review.runtimeFingerprint = runtimeFingerprint(root).sha256;
  writeFileSync(path.join(root, 'eval', 'visual-review.json'), JSON.stringify(review));
}
function addFocusEvidence(root, review) {
  writeFileSync(path.join(root, 'focus-ui.js'), 'export const focus = true;');
  review.focusChecks = {
    passed: true,
    states: REQUIRED_FOCUS_STATES.map((name) => {
      const candidatePath = `eval/evidence/focus-${name}.png`;
      const bytes = `focus:${name}`;
      writeFileSync(path.join(root, candidatePath), bytes);
      return { name, candidate: { path: candidatePath, sha256: hash(bytes) }, actualJudgment: true, passed: true, notes: `Reviewed ${name}.` };
    }),
  };
  review.runtimeFingerprint = runtimeFingerprint(root).sha256;
  writeFileSync(path.join(root, 'eval', 'visual-review.json'), JSON.stringify(review));
}

test('valid documented review passes', () => withFixture(({ root }) => assert.equal(evaluate({ root }).ok, true)));
test('missing evidence fails', () => withFixture(({ root, review }) => { review.states[0].candidate.path = ''; writeFileSync(path.join(root, 'eval', 'visual-review.json'), JSON.stringify(review)); assert.equal(evaluate({ root }).ok, false); }));
test('changed candidate evidence fails as stale', () => withFixture(({ root }) => { writeFileSync(path.join(root, 'eval', 'evidence', 'neighborhood-desktop-candidate.png'), 'changed'); assert.equal(evaluate({ root }).ok, false); }));
test('valid discovery evidence passes when the discovery interface is present', () => withFixture(({ root, review }) => { addDiscoveryEvidence(root, review); assert.equal(evaluate({ root }).ok, true); }));
test('missing discovery evidence fails when the discovery interface is present', () => withFixture(({ root, review }) => { writeFileSync(path.join(root, 'discovery-ui.js'), 'export const discovery = true;'); review.runtimeFingerprint = runtimeFingerprint(root).sha256; writeFileSync(path.join(root, 'eval', 'visual-review.json'), JSON.stringify(review)); assert.equal(evaluate({ root }).ok, false); }));
test('changed discovery proof hash fails', () => withFixture(({ root, review }) => { addDiscoveryEvidence(root, review); writeFileSync(path.join(root, 'eval', 'evidence', 'discovery-unfolded-desktop.png'), 'changed discovery proof'); assert.equal(evaluate({ root }).ok, false); }));
test('valid focus evidence passes when the focus interface is present', () => withFixture(({ root, review }) => { addFocusEvidence(root, review); assert.equal(evaluate({ root }).ok, true); }));
test('missing focus evidence fails when the focus interface is present', () => withFixture(({ root, review }) => { writeFileSync(path.join(root, 'focus-ui.js'), 'export const focus = true;'); review.runtimeFingerprint = runtimeFingerprint(root).sha256; writeFileSync(path.join(root, 'eval', 'visual-review.json'), JSON.stringify(review)); assert.equal(evaluate({ root }).ok, false); }));
test('changed focus proof hash fails', () => withFixture(({ root, review }) => { addFocusEvidence(root, review); writeFileSync(path.join(root, 'eval', 'evidence', 'focus-village-focus-desktop.png'), 'changed focus proof'); assert.equal(evaluate({ root }).ok, false); }));
test('changed runtime fails as stale', () => withFixture(({ root }) => { writeFileSync(path.join(root, 'assets', 'scene.js'), 'low poly replacement'); assert.equal(evaluate({ root }).ok, false); }));
test('low score fails', () => withFixture(({ root, review }) => { review.states[0].scores.architecture = 3; writeFileSync(path.join(root, 'eval', 'visual-review.json'), JSON.stringify(review)); assert.equal(evaluate({ root }).ok, false); }));
test('hard failure fails', () => withFixture(({ root, review }) => { review.hardFailures.push('missing landmark'); writeFileSync(path.join(root, 'eval', 'visual-review.json'), JSON.stringify(review)); assert.equal(evaluate({ root }).ok, false); }));
test('known bad low-poly scorecard fails', () => withFixture(({ root, review }) => { review.states.forEach((state) => { state.scores.architecture = 2; state.scores.landscape = 2; state.scores.lighting = 3; }); writeFileSync(path.join(root, 'eval', 'visual-review.json'), JSON.stringify(review)); assert.equal(evaluate({ root }).ok, false); }));
test('missing actual judgment fails', () => withFixture(({ root, review }) => { review.states[0].actualJudgment = false; writeFileSync(path.join(root, 'eval', 'visual-review.json'), JSON.stringify(review)); assert.equal(evaluate({ root }).ok, false); }));
test('unset actual comparison fails', () => withFixture(({ root, review }) => { delete review.actualComparison; writeFileSync(path.join(root, 'eval', 'visual-review.json'), JSON.stringify(review)); assert.equal(evaluate({ root }).ok, false); }));
test('changed pinned baseline registry fails', () => withFixture(({ root }) => { writeFileSync(path.join(root, 'eval', 'baselines.json'), JSON.stringify({ version: 2, baselines: [] })); assert.equal(evaluate({ root }).ok, false); }));
test('narrowed seven-place crop fails coverage', () => withFixture(({ root, review }) => { const narrowed = review.coverageChecks.expectedPlaceIds.slice(0, 7); review.coverageChecks.expectedPlaceIds = narrowed; review.coverageChecks.includedPlaceIds = narrowed; writeFileSync(path.join(root, 'eval', 'visual-review.json'), JSON.stringify(review)); assert.equal(evaluate({ root }).ok, false); }));
test('narrowed layout roots fails coverage', () => withFixture(({ root }) => { const layoutPath = path.join(root, 'data', 'layout.json'); const layout = JSON.parse(readFileSync(layoutPath)); layout.roots = layout.roots.slice(0, 7); writeFileSync(layoutPath, JSON.stringify(layout)); assert.equal(evaluate({ root }).ok, false); }));
test('unlocated roots must retain null coordinates and pixels', () => withFixture(({ root }) => { const layoutPath = path.join(root, 'data', 'layout.json'); const layout = JSON.parse(readFileSync(layoutPath)); const unlocated = layout.roots.find((entry) => entry.sourceCoordinates === null); unlocated.imagePixels = [10, 10]; writeFileSync(layoutPath, JSON.stringify(layout)); assert.equal(evaluate({ root }).ok, false); }));

function addTrailEvidence(root,review){
 writeFileSync(path.join(root,'walk-visuals.js'),'export const walks=true;');
 review.trailChecks={passed:true,states:REQUIRED_TRAIL_STATES.map(name=>{const rel='eval/evidence/'+name+'.png';const data='test screenshot '+name;writeFileSync(path.join(root,rel),data);return {name,candidate:{path:rel,sha256:hash(data)},actualJudgment:true,passed:true,notes:'Fixture visual judgment'};})};
 review.runtimeFingerprint=runtimeFingerprint(root).sha256;writeFileSync(path.join(root,'eval/visual-review.json'),JSON.stringify(review));
}
test('walk visuals require desktop and mobile review evidence',()=>withFixture(({root,review})=>{writeFileSync(path.join(root,'walk-visuals.js'),'export const walks=true;');review.runtimeFingerprint=runtimeFingerprint(root).sha256;writeFileSync(path.join(root,'eval/visual-review.json'),JSON.stringify(review));assert.equal(evaluate({root}).ok,false);}));
test('complete recorded walking visual evidence passes',()=>withFixture(({root,review})=>{addTrailEvidence(root,review);assert.equal(evaluate({root}).ok,true);}));
test('changed walking screenshot evidence is rejected',()=>withFixture(({root,review})=>{addTrailEvidence(root,review);writeFileSync(path.join(root,review.trailChecks.states[0].candidate.path),'changed image');assert.equal(evaluate({root}).ok,false);}));

test('village-only evidence cannot pass the full-overview route review',()=>withFixture(({root,review})=>{addTrailEvidence(root,review);review.trailChecks.states=review.trailChecks.states.filter(s=>!s.name.startsWith('walks-overview-routes-'));writeFileSync(path.join(root,'eval/visual-review.json'),JSON.stringify(review));assert.equal(evaluate({root}).ok,false);}));

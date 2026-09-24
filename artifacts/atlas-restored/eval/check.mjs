#!/usr/bin/env node
import {landingMeasurementIssues} from './landing-gate.mjs';
/**
 * Evidence gate for Atlas visual restoration. This verifies a recorded human
 * review; it does not attempt to judge whether one image is more beautiful.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeCatalog } from '../catalog.mjs';

export const REQUIRED_STATES = [
  'neighborhood-desktop',
  'sterling-open-desktop',
  'overlook-open-desktop',
  'neighborhood-mobile',
  'sterling-open-mobile',
];

export const REQUIRED_DISCOVERY_STATES = [
  'unfolded-desktop',
  'unfolded-mobile',
  'walking-guide',
  'future-layer',
];

export const REQUIRED_FOCUS_STATES = [
  'village-focus-desktop',
  'place-focus-desktop',
  'village-focus-mobile',
  'future-only-mobile',
  'future-map-desktop',
];

export const REQUIRED_TRAIL_STATES = ['walks-desktop','walks-mobile','walking-guide-mobile','unfold-walks-desktop','unfold-walks-mobile','walks-overview-routes-desktop','walks-overview-routes-mobile'];

export const DIMENSIONS = [
  'architecture', 'landscape', 'lighting', 'composition', 'readability',
  'usefulness', 'geographicIntegrity',
];

const EXCLUDED_RUNTIME_DIRECTORIES = new Set(['eval', 'docs', 'build-reference']);
const REQUIRED_BOUNDS = { west: -105.077, east: -105.02, south: 39.477, north: 39.518 };

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function normalizedRelative(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function collectRuntimeFiles(root, current = root, output = []) {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!EXCLUDED_RUNTIME_DIRECTORIES.has(entry.name)) {
        collectRuntimeFiles(root, path.join(current, entry.name), output);
      }
    } else if (entry.isFile()) {
      output.push(path.join(current, entry.name));
    }
  }
  return output;
}

export function runtimeFingerprint(root) {
  const files = collectRuntimeFiles(root).sort((a, b) => normalizedRelative(root, a).localeCompare(normalizedRelative(root, b)));
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(normalizedRelative(root, file));
    hash.update('\0');
    hash.update(sha256(readFileSync(file)));
    hash.update('\n');
  }
  return { sha256: hash.digest('hex'), files: files.map((file) => normalizedRelative(root, file)) };
}

export function baselineRegistryFingerprint(registry) {
  return sha256(JSON.stringify(registry));
}

function readData(root, name) {
  return JSON.parse(readFileSync(path.join(root, 'data', name), 'utf8'));
}

function sameSet(left, right) {
  return Array.isArray(left) && Array.isArray(right)
    && new Set(left).size === left.length && new Set(right).size === right.length
    && left.length === right.length && left.every((id) => right.includes(id));
}

/** Derives coverage from saved source data, never from the review record. */
export function expectedCoverage(root) {
  const catalog = mergeCatalog(
    readData(root, 'places.json'), readData(root, 'directory.json'),
    readData(root, 'visitor-notes.json'), readData(root, 'area-visit.json'),
  );
  const roots = catalog.filter((place) => !place.future && !place.parentId);
  const trails = readData(root, 'trails.json');
  return {
    currentRootIds: roots.map((place) => place.id).sort(),
    placeIds: catalog.map((place) => place.id).sort(),
    routeIds: (trails.routes || []).map((route) => route.id).sort(),
    roots,
    placeCount: catalog.length,
  };
}

function coverageIssues(root, coverage, issues) {
  if (!coverage || typeof coverage !== 'object') { issue(issues, 'coverageChecks is required.'); return; }
  if (coverage.passed !== true) issue(issues, 'coverageChecks.passed must be explicitly true.');
  if (coverage.scope !== 'full-saved-atlas-area') issue(issues, 'coverageChecks.scope must be "full-saved-atlas-area".');
  let expected;
  try { expected = expectedCoverage(root); } catch (error) { issue(issues, `Cannot derive authoritative coverage: ${error.message}`); return; }
  if (expected.placeCount < 101) issue(issues, `Merged catalog must retain at least the baseline 101 places; found ${expected.placeCount}.`);
  const checks = [
    ['expectedCurrentRootIds', expected.currentRootIds], ['includedCurrentRootIds', expected.currentRootIds],
    ['expectedPlaceIds', expected.placeIds], ['includedPlaceIds', expected.placeIds],
    ['expectedRouteIds', expected.routeIds], ['includedRouteIds', expected.routeIds],
  ];
  for (const [field, authoritative] of checks) {
    if (!sameSet(coverage[field], authoritative)) issue(issues, `coverageChecks.${field} must be a unique exact match for the authoritative full-area set.`);
  }
  if (!coverage.bounds || Object.keys(REQUIRED_BOUNDS).some((key) => coverage.bounds[key] !== REQUIRED_BOUNDS[key])) {
    issue(issues, 'coverageChecks.bounds must exactly equal the full saved Atlas bounds.');
  }
  let layout;
  try { layout = readData(root, 'layout.json'); } catch (error) { issue(issues, `Cannot read layout for coverage validation: ${error.message}`); return; }
  if (!layout.geographicBounds || Object.keys(REQUIRED_BOUNDS).some((key) => layout.geographicBounds[key] !== REQUIRED_BOUNDS[key])) {
    issue(issues, 'data/layout.json geographicBounds must exactly equal the full saved Atlas bounds.');
  }
  const layoutRoots = Array.isArray(layout.roots) ? layout.roots : [];
  if (!sameSet(layoutRoots.map((entry) => entry?.id), expected.currentRootIds)) {
    issue(issues, 'data/layout.json roots must include every current non-future parent, including unlocated entries, and no narrowed subset.');
  }
  const sourceById = new Map(expected.roots.map((place) => [place.id, place.coordinates]));
  for (const rootEntry of layoutRoots) {
    const source = sourceById.get(rootEntry?.id);
    if (Array.isArray(source) && source.length === 2 && (!Array.isArray(rootEntry.sourceCoordinates) || rootEntry.sourceCoordinates.length !== 2 || rootEntry.sourceCoordinates[0] !== source[0] || rootEntry.sourceCoordinates[1] !== source[1])) {
      issue(issues, `data/layout.json root ${rootEntry.id} must retain its saved source position.`);
    }
    if ((!Array.isArray(source) || source.length !== 2) && (rootEntry?.sourceCoordinates !== null || rootEntry?.imagePixels !== null)) {
      issue(issues, `data/layout.json unlocated root ${rootEntry?.id} must use null sourceCoordinates and imagePixels.`);
    }
  }
}

function issue(issues, message) {
  issues.push(message);
}

function resolveEvidence(root, evidence, label, issues) {
  if (!evidence || typeof evidence !== 'object') {
    issue(issues, `${label}: image evidence is required.`);
    return;
  }
  if (typeof evidence.path !== 'string' || !evidence.path.trim()) {
    issue(issues, `${label}: evidence.path is required.`);
    return;
  }
  if (typeof evidence.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(evidence.sha256)) {
    issue(issues, `${label}: evidence.sha256 must be a SHA-256 hash.`);
  }
  const file = path.resolve(root, evidence.path);
  if (!file.startsWith(`${path.resolve(root)}${path.sep}`) && file !== path.resolve(root)) {
    issue(issues, `${label}: evidence.path must remain inside the Atlas artifact root.`);
    return;
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    issue(issues, `${label}: screenshot file is missing: ${evidence.path}`);
    return;
  }
  if (typeof evidence.sha256 === 'string' && sha256(readFileSync(file)) !== evidence.sha256.toLowerCase()) {
    issue(issues, `${label}: screenshot hash is stale or incorrect: ${evidence.path}`);
  }
}

function hasBaselineProvenance(baseline) {
  const p = baseline?.provenance;
  return p && typeof p === 'object'
    && typeof p.source === 'string' && p.source.trim()
    && typeof p.sourceCommit === 'string' && p.sourceCommit.trim()
    && typeof p.capturedAt === 'string' && p.capturedAt.trim()
    && typeof p.recordedBy === 'string' && p.recordedBy.trim();
}

function scoreIssues(scores, label, issues) {
  if (!scores || typeof scores !== 'object') {
    issue(issues, `${label}: scores are required.`);
    return;
  }
  for (const dimension of DIMENSIONS) {
    const value = scores[dimension];
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      issue(issues, `${label}: ${dimension} must be an integer from 1 to 5.`);
    }
  }
}

function discoveryIssues(root, review, issues) {
  if (!existsSync(path.join(root, 'discovery-ui.js'))) return;
  const checks = review.discoveryChecks;
  if (!checks || typeof checks !== 'object') {
    issue(issues, 'discoveryChecks is required when discovery-ui.js is present.');
    return;
  }
  if (checks.passed !== true) issue(issues, 'discoveryChecks.passed must be explicitly true.');
  if (!Array.isArray(checks.states) || checks.states.length !== REQUIRED_DISCOVERY_STATES.length) {
    issue(issues, `discoveryChecks.states must contain exactly: ${REQUIRED_DISCOVERY_STATES.join(', ')}.`);
  }
  const names = Array.isArray(checks.states) ? checks.states.map((state) => state?.name) : [];
  if (new Set(names).size !== names.length || !sameSet(names, REQUIRED_DISCOVERY_STATES)) {
    issue(issues, `discoveryChecks.states must use each required name exactly once: ${REQUIRED_DISCOVERY_STATES.join(', ')}.`);
  }
  const byState = new Map((Array.isArray(checks.states) ? checks.states : []).map((state) => [state?.name, state]));
  for (const name of REQUIRED_DISCOVERY_STATES) {
    const state = byState.get(name);
    if (!state) { issue(issues, `Missing required discovery state: ${name}.`); continue; }
    const label = `Discovery state ${name}`;
    resolveEvidence(root, state.candidate, `${label} candidate`, issues);
    if (state.actualJudgment !== true) issue(issues, `${label}: actualJudgment must be explicitly true after an actual visual judgment.`);
    if (state.passed !== true) issue(issues, `${label}: passed must be explicitly true.`);
    if (typeof state.notes !== 'string' || !state.notes.trim()) issue(issues, `${label}: notes must be a nonempty string.`);
  }
}

function focusIssues(root, review, issues) {
  if (!existsSync(path.join(root, 'focus-ui.js'))) return;
  const checks = review.focusChecks;
  if (!checks || typeof checks !== 'object') {
    issue(issues, 'focusChecks is required when focus-ui.js is present.');
    return;
  }
  if (checks.passed !== true) issue(issues, 'focusChecks.passed must be explicitly true.');
  if (!Array.isArray(checks.states) || checks.states.length !== REQUIRED_FOCUS_STATES.length) {
    issue(issues, `focusChecks.states must contain exactly: ${REQUIRED_FOCUS_STATES.join(', ')}.`);
  }
  const names = Array.isArray(checks.states) ? checks.states.map((state) => state?.name) : [];
  if (new Set(names).size !== names.length || !sameSet(names, REQUIRED_FOCUS_STATES)) {
    issue(issues, `focusChecks.states must use each required name exactly once: ${REQUIRED_FOCUS_STATES.join(', ')}.`);
  }
  const byState = new Map((Array.isArray(checks.states) ? checks.states : []).map((state) => [state?.name, state]));
  for (const name of REQUIRED_FOCUS_STATES) {
    const state = byState.get(name);
    if (!state) { issue(issues, `Missing required focus state: ${name}.`); continue; }
    const label = `Focus state ${name}`;
    resolveEvidence(root, state.candidate, `${label} candidate`, issues);
    if (state.actualJudgment !== true) issue(issues, `${label}: actualJudgment must be explicitly true after an actual visual judgment.`);
    if (state.passed !== true) issue(issues, `${label}: passed must be explicitly true.`);
    if (typeof state.notes !== 'string' || !state.notes.trim()) issue(issues, `${label}: notes must be a nonempty string.`);
  }
}

function trailIssues(root, review, issues) {
  if (!existsSync(path.join(root, 'walk-visuals.js'))) return;
  const checks = review.trailChecks;
  if (!checks || typeof checks !== 'object') {
    issue(issues, 'trailChecks is required when walk-visuals.js is present.');
    return;
  }
  if (checks.passed !== true) issue(issues, 'trailChecks.passed must be explicitly true.');
  if (!Array.isArray(checks.states) || checks.states.length !== REQUIRED_TRAIL_STATES.length) {
    issue(issues, `trailChecks.states must contain exactly: ${REQUIRED_TRAIL_STATES.join(', ')}.`);
  }
  const names = Array.isArray(checks.states) ? checks.states.map((state) => state?.name) : [];
  if (new Set(names).size !== names.length || !sameSet(names, REQUIRED_TRAIL_STATES)) {
    issue(issues, `trailChecks.states must use each required name exactly once: ${REQUIRED_TRAIL_STATES.join(', ')}.`);
  }
  const byState = new Map((Array.isArray(checks.states) ? checks.states : []).map((state) => [state?.name, state]));
  for (const name of REQUIRED_TRAIL_STATES) {
    const state = byState.get(name);
    if (!state) { issue(issues, `Missing required trail state: ${name}.`); continue; }
    const label = `Trail state ${name}`;
    resolveEvidence(root, state.candidate, `${label} candidate`, issues);
    if (state.actualJudgment !== true) issue(issues, `${label}: actualJudgment must be explicitly true after an actual visual judgment.`);
    if (state.passed !== true) issue(issues, `${label}: passed must be explicitly true.`);
    if (typeof state.notes !== 'string' || !state.notes.trim()) issue(issues, `${label}: notes must be a nonempty string.`);
  }
}

export const REQUIRED_VILLAGE_PLAN_STATES = ['village-plan-desktop','village-plan-mobile','village-plan-selected'];
export const REQUIRED_RESIDENT_JOURNEYS = ['pool-access','pickleball-booking','return-time-walk','coffee-and-play','school-update','future-villages','nested-return','connections'];
function residentIssues(root,review,issues){
  if(!existsSync(path.join(root,'journeys.mjs')))return;
  const checks=review.residentChecks;
  if(checks?.passed!==true||!sameSet(checks?.states?.map(s=>s.name),REQUIRED_RESIDENT_JOURNEYS)){issue(issues,'Resident journeys require all eight reviewed outcomes.');return;}
  for(const s of checks.states){
    if(s.actualJudgment!==true||s.passed!==true||!s.notes?.trim())issue(issues,'Resident journey '+s.name+' requires a recorded outcome.');
    resolveEvidence(root,s.candidate,'Resident journey '+s.name,issues);
  }
}
function villagePlanIssues(root,review,issues){
  if(!existsSync(path.join(root,'village-plans-ui.js')))return;
  const checks=review.villagePlanChecks;
  if(checks?.passed!==true||!sameSet(checks?.states?.map(s=>s.name),REQUIRED_VILLAGE_PLAN_STATES)){issue(issues,'Village planning requires reviewed desktop, mobile and selected-area screenshots.');return;}
  for(const state of checks.states){
    resolveEvidence(root,state.candidate,'Village planning '+state.name,issues);
    if(state.actualJudgment!==true||state.passed!==true||!state.notes?.trim())issue(issues,'Village planning '+state.name+' needs an actual recorded judgment.');
  }
  for(const name of ['desktop','compact','phone']){
    const measured=checks.layouts?.find(x=>x.name===name);
    for(const problem of planningLayoutIssues(measured))issue(issues,'Village planning '+name+': '+problem);
  }
}
export function planningLayoutIssues(m){
 const errors=[],base=m?.image,pins=m?.pins||[];
 const illustrated=base?.src?.endsWith('/assets/wider-ranch-landscape-v1.png');
 if(!base?.visible||!base.loaded||base.width<200||base.height<300||(!illustrated&&!base.src?.endsWith('/assets/village-master-plan.jpg')))errors.push('the geographic map must be loaded and visible');
 if(illustrated&&(!m.sourceComparisonAvailable||m.orientationVillages!==4||m.futureAreaLabels!==5))errors.push('illustration needs direct source comparison, four current villages and five future area labels');
 if(base&&Math.abs(base.width/base.height-1296/2088)>.015)errors.push('the complete source-map aspect must be preserved');
 if(pins.length!==5||m?.namedCardsOnMap!==0||m?.directoryNames!==5)errors.push('use five compact markers and five separate readable names');
 if(m?.horizontalOverflow)errors.push('horizontal overflow');
 for(let i=0;i<pins.length;i++){
  const p=pins[i];if(p.width<44||p.height<44)errors.push('marker touch target below 44px');
  if(base&&(p.x<base.x||p.y<base.y||p.x+p.width>base.x+base.width||p.y+p.height>base.y+base.height))errors.push('marker outside map');
  for(const q of pins.slice(i+1))if(p.x<q.x+q.width&&p.x+p.width>q.x&&p.y<q.y+q.height&&p.y+p.height>q.y)errors.push('overlapping markers');
 }
 return errors;
}
function completePlanIssues(root,review,issues){
 if(!existsSync(path.join(root,'connections.css')))return;
 const checks=review.completePlanChecks;
 if(checks?.passed!==true){issue(issues,'Complete plan requires a reviewed desktop and phone journey matrix.');return;}
 for(const device of ['desktop','phone']){
  const states=checks[device];
  if(!sameSet(states?.map(s=>s.name),REQUIRED_RESIDENT_JOURNEYS)){issue(issues,device+': all eight resident journeys are required.');continue;}
  for(const s of states){if(s.passed!==true||s.actualJudgment!==true||!s.notes?.trim())issue(issues,device+': actual resident judgment missing for '+s.name);resolveEvidence(root,s.candidate,device+' '+s.name,issues);}
 }
 for(const desktop of checks.desktop||[]){const phone=checks.phone?.find(s=>s.name===desktop.name);if(phone&&(phone.candidate?.path===desktop.candidate?.path||phone.candidate?.sha256===desktop.candidate?.sha256))issue(issues,desktop.name+': desktop and phone need separate evidence.');}
 resolveEvidence(root,checks.browserEvidence,'Complete plan browser measurements',issues);
 if(checks.browserEvidence?.path){
  try{
   const m=JSON.parse(readFileSync(path.join(root,checks.browserEvidence.path),'utf8'));
   if(['phoneInitialMapTop','phoneWalkMapTop','phoneNeighborhoodMapTop'].some(key=>!Number.isFinite(m[key])||m[key]<0||m[key]>320))issue(issues,'Phone maps must begin within 320px.');
   for(const device of ['Desktop','Phone']){
    const text=m['largeText'+device];
    if(!text||parseFloat(text.size)!==Number(text.base)*2||text.overflow!==false)issue(issues,device+': actual 200% text and no overflow are required.');
   }
   if(m.largeTextDesktop?.animation!=='none'||m.largeTextDesktop?.transition!=='0s'||m.reducedMotionPhone?.animation!=='none')issue(issues,'Reduced motion must be observed on desktop and phone.');
   for(const device of ['desktop','phone']){
    const targets=m[device+'Targets'];if(!targets?.length||targets.some(t=>t.width<43.99||t.height<43.99))issue(issues,device+': principal controls must measure at least 44px.');
   }
   if(m.desktopNestedReturn?.focused!=='atlas-coffee'||m.phoneNestedReturn?.focused!=='atlas-coffee')issue(issues,'Nested amenities must restore keyboard focus on both devices.');
  }catch{issue(issues,'Complete plan browser measurements could not be read.');}
 }
}
function landingIssues(root,review,issues){
 if(!existsSync(path.join(root,'landing.css')))return;
 const c=review.landingChecks;
 if(c?.passed!==true||c.actualJudgment!==true){issue(issues,'Landing requires an actual desktop and phone review.');return;}
 for(const name of ['desktop','phone','chooserDesktop','chooserPhone'])resolveEvidence(root,c[name],'Landing '+name,issues);
 resolveEvidence(root,c.measurements,'Landing measurements',issues);
 try{for(const problem of landingMeasurementIssues(JSON.parse(readFileSync(path.join(root,c.measurements.path),'utf8'))))issue(issues,problem);}catch{issue(issues,'Landing measurement record unreadable.');}
}
export function evaluate({ root, reviewPath = path.join(root, 'eval', 'visual-review.json') }) {
  const issues = [];
  if (!existsSync(reviewPath)) return { ok: false, verdict: 'visual-review-fail', issues: [`Review record is missing: ${reviewPath}`] };
  let review;
  try { review = JSON.parse(readFileSync(reviewPath, 'utf8')); } catch { return { ok: false, verdict: 'visual-review-fail', issues: ['Review record is not valid JSON.'] }; }

  const registryPath = path.join(root, 'eval', 'baselines.json');
  let registry;
  if (!existsSync(registryPath)) issue(issues, `Baseline registry is missing: ${registryPath}`);
  else {
    try { registry = JSON.parse(readFileSync(registryPath, 'utf8')); } catch { issue(issues, 'Baseline registry is not valid JSON.'); }
  }
  const registryStates = new Map((Array.isArray(registry?.baselines) ? registry.baselines : []).map((entry) => [entry?.state, entry]));
  if (!registry || !Array.isArray(registry.baselines) || registry.baselines.length !== REQUIRED_STATES.length) {
    issue(issues, `Baseline registry must contain exactly: ${REQUIRED_STATES.join(', ')}.`);
  }
  if (registry && review.baselineRegistryFingerprint !== baselineRegistryFingerprint(registry)) {
    issue(issues, 'Baseline registry fingerprint is stale: the pinned baseline registry changed after review.');
  }

  if (review.verdict !== 'visual-review-pass') issue(issues, 'verdict must be exactly "visual-review-pass".');
  if (typeof review.reviewer !== 'string' || !review.reviewer.trim()) issue(issues, 'reviewer is required.');
  if (!['human', 'visual-ai'].includes(review.reviewerType)) issue(issues, 'reviewerType must be "human" or "visual-ai".');
  if (typeof review.reviewedAt !== 'string' || !review.reviewedAt.trim()) issue(issues, 'reviewedAt is required.');
  if (review.actualComparison !== true) issue(issues, 'actualComparison must be explicitly true after an actual visual comparison.');
  discoveryIssues(root, review, issues);
  focusIssues(root, review, issues);
  trailIssues(root, review, issues);
  villagePlanIssues(root, review, issues);
  residentIssues(root, review, issues);
  completePlanIssues(root,review,issues);
  landingIssues(root,review,issues);
  coverageIssues(root, review.coverageChecks, issues);
  if (review.functionalChecks?.passed !== true || !Array.isArray(review.functionalChecks?.checks) || !review.functionalChecks.checks.length || !review.functionalChecks.checks.every((check) => typeof check === 'string' && check.trim())) {
    issue(issues, 'functionalChecks must separately record passed: true and one or more named checks.');
  }
  if (!Array.isArray(review.hardFailures) || review.hardFailures.length !== 0) issue(issues, 'hardFailures must be an empty array.');

  const fingerprint = runtimeFingerprint(root);
  if (review.runtimeFingerprint !== fingerprint.sha256) issue(issues, 'Runtime fingerprint is stale: runtime files were added or changed after review.');

  if (!Array.isArray(review.states) || review.states.length !== REQUIRED_STATES.length) {
    issue(issues, `states must contain exactly: ${REQUIRED_STATES.join(', ')}.`);
  }
  const byState = new Map((Array.isArray(review.states) ? review.states : []).map((state) => [state?.name, state]));
  for (const name of REQUIRED_STATES) {
    const state = byState.get(name);
    if (!state) { issue(issues, `Missing required state: ${name}.`); continue; }
    const label = `State ${name}`;
    resolveEvidence(root, state.baseline, `${label} baseline`, issues);
    resolveEvidence(root, state.candidate, `${label} candidate`, issues);
    if (!hasBaselineProvenance(state.baseline)) issue(issues, `${label}: baseline provenance requires source, sourceCommit, capturedAt, and recordedBy.`);
    if (state.actualJudgment !== true) issue(issues, `${label}: actualJudgment must be explicitly true after an actual visual judgment.`);
    if (state.baseline?.path === state.candidate?.path) issue(issues, `${label}: candidate must be a separate screenshot from the baseline.`);
    const pinned = registryStates.get(name);
    if (!pinned) issue(issues, `${label}: no pinned baseline exists in baselines.json.`);
    else {
      resolveEvidence(root, pinned, `${label} pinned baseline`, issues);
      if (state.baseline?.path !== pinned.path || state.baseline?.sha256 !== pinned.sha256 || state.baseline?.provenance?.sourceCommit !== pinned.sourceCommit) {
        issue(issues, `${label}: review baseline does not match its pinned baseline registry entry.`);
      }
    }
    scoreIssues(state.baselineScores, `${label} baseline`, issues);
    scoreIssues(state.scores, `${label} candidate`, issues);
    for (const dimension of DIMENSIONS) {
      const candidate = state.scores?.[dimension];
      const baseline = state.baselineScores?.[dimension];
      if (Number.isInteger(candidate) && candidate < 4) issue(issues, `${label}: ${dimension} is below the minimum score of 4.`);
      if (Number.isInteger(candidate) && Number.isInteger(baseline) && candidate < baseline) issue(issues, `${label}: ${dimension} regressed from baseline (${baseline} to ${candidate}).`);
    }
  }
  return { ok: issues.length === 0, verdict: issues.length === 0 ? 'visual-review-pass' : 'visual-review-fail', issues, fingerprint };
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  if (process.argv.includes('--fingerprint')) {
    console.log(runtimeFingerprint(root).sha256);
    return;
  }
  const result = evaluate({ root });
  if (result.ok) console.log('visual-review-pass');
  else {
    console.error('visual-review-fail');
    for (const problem of result.issues) console.error(`- ${problem}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

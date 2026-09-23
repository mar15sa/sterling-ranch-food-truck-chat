import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeCatalog} from './catalog.mjs';
import {accessBadges,visitCard} from './visit-ui.js';
import {plannedVillages} from './planned-villages.mjs';
const read=n=>JSON.parse(fs.readFileSync(new URL('data/'+n+'.json',import.meta.url)));
const updates={...read('visit-parks').places,...read('visit-business').places};
const catalog=mergeCatalog(read('places'),read('directory'),read('visitor-notes'),read('area-visit'));
test('every catalog listing and future village is individually reconciled',()=>{
 for(const p of [...catalog,...plannedVillages]){
  assert.ok(updates[p.id]?.visit,p.id);
  const v=updates[p.id].visit;
  assert.ok(['public','resident','apartment','unknown'].includes(v.access.kind),p.id);
  assert.ok(v.sourceUrls.length,p.id);
  assert.ok(v.checkedAt,p.id);
  assert.ok(v.suitability.every(s=>typeof s==='object'&&s.sourceUrl&&s.supported===true),p.id);
 }
});
test('pool search badges distinguish resident access, private apartment amenities and future plans',()=>{
 for(const id of ['overlook-pool','broadstone-pool','prose-pool']){
  const p={...catalog.find(p=>p.id===id),...updates[id]};
  assert.match(accessBadges(p),id==='overlook-pool'?/Resident access/:/Apartment amenity/);
  assert.doesNotMatch(accessBadges(p),/<a\b/);
 }
});
test('retained source information never claims a new verification',()=>{
 for(const [id,p] of Object.entries(updates).filter(([,p])=>p.visit.verificationState==='retained')){
  const html=visitCard({id,name:id,...p});assert.match(html,/Saved information:/);assert.doesNotMatch(html,/Checked: 2026-09-23/);
 }
});
test('fresh library update replaces outdated target and preserves source location orientation',()=>{
 const p=updates.library.project;
 assert.match(p.details.join(' ')+p.summary,/2027/);
 assert.doesNotMatch(p.locationNote,/south of Piney/i);
 assert.match(p.summary+p.details.join(' '),/August 26|August 2026/);
});

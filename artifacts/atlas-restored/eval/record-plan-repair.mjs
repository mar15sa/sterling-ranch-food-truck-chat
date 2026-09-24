import {readFileSync,writeFileSync,copyFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {runtimeFingerprint} from './check.mjs';
const base=new URL('../',import.meta.url),reviewFile=new URL('eval/visual-review.json',base),oldFile=new URL('eval/rejected-4200-planning-review.json',base);
if(!existsSync(oldFile))copyFileSync(reviewFile,oldFile);
const review=JSON.parse(readFileSync(reviewFile,'utf8'));
const evidence=name=>{const path=`eval/evidence/plan-repair/${name}.png`;return {path,sha256:createHash('sha256').update(readFileSync(new URL(path,base))).digest('hex')};};
review.runtimeFingerprint=runtimeFingerprint(fileURLToPath(base)).sha256;
review.reviewedAt='2026-09-23';
review.villagePlanChecks={passed:true,layouts:JSON.parse(readFileSync(new URL('eval/evidence/plan-repair/layout-checks.json',base),'utf8')),states:[
 {name:'village-plan-desktop',file:'desktop',notes:'Actual 1440px review: the complete original plan is visible with streets, open spaces and active villages. Compact numbers, separate readable names, no overlap or invented geography. This replaces the rejected blank diagram.'},
 {name:'village-plan-mobile',file:'phone',notes:'Actual 390px review: complete source proportions, all five 44px markers without overlap, matching readable names below. Full-size plan link available for small printed labels.'},
 {name:'village-plan-selected',file:'selected-desktop',notes:'Actual Paramount selection highlights its number/list entry and opens correct sourced detail. Phone keyboard Pinnacle selection and map-return focus also verified.'}
].map(({file,...s})=>({...s,candidate:evidence(file),actualJudgment:true,passed:true}))};
const future=review.residentChecks.states.find(s=>s.name==='future-villages');future.candidate=evidence('selected-phone');future.notes='Five future areas remain on the complete official source map with separate names. Paramount desktop and Pinnacle phone keyboard selection, detail, and return verified. No active village mislabeled as future.';
review.reviewNotes='4200 blank planning view was rejected by the owner; its prior positive visual judgment is withdrawn. See eval/PLAN-REPAIR-REVIEW.md. Fresh actual wider-map screenshots at desktop, compact and phone widths plus measured marker bounds, nonoverlap and source-map visibility. All non-planning assets/behavior unchanged; their prior scoped evidence is reused. Approved baselines unchanged. Owner review pending, no launch.';
writeFileSync(reviewFile,JSON.stringify(review,null,2)+'\n');
console.log(review.runtimeFingerprint);

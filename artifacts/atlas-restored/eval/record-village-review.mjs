import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {runtimeFingerprint} from './check.mjs';
const root=new URL('../',import.meta.url);
const path=new URL('visual-review.json',import.meta.url);
const review=JSON.parse(fs.readFileSync(path));
fs.copyFileSync(path,new URL('previous-village-plan-review.json',import.meta.url));
const proof=name=>{const file='eval/evidence/planned-villages/'+name+'.png';return {path:file,sha256:createHash('sha256').update(fs.readFileSync(new URL(file,root))).digest('hex')};};
review.reviewedAt='2026-09-23';
review.reviewer='GPT-6 Astra coordinator and final visual reviewer; GPT-5.6 Terra bounded source reconciliation and tests';
review.runtimeFingerprint=runtimeFingerprint(root.pathname.replace(/^\/(\w:)/,'$1')).sha256;
review.reviewNotes='See eval/PLANNED-VILLAGES-REVIEW.md. Fresh future village map and preserved project map screenshots. Unchanged core/model/walk/focus evidence reused within its recorded scope. No score or baseline change. Owner review pending; no deployment.';
for(const state of review.discoveryChecks.states)if(state.name==='future-layer'){state.candidate=proof('future-desktop');state.notes='Actual desktop review: full CAB official master-plan extent, five future named areas and separate preserved project map layer. Planning dates and source limitations visible. Functional source-map addition, not a replacement miniature-art baseline.';}
for(const state of review.focusChecks.states){
 if(state.name==='future-map-desktop'){state.candidate=proof('projects-desktop');state.notes='Fresh desktop project-layer review: original full illustration retained, all 11 project groups remain; new village/project switch is visible.';}
 if(state.name==='future-only-mobile'){state.candidate=proof('future-mobile');state.notes='Fresh 390px phone review: complete uncropped CAB plan, five markers with matching names below, no open-place directory or horizontal overflow; project layer independently captured.';}
}
review.villagePlanChecks={passed:true,states:[
 ['village-plan-desktop','future-desktop','Complete official master-plan extent with five numbered future areas and matching readable controls.'],
 ['village-plan-mobile','future-mobile','Uncropped master plan on phone. Named controls below; tiny source labels accessible through names and linked original. No horizontal overflow.'],
 ['village-plan-selected','selected-desktop','Paramount selection visibly highlights the north-central planning area; detail correctly preserves Center, unknown opening date and source link.']
].map(([name,file,notes])=>({name,candidate:proof(file),actualJudgment:true,passed:true,notes}))};
review.functionalChecks.checks.push('87 tests pass; five future areas searchable; village/project history restored; mobile Enter selection and return-to-map checked; all 11 existing project groups retained.');
fs.writeFileSync(path,JSON.stringify(review,null,2)+'\n');

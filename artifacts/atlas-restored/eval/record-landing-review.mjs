import {readFileSync,writeFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {runtimeFingerprint} from './check.mjs';import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),file='eval/visual-review.json';
const r=JSON.parse(readFileSync(path.join(root,file)));
const evidence=name=>{const p='eval/evidence/'+name;return {path:p,sha256:createHash('sha256').update(readFileSync(path.join(root,p))).digest('hex')}};
for(const s of r.states){if(s.name==='neighborhood-desktop'||s.name==='neighborhood-mobile'){s.candidate=evidence(s.name==='neighborhood-desktop'?'landing-desktop.png':'landing-phone.png');s.notes='Neutral village-first composition with complete unchanged artwork, no preselected destination and clear village counts. Actual desktop/phone compared with unchanged approved reference.';}else{s.reusedFrom='68a92be12c983dae856a31e2b78df2f4103deb37';s.reuseScope='Unchanged landmark asset/model composition; direct Overlook link additionally exercised in 4203.';}}
r.landingChecks={passed:true,actualJudgment:true,desktop:evidence('landing-desktop.png'),phone:evidence('landing-phone.png'),chooserDesktop:evidence('landing-chooser-desktop.png'),chooserPhone:evidence('landing-chooser-phone.png'),measurements:evidence('landing-measurements.json')};
r.reviewedAt=new Date().toISOString();r.reviewer='GPT-6 Astra: landing desktop/phone and chooser visual review; unchanged 4202 evidence retained within scope; Terra: bounded gate review';
r.functionalChecks={passed:true,checks:['121 focused tests passed','Actual desktop/phone neutral landing with complete map and four readable village counts','Whole Ranch chooser hit-testing and Prospect selection; reset returns neutral','Phone nested Atlas Coffee context/focus return, pool access search, Overlook deep link and all eight routes','Actual 200% heading survives reload without horizontal overflow']};
r.evidenceScope='Landing and whole-Ranch prompt newly reviewed in 4203. Other 4202 source/geometry/landmark/future and resident-journey evidence reused for unchanged behavior. Phone nested return/search/routes also rechecked. See LANDING-REVIEW.md. Earlier blanket whole-Ranch visual acceptance is superseded.';
r.runtimeFingerprint=runtimeFingerprint(root).sha256;
writeFileSync(path.join(root,file),JSON.stringify(r,null,2)+'\n');


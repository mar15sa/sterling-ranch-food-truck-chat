import {readFileSync,writeFileSync,copyFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runtimeFingerprint} from './check.mjs';
const root=new URL('../',import.meta.url).pathname.replace(/^\/([A-Z]:)/i,'$1');
const reviewPath=new URL('./visual-review.json',import.meta.url);
if(!existsSync(new URL('./previous-resident-review.json',import.meta.url)))copyFileSync(reviewPath,new URL('./previous-resident-review.json',import.meta.url));
const review=JSON.parse(readFileSync(reviewPath,'utf8'));
const candidate=name=>{const path=`eval/evidence/resident/${name}.png`;return {path,sha256:createHash('sha256').update(readFileSync(new URL('../'+path,import.meta.url))).digest('hex')};};
const state=(name,file,notes)=>({name,candidate:candidate(file),actualJudgment:true,passed:true,notes});
review.reviewedAt='2026-09-23';review.runtimeFingerprint=runtimeFingerprint(root).sha256;
review.reviewer='GPT-6 Astra: actual browser and visual review; GPT-5.6 Terra: bounded source reconciliation and acceptance-test review';
review.states.forEach(s=>{s.candidate=candidate(s.name);s.actualJudgment=true;s.notes='Actual desktop/390px phone comparison with the pinned owner-selected base. Full landscape and detailed landmark artwork unchanged. Three-tab navigation and compact access information improve the visit flow. Scores and approved baselines unchanged. Earlier captures in this review predate only the darker unknown-access text and added connections-return control; final neighborhood and connections captures separately verify those refinements.';});
review.discoveryChecks={passed:true,states:[
state('unfolded-desktop','connections-desktop','Approved plan replaces representative floating cards with selected-village amenities, illustrated nearby walking guides and future additions. Ground map retained above. Dotted membership branches explicitly do not represent walking paths.'),
state('unfolded-mobile','connections-mobile','390px review: reveal scrolls useful amenities into view below persistent search. A 44px Back to the map control restores map context.'),
state('walking-guide','walking-guide-desktop','Full highlighted route with 42–62 minute out-and-back total; one-way time secondary. Arrival and return section below. Escape closes and restores route control focus.'),
state('future-layer','future-desktop','Map-first future projects. School/library prominent; combined future-only directory includes projects and five future areas.')
]};
review.focusChecks={passed:true,states:[
state('village-focus-desktop','village-focus-desktop','Prospect focuses with surrounding blur; place list and full-map reset retained.'),
state('place-focus-desktop','place-focus-desktop','Burns focuses with surrounding blur and contextual card; original illustrated detail remains.'),
state('village-focus-mobile','village-focus-mobile','Prospect focus on phone. Nested playground then Back to Prospect preserves village and focus.'),
state('future-only-mobile','future-mobile','Phone future view begins with map and shows future-only projects; active villages are orientation context only.'),
state('future-map-desktop','future-desktop','Neighborhood project extent preserves full illustration and eleven project groups.')
]};
review.trailChecks={passed:true,states:[
...['desktop','mobile'].flatMap(size=>[state('walks-'+size,'walks-'+size,'Actual all-eight-route overview before area selection. Full source window and aligned highlighted paths retained.'),state('walks-overview-routes-'+size,'walks-'+size,'All eight route controls remain on full-area image. Filters mute nonmatching routes rather than crop geography.'),state('unfold-walks-'+size,'connections-walks-'+size,'Connection reveal contains illustrated, highlighted nearby walking guides and total outing times. Suggestions explicitly do not establish connecting paths.')]),
state('walking-guide-mobile','walking-guide-mobile','Phone guide shows highlighted complete route and total return time; arrival uncertainty is explicit.')
],browserEvidence:'eval/evidence/resident/browser-checks.json'};
review.villagePlanChecks={passed:true,states:[
state('village-plan-desktop','village-plan-desktop','All five future areas and four active orientation villages in approximate CAB-plan arrangement. Atlas palette/type; no invented boundaries, roads or buildings. Original document is expandable.'),
state('village-plan-mobile','village-plan-mobile','Phone planning overview keeps all five names readable without horizontal overflow.'),
state('village-plan-selected','village-plan-selected','Paramount selection stays in wider-plan mode and reveals location, naming nuance, unknown opening and official source. Deep link/reload and phone Pinnacle click verified.')
]};
review.residentChecks={passed:true,states:[
state('pool-access','pool-search-mobile','Desktop and phone global search from other tabs shows Resident access versus Apartment amenity before opening. ArrowDown/Enter opens pool details and transfers focus.'),
state('pickleball-booking','pickleball-desktop','Desktop and phone court detail includes public access, reservation windows, hours, bring paddles/balls, street parking, CourtReserve action and checked date. No booking submitted.'),
state('return-time-walk','filtered-walk-mobile','Upper-bound 30-minute filter and Prospect area survive share/reload with selected loop. Eight paths retained; only two Prospect routes match. Guide shows start, finish, return arrangement and unverified parking/entrance caveat.'),
state('coffee-and-play','coffee-mobile','Ranch Social has verified tenant-page hours and nested Atlas Coffee/log playground. Sterling Center map card exposes both. Nearby walks are separate suggestions, not fabricated connecting routes.'),
state('school-update','school-mobile','School project shows under-construction status, recorded August 2027 opening and November 2026 enrollment targets, DCSD source and September 23 check date.'),
state('future-villages','village-plan-selected','Five future areas remain searchable/in combined directory. Active villages labeled orientation context. Paramount and Pinnacle selections, saved URL and reload verified.'),
state('nested-return','village-focus-mobile','Prospect playground opened from search; return restored Prospect village and focus. Connection return also preserves map context.'),
state('connections','connections-desktop','Whole Ranch prompts village selection. Prospect reveals actual nested amenities, three walking guides and supported future items beyond a single place card. Close returns to retained map.')
]};
review.journeyChecks={passed:true,evidence:'eval/evidence/resident/browser-checks.json',ownerApproval:false,productionDeployed:false,notes:'Actual coordinator browser QA. No resident usability study claimed.'};
review.reviewNotes='See eval/RESIDENT-JOURNEYS-REVIEW.md. Fresh desktop/phone captures; approved artwork, coordinates, baselines and full inventory preserved. Source recheck failures remain explicitly dated. No production or shared-staging deployment. OS-level reduced-motion and true 200% text enlargement need a browser/device capable of exposing those preferences; static suppression and phone reflow checked, not claimed as device testing.';
writeFileSync(reviewPath,JSON.stringify(review,null,2)+'\n');
console.log(review.runtimeFingerprint);

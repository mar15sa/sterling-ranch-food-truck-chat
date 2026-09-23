from pathlib import Path
import json,re
root=Path(__file__).resolve().parent.parent
def edit(name,old,new):
 p=root/name;s=p.read_text(encoding='utf8');assert old in s,(name,old[:80]);p.write_text(s.replace(old,new),encoding='utf8')
# Move the existing exact records into a data file, using node export separately.
edit('future-ui.js',"import { plannedVillage }", "import {sortProjects,projectStatus} from './journeys.mjs';\nimport { plannedVillages,plannedVillage }")
edit('future-ui.js','{places,roots,point,details,onChange}', '{places,roots,point,details,onChange,updates=[]}')
edit('future-ui.js',"mode='villages'", "mode='projects'")
edit('future-ui.js','Future villages & areas · 5','Wider village plan')
edit('future-ui.js','Parks & projects · ${projects.length}','Neighborhood projects')
edit('future-ui.js','aria-label="Coming soon map layers"','aria-label="Choose map extent"')
edit('future-ui.js','<div class="future-map-heading">','<div class="future-map-heading">')
edit('future-ui.js','</div></div>`;', '</div></div><section class="combined-future-index"><p class="eyebrow">ALL PLANS & PROGRESS</p><h2>What’s taking shape.</h2><div id="all-future-plans"></div></section>`;')
edit('future-ui.js',"$('#future-area').value=area;", "$('#future-area').value=area;\n    $('#all-future-plans').innerHTML=sortProjects([...projects,...plannedVillages],updates).map(p=>`<button data-${plannedVillage(p.id)?'planned-village':'future-project'}=\"${esc(p.id)}\"><span class=\"project-status\">${esc(projectStatus(p,updates.find(u=>u.id===p.id)))}</span><strong>${esc(p.name)}</strong><small>${esc(p.village||'Wider Ranch plan')} · ${p.openingDate||'See official update'} ↗</small></button>`).join('');")
edit('future-ui.js',"mode=s.mode==='projects'||(s.selected&&!plannedVillage(s.selected))||(s.area&&s.area!=='all')?'projects':'villages';", "mode=plannedVillage(s.selected)||s.mode==='villages'?'villages':'projects';")
# Preserve explicit old futureMap=projects and make absent mode default to neighborhood projects.
edit('navigation.mjs',"q.get('futureMap')==='projects'?'projects':'villages'", "q.get('futureMap')==='villages'?'villages':'projects'")
edit('navigation.mjs',"if(s.future?.mode==='projects')q.set('futureMap','projects');", "if(s.future?.mode==='villages')q.set('futureMap','villages');")
edit('village-plans-ui.js', '<img src="assets/village-master-plan.jpg" width="1296" height="2088" alt="Complete CAB August 2025 illustrative master plan. Future areas extend north and south of the active villages.">', '<div class="planning-paper" aria-label="Wider Sterling Ranch planning orientation, north up"><span class="planning-north">N ↑</span><span class="planning-context context-providence">Providence<small>Active village</small></span><span class="planning-context context-ascent">Ascent<small>Active village</small></span><span class="planning-context context-parkvale">Parkvale<small>Active village</small></span><span class="planning-context context-prospect">Prospect<small>Active village</small></span><span class="planning-extent-label">THE WIDER RANCH</span></div>')
edit('village-plans-ui.js','>${i+1}</button>','><span>${i+1}</span><strong>${v.name}</strong><small>Long-range plan</small></button>')
edit('village-plans-ui.js','Official planning illustration · August 2025 · subject to change<br>Numbered areas are future plans. Existing villages appear for orientation.','General arrangement from CAB’s August 2025 plan · approximate<br>Labels show areas, not boundaries, roads or building positions.')
edit('village-plans-ui.js','<details class="village-source-notes"><summary>Sources & what can change</summary>','<details class="village-source-notes"><summary>Compare with official plan</summary><img class="official-plan-comparison" src="assets/village-master-plan.jpg" alt="Complete original CAB August 2025 illustrative master plan">')
edit('village-plans-ui.js','Plans elsewhere in the Ranch remain under Parks & projects.','Use Neighborhood projects to explore plans in the active villages.')

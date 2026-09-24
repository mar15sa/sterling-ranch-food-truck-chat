from pathlib import Path
import json
root=Path(__file__).resolve().parent.parent
def edit(n,a,b):
 p=root/n;s=p.read_text(encoding='utf8');assert a in s,(n,a[:65]);p.write_text(s.replace(a,b),encoding='utf8')
edit('app.js',"const places=mergeCatalog", "const projectUpdates=local.projects.map(p=>({...p,...refreshed[p.id]?.project}));\nconst places=mergeCatalog")
edit('app.js',"updates:local.projects", "updates:projectUpdates")
edit('app.js',"if(view==='place')renderPlace();", "if(view==='place')renderPlace();")
edit('app.js',"guides.map(r=>`<article", "guides.map(r=>`<article")
edit('app.js',"</button></article>`).join('');\n $('#walk-access')", "</button></article>`).join('')||'<p class=\"empty-walks\">No confirmed guide fits these filters. Try All walks or another village.</p>';\n $('#walk-access')")
edit('discovery-ui.js',"import {connectionScene}", "import {outing} from './journeys.mjs';\nimport {connectionScene}")
edit('discovery-ui.js',"${r.miles} mi · ${esc(r.type)} · CAB guide", "${outing(r).min}–${outing(r).max} min · return included")
edit('discovery-ui.js',"if(b.dataset.village){const fromMap=b.classList.contains('village-label');chooseVillage(b.dataset.village);", "if(b.dataset.village){const fromConnections=!!b.closest('#unfold-sheets');const fromMap=b.classList.contains('village-label');chooseVillage(b.dataset.village);if(fromConnections){unfolded=true;render();changed();}")
edit('discovery-ui.js',"$('#landscape').inert=unfolded", "$('#landscape').inert=false")
edit('discovery-ui.js',"const plansOnly=unfolded&&layer==='future';", "const plansOnly=false;")
# Supplement source badges with explicit reservation metadata, and retain real provenance.
park=root/'data/visit-parks.json';p=json.loads(park.read_text(encoding='utf8'))
for id,record in p['places'].items():
 v=record['visit'];v['verificationState']='retained' if v.get('freshCheckBlocked') else 'verified'
 if v.get('freshCheckBlocked'):v['attemptedAt']='2026-09-23'
 if id in ['overlook','overlook-pool','overlook-fitness']:
  v['access']['text']='Sterling Ranch households use membership-card access. Confirm current guest arrangements and activity hours with CAB.'
  if not v['access'].get('sourceUrl'):v['access']['sourceUrl']='https://sterlingranchcab.com/DocumentCenter/View/435'
 if id=='burns-courts':v['reservation']['kind']='available';record['actions']=[{'label':'Reserve a court','url':'https://app.courtreserve.com/Online/Portal/Index/15838'},{'label':'Court hours & rules','url':'https://sterlingranchcab.com/418/Pickleball-Courts'}]
park.write_text(json.dumps(p,indent=2)+'\n',encoding='utf8')
# Keep all route geometry unchanged; add explicit arrival and connection contracts.
f=root/'data/trails.json';tr=json.loads(f.read_text(encoding='utf8'))
for r in tr['routes']:
 r['arrival']={'text':r['start']+'. This identifies the mapped path, not a confirmed parking spot or accessible entrance.','sourceUrl':tr['source']['url'],'verifiedEntrance':False}
 r['stopConnections']=[]
f.write_text(json.dumps(tr,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
f=root/'package.json';pkg=json.loads(f.read_text());pkg['scripts']['test']=pkg['scripts']['test'].replace(' eval/check.test.mjs',' journeys.test.mjs resident-data.test.mjs eval/check.test.mjs');f.write_text(json.dumps(pkg,indent=2)+'\n')

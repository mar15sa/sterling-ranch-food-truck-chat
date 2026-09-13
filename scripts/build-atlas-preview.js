'use strict';
// Deterministic staging projection. Research leads never become place cards.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const inventory=read('data/atlas/inventory.json'),sources=new Map(read('data/atlas/sources.json').sources.map(s=>[s.id,s]));
const locations=read('data/atlas/locations.json');
const detail=read('data/atlas/preview-details.json');
const categories={parks:'parks',trails:'parks',amenities:'amenities',housing:'amenities',recurring:'businesses',businesses:'businesses',schools:'services',civic:'services',services:'services',infrastructure:'services',future:'future'};
const statusMap={'source-listed':'listed','operator-listed':'listed','partly-open':'partial',design:'planned',planned:'planned',unconfirmed:'unconfirmed','under-construction':'building','opening-season':'listed','construction-project':'planned','site-preparation':'construction','map-concept':'planned',seasonal:'seasonal','school-access-only':'listed','seasonal-or-scheduled':'seasonal'};
const records=new Map(inventory.records.map(r=>[r.id,r]));
const upcoming=r=>['planned','design','under-construction','construction-project','site-preparation','map-concept'].includes(r.status)||r.kind==='phase'||(r.parentId&&upcoming(records.get(r.parentId)));
function locate(r){
  if(locations[r.id])return locations[r.id];
  if(r.parentId){const p=locate(records.get(r.parentId));if(p)return {...p,locationPrecision:p.locationPrecision==='street-area'?'street-area':'parent-area'};}
  return null;
}
const places=inventory.records.filter(r=>r.kind!=='candidate').map(r=>{
  const extra=detail[r.id]||{},parent=r.parentId&&records.get(r.parentId),location=locate(r);
  const selectedSources=[...new Set([...(extra.sourceIds||[]),...r.sourceIds])].map(id=>sources.get(id));
  if(selectedSources.some(s=>!s))throw Error('Missing source for '+r.id);
  const facts=r.claims.map(c=>({text:c.text,url:sources.get(c.sourceId).url}));
  const p={id:r.id,name:r.name,category:categories[r.category],kind:r.kind,parentId:r.parentId,parentName:parent?.name||null,village:r.village,status:statusMap[r.status]||'unconfirmed',future:Boolean(upcoming(r)),description:extra.description||r.claims.map(c=>c.text).join(' ')||r.name+' is listed within '+parent?.name+'.',tags:extra.tags||[],aliases:[...r.aliases,...(extra.aliases||[])],sources:selectedSources.map(s=>({label:s.title,url:s.url})),checkedAt:inventory.asOf,reviewAfterDays:Math.min(...selectedSources.map(s=>s.reviewEveryDays)),reviewState:'staging-review',facts,access:extra.access||r.access||null,visitNotes:extra.visitNotes||[],unknowns:extra.unknowns||r.questions,address:r.publicAddress||r.locationDescription?.text||null};
  if(location)Object.assign(p,location);
  if(extra.status)p.status=extra.status;
  if(extra.action||r.action)p.action=extra.action||{label:r.action.label,url:r.action.url};
  if(extra.note)p.note=extra.note;
  return p;
});
// Keep the easily missed court listing at the front of the directory and marker group.
places.sort((a,b)=>(a.id==='burns-courts'?-1:b.id==='burns-courts'?1:0));
const held=inventory.records.filter(r=>r.kind==='candidate');
const output={version:2,checkedAt:inventory.asOf,status:'staging-prototype',places,coverage:{inventoryTotal:inventory.records.length,listed:places.length,placeCount:places.filter(p=>p.kind==='place').length,featureCount:places.filter(p=>p.kind==='feature').length,phaseCount:places.filter(p=>p.kind==='phase').length,recurringCount:places.filter(p=>p.kind==='recurring-use').length,heldCount:held.length,makerLeadsHeld:held.filter(r=>r.category==='makers').length,heldReasons:held.filter(r=>r.category!=='makers').map(r=>({id:r.id,name:r.name,reason:r.questions[0]})),allIds:inventory.records.map(r=>r.id),heldIds:held.map(r=>r.id),exhaustive:false}};
const file=path.join(root,'public/atlas/places.json'),json=JSON.stringify(output,null,2)+'\n';
if(process.argv.includes('--check')){if(fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n')!==json)throw Error('Staging catalog is out of sync with reviewed projection');}
else fs.writeFileSync(file,json);
console.log(JSON.stringify({listed:places.length,mapped:places.filter(p=>p.coordinates).length,held:held.length,total:inventory.records.length}));

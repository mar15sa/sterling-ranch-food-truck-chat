import {createDistrict} from './scene.js';
import {rootOf,inArea,searchPlaces,mergeCatalog} from './catalog.mjs';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e;};
const link=(label,url,cls='')=>{const a=el('a',cls,label+' ↗');a.href=url;a.target='_blank';a.rel='noopener';return a;};
let area,geo,catalog,supplement,trailData,notes,local,places=[],byId,scoped=[],district,activeId='sterling-center',mode='places',opened=false;
const revealMenu=el('div','reveal-menu');revealMenu.hidden=true;$('#map-stage').append(revealMenu);
const status=text=>{$('#status').textContent=text;};
const sources=place=>place.actions?.length?place.actions:place.action?[place.action]:place.sources||[];
const children=id=>places.filter(p=>p.parentId===id&&!p.future);
function btn(label,cls,action){const b=el('button',cls,label);b.type='button';b.addEventListener('click',action);return b;}
function context(){const holder=$('#context-strip');holder.replaceChildren();for(const item of area.landmarks){const b=btn('','context-card',()=>select(item.id));b.dataset.place=item.id;b.append(el('span','',item.number));const wrap=el('div');wrap.append(el('strong','',item.label),el('small','',item.subtitle));b.append(wrap);holder.append(b);}}
function updateContext(){const root=rootOf(activeId,byId)?.id;$$('.context-card').forEach(b=>{const selected=b.dataset.place===root;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});}
function hideSearch(){$('#search-results').hidden=true;}
function setMode(next){mode=next;$$('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===next)));district?.setMode(next);if(next!=='places'){opened=false;district?.reset();$('#open-controls').hidden=true;}$('#map-state').textContent=next==='paths'?'The paths between places.':next==='future'?'Here today. Taking shape.':'A neighborhood, together.';renderInspector();}
function select(id,{focus=false,open=false}={}){
  if(!byId.has(id))return;activeId=id;setMode('places');const root=rootOf(id,byId);const canOpen=area.landmarks.find(x=>x.id===root.id)?.canOpen;
  opened=Boolean(open&&canOpen);district?.select(root.id,{focus:focus||opened,open:opened});$('#open-controls').hidden=!opened;$('#close-model').textContent='Close the roof ↓';$('#opened-caption').textContent='Directory reveal · not a floor plan';
  $('#map-state').textContent=opened?root.name+', opened up.':'A neighborhood, together.';renderInspector();updateContext();hideSearch();status(byId.get(id).name+' selected.');
}
function openActive(){const root=rootOf(activeId,byId);select(activeId,{open:true});status(root.name+' opened. Its directory is available alongside the model.');}
function visitContent(parent,place){
  const highlights=place.highlights?.length?place.highlights:place.visitNotes?.length?place.visitNotes:[];
  if(highlights.length){const list=el('ul','visit-list');for(const text of highlights)list.append(el('li','',text));parent.append(list);}
  if(place.access)parent.append(el('p','description',place.access));
  const links=el('div','source-actions');for(const item of sources(place).slice(0,3))links.append(link(item.label,item.url));parent.append(links);
  if(place.note)parent.append(el('p','source-date',place.note));
  const checked=local.places[place.id]?local.checkedAt:place.checkedAt||catalog.checkedAt;parent.append(el('p','source-date','Source review: '+checked+'. Current hours and access are on the operator’s website.'));
}
function childButton(place){const b=btn('','child-place',()=>select(place.id,{open:opened}));const text=el('span');text.append(el('span','',place.name));if(place.suite)text.append(el('small','','Suite '+place.suite));b.append(text,el('b','','↗'));return b;}
function tree(parentId,{open=false}={}){
  const parent=byId.get(parentId),kids=children(parentId),details=el('details','tree-group');details.open=open;const summary=el('summary','',parent.name);summary.append(el('small','',kids.length+' places & features'));details.append(summary);
  details.append(childButton(parent));for(const kid of kids){if(children(kid.id).length)details.append(tree(kid.id));else details.append(childButton(kid));}return details;
}
function renderPlace(host){
  const p=byId.get(activeId),root=rootOf(activeId,byId),landmark=area.landmarks.find(x=>x.id===root.id),isChild=p.id!==root.id;
  if(isChild)host.append(btn('← '+root.name,'mini-back',()=>select(root.id,{open:opened})));
  host.append(el('p','eyebrow',landmark.number+' / '+(isChild?root.name:landmark.subtitle).toUpperCase()),el('h2','',p.name),el('p','description',p.summary||p.description));
  if(p.address||root.address)host.append(el('p','place-address',p.address||root.address));
  if(landmark.canOpen&&district){host.append(btn(opened?'Return to the neighborhood ↙':'Open '+landmark.label+' ↗','main-action',()=>{if(opened){opened=false;district.reset();district.select(root.id);$('#open-controls').hidden=true;$('#map-state').textContent='A neighborhood, together.';renderInspector();}else openActive();}));}
  else if(district)host.append(btn('See this place more closely ↗','secondary-action',()=>district.select(root.id,{focus:true})));
  if(!isChild&&p.id==='sterling-center'){
    host.append(el('p','section-label','EXPLORE WHAT’S HERE'));
    for(const group of supplement.groups){const d=el('details','tree-group');d.open=group.id==='food-gathering';const summary=el('summary','',group.label);d.append(summary);for(const id of group.placeIds){const item=byId.get(id);if(!item)continue;d.append(children(id).length?tree(id,{open:group.id==='food-gathering'}):childButton(item));}host.append(d);}
  }else{const kids=children(p.id);if(kids.length){host.append(el('p','section-label','WITHIN THIS PLACE'));for(const child of kids)host.append(children(child.id).length?tree(child.id):childButton(child));}}
  visitContent(host,p);
}
function renderWalks(host){
  host.append(el('p','eyebrow','A LITTLE TIME OUTSIDE'),el('h2','','Take the long way.'),el('p','description','Choose a CAB walking guide, see its source route, and plan a nearby stop.'));
  host.append(el('p','path-explanation','The green lines on the miniature show mapped paths and sidewalks. Open a walking guide for CAB’s separate route diagram and distances.'));
  for(const route of trailData.routes.filter(r=>area.routeIds.includes(r.id))){const card=el('article','route-card');card.append(el('p','eyebrow',route.type.toUpperCase()),el('h3','',route.name));const stats=el('div','route-stats');stats.append(el('span','',route.miles+' mi one way'),el('span','',Math.ceil(route.miles/3*60)+'–'+Math.ceil(route.miles/2*60)+' min walking'));card.append(stats,el('p','',route.description),btn('Open the walking guide ↗','',()=>showRoute(route)));host.append(card);}
  host.append(el('p','source-date','Distances are printed on CAB’s October 2025 map. Times estimate 2–3 mph before stops. Map listing rechecked '+local.routeReview.date+'.'));
}
function renderProjects(host){
  host.append(el('p','eyebrow','THE NEXT CHAPTER'),el('h2','','Taking shape nearby.'),el('p','description','Follow the school and library projects from their official updates.'));
  for(const project of local.projects){const card=el('article','project-card');card.append(el('span','project-status',project.status),el('h3','',project.name),el('p','',project.summary));const list=el('ul','visit-list');project.details.forEach(text=>list.append(el('li','',text)));card.append(list,link(project.sourceLabel+' updates',project.url),el('small','',project.locationNote));host.append(card);}
  host.append(el('p','scope-note','These are project cards, not open destinations. The miniature continues to show mapped existing features; future buildings have no guessed positions.'));
  host.append(el('p','source-date','Project sources reviewed '+local.checkedAt+'. Status and dates may change.'));
}
function renderReveal(){
  revealMenu.replaceChildren();revealMenu.hidden=!opened||mode!=='places';if(revealMenu.hidden)return;
  const root=rootOf(activeId,byId);const options=root.id==='sterling-center'?[['Food & gathering','Coffee, market & more','food-gathering'],['Health & wellness','Four providers','health-wellness'],['Community help','Info Center & CAB','community-help']]:[['Swim','Outdoor pool','overlook-pool'],['Move','Fitness center','overlook-fitness'],['Gather','Great Hall & rentals','overlook-great-hall']];
  for(const [title,subtitle,id] of options){const b=btn('','reveal-option',()=>{if(root.id==='sterling-center'){activeId=root.id;renderInspector();const groups=$$('#inspector > .tree-group');groups.forEach((group,i)=>group.open=supplement.groups[i].id===id);const selected=groups.find((_,i)=>supplement.groups[i].id===id);selected?.scrollIntoView({block:'nearest',behavior:'smooth'});status(title+' directory expanded.');}else select(id,{open:true});});b.append(el('strong','',title),el('small','',subtitle));revealMenu.append(b);}
}
function renderInspector(){if(!byId)return;const host=$('#inspector');host.replaceChildren();if(mode==='paths')renderWalks(host);else if(mode==='future')renderProjects(host);else renderPlace(host);renderReveal();}
function showRoute(route){
  const host=$('#route-content');host.replaceChildren();host.append(el('p','eyebrow','CAB WALKING GUIDE'),el('h2','',route.name),el('p','route-distance',route.miles+' mi one way · '+(route.miles*2).toFixed(2)+' mi if you retrace · '+Math.ceil(route.miles/3*60)+'–'+Math.ceil(route.miles/2*60)+' min each way before stops'));
  const map=el('div','route-map'),ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox',route.viewBox.join(' '));svg.setAttribute('role','img');svg.setAttribute('aria-label',route.name+' highlighted on the official CAB map. Schematic route guide, not GPS navigation.');
  const sourceLoading=el('p','source-loading','Loading CAB’s source map…');map.append(sourceLoading);
  const image=document.createElementNS(ns,'image');image.addEventListener('load',()=>sourceLoading.remove());image.addEventListener('error',()=>{sourceLoading.textContent='Source image unavailable. Use the complete CAB map link below.';});image.setAttribute('href','assets/cab-trail-map.png');image.setAttribute('width',String(trailData.imageSize[0]));image.setAttribute('height',String(trailData.imageSize[1]));svg.append(image);
  for(const points of route.paths){const path=document.createElementNS(ns,'polyline');path.setAttribute('points',points.map(p=>p.join(',')).join(' '));path.setAttribute('fill','none');path.setAttribute('stroke','#1b7765');path.setAttribute('stroke-width','6');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');path.setAttribute('opacity','.8');svg.append(path);}
  for(const [point,text] of [[route.startPoint,'A'],[route.endPoint,'B']]){const circle=document.createElementNS(ns,'circle');circle.setAttribute('cx',point[0]);circle.setAttribute('cy',point[1]);circle.setAttribute('r','9');circle.setAttribute('fill','#fffdf2');circle.setAttribute('stroke','#2e634d');circle.setAttribute('stroke-width','2');svg.append(circle);const label=document.createElementNS(ns,'text');label.setAttribute('x',point[0]);label.setAttribute('y',point[1]+3.5);label.setAttribute('text-anchor','middle');label.setAttribute('font-size','10');label.setAttribute('font-family','Arial');label.setAttribute('fill','#2e634d');label.textContent=text;svg.append(label);}
  map.append(svg);host.append(map,el('p','route-note','A · '+route.start+'\nB · '+route.finish));
  const steps=el('ol','route-steps');route.steps.forEach(text=>steps.append(el('li','',text)));host.append(steps,el('p','route-note','Nearby places, shown separately — these are not verified route entrances:'));
  const nearby=el('div','route-nearby');for(const id of route.nearbyPlaceIds){const p=byId.get(id);if(p)nearby.append(btn(p.name+' ↗','',()=>{$('#route-dialog').close();select(id,{focus:true});}));}host.append(nearby,el('p','route-note',route.sourceScope+' '+route.geometryMethod),el('p','route-note','Check CAB for current closures and access. Surface, grade and accessibility have not been verified.'),link('Open CAB’s complete source map',trailData.source.url));
  $('#route-dialog').showModal();status(route.name+' walking guide opened.');
}
function search(){const query=$('#search').value;const target=$('#search-results');target.replaceChildren();if(!query.trim()){target.hidden=true;return;}const results=searchPlaces(scoped,query);target.hidden=false;if(!results.length){target.append(el('p','','No match in this seven-destination area. The full Sterling Ranch directory is available in the previous working neighborhood below.'));return;}for(const p of results){const root=rootOf(p.id,byId),b=btn('','',()=>{select(p.id,{focus:true,open:root.id==='sterling-center'||root.id==='overlook'});$('#search').value='';$('#inspector').focus({preventScroll:true});});b.append(el('strong','',p.name),el('small','',root.id!==p.id?'Inside '+root.name:root.name));target.append(b);}}
$$('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
$('#search').addEventListener('input',search);$('#search').addEventListener('keydown',event=>{if(event.key==='Escape')hideSearch();if(event.key==='ArrowDown'){$('#search-results button')?.focus();event.preventDefault();}});
document.addEventListener('click',event=>{if(!event.target.closest('.search-area'))hideSearch();});
for(const id of ['about-open','geometry-open'])$('#'+id).addEventListener('click',()=>$('#about-dialog').showModal());
$$('[data-close]').forEach(b=>b.addEventListener('click',()=>$('#'+b.dataset.close).close()));
$('#zoom-in').addEventListener('click',()=>district?.zoom(.8));$('#zoom-out').addEventListener('click',()=>district?.zoom(1.25));$('#turn-left').addEventListener('click',()=>district?.turn(-.25));$('#turn-right').addEventListener('click',()=>district?.turn(.25));$('#top-view').addEventListener('click',()=>district?.top());
$('#reset-view').addEventListener('click',()=>{district?.reset();opened=false;$('#open-controls').hidden=true;$('#map-state').textContent=mode==='paths'?'The paths between places.':mode==='future'?'Here today. Taking shape.':'A neighborhood, together.';renderInspector();});
$('#close-model').addEventListener('click',()=>{opened=!opened;district?.select(rootOf(activeId,byId).id,{open:opened});$('#close-model').textContent=opened?'Close the roof ↓':'Open the roof ↑';renderInspector();});
$('#map-canvas').addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','+','=','-','Home'].includes(event.key)){event.preventDefault();if(event.key==='ArrowLeft')district?.turn(-.2);if(event.key==='ArrowRight')district?.turn(.2);if(['+','='].includes(event.key))district?.zoom(.8);if(event.key==='-')district?.zoom(1.25);if(event.key==='Home')$('#reset-view').click();}});
async function start(){
  const paths=['area.json','data/geography.json','data/places.json','data/directory.json','data/trails.json','data/visitor-notes.json','data/area-visit.json'];
  [area,geo,catalog,supplement,trailData,notes,local]=await Promise.all(paths.map(path=>fetch(path).then(r=>{if(!r.ok)throw new Error('Could not load '+path);return r.json();})));
  places=mergeCatalog(catalog,supplement,notes,local);byId=new Map(places.map(p=>[p.id,p]));scoped=inArea(places,area.rootIds);$('#place-count').textContent=area.rootIds.length+' destinations · '+scoped.length+' listings';context();renderInspector();updateContext();
  try{district=createDistrict({host:$('#map-canvas'),labelHost:$('#map-labels'),geo,area,places,onSelect:id=>select(id),onStatus:status});district.select(activeId);$('#map-loading').hidden=true;renderInspector();}
  catch(error){console.error(error);$$('.map-controls button').forEach(button=>button.disabled=true);$('#map-loading').textContent='The 3D view could not open. The place guide and walking routes are still available.';status('Map unavailable. Use the destination list and guide.');}
}
start().catch(error=>{console.error(error);$('#map-loading').textContent='The area could not load. Refresh to try again.';$('#inspector').append(el('p','description','The preview’s saved data is unavailable.'),link('Open the previous Atlas','http://127.0.0.1:4185/atlas/opened/index.html'));});

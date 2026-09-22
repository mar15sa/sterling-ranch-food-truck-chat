import { descendants, features, matchesLens, routesFor, futureGroups, villages, iconPaths, iconFor } from './discovery.mjs';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = key => `<svg viewBox="0 0 24 24" aria-hidden="true">${iconPaths[key] || iconPaths.park}</svg>`;
const shortName = p => p.name.replace('Regional Park','Park').replace('The Overlook Clubhouse','The Overlook').replace('The Lawn at Providence','The Lawn');

export function createDiscovery({ places, roots, trails, models, located, selected, select, showRoute, setView, routeSvg, focusVillage }) {
  const $ = s => document.querySelector(s), byId = new Map(places.map(p=>[p.id,p]));
  let lens = 'all', village = 'all', unfolded = false;
  const lenses = [['all','All places','layers'],['play','Play & parks','play'],['everyday','Everyday stops','coffee'],['walks','Walks','walk'],['future','Coming next','future']];
  const query=new URLSearchParams(location.search);
  if(lenses.some(l=>l[0]===query.get('lens')))lens=query.get('lens');
  if(villages.some(v=>v.name===query.get('village')))village=query.get('village');
  unfolded=query.get('unfold')==='1';
  const toolbar = document.createElement('div'); toolbar.className = 'discovery-toolbar';
  toolbar.innerHTML = `<div class="lens-row"><div class="map-lenses" role="group" aria-label="Discover on the map">${lenses.map(([id,label,key])=>`<button data-lens="${id}" aria-pressed="${id==='all'}">${icon(key)}${label}</button>`).join('')}</div><button id="unfold-map" aria-expanded="false" aria-controls="unfold-sheets">${icon('layers')}<span>Unfold the Ranch</span></button></div><div class="village-row"><div class="village-tabs" role="group" aria-label="Explore a village"><button data-village="all" aria-pressed="true">Whole Ranch</button>${villages.map(v=>`<button data-village="${v.name}" aria-pressed="false">${v.name}</button>`).join('')}</div><span id="map-match-count"></span></div>`;
  $('#neighborhood-panel').prepend(toolbar);
  toolbar.insertAdjacentHTML('afterbegin',`<div class="mobile-discovery-controls"><label>Explore<select id="mobile-lens" aria-label="Choose what to explore">${lenses.map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}</select></label><label>Area<select id="mobile-village" aria-label="Choose an area"><option value="all">Whole Ranch</option>${villages.map(v=>`<option>${v.name}</option>`).join('')}</select></label></div>`);
  const stage = document.createElement('div'); stage.className = 'map-stage';
  toolbar.after(stage); stage.append($('#landscape'), $('#place-note'));
  const actions=document.createElement('div');actions.className='map-actions';stage.insertBefore(actions,$('#place-note'));
  const phone=matchMedia('(max-width:720px)'), positionControls=()=>{const parent=phone.matches?actions:$('#landscape');parent.append($('.map-controls'),$('#source-toggle'));};
  phone.addEventListener('change',positionControls);positionControls();
  $('#map-plane').insertAdjacentHTML('beforeend','<div id="village-labels" role="group" aria-label="Village orientation labels"></div>');
  $('#landscape').insertAdjacentHTML('beforeend',`<div class="map-key" aria-label="Map symbol key"><span>${icon('play')}Play</span><span>${icon('court')}Courts</span><span>${icon('coffee')}Everyday</span><span>${icon('walk')}Trails</span></div>`);
  stage.insertAdjacentHTML('beforeend','<section id="unfold-sheets" aria-label="The neighborhood in layers" hidden></section>');
  stage.insertAdjacentHTML('afterend','<section id="map-discovery" class="map-discovery" aria-label="Discover more from the map" hidden></section>');

  function rootsInView() { return roots.filter(p => (village==='all'||p.village===village||p.village?.startsWith(village+' /')||p.village===village+' area') && matchesLens(p,places,lens,trails)); }
  function futureInView() { return futureGroups(places).filter(p => village==='all'||p.village===village); }
  function chooseLens(next) { lens=next; unfolded=false; setView('neighborhood'); render(); }
  function chooseVillage(next) { village=next; unfolded=false; setView('neighborhood'); render(); }
  function quickChips(p) {
    const all=descendants(p.id,places), keys=['atlas-coffee','ranch-playground','burns-courts','overlook-pool','overlook-fitness','prospect-playground','prospect-walking'];
    return [...all].sort((a,b)=>(keys.includes(b.id)?1:0)-(keys.includes(a.id)?1:0)).slice(0,2).map(c=>`<button data-open="${c.id}">${esc(c.name.replace(/^Prospect |^Overlook |^McCormick |^Pioneer /,''))} ↗</button>`).join('');
  }
  function renderCard(p) {
    const dock=$('#place-note');
    if(lens==='walks') {
      const routes=trails.routes.filter(r=>village==='all'||r.area===village);
      dock.innerHTML=`<div class="layer-dock"><p class="eyebrow">CAB WALKING GUIDES</p><h2>Pick a little escape.</h2><p class="place-promise">See a highlighted route, where to start, and places nearby.</p>${routes.map(r=>`<button class="dock-link" data-route="${r.id}">${icon('walk')}<span><strong>${esc(r.name)}</strong><small>${r.miles} mi · ${esc(r.type)}</small></span>↗</button>`).join('')||'<p class="place-promise">No saved guide for this area yet.</p><button class="dock-link" data-village="all">See all three guides ↗</button>'}<p class="source-footnote">Routes use CAB’s original map. The painting is an illustrated overview.</p></div>`;
      return;
    }
    if(lens==='future') {
      const future=futureInView();
      dock.innerHTML=`<div class="layer-dock"><p class="eyebrow">${esc(village==='all'?'THE NEXT CHAPTER':village)}</p><h2>Taking shape.</h2><p class="place-promise">${future.length} plans to explore. Select a project for its current saved update and official source.</p>${[...future].sort((a,b)=>(['school51','library'].includes(b.id)?1:0)-(['school51','library'].includes(a.id)?1:0)).slice(0,3).map(p=>`<button class="dock-link" data-open="${p.id}">${icon(p.id==='school51'?'school':'future')}<span><strong>${esc(p.name)}</strong><small>${esc(p.village)}</small></span>↗</button>`).join('')}<p class="source-footnote">All plans are listed below. Unconfirmed sites stay off the map.</p></div>`;
      return;
    }
    if(!rootsInView().some(x=>x.id===p.id)) {
      dock.innerHTML=`<div class="layer-dock"><p class="eyebrow">${esc(village==='all'?'AROUND THE RANCH':village)}</p><h2>Find a favorite.</h2><p class="place-promise">Choose a place to see what’s inside.</p>${rootsInView().slice(0,4).map(p=>`<button class="dock-link" data-select="${p.id}">${icon(iconFor(p,places))}<span><strong>${esc(shortName(p))}</strong><small>${located.has(p.id)?'On the map':'Map position to confirm'}</small></span>↗</button>`).join('')||'<p class="place-promise">No matching places in this area.</p>'}</div>`;
      return;
    }
    const fs=features(p,places), walks=routesFor(p.id,trails);
    $('#place-note').innerHTML=`<div class="place-card-heading"><p class="eyebrow">${esc(p.village)} / EXPLORE</p><h2>${esc(shortName(p))}</h2></div>${models[p.id]?`<img class="discovery-portrait" src="assets/${models[p.id]}" alt="Illustrated model of ${esc(p.name)}">`:''}<p class="place-promise">${esc(fs.items.slice(0,3).map(f=>f.label).join(' · ')||p.tags?.join(' · ')||'A place to know in the Ranch')}</p>${fs.privateAmenities?'<p class="access-note">Private apartment amenities</p>':p.id==='overlook'?'<p class="access-note">Resident membership · check guest access</p>':''}<div class="quick-places">${quickChips(p)}</div><button class="primary" data-open="${p.id}">${models[p.id]?'Open this place':'See place details'} <span>↗</span></button>${walks.length?`<div class="pair-a-walk"><span class="eyebrow">PAIR IT WITH A WALK</span>${walks.map(r=>`<button data-route="${r.id}">${icon('walk')}<span>${esc(r.name)}<small>${r.miles} mi · ${esc(r.type)} · CAB guide</small></span>↗</button>`).join('')}</div>`:''}${!located.has(p.id)?'<p class="access-note">In the directory · map position to confirm</p>':''}`;
  }
  function renderMarkers() {
    const matchIds=new Set(rootsInView().map(p=>p.id));
    for (const b of document.querySelectorAll('.map-label')) {
      const p=byId.get(b.dataset.select), key=iconFor(p,places), fs=features(p,places);
      b.hidden=!matchIds.has(p.id);
      b.dataset.kind=key;
      b.setAttribute('aria-label',p.name+(fs.items.length?' · '+fs.items.slice(0,3).map(f=>f.label).join(', '):''));
      b.title=p.name;
      b.querySelector('.number').innerHTML=icon(key);
      b.querySelector('.name').innerHTML=`<strong>${esc(shortName(p))}</strong><small>${esc(fs.privateAmenities?'Private amenities':fs.items.slice(0,2).map(f=>f.label).join(' · ')||p.village)}</small>`;
    }
    $('#village-labels').innerHTML=villages.map(v=>`<button class="village-label ${village===v.name?'active':''}" data-village="${v.name}" style="left:${v.x}%;top:${v.y}%">${esc(v.name)}<small>Explore this area ↗</small></button>`).join('');
    const matches=rootsInView(), mapped=matches.filter(p=>located.has(p.id)).length;
    $('#map-match-count').textContent=lens==='future'?`${futureInView().length} plans · grouped by area`:`${mapped} mapped · ${matches.length-mapped} directory only`;
    $('#status').textContent=`${lenses.find(l=>l[0]===lens)[1]} · ${village==='all'?'Whole Ranch':village}: ${$('#map-match-count').textContent}`;
  }
  function renderDiscovery() {
    const panel=$('#map-discovery'); panel.hidden=lens==='all'&&village==='all';
    if(panel.hidden)return;
    if(lens==='walks') {
      const routes=trails.routes.filter(r=>village==='all'||r.area===village);
      panel.innerHTML=`<div class="discovery-heading"><div><p class="eyebrow">THE WALKING LAYER</p><h2>A little further, a little slower.</h2></div><p>Pick a walk to see its highlighted CAB route and nearby places.</p></div><div class="map-route-cards">${routes.map(r=>`<button class="map-route-card" data-route="${r.id}" style="--route-color:${r.color}">${routeSvg(r)}<span class="route-card-body"><small>${esc(r.area)} · ${esc(r.type)}</small><strong>${esc(r.name)}</strong><span>${r.miles} mi <b>Open guide ↗</b></span></span></button>`).join('')||'<p class="empty-layer">No saved CAB walking guide for this area yet. <button data-village="all">See all three guides ↗</button></p>'}</div><p class="source-footnote">Highlighted routes follow CAB’s map. Nearby places are separate stops; entrances and access are not inferred.</p>`;
    } else if(lens==='future') {
      panel.innerHTML=`<div class="discovery-heading"><div><p class="eyebrow">THE NEXT CHAPTER</p><h2>Watch the neighborhood grow.</h2></div><p>Plans are grouped by area. Unconfirmed sites stay off the map.</p></div><div class="future-ribbon">${futureInView().map(p=>`<button data-open="${p.id}" class="future-preview"><span>${icon(p.id==='school51'?'school':'future')}<small>${esc(p.village)}</small></span><strong>${esc(p.name)}</strong><small>${esc(p.status||'Planned development')} · details & sources ↗</small></button>`).join('')||'<p class="empty-layer">No saved plans in this area.</p>'}</div>`;
    } else {
      const matches=rootsInView();
      panel.innerHTML=`<div class="discovery-heading"><div><p class="eyebrow">${esc(village==='all'?'ALL AROUND THE RANCH':village)}</p><h2>${lens==='play'?'Room to play.':lens==='everyday'?'Make a few good stops.':'Get to know the area.'}</h2></div><p>${matches.length} destinations. Amenities stay grouped inside each place.</p></div><div class="matching-places">${matches.map(p=>`<button data-select="${p.id}" class="matching-place">${icon(iconFor(p,places))}<span><strong>${esc(shortName(p))}</strong><small>${esc(features(p,places).items.slice(0,3).map(f=>f.label).join(' · ')||p.village)}${located.has(p.id)?'':' · map position to confirm'}</small></span>↗</button>`).join('')}</div>`;
    }
  }
  function renderSheets() {
    const sheets=$('#unfold-sheets'); sheets.hidden=!unfolded;
    stage.classList.toggle('unfolded',unfolded);
    $('#unfold-map').setAttribute('aria-expanded',String(unfolded));
    $('#unfold-map span').textContent=unfolded?'Bring it together':'Unfold the Ranch';
    if(!unfolded)return;
    const p=byId.get(selected()), nearby=routesFor(p.id,trails), r=nearby[0]||trails.routes[0];
    sheets.innerHTML=`<div class="unfold-intro"><p class="eyebrow">THE RANCH, LAYER BY LAYER</p><h2>More than meets the eye.</h2><p>Places within places. Walks between stops. A next chapter taking shape.</p></div><div class="layer-sheets"><article class="layer-sheet sheet-places"><span class="layer-number">01 / PLACES</span><h3>${esc(shortName(p))}</h3><p>${descendants(p.id,places).length} places & amenities to explore</p><div class="sheet-links">${quickChips(p)}</div><button class="sheet-action" data-open="${p.id}">Open this place ↗</button></article><article class="layer-sheet sheet-walks"><span class="layer-number">02 / WALKS</span><h3>${esc(r.name)}</h3>${routeSvg(r)}<button class="sheet-action" data-route="${r.id}">${r.miles} mi · See the CAB route ↗</button></article><article class="layer-sheet sheet-future"><span class="layer-number">03 / COMING NEXT</span><h3>A neighborhood growing.</h3><p>School, library, parks & future village places.</p><div class="sheet-links">${futureGroups(places).filter(p=>p.village===byId.get(selected()).village).slice(0,2).map(p=>`<button data-open="${p.id}">${esc(p.name)} ↗</button>`).join('')}</div><button class="sheet-action" data-lens="future">Explore all ${futureGroups(places).length} plans ↗</button></article></div>`;
  }
  function render() {
    $('#mobile-lens').value=lens;$('#mobile-village').value=village;
    toolbar.querySelectorAll('[data-lens]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.lens===lens)));
    toolbar.querySelectorAll('[data-village]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.village===village)));
    stage.dataset.lens=lens;stage.dataset.village=village; renderMarkers(); renderCard(byId.get(selected())); renderDiscovery(); renderSheets();
    $('#place-note').hidden=unfolded;
  }
  toolbar.addEventListener('click',e=>{const b=e.target.closest('button');if(b?.id==='unfold-map'){unfolded=!unfolded;render();}});
  $('#mobile-lens').addEventListener('change',e=>chooseLens(e.target.value));
  $('#mobile-village').addEventListener('change',e=>chooseVillage(e.target.value));
  document.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.lens)chooseLens(b.dataset.lens);
    if(b.dataset.village){const fromMap=b.classList.contains('village-label');chooseVillage(b.dataset.village);if(fromMap)toolbar.querySelector(`[data-village="${b.dataset.village}"]`)?.focus({preventScroll:true});}
    if(b.dataset.open){unfolded=false;renderSheets();}
  });
  return { render, reveal(id) { unfolded=false;const p=byId.get(id);if(p&&!rootsInView().some(x=>x.id===p.id)){lens='all';village='all';}if(lens==='walks'||lens==='future')lens='all'; }, state:()=>({lens,village,unfolded}) };
}

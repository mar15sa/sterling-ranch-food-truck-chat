/* Separate staging preview. Shared catalog and the current Atlas are read-only. */
(() => {
  'use strict';
  const C = window.AtlasCore;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state = {places:[],byId:new Map(),notes:{},centerGroups:[],geo:null,trails:null,mode:'location',selected:'sterling-center',route:'prospect-loop',category:'all',query:'',opening:0,ranch:null,ranchPromise:null,ranchFilter:'all',unfolded:false};
  const dialog = $('#directory-dialog');
  if(['127.0.0.1','localhost','[::1]'].includes(location.hostname)){$('.preview-dot').textContent='Local preview';document.title=document.title.replace('Staging preview','Local preview');}
  document.querySelectorAll('.view-nav button, #search-launch').forEach(b=>{b.disabled=true;});
  const aliases = {'living-dream':'Living the Dream','ranch-patio':'Patio & fire pit','ranch-playground':'Log playground','food-trucks':'Food trucks','uchealth':'UCHealth Medical Center','info-center':'Info Center','cab-office':'CAB Offices'};
  const sublabels = {'atlas-coffee':'Coffee','salta':'Wine & cocktails','living-dream':'Sterling Ranch taproom','agora':'Grab & go','ranch-patio':'Outside Ranch Social','ranch-playground':'Outside Ranch Social','food-trucks':'See the daily lineup'};
  const iconPaths = {
    coffee:'M4 5h14v9a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z M18 7h2a3 3 0 0 1 0 6h-2 M3 22h18 M4 9h14',
    wine:'M8 3h8l2 7a6 6 0 0 1-12 0z M6 9h12 M12 16v8 M8 24h8',
    beer:'M6 4q6-3 12 0l2 16q-8 5-16 0z M6 4q6 4 12 0 M5 9q7 3 14 0 M4 19q8 3 16 0 M9 7l-1 14 M15 7l1 14',
    bag:'M5 8h14l2 16H3z M8 10V6a4 4 0 0 1 8 0v4',
    fire:'M13 2c2 5-2 6 1 10 1-2 3-3 4-5 8 10 0 18-6 17-8 0-11-8-6-14 0 4 2 5 3 6-1-7 4-9 4-14z',
    play:'M3 24V10l7-6 7 6v14 M1 10h18 M7 24V12h6v12 M17 12h4v7l4 5 M17 17h4 M10 4V1',
    tree:'M12 2 4 12h4l-6 7h8v6h4v-6h8l-6-7h4z',
    building:'M4 25V8l8-5 8 5v17 M2 25h20 M8 10h1 M15 10h1 M8 15h1 M15 15h1 M10 25v-6h4v6',
    pool:'M2 18q3-3 6 0t6 0t6 0 M2 23q3-3 6 0t6 0t6 0 M7 15V4a2 2 0 0 1 4 0 M15 15V4a2 2 0 0 1 4 0 M7 8h8 M7 12h8',
    court:'M2 3h22v22H2z M2 14h22 M13 3v22 M6 3v22 M20 3v22',
    walk:'M14 4a2 2 0 1 0 0-.1 M8 12l4-5 4 5 5 2 M12 7l-2 9-5 8 M10 16l6 2 2 7',
    truck:'M2 8h14v13H2z M16 12h5l4 5v4h-9 M5 24a2 2 0 1 0 0-4 2 2 0 0 0 0 4 M21 24a2 2 0 1 0 0-4 2 2 0 0 0 0 4 M16 17h9'
  };
  function icon(kind) {return `<svg class="tenant-icon" viewBox="0 0 28 28" aria-hidden="true"><path d="${iconPaths[kind] || iconPaths.building}"/></svg>`;}
  function kind(p) {if(!p)return 'building'; if(p.id==='atlas-coffee')return 'coffee';if(p.id==='salta')return 'wine';if(p.id==='living-dream')return 'beer';if(p.id==='agora')return 'bag';if(p.id==='ranch-patio')return 'fire';if(/playground|play-/.test(p.id))return 'play';if(/pickleball|court/.test(p.id))return 'court';if(/pool|overlook/.test(p.id))return 'pool';if(p.id==='food-trucks')return 'truck';if(p.category==='parks')return 'tree';return 'building';}
  function name(p) {return aliases[p.id] || p.name;}
  function rootOf(p) {const seen=new Set();while(p?.parentId && state.byId.has(p.parentId) && !seen.has(p.id)){seen.add(p.id);p=state.byId.get(p.parentId);}return p;}
  function ancestors(p) {const list=[],seen=new Set();while(p?.parentId && state.byId.has(p.parentId) && !seen.has(p.id)){seen.add(p.id);p=state.byId.get(p.parentId);list.unshift(p);}return list;}
  function children(id) {return state.places.filter(p=>p.parentId===id);}
  function link(a,cls='') {const url=C.safeLink(a.url);return url ? `<a class="${cls}" href="${esc(url)}"${url.startsWith('https:')?' target="_blank" rel="noopener"':''}>${esc(a.label)} <span aria-hidden="true">↗</span></a>`:'';}
  function row(p,subtitle) {return `<button class="tenant-row${p.id===state.selected?' selected':''}" type="button" data-place="${esc(p.id)}">${icon(kind(p))}<span class="tenant-text"><span class="tenant-name">${esc(name(p))}</span><span class="tenant-type">${esc(subtitle || sublabels[p.id] || (p.future ? C.statuses[p.status] : p.tags.slice(0,2).join(' · ') || C.categories[p.category].label))}</span></span><span class="arrow" aria-hidden="true">→</span></button>`;}
  function sources(p) {
    const note=state.notes[p.id], list=note?.sources || p.sources, checked=note?.checkedAt || (note ? state.notesDate : p.checkedAt);
    return `<details class="source-details"><summary>Sources & visit notes · checked ${esc(checked)}</summary><p>${note?'These visitor details were checked against the linked operator pages.':'This listing is from the September 13 staging catalog.'} Open the source for current hours, availability and updates.</p><ul>${list.map(s=>`<li>${link(s)}</li>`).join('')}</ul>${p.locationPrecision==='parent-area'?'<p>The point locates the parent destination. It is not a verified entrance or an exact feature location.</p>':''}${note?.note?`<p>${esc(note.note)}</p>`:''}${(p.unknowns||[]).length?`<p>Still to confirm: ${esc(p.unknowns.join(' ').replace(/\?/g,'.'))}</p>`:''}</details>`;
  }
  function bread(p) {return `<div class="breadcrumb">${ancestors(p).map(a=>`<button type="button" data-place="${esc(a.id)}">${esc(name(a))}</button><span>/</span>`).join('')}<span>${esc(name(p))}</span></div>`;}
  function actions(p) {
    let list=state.notes[p.id]?.actions || (p.action?[p.action]:[]);
    if(!list.length)list=p.sources.slice(0,1).map(a=>({label:'View official details',url:a.url}));
    if(p.id==='food-trucks')list=[{label:'See today’s food truck',url:'/food-truck'},...list.slice(0,1)];
    if(p.id==='ranch-social')list=[{label:'Today’s food truck',url:'/food-truck'},{label:'Events at Ranch Social',url:'https://sterlingranch.com/happenings/events/'}];
    const center=rootOf(p).id==='sterling-center', directions=C.directionsUrl(center?state.byId.get('sterling-center'):p);
    if(directions && list.length<3)list=[...list,{label:center?'Directions to Sterling Center':'Directions to the destination',url:directions}];
    return `<div class="detail-actions">${list.map(a=>link(a)).join('')}</div>`;
  }
  function centerRows(group) {
    return group.placeIds.map(id=>{
      const p=state.byId.get(id), suite=state.notes[id]?.suite;
      const subtitle=suite?'Suite '+suite:subtitles[id] || 'View visit details';
      return row(p,subtitle)+(children(id).length?`<div class="nested-places">${children(id).map(child=>`<button type="button" data-place="${esc(child.id)}">${esc(name(child))}<span aria-hidden="true">↗</span></button>`).join('')}</div>`:'');
    }).join('');
  }
  const subtitles={'ranch-social':'Coffee, drinks, market & outdoor gathering','cab-office':'Community Authority Board contact'};
  function centerDetail(groupId) {
    const p=state.byId.get('sterling-center'), group=state.centerGroups.find(g=>g.id===groupId);
    const groups=group?[group]:state.centerGroups;
    return `${group?'<button class="back-detail" type="button" data-place="sterling-center">← Whole building directory</button>':''}<h2 class="detail-title" tabindex="-1">${esc(group?.label || 'Sterling Center')}</h2><p class="center-address">8155 Piney River Avenue</p><p class="detail-description">${esc(group?'Choose a place for visit details and official links.':state.notes[p.id]?.summary || 'Food, health services and community help, together in one building.')}</p>${groups.map(g=>`<section class="center-group"><h3 class="detail-subtitle">${esc(g.label)}</h3><div class="tenant-list">${centerRows(g)}</div></section>`).join('')}<p class="detail-note">Each business sets its own hours. Suite numbers are shown where the operator publishes them.</p>${actions(p)}${sources(p)}<div class="nearby-building"><span class="eyebrow">Nearby, in a separate building</span><button type="button" data-place="primrose">Primrose School <span>8159 Piney River Avenue ↗</span></button></div>`;
  }
  function renderCenterCards(groupId) {
    const selected=state.byId.get(state.selected), family=ancestors(selected).map(p=>p.id);
    const focused=groupId || (state.selected!=='sterling-center'?state.centerGroups.find(g=>g.placeIds.some(id=>id===state.selected||family.includes(id)))?.id:null);
    $('#center-cards').dataset.focus=focused||'';
    const modelRow=p=>`<button type="button" class="model-place${p.id===state.selected?' active':''}" data-place="${esc(p.id)}">${icon(kind(p))}<span>${esc(name(p))}</span><span aria-hidden="true">↗</span></button>`;
    $('#center-cards').innerHTML=state.centerGroups.map((g,i)=>{
      const members=g.placeIds.flatMap(id=>id==='ranch-social'?children(id):[state.byId.get(id)]);
      return `<article class="center-card${focused===g.id?' is-focused':''}" data-plane="${esc(g.id)}"><button class="plane-title" data-center-group="${esc(g.id)}" type="button" aria-pressed="${focused===g.id}"><span class="card-number">0${i+1}<span aria-hidden="true">↗</span></span><strong>${esc(g.label)}</strong></button>${g.id==='food-gathering'?'<button type="button" class="plane-parent" data-place="ranch-social">Inside & around Ranch Social ↗</button>':''}<div class="model-members">${members.map(p=>modelRow(p)+(p.id==='uchealth'&&(state.selected===p.id||family.includes(p.id))?`<div class="model-subplaces">${children(p.id).map(modelRow).join('')}</div>`:'')).join('')}</div></article>`;
    }).join('');
    if(focused && innerWidth<=480){const card=$('#center-cards .is-focused');if(card)$('#center-cards').scrollTo({left:card.offsetLeft-24,behavior:'instant'});}
  }
  function renderDetail(id,focus=false,groupId=null) {
    const p=state.byId.get(id);if(!p)return;
    state.selected=id;
    const note=state.notes[id];
    const childList=children(id);
    let html=bread(p);
    if(id==='sterling-center'){
      html+=centerDetail(groupId);
    } else if(id==='ranch-social'){
      html+='<h2 class="detail-title" tabindex="-1">One place.<br>More to discover.</h2><div class="tenant-list">';
      html+=['atlas-coffee','salta','living-dream','agora'].map(x=>row(state.byId.get(x))).join('');
      html+='</div><h3 class="detail-subtitle">Outside</h3><div class="tenant-list">';
      html+=['ranch-patio','ranch-playground'].map(x=>row(state.byId.get(x))).join('');
      const shown=new Set(['atlas-coffee','salta','living-dream','agora','ranch-patio','ranch-playground']);
      html+=childList.filter(x=>!shown.has(x.id)).map(x=>row(x)).join('');
      html+='</div>'+actions(p)+sources(p)+'<button type="button" class="coming-link" data-view="future"><span>What’s coming</span>School & library projects →</button>';
    } else {
      html+=`<h2 class="detail-title" tabindex="-1">${esc(name(p))}</h2>`;
      if(p.future)html+=`<span class="status-tag">${esc(C.statuses[p.status])}</span>`;
      html+=`<p class="detail-description">${esc(note?.summary || p.description)}</p>`;
      if(p.access && !/^Confirm facility-specific access/.test(p.access))html+=`<p class="detail-access"><strong>Access</strong>${esc(p.access)}</p>`;
      const highlights=note?.highlights || (p.visitNotes?.length?p.visitNotes:p.facts?.map(f=>f.text).filter(t=>t!==p.description)) || [];
      if(highlights.length)html+=`<ul class="detail-highlights">${highlights.slice(0,4).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;
      if(childList.length)html+=`<h3 class="detail-subtitle">${p.future?'In the plans':'At this place'}</h3><div class="tenant-list">${childList.map(x=>row(x)).join('')}</div>`;
      if(p.address)html+=`<p class="address"><span>${p.future?'Project address':'Find it'}</span>${esc(p.address)}</p>`;
      if(p.future && !p.coordinates)html+='<p class="detail-note">This project’s position is not yet verified in the Atlas. It has no map marker.</p>';
      html+=actions(p)+sources(p);
      if(p.parentId)html+=`<button class="back-detail" data-place="${esc(p.parentId)}" type="button">← Back to ${esc(name(state.byId.get(p.parentId)))}</button>`;
    }
    $('#details').innerHTML=html;
    renderCenterCards(groupId);
    document.querySelectorAll('[data-center-group]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.centerGroup===groupId || (id!=='sterling-center' && state.centerGroups.find(g=>g.placeIds.some(pid=>pid===id || ancestors(p).some(a=>a.id===pid)))?.id===b.dataset.centerGroup))));
    document.querySelectorAll('.scene [data-place]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.place===id || (b.dataset.place==='ranch-social' && p.parentId==='ranch-social' && !['ranch-patio','ranch-playground'].includes(id)))));
    $('#announcement').textContent=p.name+' details selected';
    if(focus) {$('#details h2').focus({preventScroll:true});if(innerWidth<=800)$('#details').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}
  }
  function setMode(mode) {
    state.mode=mode;
    $('#model-view').hidden=mode!=='explore';$('#walks-view').hidden=mode!=='walks';$('#future-view').hidden=mode!=='future';$('#location-view').hidden=mode!=='location';
    document.querySelectorAll('.view-nav [data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===mode)));
    if(mode==='location')ensureNeighborhood().then(r=>r?.resize());
  }
  function openPlace(id,focus=false) {
    const p=state.byId.get(id);if(!p)return;
    if(p.future){setMode('future');renderFuture();}
    else if(rootOf(p).id==='sterling-center'){setMode('explore');setOpening(id==='sterling-center'?0:100);}
    else {setMode('location');focusNeighborhood(p);}
    renderDetail(id,focus);
    if(state.mode==='future')document.querySelectorAll('.future-card').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.place===id || b.dataset.place===p.parentId)));
  }
  function setOpening(value) {
    const n=Math.max(0,Math.min(100,Number(value)||0));state.opening=n;
    const scene=$('#scene');scene.style.setProperty('--open',n/100);scene.style.setProperty('--move',1-n/100);scene.classList.toggle('closed',n<16);
    scene.style.setProperty('--peel',Math.min(1,n/80));scene.style.setProperty('--reveal',Math.max(0,(n-25)/75));scene.style.setProperty('--shell',Math.min(1,n/20));
    $('#opening').value=n;$('#opening').setAttribute('aria-valuetext',n+' percent open');
    $('#scene-toggle').innerHTML=n>50?'Bring together <span aria-hidden="true">↙</span>':'Open Sterling Center <span aria-hidden="true">↗</span>';
    $('#center-cards').inert=n<45;
    $('#building-action').textContent=n>50?'Bring it together':'Open the building';
    $('#scene-step').textContent=n>50?'Pick a place. Find what you need.':'A closer look starts here.';
  }
  function renderFuture() {
    // Keep planned children of existing destinations as well as wholly future roots.
    const groups=C.directoryGroups(state.places,'future','');
    const ranked=['school51','library','prospect-park','burns'];
    groups.sort((a,b)=>(ranked.includes(a.place.id)?ranked.indexOf(a.place.id):99)-(ranked.includes(b.place.id)?ranked.indexOf(b.place.id):99));
    $('#future-list').innerHTML=groups.map(g=>{const p=g.place.future?g.place:g.matches[0];return `<button class="future-card" type="button" data-place="${esc(p.id)}" aria-pressed="${p.id===state.selected}">${icon(kind(p))}<span><strong>${esc(p.name)}</strong><small>${esc(C.statuses[p.status])}${g.place.id!==p.id?' · '+esc(g.place.name):''}</small></span><span class="arrow" aria-hidden="true">↗</span></button>`;}).join('');
  }
  function walkTime(route) {return Math.ceil(route.miles/3*60)+'–'+Math.ceil(route.miles/2*60)+' min';}
  function renderWalk(id=state.route) {
    const route=state.trails.routes.find(r=>r.id===id)||state.trails.routes[0];state.route=route.id;
    $('#walk-choices').innerHTML=state.trails.routes.map(r=>`<button class="walk-choice" data-route="${esc(r.id)}" type="button" aria-pressed="${r.id===route.id}"><strong>${esc(r.name)}</strong><span>${r.miles} mi · ${esc(walkTime(r))}<br>${esc(r.type)}</span></button>`).join('');
    const paths=route.paths.map(p=>p.map((v,i)=>(i?'L':'M')+v.join(' ')).join(' '));
    const vb=route.viewBox,pad=10;
    const first=route.startPoint,last=route.endPoint;
    const annotations=(state.trails.annotationUpdates||[]).map(a=>`<g><rect x="${a.box[0]}" y="${a.box[1]}" width="${a.box[2]}" height="${a.box[3]}" rx="4" fill="#093348"/>${a.lines.map((line,i)=>`<text x="${a.box[0]+a.box[2]/2}" y="${a.box[1]+11+i*11}" fill="white" font-family="Arial,sans-serif" font-size="8" text-anchor="middle">${esc(line)}</text>`).join('')}</g>`).join('');
    $('#trail-canvas').innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb[0]-pad} ${vb[1]-pad} ${vb[2]+pad*2} ${vb[3]+pad*2}" role="img" aria-label="${esc(route.name)} highlighted on the official CAB trail map"><image href="${esc(C.safeLink(state.trails.image))}" width="${state.trails.imageSize[0]}" height="${state.trails.imageSize[1]}"/>${paths.map(d=>`<path d="${d}" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${route.color}" stroke-width="2.5" stroke-linejoin="round"/>`).join('')}<circle cx="${first[0]}" cy="${first[1]}" r="4" fill="${route.color}" stroke="#fff" stroke-width="1.5"/>${route.type==='One way'?`<rect x="${last[0]-3}" y="${last[1]-3}" width="6" height="6" fill="${route.color}" stroke="#fff"/>`:''}</svg>`;
    $('#trail-caption').innerHTML=`<span>Highlighted on CAB’s October 2025 trail map. Route guide, not GPS navigation.</span>${link({label:'Full official trail map',url:state.trails.source.url})}`;
    // Keep the source map's geometry; apply the same dated annotation corrections as the existing Atlas.
    $('#trail-canvas svg image').insertAdjacentHTML('afterend',annotations);
    $('#details').innerHTML=`<div class="breadcrumb"><span>Walking guide / ${esc(route.area)}</span></div><h2 class="detail-title" tabindex="-1">${esc(route.name)}</h2><p class="trail-stat">${route.miles} mi <small>${esc(walkTime(route))} · ${esc(route.type.toLowerCase())}</small></p><p class="detail-description">${esc(route.description)}</p>${route.type==='One way'?`<p class="detail-note">Walking back the same way makes this ${(route.miles*2).toFixed(2)} miles total.</p>`:''}<div class="trail-endpoints"><p><strong>Start</strong><br>${esc(route.start)}</p><p><strong>Finish</strong><br>${esc(route.finish)}</p></div><h3 class="detail-subtitle">Along the way</h3><ol class="trail-steps">${route.steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol><h3 class="detail-subtitle">Places nearby</h3><div class="tenant-list">${route.nearbyPlaceIds.map(id=>state.byId.get(id)).filter(Boolean).map(p=>row(p)).join('')}</div><details class="source-details"><summary>Distance, access & source</summary><p>${esc(state.trails.distanceNote)}</p><p>${esc(route.sourceScope)}</p><p>${esc(route.geometryMethod)}</p><p>Check CAB for trail access and closures before you set out. The background map may contain older project labels.</p>${link({label:'CAB trails & updates',url:state.trails.source.listingUrl})}</details>`;
    $('#announcement').textContent=route.name+' walking guide selected';
  }
  async function ensureNeighborhood() {
    if(state.ranch)return state.ranch;
    if(state.ranchPromise)return state.ranchPromise;
    state.ranchPromise=import('./neighborhood-3d.js?v=20260921-9').then(async module=>{
      const ranch=await module.createNeighborhood({host:$('#ranch-canvas'),labelLayer:$('#ranch-labels'),places:state.places,geo:state.geo,onSelect:id=>openPlace(id,true),onStatus:text=>{$('#ranch-status').textContent=text;}});
      state.ranch=ranch;$('#ranch-loading').hidden=true;ranch.setFilter(state.ranchFilter);ranch.setExploded(state.unfolded);ranch.resize();return ranch;
    }).catch(error=>{
      $('#ranch-loading').hidden=true;$('#ranch-canvas').innerHTML='<div class="ranch-fallback"><h3>The place guide is still here.</h3><p>This device could not open the 3D model.</p><button type="button" data-open-directory>Browse every place ↗</button></div>';
      $('#ranch-status').textContent='Use the directory, walks and project views to explore.';console.error(error);return null;
    });
    return state.ranchPromise;
  }
  function setRanchFilter(filter) {
    state.ranchFilter=filter;document.querySelectorAll('[data-ranch-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.ranchFilter===filter)));
    ensureNeighborhood().then(r=>r?.setFilter(filter));renderNeighborhoodIntro(filter);
  }
  function resetNeighborhood(){
    state.unfolded=false;$('#ranch-unfold').setAttribute('aria-pressed','false');$('#ranch-unfold span').textContent='Unfold the neighborhood';
    setRanchFilter('all');ensureNeighborhood().then(r=>r?.reset());
  }
  function focusNeighborhood(place) {
    state.ranchFilter='all';document.querySelectorAll('[data-ranch-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.ranchFilter==='all')));
    ensureNeighborhood().then(r=>{if(r){r.setFilter('all');if(place.coordinates)r.focusPlace(rootOf(place).id);}});
  }
  function renderNeighborhoodIntro(filter=state.ranchFilter) {
    let places;
    if(filter==='future')places=C.directoryGroups(state.places,'future','').map(g=>g.place.future?g.place:g.matches[0]);
    else places=state.places.filter(p=>!p.parentId&&!p.future&&(filter==='all'||(filter==='outside'?p.category==='parks':p.category!=='parks')));
    const ranked=['sterling-center','overlook','burns','mccormick','prospect-park','providence-park','willow-creek'];
    places.sort((a,b)=>(ranked.includes(a.id)?ranked.indexOf(a.id):99)-(ranked.includes(b.id)?ranked.indexOf(b.id):99));
    const lead=places.slice(0,7),rest=places.slice(7);
    const placeRow=p=>row(p,p.future?C.statuses[p.status]:!p.coordinates?'Details available · position not mapped':p.id==='sterling-center'?'Open the building & its full directory':(children(p.id).length?children(p.id).length+' places & features to discover':p.village));
    $('#details').innerHTML='<div class="breadcrumb">The neighborhood</div><h2 class="detail-title" tabindex="-1">'+(filter==='future'?'The next chapter.':'Find a place.<br>See what’s there.')+'</h2><p class="detail-description">'+(filter==='future'?'Located plans lift above their reference area. Projects without a verified position stay in this list.':'Turn the model, choose a destination, and discover the places and amenities that belong to it.')+'</p><div class="tenant-list">'+lead.map(placeRow).join('')+'</div>'+(rest.length?'<details class="more-neighborhood"><summary>'+rest.length+' more places</summary><div class="tenant-list">'+rest.map(placeRow).join('')+'</div></details>':'')+'<p class="detail-note">Locations mark properties or approximate park areas. Use each place’s source for access and current details.</p>';
    $('#announcement').textContent=(filter==='future'?'Future projects':'Neighborhood places')+' selected';
  }
  function renderDirectory() {
    const groups=C.directoryGroups(state.places,state.category,state.query.replace(/pickle\s+ball/gi,'pickleball'));
    const count=groups.reduce((a,g)=>a+g.matches.length,0);
    $('#result-count').textContent=`${count} matching ${count===1?'listing':'listings'} in ${groups.length} ${groups.length===1?'destination':'destinations'}`;
    $('#category-choices').innerHTML=[['all','Everything'],...Object.entries(C.categories).map(([k,v])=>[k,v.label])].map(([id,label])=>`<button type="button" data-category="${id}" aria-pressed="${state.category===id}">${esc(label)}</button>`).join('');
    $('#directory-results').innerHTML=groups.length?groups.map(g=>{const isSearching=state.query.trim()||state.category!=='all',matches=isSearching?g.matches.filter(p=>p.id!==g.place.id):[];return `<section class="result-group"><button class="result-parent" type="button" data-place="${esc(g.place.id)}"><span>${esc(g.place.name)}</span><small>${esc(g.place.village||C.categories[g.place.category].label)}</small></button>${matches.map(p=>`<button class="result-child" data-place="${esc(p.id)}" type="button"><span>${esc(p.name)}</span><small>${esc(p.future?'Planned':'View details')} →</small></button>`).join('')}${!isSearching && g.children.length?`<button class="result-child" data-place="${esc(g.place.id)}" type="button"><span>${g.children.length} places & features inside</span><span>→</span></button>`:''}</section>`;}).join(''):'<p class="empty-results">No places matched that search.</p><p class="detail-note">Try a shorter name or choose Everything.</p>';
  }
  function openDirectory(query='') {state.query=query;state.category='all';$('#find-place').value=query;renderDirectory();dialog.showModal();$('#find-place').focus();}
  function renderDiscovery() {
    const picks=[['burns','court','Pickleball & more'],['mccormick','play','Playground & gathering'],['overlook','pool','Pool & recreation'],['prospect-park','tree','A walk around the park']];
    $('#discovery-links').innerHTML=picks.filter(([id])=>state.byId.has(id)).map(([id,k,sub])=>`<button type="button" data-place="${id}">${icon(k)}<strong>${esc(state.byId.get(id).name)}</strong><small>${esc(sub)}</small><span aria-hidden="true">↗</span></button>`).join('');
  }
  document.addEventListener('click',e=>{
    if(e.target.closest('[data-open-directory]')){openDirectory();return;}
    const filter=e.target.closest('[data-ranch-filter]');if(filter){setRanchFilter(filter.dataset.ranchFilter);return;}
    const centerGroup=e.target.closest('[data-center-group]');if(centerGroup){setMode('explore');setOpening(100);renderDetail('sterling-center',true,centerGroup.dataset.centerGroup);return;}
    const place=e.target.closest('[data-place]');if(place){const wasDialog=dialog.open;if(wasDialog)dialog.close();openPlace(place.dataset.place,true);return;}
    const view=e.target.closest('[data-view]');if(view){const mode=view.dataset.view;setMode(mode);if(mode==='explore'){renderDetail('sterling-center');setOpening(0);}if(mode==='location')resetNeighborhood();if(mode==='walks')renderWalk();if(mode==='future'){renderFuture();renderDetail('school51');renderFuture();}return;}
    const route=e.target.closest('[data-route]');if(route){renderWalk(route.dataset.route);return;}
    const category=e.target.closest('[data-category]');if(category){state.category=category.dataset.category;renderDirectory();document.querySelector(`[data-category="${state.category}"]`)?.focus();return;}
    if(e.target.closest('[data-model-return]')){setMode('explore');setOpening(0);renderDetail('sterling-center');}
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='/'&&!dialog.open && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)){e.preventDefault();openDirectory();}
    if((e.key==='Enter'||e.key===' ')&&e.target.matches('.map-pin')){e.preventDefault();openPlace(e.target.dataset.place,true);}
  });
  $('#search-launch').addEventListener('click',()=>openDirectory());$('#browse-all').addEventListener('click',()=>openDirectory());$('#close-directory').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();dialog.close();}});
  $('#find-place').addEventListener('input',e=>{state.query=e.target.value;renderDirectory();});
  $('#opening').addEventListener('input',e=>setOpening(e.target.value));$('#assemble').addEventListener('click',()=>setOpening(0));$('#explode').addEventListener('click',()=>setOpening(100));$('#scene-toggle').addEventListener('click',()=>setOpening(state.opening>50?0:100));
  $('#reset-scene').addEventListener('click',()=>{setOpening(0);renderDetail('sterling-center');});
  $('#open-building').addEventListener('click',()=>setOpening(state.opening>50?0:100));
  $('#show-location').addEventListener('click',()=>{setMode('location');focusNeighborhood(state.byId.get('sterling-center'));renderDetail('sterling-center');});
  $('#ranch-unfold').addEventListener('click',()=>{state.unfolded=!state.unfolded;$('#ranch-unfold').setAttribute('aria-pressed',String(state.unfolded));$('#ranch-unfold span').textContent=state.unfolded?'Bring the neighborhood together':'Unfold the neighborhood';ensureNeighborhood().then(r=>r?.setExploded(state.unfolded));});
  $('#ranch-left').addEventListener('click',()=>state.ranch?.orbit(-Math.PI/12));$('#ranch-right').addEventListener('click',()=>state.ranch?.orbit(Math.PI/12));
  $('#ranch-in').addEventListener('click',()=>state.ranch?.zoom(.2));$('#ranch-out').addEventListener('click',()=>state.ranch?.zoom(-.2));
  $('#ranch-reset').addEventListener('click',resetNeighborhood);
  function imageFailed(){document.body.classList.add('image-failed');$('.model-caption').textContent='Model art could not load. Place details and the neighborhood are still available.';}
  document.querySelectorAll('.scene img').forEach(img=>{img.addEventListener('error',imageFailed);if(img.complete && !img.naturalWidth)imageFailed();});
  async function json(url){const r=await fetch(url);if(!r.ok)throw Error('Could not load '+url);return r.json();}
  async function start(){
    try{
      const [catalog,geo,trails,notes,directory]=await Promise.all([json('../places.json'),json('../geography.json'),json('../trails.json'),json('./visitor-notes.json'),json('./sterling-center-directory.json?v=20260921-3')]);
      C.validateTrails(trails);const merged=window.OpenedDirectory.merge(catalog,directory,notes);state.places=merged.places;state.byId=new Map(state.places.map(p=>[p.id,p]));state.geo=geo;state.trails=trails;state.notes=merged.notes;state.notesDate=notes.checkedAt;state.centerGroups=merged.groups;
      renderCenterCards();renderNeighborhoodIntro();renderDiscovery();setOpening(0);$('#loading').hidden=true;$('#workspace').hidden=false;setMode('location');
      document.querySelectorAll('.view-nav button, #search-launch').forEach(b=>{b.disabled=false;});
      const id=new URLSearchParams(location.search).get('place');if(id && state.byId.has(id))openPlace(id);
    }catch(error){$('#loading').classList.add('error');$('#loading').innerHTML='The preview could not load its place information. Please reload the page. <a href="/atlas">Open the current Atlas</a>';console.error(error);}
  }
  start();
})();

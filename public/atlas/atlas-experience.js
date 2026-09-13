(function(){
  'use strict';
  const C=window.AtlasCore, $=s=>document.querySelector(s);
  let places=[],config=null,includeFuture=false,selected=null,worldParent=null,opener=null;
  const explorer=$('#places-explorer'),column=$('.map-column'),mapStage=$('#map-stage'),footer=$('.map-footer');
  function add(parent,tag,attrs={},text){const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;parent.append(n);return n;}
  function open(id,source){if(!selected&&source)opener=source;window.dispatchEvent(new CustomEvent('atlas:open-place',{detail:{id}}));}
  function artKind(p){return config?.featured.find(f=>f.id===p.id)?.art||(p.future?'future':['businesses','services'].includes(p.category)?'center':'park');}
  function art(p){const node=window.AtlasArt.landmark(artKind(p));node.setAttribute('aria-hidden','true');node.removeAttribute('aria-label');return node;}
  function excerpt(p){return p.visitNotes?.[0]||p.description;}
  const layers=add(column,'div',{class:'time-layer'});column.insertBefore(layers,mapStage);
  add(layers,'span',{class:'time-layer-label'},'THE NEIGHBORHOOD');
  const switches=add(layers,'div',{'aria-label':'Future map layer',class:'time-layer-buttons'});
  const now=add(switches,'button',{type:'button','aria-pressed':'true'},'Now');
  const next=add(switches,'button',{type:'button','aria-pressed':'false'},'With what’s coming');
  now.addEventListener('click',()=>setFuture(false));next.addEventListener('click',()=>setFuture(true));
  const shelf=add(column,'section',{class:'landmark-shelf','aria-label':'Places to open'});column.insertBefore(shelf,mapStage);
  const projects=add(column,'section',{class:'future-projects','aria-label':'Featured future projects',hidden:''});column.insertBefore(projects,mapStage);
  const world=add(column,'section',{class:'place-world','aria-label':'Inside this place',hidden:''});column.insertBefore(world,mapStage);
  const worldTop=add(world,'div',{class:'world-top'});
  const back=add(worldTop,'button',{type:'button',class:'world-back'},'← Neighborhood');
  back.addEventListener('click',()=>{const target=opener;window.dispatchEvent(new Event('atlas:close-world'));if(target?.isConnected&&target.getClientRects().length)target.focus();});
  const crumbs=add(worldTop,'nav',{'aria-label':'Place hierarchy',class:'world-crumbs'});
  const title=add(world,'h2',{id:'world-title',tabindex:'-1'});
  const caption=add(world,'p',{class:'world-caption'});
  const board=add(world,'div',{class:'place-diorama'});
  const worldNote=add(world,'p',{class:'world-note'},'Illustrations show what belongs here, not exact positions. Select an amenity for visit details.');
  function setFuture(value){
    includeFuture=value;now.setAttribute('aria-pressed',String(!value));next.setAttribute('aria-pressed',String(value));explorer.classList.toggle('with-future',value);
    window.dispatchEvent(new CustomEvent('atlas:set-future',{detail:{includeFuture:value}}));
    let p=places.find(item=>item.id===selected);
    if(!value&&p?.future){const seen=new Set();while(p?.future&&p.parentId&&!seen.has(p.id)){seen.add(p.id);p=places.find(item=>item.id===p.parentId);}if(p&&!p.future)open(p.id);else window.dispatchEvent(new Event('atlas:close-world'));}
    else if(selected)renderWorld(selected,false);
    renderProjects();
  }
  function renderShelf(){
    if(!places.length||!config||!window.AtlasArt?.landmark)return;shelf.replaceChildren();
    for(const feature of config.featured){const p=places.find(item=>item.id===feature.id);if(!p)continue;
      const button=add(shelf,'button',{type:'button',class:'landmark-preview'});button.append(art(p));
      const copy=add(button,'span',{});add(copy,'small',{},'OPEN A PLACE');add(copy,'strong',{},p.name);add(copy,'span',{},'See what’s inside ↗');button.addEventListener('click',()=>open(p.id,button));
    }
  }
  function renderProjects(){
    projects.replaceChildren();projects.hidden=!includeFuture||!config||Boolean(selected);if(projects.hidden)return;
    const head=add(projects,'div',{class:'future-heading'});add(head,'strong',{},'A look ahead');add(head,'span',{},'Existing places stay on the map. Planned additions are marked in mauve.');
    const cards=add(projects,'div',{class:'future-cards'});
    for(const id of config.futureHighlights){const p=places.find(item=>item.id===id);if(!p)continue;
      const b=add(cards,'button',{type:'button',class:'future-project'});add(b,'small',{},C.statuses[p.status]);add(b,'strong',{},p.name);
      const facts=[...(p.facts||[]).map(f=>f.text),...(p.visitNotes||[]),p.description];const milestone=facts.find(text=>/202[6-9]/.test(text))||facts.find(text=>/target|construction|later phases/i.test(text));add(b,'span',{},milestone||p.description);
      add(b,'small',{},p.coordinates?'Shown at the existing park':'Project card · location not pinned');b.addEventListener('click',()=>open(id,b));
    }
  }
  function renderWorld(id,moveFocus=true){
    if(!config||!places.length||!window.AtlasArt?.landmark)return;const family=C.placeFamily(places,id);if(!family)return;
    selected=id;const changed=worldParent!==family.parent.id;worldParent=family.parent.id;
    explorer.classList.add('has-place-world');world.hidden=false;mapStage.hidden=true;footer.hidden=true;shelf.hidden=true;projects.hidden=true;
    title.textContent=family.parent.name;caption.textContent=family.parent.future?C.statuses[family.parent.status]+' · '+family.parent.village:family.parent.village+' · Open a part of the place to see more.';
    crumbs.replaceChildren();for(const p of family.ancestors){const b=add(crumbs,'button',{type:'button'},p.name+' ›');b.addEventListener('click',()=>open(p.id,b));}
    board.replaceChildren();board.classList.toggle('world-arrive',changed);
    const center=add(board,'div',{class:'world-landmark'});center.append(art(family.parent));
    const parentButton=add(center,'button',{type:'button','aria-pressed':String(id===family.parent.id)},'About '+family.parent.name);parentButton.addEventListener('click',()=>open(family.parent.id,parentButton));
    const children=C.mapPlaces(family.children,includeFuture);
    const parts=add(board,'div',{class:'world-parts'});
    children.forEach((p,index)=>{
      const b=add(parts,'button',{type:'button',class:'world-part'+(p.future?' is-future':''),'aria-pressed':String(p.id===id),style:'--part-index:'+index});
      const count=places.filter(item=>item.parentId===p.id).length;
      add(b,'small',{},p.future?'WHAT’S COMING':count?count+' PLACES INSIDE':C.categories[p.category].label.toUpperCase());
      add(b,'strong',{},p.name);add(b,'span',{class:'part-status'},C.statuses[p.status]);
      const tags=(p.tags||[]).slice(0,2).join(' · ');if(tags)add(b,'span',{class:'part-preview'},tags);
      add(b,'span',{class:'part-arrow','aria-hidden':'true'},'↗');b.addEventListener('click',()=>open(p.id,b));
    });
    const futureCount=family.children.filter(p=>p.future).length;
    if(!includeFuture&&futureCount){const future=add(parts,'button',{type:'button',class:'world-future-toggle'},'＋ '+futureCount+' planned '+(futureCount===1?'addition':'additions'));future.addEventListener('click',()=>setFuture(true));}
    if(!children.length&&!futureCount){const intro=add(parts,'div',{class:'world-project-summary'});add(intro,'strong',{},C.statuses[family.parent.status]);add(intro,'p',{},excerpt(family.parent));}
    worldNote.textContent=family.parent.future?'Project illustration · target dates and plans can change. Read the current project details below.':'Illustrations show what belongs here, not exact positions. Select an amenity for visit details.';
    const detail=$('#place-detail');detail.classList.toggle('world-child-detail',id!==family.parent.id);
    if(moveFocus){if(id===family.parent.id)title.focus({preventScroll:true});else $('#detail-title')?.focus({preventScroll:true});
      if(matchMedia('(max-width: 1299px)').matches)(id===family.parent.id?world:detail).scrollIntoView({block:'start',behavior:'instant'});
    }
  }
  function closeWorld(){selected=null;worldParent=null;opener=null;explorer.classList.remove('has-place-world');world.hidden=true;mapStage.hidden=false;footer.hidden=false;shelf.hidden=false;renderProjects();}
  function decorateMap(){
    if(!config||!places.length||!window.AtlasArt)return;
    for(const pin of document.querySelectorAll('#map-pins [data-pin]')){
      pin.querySelector('.map-landmark')?.remove();
      const p=places.find(item=>item.id===pin.dataset.pin);if(!p)continue;
      const family=C.placeFamily(places,p.id),root=family?.ancestors[0]||family?.parent;
      const featured=config.featured.find(item=>item.id===root?.id);if(!featured)continue;
      const circle=pin.querySelector('.pin-circle'),unit=Number(circle.getAttribute('r'))/13;
      const drawing=art(root);drawing.setAttribute('x',Number(circle.getAttribute('cx'))-48*unit);drawing.setAttribute('y',Number(circle.getAttribute('cy'))-58*unit);drawing.setAttribute('width',96*unit);drawing.setAttribute('height',58*unit);drawing.classList.add('map-landmark');pin.insertBefore(drawing,circle);
      pin.classList.add('has-landmark');
    }
  }
  window.addEventListener('atlas:catalog-ready',e=>{places=e.detail.places;renderShelf();renderProjects();decorateMap();});
  window.addEventListener('atlas:place-selected',e=>renderWorld(e.detail.id));
  window.addEventListener('atlas:place-closed',closeWorld);
  window.addEventListener('atlas:map-rendered',decorateMap);
  window.addEventListener('atlas:future-changed',e=>setFuture(e.detail.includeFuture));
  fetch('/atlas/experience.json',{cache:'no-store',signal:AbortSignal.timeout(15000)}).then(r=>{if(!r.ok)throw Error('Unavailable');return r.json();}).then(data=>{
    if(!window.AtlasArt?.landmark||!Array.isArray(data.featured)||!data.featured.every(p=>p&&typeof p.id==='string'&&['playground','courts','center','park','future'].includes(p.art))||!Array.isArray(data.futureHighlights)||!data.futureHighlights.every(id=>typeof id==='string'))throw Error('Invalid display configuration');config=data;window.dispatchEvent(new Event('atlas:experience-ready'));
  }).catch(()=>{layers.hidden=true;shelf.hidden=true;projects.hidden=true;});
})();

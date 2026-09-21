(function(){
  'use strict';
  const $=s=>document.querySelector(s), C=window.AtlasCore, NS='http://www.w3.org/2000/svg';
  const state={mode:'layers',layer:'all',separation:80,selected:'burns',places:[],geo:null};
  const modes={
    layers:{eyebrow:'01 / EXPLODED ATLAS',title:'The neighborhood, opened up.',intent:'See how parks, everyday places and future additions fit together. Separate a layer to focus on it.',caption:'Aligned map layers · vertical spacing is for exploration'},
    guide:{eyebrow:'02 / NEIGHBORHOOD GUIDE',title:'Find your kind of afternoon.',intent:'Read the neighborhood at a glance. Start with a park or gathering place, then see the amenities inside.',caption:'Geographic overview · numbered places share the same directory'},
    lens:{eyebrow:'03 / FOCUS LENS',title:'Keep the big picture. Get closer.',intent:'Inspect the area around a place while keeping the wider neighborhood in view. Try Sterling Center or Prospect.',caption:'Whole neighborhood + a 3× area detail · approximate locations'}
  };
  const shortNames={'burns':'Burns Park','prospect-park':'Prospect Park','horsebrush':'Horsebrush','mccormick':'McCormick','pat-gallagher':'Pat Gallagher','pioneer':'Pioneer','providence-park':'The Lawn','yard-27':'Yard 27','high-top':'High Top','ascent-pavilion':'Gathering Green','zippity':'Zippity','willow-creek':'Willow Creek','overlook':'The Overlook','sterling-center':'Sterling Center','john-adams':'John Adams','primrose':'Primrose','broadstone':'Broadstone','prose':'Prose'};
  let paths={},roots=[],placesById=new Map();
  function html(tag,attrs={},text){const e=document.createElement(tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;return e;}
  function svg(tag,attrs={},text){const e=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;return e;}
  function point(coords){const b=state.geo.bounds,scale=660/(b.north-b.south);return [(coords[0]-(b.east+b.west)/2)*Math.cos((b.north+b.south)*Math.PI/360)*scale,((b.north+b.south)/2-coords[1])*scale];}
  function rootPlace(p){const seen=new Set();while(p?.parentId&&placesById.has(p.parentId)&&!seen.has(p.id)){seen.add(p.id);p=placesById.get(p.parentId);}return p;}
  function category(p){return p.future?'future':p.category==='parks'?'parks':'everyday';}
  function visible(p){return state.layer==='all'||category(p)===state.layer;}
  function prepare(){
    const closed=new Set(['park','water','building','pitch','pool']);
    for(const feature of state.geo.features){const d=feature.coordinates.map((c,i)=>{const [x,y]=point(c);return (i?'L':'M')+x.toFixed(1)+' '+y.toFixed(1);}).join(' ')+(closed.has(feature.kind)?'Z':'');
      const kind=feature.kind;if(!paths[kind])paths[kind]=[];paths[kind].push({d,major:feature.major});}
    placesById=new Map(state.places.map(p=>[p.id,p]));roots=state.places.filter(p=>!p.parentId&&p.coordinates&&!p.future);
  }
  function defs(target,prefix){
    const d=svg('defs');const clip=svg('clipPath',{id:prefix+'-clip'});clip.append(svg('rect',{x:-360,y:-330,width:720,height:660}));d.append(clip);
    for(const[kind,features]of Object.entries(paths)){const group=svg('g',{id:prefix+'-'+kind,class:'map-geo','clip-path':'url(#'+prefix+'-clip)'});for(const f of features)group.append(svg('path',{d:f.d,class:kind+(f.major?' major':'')}));d.append(group);}
    target.append(d);return d;
  }
  function geometry(parent,prefix,kinds,attrs={}){const g=svg('g',attrs);for(const kind of kinds)g.append(svg('use',{href:'#'+prefix+'-'+kind}));parent.append(g);return g;}
  function planeCoords(p,z=0){const[x,y]=point(p.coordinates);return [500+.8*x-.4*y,565+.15*x+.36*y-z];}
  function flatCoords(p){const[x,y]=point(p.coordinates);return [500+x,410+y*.88];}
  function marker(parent,p,x,y,index,{labels=false,mini=false}={}){
    const current=placesById.get(state.selected);
    const selected=p.future?p.id===current?.id:!current?.future&&rootPlace(current)?.id===p.id;
    const g=svg('g',{class:'map-marker '+category(p),transform:'translate('+x.toFixed(1)+' '+y.toFixed(1)+')','data-place':p.id});
    if(!mini){g.setAttribute('role','button');g.setAttribute('tabindex','0');g.setAttribute('aria-label',p.name+(p.future?', planned addition at existing facility':''));g.setAttribute('aria-pressed',String(selected));}
    g.append(svg('circle',{r:20,class:'point-halo'}),svg('circle',{r:15,class:'focus-ring'}),svg('circle',{r:mini?7:11,class:'point-dot'}));
    if(!mini){g.append(svg('circle',{r:21,fill:'transparent'}));g.append(svg('text',{y:3.4,'text-anchor':'middle',class:'marker-number'},String(index+1).padStart(2,'0')));
      if(labels){const left=x>710;g.append(svg('text',{x:left?-19:19,y:4,'text-anchor':left?'end':'start'},shortNames[p.id]||p.name.replace(': later phases',' · next')));}
      g.addEventListener('click',()=>select(p.id,true));g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(p.id,true);}});
    }
    parent.append(g);return g;
  }
  function layerOpacity(key){return state.layer==='all'||state.layer===key||key==='ground'?1:.16;}
  function makeScene(mode,mini=false){
    const prefix=(mini?'mini-':'scene-')+mode, target=svg('svg',{viewBox:'0 0 1000 780',role:mini?'presentation':'group','aria-label':mini?'':modes[mode].title});
    if(!mini)target.append(svg('title',{},modes[mode].title));defs(target,prefix);
    if(mode==='layers')drawLayers(target,prefix,mini);else if(mode==='guide')drawGuide(target,prefix,mini);else drawLens(target,prefix,mini);
    return target;
  }
  function drawLayers(target,prefix,mini){
    const gap=(mini?80:state.separation)*1.05, polygon='80,629 656,737 920,501 344,393';
    const shadow=svg('path',{d:'M80 637L656 745L920 509L920 501L656 737L80 629Z',fill:'#132c27',opacity:'.8'});target.append(shadow);
    for(const[x,y]of [[80,629],[656,737],[920,501],[344,393]])target.append(svg('path',{class:'guide-wire','data-wire':x+','+y,d:'M'+x+' '+y+'V'+(y-gap*3)}));
    const layers=[['ground',['water','stream','road','building']],['parks',['park','trail','pitch','pool']],['everyday',['building']],['future',[]]];
    layers.forEach(([key,kinds],i)=>{
      const plane=svg('g',{class:'map-plane','data-plane':i,transform:'translate(0 '+(-i*gap)+')',opacity:mini?1:layerOpacity(key)});
      plane.append(svg('polygon',{points:polygon,class:i?'plane-outline':'ground-plate',...(key==='parks'?{style:'fill:#64825a;fill-opacity:.24'}:key==='everyday'?{style:'fill:#6e989c;fill-opacity:.1'}:key==='future'?{style:'fill:#a58caf;fill-opacity:.1','stroke-dasharray':'5 3'}:{})}));
      geometry(plane,prefix,kinds,{transform:'matrix(.8 .15 -.4 .36 500 565)'});
      if(i>0&&(mini||state.layer==='all'||state.layer===key)){const ps=key==='future'?state.places.filter(p=>p.future&&p.coordinates):roots.filter(p=>category(p)===key);
        ps.forEach((p,n)=>{const[x,y]=planeCoords(p);const wantLabel=!mini&&(['burns','prospect-park','sterling-center','overlook'].includes(p.id)||selectedRootId()===p.id);const m=marker(plane,p,x,y,roots.findIndex(r=>r.id===rootPlace(p)?.id),{labels:wantLabel,mini});if(state.separation<=30)m.querySelector('text:not(.marker-number)')?.setAttribute('opacity','0');});}
      if(!mini){plane.append(svg('text',{x:58,y:659,class:'plane-number','data-plane-label':i,opacity:state.separation>25||i===0?1:0},'0'+i),svg('text',{x:90,y:660,class:'plane-label','data-plane-label':i,opacity:state.separation>25||i===0?1:0},['GROUND / STREETS & HOMES','PARKS & OUTDOORS','EVERYDAY PLACES','WHAT’S COMING'][i]));}
      target.append(plane);
    });
    if(!mini)target.append(svg('text',{x:927,y:739,'text-anchor':'end',class:'map-caption'},'N ↗  /  LAYERS STAY GEOGRAPHICALLY ALIGNED'));
  }
  function selectedRootId(){return rootPlace(placesById.get(state.selected))?.id;}
  function drawGuide(target,prefix,mini){
    target.append(svg('rect',{x:93,y:68,width:814,height:675,fill:'none',stroke:'#6c815540','stroke-width':1}));
    geometry(target,prefix,['water','park','stream','road','building','pitch','pool','trail'],{transform:'matrix(1 0 0 .88 500 410)'});
    if(!mini){for(const l of state.geo.labels.filter(l=>l.kind==='village')){const [x,y]=flatCoords(l);target.append(svg('text',{x,y:y+24,'text-anchor':'middle',class:'village-label'},l.name));}
      target.append(svg('text',{x:112,y:96,class:'map-caption'},'STERLING RANCH / COLORADO'),svg('text',{x:878,y:96,'text-anchor':'end',class:'map-caption'},'N ↑'));
    }
    roots.forEach((p,index)=>{if(!mini&&!visible(p))return;const[x,y]=flatCoords(p);const labels=!mini&&(['burns','prospect-park','overlook','sterling-center','prose'].includes(p.id)||p.id===selectedRootId());marker(target,p,x,y,index,{labels,mini});});
    if(!mini&&state.layer==='future')for(const p of state.places.filter(p=>p.future&&p.coordinates)){const[x,y]=flatCoords(p);marker(target,p,x,y,roots.findIndex(r=>r.id===rootPlace(p)?.id),{labels:true});}
    if(!mini){target.append(svg('path',{d:'M118 716h100m-100 -4v8m100 -8v8',stroke:'#688054','stroke-width':1.4,fill:'none'}),svg('text',{x:118,y:705,class:'map-caption'},'MAP WINDOW · APPROXIMATE POSITIONS'));
    }
  }
  function drawLens(target,prefix,mini){
    const p=placesById.get(mini?'sterling-center':state.selected), fallback=placesById.get('sterling-center'), current=p?.coordinates?p:(rootPlace(p)?.coordinates?rootPlace(p):fallback);
    if(!mini&&!p?.coordinates&&!rootPlace(p)?.coordinates){
      geometry(target,prefix,['park','water','stream','road','building','trail'],{transform:'matrix(1 0 0 .88 500 410)',opacity:'.45'});
      target.append(svg('text',{x:500,y:380,'text-anchor':'middle',class:'lens-title'},'Location still to be confirmed'),svg('text',{x:500,y:416,'text-anchor':'middle',class:'lens-caption'},'This place stays in the directory until its map position is sourced.'));
      return;
    }
    const [cx,cy]=point(current.coordinates), lx=510,ly=407,r=232;
    geometry(target,prefix,['park','water','stream','road','building','trail'],{transform:'matrix(1 0 0 .88 500 410)',opacity:'.33'});
    const[originX,originY]=flatCoords(current);target.append(svg('circle',{cx:originX,cy:originY,r:9,fill:'none',stroke:'#dfad81','stroke-width':1.5}),svg('path',{d:'M'+originX+' '+originY+'L'+(lx-r)+' '+ly,class:'guide-wire'}));
    if(!mini)roots.forEach((q,i)=>{if(!visible(q))return;const[x,y]=flatCoords(q);if(Math.hypot(x-lx,y-ly)>r+25)marker(target,q,x,y,i,{labels:false});});
    const d=target.querySelector('defs'),clip=svg('clipPath',{id:prefix+'-lens'});clip.append(svg('circle',{cx:lx,cy:ly,r}));d.append(clip);
    target.append(svg('circle',{cx:lx,cy:ly,r:r+9,fill:'#132f35',stroke:'#71979133','stroke-width':14}));
    const lens=svg('g',{'clip-path':'url(#'+prefix+'-lens)'});lens.append(svg('rect',{x:lx-r,y:ly-r,width:r*2,height:r*2,fill:'#193940'}));
    geometry(lens,prefix,['park','water','stream','road','building','trail','pitch','pool'],{transform:'translate('+lx+' '+ly+') scale(3) translate('+(-cx)+' '+(-cy)+')'});
    roots.forEach((q,i)=>{if(!visible(q))return;const[x,y]=point(q.coordinates),px=lx+(x-cx)*3,py=ly+(y-cy)*3;if(Math.hypot(px-lx,py-ly)<r-32)marker(lens,q,px,py,i,{labels:!mini&&(q.id===current.id||q.id==='sterling-center'),mini});});
    if(p?.future&&p.coordinates)marker(lens,p,lx,ly,roots.findIndex(q=>q.id===rootPlace(p).id),{labels:!mini,mini});target.append(lens);
    target.append(svg('circle',{cx:lx,cy:ly,r,class:'lens-border'}));
    for(const [x,y,dx,dy]of [[lx-r,ly,-14,0],[lx+r,ly,14,0],[lx,ly-r,0,-14],[lx,ly+r,0,14]])target.append(svg('path',{class:'lens-crosshair',d:'M'+x+' '+y+'l'+dx+' '+dy}));
    if(!mini){target.append(svg('text',{x:lx,y:133,'text-anchor':'middle',class:'lens-label'},'AREA DETAIL / 3×'),svg('text',{x:lx,y:688,'text-anchor':'middle',class:'lens-title'},shortNames[current.id]||current.name),svg('text',{x:lx,y:711,'text-anchor':'middle',class:'lens-caption'},p?.coordinates?'Mapped area, not a confirmed entrance':'No confirmed pin for this project; Sterling Center shown for orientation'));
    }
  }
  function updateScene(){const next=makeScene(state.mode);$('#scene').replaceChildren(next);}
  function updateSeparation(){const gap=state.separation*1.05;$('#separation-value').textContent=state.separation+'%';$('#assemble').textContent=state.separation>0?'Bring together':'Explode layers';
    for(const plane of document.querySelectorAll('#scene [data-plane]'))plane.style.transform='translateY('+(-Number(plane.dataset.plane)*gap)+'px)';
    for(const wire of document.querySelectorAll('#scene [data-wire]')){const[x,y]=wire.dataset.wire.split(',').map(Number);wire.setAttribute('d','M'+x+' '+y+'V'+(y-gap*3));}
    for(const label of document.querySelectorAll('#scene [data-plane-label]'))label.setAttribute('opacity',state.separation>25||label.dataset.planeLabel==='0'?1:0);
    for(const label of document.querySelectorAll('#scene .map-marker text:not(.marker-number)'))label.setAttribute('opacity',state.separation>30?1:0);
  }
  function renderPicker(){const el=$('#place-picker'), eligible=state.places.filter(p=>(!p.parentId||p.id===state.selected)&&visible(p));el.replaceChildren();for(const p of eligible)el.append(html('option',{value:p.id},p.name+(p.coordinates?'':' · no pin')));if(!eligible.some(p=>p.id===state.selected)){const p=placesById.get(state.selected);el.append(html('option',{value:p.id},p.name));}el.value=state.selected;}
  function renderCard(){
    const p=placesById.get(state.selected),card=$('#place-card');card.replaceChildren();
    card.append(html('span',{class:'place-status'},p.village+' / '+C.statuses[p.status]),html('h3',{},p.name),html('p',{class:'place-summary'},p.description));
    const tags=html('ul',{class:'place-tags'});for(const tag of p.tags.slice(0,4))tags.append(html('li',{},tag));card.append(tags);
    if(p.access)card.append(html('p',{class:'place-caveat'},p.access));
    const children=state.places.filter(q=>q.parentId===p.id);if(children.length){card.append(html('p',{class:'inside-label'},'INSIDE THIS PLACE'));const group=html('div',{class:'inside-list'});for(const q of children){const button=html('button',{type:'button','data-child':q.id},q.name);button.append(html('span',{'aria-hidden':'true'},'↗'));button.addEventListener('click',()=>select(q.id));group.append(button);}card.append(group);}
    if(p.parentId){const button=html('button',{type:'button',class:'parent-button'},'← '+p.parentName);button.addEventListener('click',()=>select(p.parentId));card.append(button);}
    const source=C.safeLink(p.sources[0]?.url);if(source)card.append(html('a',{class:'source-link',href:source,target:'_blank',rel:'noopener'},'Official place details ↗'));
    const location=!p.coordinates?'Location not pinned.':p.locationPrecision==='facility'?'Source-listed facility location.':p.locationPrecision==='area-reference'?'Marker refers to the existing facility, not a future site boundary.':'Approximate property or park area; entrance not confirmed.';
    card.append(html('p',{class:'place-caveat'},location+' Snapshot checked '+p.checkedAt+'. Check the official source for current access.'));
    $('#unlocated').hidden=state.layer!=='future';const projects=$('#unlocated-items');projects.replaceChildren();for(const q of state.places.filter(q=>q.future&&!q.coordinates&&!q.parentId)){const b=html('button',{type:'button'},q.name+' ↗');b.addEventListener('click',()=>select(q.id));projects.append(b);}
  }
  function select(id,fromMap=false){if(!placesById.has(id))return;state.selected=id;if(!visible(placesById.get(id))){state.layer=category(placesById.get(id));for(const b of document.querySelectorAll('[data-layer]'))b.setAttribute('aria-pressed',String(b.dataset.layer===state.layer));}renderPicker();renderCard();updateScene();if(fromMap){$('#scene').querySelector('[data-place="'+id+'"]')?.focus({preventScroll:true});if(matchMedia('(max-width:850px)').matches)$('#place-picker').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});}}
  function setMode(mode){state.mode=mode;$('#study').className='study mode-'+mode;for(const b of document.querySelectorAll('[data-mode]')){const on=b.dataset.mode===mode;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));}const m=modes[mode];$('#scene-eyebrow').textContent=m.eyebrow;$('#scene-title').textContent=m.title;$('#view-intent').textContent=m.intent;$('#scene-caption').textContent=m.caption;$('#explode-control').hidden=mode!=='layers';$('#flat-control').hidden=mode==='layers';$('#flat-hint').textContent=mode==='lens'?'Choose a place to move the magnifying lens.':'Select a place to see what belongs there.';updateScene();}
  function setLayer(layer){state.layer=layer;for(const b of document.querySelectorAll('[data-layer]'))b.setAttribute('aria-pressed',String(b.dataset.layer===layer));if(!visible(placesById.get(state.selected)))state.selected=layer==='future'?'burns-next':layer==='everyday'?'sterling-center':'burns';renderPicker();renderCard();updateScene();}
  async function init(){try{
    const [g,p]=await Promise.all(['/atlas/geography.json','/atlas/places.json'].map(url=>fetch(url,{signal:AbortSignal.timeout(15000)}).then(r=>{if(!r.ok)throw Error('Map unavailable');return r.json();})));
    C.validateCatalog(p);state.geo=g;state.places=p.places;prepare();
    for(const mode of Object.keys(modes)){const host=$('.mini-'+mode);host.classList.add('scene-column');if(mode!=='layers'){const parent=host.closest('.concept-choice');parent.classList.add('mode-'+mode);}host.append(makeScene(mode,true));}
    document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
    document.querySelectorAll('[data-layer]').forEach(b=>b.addEventListener('click',()=>setLayer(b.dataset.layer)));
    $('#place-picker').addEventListener('change',e=>select(e.target.value));$('#separation').addEventListener('input',e=>{state.separation=Number(e.target.value);updateSeparation();});$('#assemble').addEventListener('click',()=>{state.separation=state.separation?0:80;$('#separation').value=state.separation;updateSeparation();});$('#reset-selection').addEventListener('click',()=>{state.layer='all';setLayer('all');select(state.mode==='lens'?'sterling-center':'burns');});
    renderPicker();renderCard();setMode('layers');
  }catch(error){$('#loading').textContent='The map snapshot could not load. Reload this page to try again.';$('#loading').setAttribute('role','alert');}}
  init();
})();

(function () {
  'use strict';
  const C=window.AtlasCore;
  const $=selector=>document.querySelector(selector);
  const svg=$('#atlas-map'), stage=$('#map-stage'), list=$('#place-list'), detail=$('#place-detail');
  const state={places:[],geography:null,category:'all',query:'',selected:null,view:'model',explode:0,zoom:1,pan:[0,0],returnFocus:null};
  let animation=0, frame=0;
  function el(tag,attrs={},text){const n=document.createElement(tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;}
  function se(tag,attrs={},text){const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;}
  function add(parent,tag,attrs,text){const n=el(tag,attrs,text);parent.append(n);return n;}
  function link(parent,label,url,cls=''){const safe=C.safeLink(url);if(!safe)return;return add(parent,'a',{href:safe,class:cls,...(safe.startsWith('https:')?{target:'_blank',rel:'noopener noreferrer'}:{})},label);}
  function filtered(){return C.filterPlaces(state.places,state.category,state.query);}
  function number(p){return String(state.places.indexOf(p)+1).padStart(2,'0');}
  function point(c){return C.project(c,state.geography.bounds,state.view);}
  function pathData(coords,height=0){return coords.map((c,i)=>{const[x,y]=point(c);return `${i?'L':'M'}${x.toFixed(2)} ${(y-height).toFixed(2)}`;}).join(' ');}
  function screenUnit(){return Math.max(1200/Math.max(1,stage.clientWidth),940/Math.max(1,stage.clientHeight))/state.zoom;}
  function updateCamera(){
    $('#map-camera').setAttribute('transform',`translate(${600+state.pan[0]} ${470+state.pan[1]}) scale(${state.zoom}) translate(-600 -470)`);
    $('#zoom-in').disabled=state.zoom>=3;
    $('#zoom-out').disabled=state.zoom<=1;
    svg.style.touchAction=state.zoom>1?'none':'pan-y';
  }
  function drawGeography(){
    if(!state.geography)return;
    const target=$('#geography'), frag=document.createDocumentFragment(), b=state.geography.bounds;
    const outline=[[b.west,b.north],[b.east,b.north],[b.east,b.south],[b.west,b.south],[b.west,b.north]];
    let clip=$('#map-clip');
    if(!clip){clip=se('clipPath',{id:'map-clip'});svg.querySelector('defs').append(clip);}
    clip.replaceChildren(se('path',{d:pathData(outline)+' Z'}));
    const floor=se('path',{d:pathData(outline)+' Z',class:'geo-land'});frag.append(floor);
    const layers={};
    for(const kind of ['park','water','stream','trail','road-outline','road','building-wall','building','pitch','pool']){layers[kind]=se('g',{'clip-path':'url(#map-clip)'});frag.append(layers[kind]);}
    const closed=new Set(['park','water','building','pitch','pool']);
    for(const f of state.geography.features){
      const d=pathData(f.coordinates)+(closed.has(f.kind)?' Z':'');
      if(f.kind==='road' && f.major)layers['road-outline'].append(se('path',{d,class:'geo-road-outline'}));
      if(f.kind==='building' && state.view==='model'){
        const roof=pathData(f.coordinates,3.5)+' Z';
        layers['building-wall'].append(se('path',{d,class:'geo-building-wall',transform:'translate(0 2)'}));
        layers.building.append(se('path',{d:roof,class:'geo-building'}));
      }else layers[f.kind]?.append(se('path',{d,class:'geo-'+f.kind+(f.major?' major':'')}));
    }
    target.replaceChildren(frag);
    const labels=$('#map-labels');labels.replaceChildren();
    for(const label of state.geography.labels||[]){const[x,y]=point(label.coordinates);labels.append(se('text',{x,y,class:label.kind==='village'?'village-label':'road-label','text-anchor':'middle'},label.name));}
    drawPins();
  }
  function drawPins(){
    if(!state.geography)return;
    const groups=C.groupPlaces(filtered()), frag=document.createDocumentFragment(), unit=screenUnit(), boxes=[], labelBoxes=[];
    for(const group of groups){
      const selected=group.places.find(p=>p.id===state.selected);
      const p=selected||group.places[0], category=state.category==='future'?'future':p.category, style=C.categories[category];
      const [gx,gy]=point(group.coordinates);
      const lift=(state.view==='model'?9:0)+state.explode*style.elevation;
      let x=gx,y=gy-lift;
      // Displace crowded markers only; leader lines retain their true location.
      for(let attempt=0;attempt<14;attempt++){
        if(!boxes.some(b=>Math.abs(x-b.x)<48*unit && Math.abs(y-b.y)<43*unit))break;
        const theta=(attempt+1)*2.4;
        x=gx+Math.cos(theta)*(35+attempt*8)*unit;
        y=gy-lift+Math.sin(theta)*(35+attempt*8)*unit;
      }
      boxes.push({x,y});
      const label=group.places.length>1?(p.groupName||p.name):p.name;
      const g=se('g',{class:'map-pin'+(selected?' is-selected':''),role:'button',tabindex:0,'aria-label':label+(group.places.length>1?`, ${group.places.length} places`:''),'aria-pressed':String(Boolean(selected)),'data-pin':p.id,style:'--place-color:'+style.color});
      if(category==='future')g.append(se('ellipse',{cx:gx,cy:gy,rx:24*unit,ry:12*unit,class:'future-ring'}));
      g.append(se('circle',{cx:gx,cy:gy,r:3*unit,class:'pin-ground'}));
      g.append(se('path',{d:`M${gx} ${gy} L${x} ${y}`,class:'pin-line'}));
      g.append(se('circle',{cx:x,cy:y,r:23*unit,class:'pin-hit'}));
      g.append(se('circle',{cx:x,cy:y,r:20*unit,class:'pin-halo'}));
      g.append(se('circle',{cx:x,cy:y,r:13*unit,class:'pin-circle'}));
      g.append(se('text',{x,y,class:'pin-number',style:`font-size:${11*unit}px`},number(p)));
      if(state.zoom>1.25 || selected || groups.length<=7){
        const title=label+(group.places.length>1?' · '+group.places.length+' places':'');
        const labelText=title.length>32?title.slice(0,30)+'…':title;
        const width=labelText.length*6.2*unit,height=18*unit, preferred=x>760?'end':'start';
        let chosen;
        for(const shift of [0,-32,32,-60,60]){
          for(const anchor of [preferred,preferred==='end'?'start':'end']){
            const tx=x+(anchor==='end'?-20:20)*unit,ty=y+(4+shift)*unit;
            const box={left:anchor==='end'?tx-width:tx,right:anchor==='end'?tx:tx+width,top:ty-height,bottom:ty+5*unit};
            if(box.left<20||box.right>1180||box.top<20||box.bottom>920)continue;
            if(labelBoxes.some(b=>box.left<b.right+6*unit&&box.right>b.left-6*unit&&box.top<b.bottom&&box.bottom>b.top))continue;
            if(boxes.slice(0,-1).some(b=>b.x+16*unit>box.left&&b.x-16*unit<box.right&&b.y+16*unit>box.top&&b.y-16*unit<box.bottom))continue;
            chosen={tx,ty,anchor,box,shift};break;
          }
          if(chosen)break;
        }
        if(chosen){
          labelBoxes.push(chosen.box);
          if(chosen.shift)g.append(se('path',{d:`M${x} ${y} L${chosen.tx} ${chosen.ty-4*unit}`,class:'pin-line'}));
          g.append(se('text',{x:chosen.tx,y:chosen.ty,'text-anchor':chosen.anchor,class:'pin-title',style:`font-size:${12*unit}px;stroke-width:${4*unit}px`},labelText));
        }
      }
      const activate=()=>selectPlace(p.id,g);
      g.addEventListener('click',event=>{if(dragMoved)return;event.stopPropagation();activate();});
      g.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();activate();}});
      frag.append(g);
    }
    $('#map-pins').replaceChildren(frag);
    const message=$('#map-message');
    if(!groups.length){message.textContent=state.category==='makers'?'Neighborhood makers are next.':filtered().length?'These places still need a confirmed map location.':'No matching places.';}
    else message.textContent='';
  }
  function renderList(){
    const places=filtered(), mapped=places.filter(p=>p.coordinates).length;
    $('#result-count').textContent=`${places.length} listings · ${mapped} located`;
    const frag=document.createDocumentFragment();
    for(const p of places){
      const b=el('button',{type:'button',class:'place-row','aria-pressed':String(p.id===state.selected),'data-place':p.id,style:'--place-color:'+C.categories[p.category].color});
      add(b,'span',{class:'place-number','aria-hidden':'true'},number(p));
      const copy=add(b,'span',{});add(copy,'strong',{},p.name);add(copy,'small',{},(p.parentName?'At '+p.parentName:p.village)+' · '+C.statuses[p.status]+(!p.coordinates?' · Not pinned yet':''));
      add(b,'span',{class:'row-arrow','aria-hidden':'true'},'↗');b.addEventListener('click',()=>selectPlace(p.id,b));frag.append(b);
    }
    if(!places.length){
      const empty=add(frag,'div',{class:'empty'});
      if(state.category==='makers'){
        add(empty,'strong',{},'Made by a neighbor.');
        add(empty,'p',{},'Home bakers, makers and neighborhood services belong here. The first listings will need owner permission and a preferred pickup area.');
        add(empty,'p',{},'No home addresses have been added.');
      }else{add(empty,'strong',{},'Nothing here yet.');add(empty,'p',{},'Try another name, village or amenity.');}
      const reset=add(empty,'button',{type:'button'},'Show all places');reset.addEventListener('click',resetFilters);
    }
    list.replaceChildren(frag);drawPins();
  }
  function selectPlace(id,opener){
    const p=state.places.find(p=>p.id===id);if(!p)return;
    state.returnFocus=opener||state.returnFocus;state.selected=id;
    detail.style.setProperty('--place-color',C.categories[p.category].color);
    detail.replaceChildren();detail.hidden=false;
    const close=add(detail,'button',{type:'button',class:'detail-close','aria-label':'Close place details'},'×');close.addEventListener('click',closeDetail);
    add(detail,'p',{class:'detail-category'},C.categories[p.category].label.toUpperCase());
    add(detail,'h2',{id:'detail-title',tabindex:'-1'},p.name);
    add(detail,'p',{class:'detail-location'},p.address||p.village);
    add(detail,'span',{class:'detail-status'},C.statuses[p.status]);
    add(detail,'p',{class:'detail-description'},p.description);
    if(p.parentId){const parent=add(detail,'button',{type:'button',class:'parent-link'},'Part of '+p.parentName+' ↗');parent.addEventListener('click',()=>selectPlace(p.parentId));}
    if(p.access)add(detail,'p',{class:'detail-note'},p.access);
    if(p.visitNotes?.length){const section=add(detail,'div',{class:'visit-details'});add(section,'h3',{},'Plan your visit');const items=add(section,'ul',{});p.visitNotes.forEach(note=>add(items,'li',{},note));}
    const tags=add(detail,'ul',{class:'detail-tags','aria-label':'Amenities'});p.tags.forEach(t=>add(tags,'li',{},t));
    if(p.note)add(detail,'p',{class:'detail-note'},p.note);
    if(!p.coordinates)add(detail,'p',{class:'detail-note'},'The exact location is still being checked. This entry appears in the directory only.');
    const actions=add(detail,'div',{class:'detail-actions'});
    if(p.action)link(actions,p.action.label+' ↗',p.action.url);
    const directions=C.directionsUrl(p);if(directions)link(actions,'Get directions ↗',directions,p.action?'secondary':'');
    link(actions,p.category==='future'?'Read the development update ↗':'View official details ↗',p.sources[0].url,'secondary');
    if(p.locationPrecision==='street-area')add(detail,'p',{class:'detail-note'},'Approximate area near the streets named by CAB. The marker is not an entrance or a surveyed park location.');
    if(p.locationPrecision==='operator-area')add(detail,'p',{class:'detail-note'},'This property location comes from the operator’s website. The visitor entrance still needs checking.');
    if(p.locationPrecision==='parent-area')add(detail,'p',{class:'detail-note'},'The marker uses the parent facility’s location. The exact position of this feature within it is still being checked.');
    const relatives=state.places.filter(other=>other.id!==p.id&&(other.parentId===p.id||(p.parentId&&other.parentId===p.parentId)||(p.locationGroup&&other.locationGroup===p.locationGroup)));
    if(relatives.length){const section=add(detail,'div',{class:'related-places'});add(section,'h3',{},'Also at this location');for(const other of relatives){const b=add(section,'button',{type:'button'},other.name+' ↗');b.addEventListener('click',()=>selectPlace(other.id));}}
    if(p.unknowns?.length){const check=add(detail,'details',{class:'detail-checks'});add(check,'summary',{},'Details still being checked');const ul=add(check,'ul',{});p.unknowns.forEach(q=>add(ul,'li',{},q));}
    const sources=add(detail,'div',{class:'detail-sources'});add(sources,'strong',{},'SOURCES & REVIEW');
    for(const s of p.sources)link(sources,s.label+' ↗',s.url);
    if(p.locationSource)link(sources,'Map-location source ↗',p.locationSource);
    if(p.locationContextSource)link(sources,'Official location description ↗',p.locationContextSource);
    add(sources,'p',{},`Source checked ${new Date(p.checkedAt+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})}. ${C.sourceIsDue(p)?'Due for another check.':'Staging review; publication not yet approved.'}`);
    if(p.locationPrecision==='park-center')add(sources,'p',{},'Marker shows the park area, not a confirmed entrance.');
    detail.scrollTop=0;
    list.querySelectorAll('[data-place]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.place===id)));
    drawPins();$('#detail-title').focus({preventScroll:true});
  }
  function closeDetail(){
    detail.hidden=true;const id=state.selected;state.selected=null;
    list.querySelectorAll('[data-place]').forEach(b=>b.setAttribute('aria-pressed','false'));drawPins();
    const target=state.returnFocus?.isConnected?state.returnFocus:list.querySelector(`[data-place="${id}"]`);
    (target||$('#search')).focus({preventScroll:true});state.returnFocus=null;
  }
  function setFilters(){
    if(!detail.hidden){detail.hidden=true;state.selected=null;state.returnFocus=null;}
    document.querySelectorAll('[data-category]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.category===state.category)));
    $('#clear-search').hidden=!state.query;renderList();
  }
  function resetFilters(){state.category='all';state.query='';$('#search').value='';setFilters();}
  function setExplosion(on){
    cancelAnimationFrame(animation);$('#explode').setAttribute('aria-pressed',String(on));
    $('#explode').lastChild.textContent=on?' Bring layers together':' Separate layers';
    $('#map-instruction').textContent=on?'Lines connect each place to its map location':'Select a place to look closer';
    const start=state.explode,target=on?1:0,time=performance.now(),duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:450;
    const animate=now=>{const t=duration?Math.min(1,(now-time)/duration):1;state.explode=start+(target-start)*(1-Math.pow(1-t,3));drawPins();if(t<1)animation=requestAnimationFrame(animate);};
    animation=requestAnimationFrame(animate);
  }
  function zoom(delta){state.zoom=Math.min(3,Math.max(1,state.zoom+delta));if(state.zoom===1)state.pan=[0,0];updateCamera();drawPins();}
  $('#search').addEventListener('input',e=>{state.query=e.target.value;setFilters();});
  $('#clear-search').addEventListener('click',()=>{state.query='';$('#search').value='';setFilters();$('#search').focus();});
  document.querySelectorAll('[data-category]').forEach(b=>b.addEventListener('click',()=>{state.category=b.dataset.category;setFilters();}));
  document.querySelectorAll('[data-find]').forEach(b=>b.addEventListener('click',()=>{state.category='all';state.query=b.dataset.find;$('#search').value=state.query;setFilters();}));
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{state.view=b.dataset.view;document.querySelectorAll('[data-view]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));drawGeography();}));
  $('#explode').addEventListener('click',()=>setExplosion($('#explode').getAttribute('aria-pressed')!=='true'));
  $('#zoom-in').addEventListener('click',()=>zoom(.35));$('#zoom-out').addEventListener('click',()=>zoom(-.35));
  $('#reset-map').addEventListener('click',()=>{state.zoom=1;state.pan=[0,0];updateCamera();drawPins();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!detail.hidden)closeDetail();});
  svg.addEventListener('keydown',e=>{if(e.target!==svg)return;if(['+','=','-','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(e.key)){e.preventDefault();if(['+','='].includes(e.key))zoom(.35);else if(e.key==='-')zoom(-.35);else if(e.key==='Home')$('#reset-map').click();else{const axis=e.key==='ArrowLeft'||e.key==='ArrowRight'?0:1;state.pan[axis]+=e.key==='ArrowLeft'||e.key==='ArrowUp'?45:-45;limitPan();updateCamera();}}});
  function limitPan(){state.pan=state.pan.map(n=>Math.max(-650*state.zoom,Math.min(650*state.zoom,n)));}
  let drag=null,dragMoved=false;
  svg.addEventListener('pointerdown',e=>{if((e.pointerType==='touch'&&state.zoom<=1)||e.button!==0||e.target.closest('.map-pin')||drag)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,pan:[...state.pan]};dragMoved=false;svg.setPointerCapture(e.pointerId);});
  svg.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;dragMoved=Math.abs(dx)+Math.abs(dy)>5;const ratio=Math.max(1200/stage.clientWidth,940/stage.clientHeight);state.pan=[drag.pan[0]+dx*ratio,drag.pan[1]+dy*ratio];limitPan();updateCamera();});
  const stopDrag=()=>{drag=null;setTimeout(()=>{dragMoved=false;},0);};svg.addEventListener('pointerup',stopDrag);svg.addEventListener('pointercancel',stopDrag);
  new ResizeObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(drawPins);}).observe(stage);
  async function getJson(url){const response=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Could not load '+url);return response.json();}
  async function load(){
    stage.setAttribute('aria-busy','true');
    const [catalog,geography]=await Promise.allSettled([getJson('/atlas/places.json').then(C.validateCatalog),getJson('/atlas/geography.json')]);
    if(catalog.status==='fulfilled'){
      state.places=catalog.value.places;renderList();
      const coverage=catalog.value.coverage;
      if(coverage){
        $('#inventory-summary').textContent=`${coverage.listed} listings: ${coverage.placeCount} places and projects, ${coverage.featureCount} individual amenities, ${coverage.phaseCount} future phases and ${coverage.recurringCount} recurring uses. ${coverage.heldCount} research leads are still held for review.`;
        $('#coverage-note').textContent='The collection accounts for the named parks in the developer and CAB directories and the CAB facility list. Features share their parent’s marker when their exact position is unknown. Unlocated entries remain searchable in the directory. The saved map background is incomplete and does not establish a community or property boundary. Use the official full plan below for wider development context.';
        $('#research-summary').textContent=`${coverage.heldCount} research leads still being checked`;
        $('#research-intro').textContent=`${coverage.makerLeadsHeld} neighborhood-business leads are awaiting their owners’ listing permission and public location choice. Other leads below need identity, location or access checks. These are not confirmed destinations or map pins.`;
        const research=$('#research-list');research.replaceChildren();for(const item of coverage.heldReasons){const li=add(research,'li',{});add(li,'strong',{},item.name+': ');add(li,'span',{},item.reason);}
      }
    }else{list.replaceChildren(el('p',{class:'empty'},'The place collection couldn’t load. Please try again.'));$('#result-count').textContent='Unavailable';}
    if(geography.status==='fulfilled'&&Array.isArray(geography.value.features)&&geography.value.bounds){state.geography=geography.value;drawGeography();updateCamera();}
    if(catalog.status==='rejected'||geography.status==='rejected'){
      const msg=$('#map-message');msg.textContent=catalog.status==='fulfilled'?'The map couldn’t load. You can still browse the directory.':'The atlas couldn’t load.';const retry=add(msg,'button',{type:'button'},'Try again');retry.addEventListener('click',load);
    }
    stage.setAttribute('aria-busy','false');
  }
  load();
})();

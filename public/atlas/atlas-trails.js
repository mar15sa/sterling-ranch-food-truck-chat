(function(){
  'use strict';
  const C=window.AtlasCore,$=s=>document.querySelector(s),svg=$('#trail-map');
  let data=null,places=[],selected=null,currentBox=null,homeBox=null,loading=false,timeChoice='all';
  const ns='http://www.w3.org/2000/svg';
  function add(parent,tag,attrs={},text){const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;parent.append(n);return n;}
  function se(tag,attrs={},text){const n=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;}
  function link(parent,label,url){const safe=C.safeLink(url);if(safe)add(parent,'a',{href:safe,target:'_blank',rel:'noopener noreferrer'},label);}
  function walkMinutes(route){return {min:Math.ceil(route.miles/3*60),max:Math.ceil(route.miles/2*60)};}
  function walkTime(route){const minutes=walkMinutes(route);return minutes.min+'–'+minutes.max+' min';}
  function timeGroup(route){const upper=walkMinutes(route).max;return upper<=15?'15':upper<=35?'30':null;}
  function setTimeChoice(value){timeChoice=value;renderTimePicker();const visible=renderWalkList();if(visible.length&&!visible.some(route=>route.id===selected))select(visible[0].id);}
  function renderWalkList(){
    const list=$('#walk-list');list.replaceChildren();
    const visible=data.routes.filter(route=>timeChoice==='all'||timeGroup(route)===timeChoice);
    if(!visible.length){selected=null;$('#trail-network').setAttribute('aria-pressed','true');draw(null);const detail=$('#walk-detail');detail.replaceChildren();add(detail,'h3',{},'No walks match that time');add(detail,'p',{},'Try another time choice to see a route, or explore the full trail map.');const empty=add(list,'div',{class:'walk-empty',role:'status'});add(empty,'strong',{},'No walks match that time.');const reset=add(empty,'button',{type:'button'},'Show all walks');reset.addEventListener('click',()=>setTimeChoice('all'));return visible;}
    for(const route of visible){const b=add(list,'button',{type:'button','data-walk':route.id,'aria-pressed':String(selected===route.id),style:'--route-color:'+route.color});add(b,'small',{},route.area+' · '+route.type);add(b,'strong',{},route.name);add(b,'span',{},route.miles.toFixed(2)+' mi · '+walkTime(route));b.addEventListener('click',()=>select(route.id));}
    return visible;
  }
  function renderTimePicker(){
    let picker=$('#walk-time-picker');
    if(!picker){picker=add($('#walk-list').parentElement,'div',{id:'walk-time-picker',class:'walk-time-picker',role:'group','aria-label':'Choose a walk length'});$('#walk-list').parentElement.insertBefore(picker,$('#walk-list'));}
    picker.replaceChildren();add(picker,'span',{},'How much time?');
    for(const [value,label] of [['all','All walks'],['15','About 15 minutes'],['30','About 30 minutes']]){const b=add(picker,'button',{type:'button','aria-pressed':String(timeChoice===value)},label);b.addEventListener('click',()=>setTimeChoice(value));}
  }
  function showPlaces(){ $('#trail-guide').hidden=true;$('#places-explorer').hidden=false;$('#show-places').setAttribute('aria-pressed','true');$('#show-trails').setAttribute('aria-pressed','false');}
  async function showTrails(){window.dispatchEvent(new Event('atlas:leave-places'));$('#places-explorer').hidden=true;$('#trail-guide').hidden=false;$('#show-places').setAttribute('aria-pressed','false');$('#show-trails').setAttribute('aria-pressed','true');if(!data&&!loading)await load();}
  $('#show-places').addEventListener('click',showPlaces);$('#show-trails').addEventListener('click',showTrails);
  function applyBox(){currentBox=C.clampTrailView(currentBox,data.imageSize);svg.setAttribute('viewBox',currentBox.join(' '));svg.style.touchAction=currentBox[2]<homeBox[2]?'none':'pan-y';}
  function zoom(factor){if(!currentBox)return;const[x,y,w,h]=currentBox,nw=Math.max(65,Math.min(2000,w*factor)),nh=nw*h/w;currentBox=[x+(w-nw)/2,y+(h-nh)/2,nw,nh];applyBox();}
  $('#trail-zoom-in').addEventListener('click',()=>zoom(.7));$('#trail-zoom-out').addEventListener('click',()=>zoom(1/.7));$('#trail-reset').addEventListener('click',()=>{if(homeBox){currentBox=[...homeBox];applyBox();}});
  svg.addEventListener('keydown',event=>{if(currentBox&&['+','=','-','Home','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();if(event.key==='+'||event.key==='=')zoom(.7);else if(event.key==='-')zoom(1/.7);else if(event.key==='Home')$('#trail-reset').click();else{const axis=/Left|Right/.test(event.key)?0:1;currentBox[axis]+=(/Left|Up/.test(event.key)?-1:1)*currentBox[axis+2]*.12;applyBox();}}});
  let drag=null;
  svg.addEventListener('pointerdown',e=>{if(!currentBox||e.button!==0||e.target.closest('[data-route]')||(e.pointerType==='touch'&&currentBox[2]>=homeBox[2]))return;drag={x:e.clientX,y:e.clientY,box:[...currentBox]};svg.setPointerCapture(e.pointerId);});
  svg.addEventListener('pointermove',e=>{if(!drag)return;const r=svg.getBoundingClientRect(),scale=Math.max(drag.box[2]/r.width,drag.box[3]/r.height);currentBox=[drag.box[0]-(e.clientX-drag.x)*scale,drag.box[1]-(e.clientY-drag.y)*scale,drag.box[2],drag.box[3]];applyBox();});
  svg.addEventListener('pointerup',()=>drag=null);svg.addEventListener('pointercancel',()=>drag=null);
  function draw(route){
    svg.replaceChildren(se('title',{},route?route.name:'Official Sterling Ranch trail network'));
    const mapImage=se('image',{href:data.image,x:0,y:0,width:data.imageSize[0],height:data.imageSize[1]});
    mapImage.addEventListener('error',()=>{$('#trail-map-status').textContent='The map image couldn’t load. Walk details and the original map link are available below.';});svg.append(mapImage);
    for(const update of data.annotationUpdates||[]){svg.append(se('rect',{x:update.box[0],y:update.box[1],width:update.box[2],height:update.box[3],rx:2,fill:'#00283e'}));update.lines.forEach((line,i)=>svg.append(se('text',{x:update.box[0]+update.box[2]/2,y:update.box[1]+11+i*10,'text-anchor':'middle',fill:'white','font-family':'Arial, sans-serif','font-size':6.5},line)));}
    const routes=route?[route]:data.routes;
    for(const item of routes){
      const g=se('g',{'data-route':item.id,role:'button',tabindex:0,'aria-label':'Highlight '+item.name,class:'walk-path-group'});
      for(const coords of item.paths){const d=coords.map((p,i)=>(i?'L':'M')+p.join(' ')).join(' ');g.append(se('path',{d,class:'walk-path-halo'}));g.append(se('path',{d,class:'walk-path',style:'--route-color:'+item.color}));}
      g.addEventListener('click',()=>select(item.id));g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(item.id);}});svg.append(g);
      if(route){for(const [point,label] of [[item.startPoint,'START'],...(item.type==='Loop'?[]:[[item.endPoint,'FINISH']])]){svg.append(se('circle',{cx:point[0],cy:point[1],r:3.5,fill:item.color,stroke:'white','stroke-width':1}));svg.append(se('text',{x:point[0]+6,y:point[1]-5,class:'walk-endpoint'},label));}}
    }
    homeBox=[...(route?route.viewBox:data.overview)];currentBox=[...homeBox];applyBox();$('#trail-map-title').textContent=route?route.name:'The full CAB trail map';
  }
  function select(id){
    const route=data.routes.find(r=>r.id===id);if(!route)return;selected=id;
    $('#walk-list').querySelectorAll('[data-walk]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.walk===id)));$('#trail-network').setAttribute('aria-pressed','false');draw(route);
    const target=$('#walk-detail');target.replaceChildren();target.style.setProperty('--route-color',route.color);
    const heading=add(target,'div',{class:'walk-detail-heading'});add(heading,'h3',{},route.name);add(heading,'span',{class:'walk-type'},route.type);
    add(target,'p',{},route.description);
    const journey=add(target,'section',{class:'walk-journey','aria-label':'Walk at a glance'});
    const journeyStats=add(journey,'div',{class:'walk-journey-stats'});add(journeyStats,'span',{},route.type==='Loop'?'Loop walk':'One-way walk');add(journeyStats,'strong',{},route.miles.toFixed(2)+' mi');add(journeyStats,'span',{},walkTime(route)+' walking');
    const routeLine=add(journey,'div',{class:'walk-journey-line'});const start=add(routeLine,'div',{class:'walk-journey-stop'});add(start,'small',{},'Start');add(start,'strong',{},route.start);add(routeLine,'span',{class:'walk-journey-arrow','aria-hidden':'true'},'→');const finish=add(routeLine,'div',{class:'walk-journey-stop'});add(finish,'small',{},route.type==='Loop'?'Return':'Finish');add(finish,'strong',{},route.finish);
    if(route.type!=='Loop')add(journey,'p',{class:'walk-return'},'One way. Return along the same trail for an approximately '+(route.miles*2).toFixed(2)+'-mi out-and-back.');
    const steps=add(target,'ol',{class:'walk-steps'});route.steps.forEach(s=>add(steps,'li',{},s));
    const nearby=route.nearbyPlaceIds.map(id=>places.find(p=>p.id===id)).filter(Boolean);
    if(nearby.length){const wrap=add(target,'div',{class:'walk-stops'});add(wrap,'h4',{},'Pair it with a place');add(wrap,'p',{class:'walk-stops-note'},'These are nearby activities to plan separately; this guide does not confirm they are on the route or show their entrances.');const cards=add(wrap,'div',{class:'walk-stop-cards'});for(const place of nearby){const b=add(cards,'button',{type:'button',class:'walk-stop-card'});add(b,'small',{},'Nearby activity');add(b,'strong',{},place.name);add(b,'span',{},place.description);if(place.access)add(b,'em',{},place.access);else{const children=places.filter(p=>p.parentId===place.id);if(children.length)add(b,'em',{},children.slice(0,2).map(p=>p.name).join(' · '));}add(b,'i',{},'See amenities & access →');b.addEventListener('click',()=>{showPlaces();window.dispatchEvent(new CustomEvent('atlas:open-place',{detail:{id:place.id}}));});}}
    const sources=add(target,'details',{class:'walk-source'});add(sources,'summary',{},'Map source & walk details');add(sources,'p',{},data.distanceNote);add(sources,'p',{},data.mapNote);add(sources,'p',{},route.sourceScope);link(sources,data.source.label,data.source.url);link(sources,'CAB trail information',data.source.listingUrl);for(const update of data.annotationUpdates||[])link(sources,update.lines[0]+' · current source',update.sourceUrl);add(sources,'p',{},'Reviewed '+data.checkedAt+'. Surface, gradient and step-free access are not specified for this walk in the source.');
  }
  $('#trail-network').addEventListener('click',()=>{if(!data)return;selected=null;$('#walk-list').querySelectorAll('[data-walk]').forEach(b=>b.setAttribute('aria-pressed','false'));$('#trail-network').setAttribute('aria-pressed','true');draw(null);const detail=$('#walk-detail');detail.replaceChildren();add(detail,'h3',{},'Follow the neighborhood’s trail network');add(detail,'p',{},'Zoom in to read the trail distances and connections on CAB’s map. Choose a highlighted walk for its start, distance and nearby places.');link(detail,'Open the original map at full resolution',data.source.url);});
  async function load(){loading=true;const status=$('#trail-map-status');status.textContent='Opening the trail guide…';try{
    const results=await Promise.all(['/atlas/trails.json','/atlas/places.json'].map(async url=>{const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Unavailable');return r.json();}));
    data=C.validateTrails(results[0]);places=results[1].places;timeChoice='all';renderTimePicker();renderWalkList();status.textContent='';select(data.routes[0].id);
  }catch{data=null;status.replaceChildren();add(status,'span',{},'The trail guide couldn’t load.');const retry=add(status,'button',{type:'button'},'Try again');retry.addEventListener('click',load);}finally{loading=false;}}
})();

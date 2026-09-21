(function(){
  'use strict';
  const C=window.AtlasCore, $=s=>document.querySelector(s);
  let places=[],config=null,includeFuture=false,selected=null;
  const explorer=$('#places-explorer'),column=$('.map-column'),mapStage=$('#map-stage');
  function add(parent,tag,attrs={},text){const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;parent.append(n);return n;}
  function open(id,opener){window.dispatchEvent(new CustomEvent('atlas:open-place',{detail:{id,opener}}));}
  const layers=add(column,'div',{class:'time-layer'});column.insertBefore(layers,mapStage);
  add(layers,'span',{class:'time-layer-label'},'THE NEIGHBORHOOD');
  const switches=add(layers,'div',{'aria-label':'Future map layer',class:'time-layer-buttons'});
  const now=add(switches,'button',{type:'button','aria-pressed':'true'},'Now');
  const next=add(switches,'button',{type:'button','aria-pressed':'false'},'With what’s coming');
  now.addEventListener('click',()=>setFuture(false));next.addEventListener('click',()=>setFuture(true));
  const projects=add(column,'section',{class:'future-projects','aria-label':'Featured future projects',hidden:''});column.insertBefore(projects,mapStage);
  function setFuture(value){
    includeFuture=value;now.setAttribute('aria-pressed',String(!value));next.setAttribute('aria-pressed',String(value));explorer.classList.toggle('with-future',value);
    window.dispatchEvent(new CustomEvent('atlas:set-future',{detail:{includeFuture:value}}));
    let p=places.find(item=>item.id===selected);
    if(!value&&p?.future){const seen=new Set();while(p?.future&&p.parentId&&!seen.has(p.id)){seen.add(p.id);p=places.find(item=>item.id===p.parentId);}if(p&&!p.future)open(p.id);else window.dispatchEvent(new Event('atlas:close-place'));}
    renderProjects();
  }
  function renderProjects(){
    projects.replaceChildren();projects.hidden=!includeFuture||!config;if(projects.hidden)return;
    const head=add(projects,'div',{class:'future-heading'});add(head,'strong',{},'A look ahead');add(head,'span',{},'Existing places stay on the map. Planned additions are marked in mauve.');
    const cards=add(projects,'div',{class:'future-cards'});
    for(const id of config.futureHighlights){const p=places.find(item=>item.id===id);if(!p)continue;
      const b=add(cards,'button',{type:'button',class:'future-project'});add(b,'small',{},C.statuses[p.status]);add(b,'strong',{},p.name);
      const facts=[...(p.facts||[]).map(f=>f.text),...(p.visitNotes||[]),p.description];const milestone=facts.find(text=>/202[6-9]/.test(text))||facts.find(text=>/target|construction|later phases/i.test(text));add(b,'span',{},milestone||p.description);
      add(b,'small',{},p.coordinates?'Shown at the existing park':'Project card · location not pinned');b.addEventListener('click',()=>open(id,b));
    }
  }
  window.addEventListener('atlas:catalog-ready',e=>{places=e.detail.places;renderProjects();});
  window.addEventListener('atlas:place-selected',e=>{selected=e.detail.id;});
  window.addEventListener('atlas:place-closed',()=>{selected=null;});
  window.addEventListener('atlas:future-changed',e=>setFuture(e.detail.includeFuture));
  fetch('/atlas/experience.json',{cache:'no-store',signal:AbortSignal.timeout(15000)}).then(r=>{if(!r.ok)throw Error('Unavailable');return r.json();}).then(data=>{
    if(!Array.isArray(data.futureHighlights)||!data.futureHighlights.every(id=>typeof id==='string'))throw Error('Invalid display configuration');config=data;window.dispatchEvent(new Event('atlas:experience-ready'));
  }).catch(()=>{projects.hidden=true;});
})();

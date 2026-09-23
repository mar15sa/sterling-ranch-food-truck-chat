import { futureAreas, futureRoot, futureFocus } from './future-map.mjs';
import { futureGroups } from './discovery.mjs';
import { cameraFor, inVillage } from './focus.mjs';
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createFutureMap({places,roots,point,details}) {
  const panel=document.querySelector('#future-panel'), areas=futureAreas(places), projects=futureGroups(places.filter(p=>p.future===true));
  let area='all', selected=null, zoom=1, focus=null;
  panel.className='future-map-panel';
  panel.innerHTML=`<div class="future-map-heading"><div><p class="eyebrow">THE NEXT CHAPTER</p><h2>A neighborhood taking shape.</h2></div><p>Explore what’s planned around the Ranch.<br>Area labels show where to look, not exact project sites.</p></div>
    <div class="future-map-toolbar"><label>Explore an area <select id="future-area" aria-label="Future project area"><option value="all">Whole Ranch</option>${areas.map(a=>`<option>${esc(a.name)}</option>`).join('')}</select></label><span>${projects.length} projects · future plans only</span></div>
    <div class="map-stage future-stage"><div id="future-landscape" class="landscape"><div class="map-plane" id="future-plane"><img src="assets/full-landscape.png" alt="Full-area illustrated Sterling Ranch map with future projects grouped by village" draggable="false"><div class="focus-haze" aria-hidden="true"></div><div id="future-area-labels"></div></div><div class="future-map-note">The next chapter<small>Area guides · not construction footprints</small></div><div class="focus-caption" hidden><button type="button" data-future-reset>← Whole Ranch</button><span></span><small></small></div><div class="compass" aria-label="North is up"><span>↑</span><small>N</small></div></div><aside id="future-note" class="place-note" tabindex="-1" aria-label="Future project details"></aside></div>
    <div class="future-map-controls"><button type="button" data-future-reset>Whole Ranch</button><button type="button" data-future-zoom="-0.25" aria-label="Zoom out of future map">−</button><button type="button" data-future-zoom="0.25" aria-label="Zoom into future map">+</button><span id="future-location-note" role="status" aria-live="polite">Explore by area. Exact sites are still being confirmed.</span></div>
    <div id="future-outside" class="future-outside"></div><div class="future-project-index"><p class="eyebrow" id="future-index-label">ALL FUTURE PROJECTS</p><div id="project-list" class="future-project-buttons"></div></div>`;
  const $=s=>panel.querySelector(s), plane=$('#future-plane'), landscape=$('#future-landscape');
  function applyCamera(){
    let c=focus?cameraFor({points:focus.points,kind:'village',mobile:innerWidth<=720}):null;
    const z=Math.min(3.5,Math.max(1,(c?.zoom||1)*zoom));
    const x=c?.x||50,y=c?.y||50;
    const tx=Math.max(100-100*z,Math.min(0,(innerWidth<=720?50:64)-x*z));
    const ty=Math.max(100-100*z,Math.min(0,50-y*z));
    for(const [k,v] of Object.entries({zoom:z,tx:tx+'%',ty:ty+'%',x:x+'%',y:y+'%',rx:(c?.radiusX||100)+'%',ry:(c?.radiusY||100)+'%'}))plane.style.setProperty('--camera-'+k,v);
    landscape.classList.toggle('has-focus',!!c);
    const caption=$('.focus-caption');caption.hidden=!c;caption.querySelector('span').textContent=focus?.label||'';caption.querySelector('small').textContent=focus?.note||'';
  }
  function areaFocus(name){const points=roots.filter(p=>inVillage(p,name)).map(p=>point(p.id)).filter(Boolean);return points.length?{points,label:name,note:'Area guide · exact sites unconfirmed'}:null;}
  function projectButton(p){return `<button type="button" data-future-project="${esc(p.id)}" aria-pressed="${selected===p.id}"><small>${esc(p.village)}</small><strong>${esc(p.name)}</strong><span>Explore this plan ↗</span></button>`;}
  function render(){
    $('#future-area').value=area;
    const displayed=projects.filter(p=>area==='all'||p.village===area);
    $('#future-area-labels').innerHTML=areas.map(a=>{let anchor=a.anchor;if(!anchor&&a.name==='Between villages'){const p=projects.find(p=>p.village===a.name),xy=point(p?.parentId);if(xy)anchor={x:xy[0]/15.36,y:xy[1]/10.24};}if(!anchor)return '';return `<button class="future-area-marker" data-future-area="${esc(a.name)}" style="left:${anchor.x}%;top:${anchor.y}%" ${focus?'hidden':''}><span>${a.projects.length}</span><strong>${esc(a.name==='Between villages'?'Burns Park':a.name)}</strong><small>${a.projects.length===1?'Future project':'Future projects'} ↗</small></button>`;}).join('');
    $('#future-outside').innerHTML=areas.filter(a=>!a.anchor&&a.name!=='Between villages').map(a=>`<div><span class="eyebrow">${esc(a.name)}</span>${a.projects.map(p=>`<button data-future-project="${esc(p.id)}">${esc(p.name)} ↗</button>`).join('')}<small>Exact site not plotted in this view.</small></div>`).join('');
    $('#future-index-label').textContent=area==='all'?'ALL FUTURE PROJECTS':area.toUpperCase()+' · FUTURE PROJECTS';
    $('#project-list').innerHTML=displayed.map(projectButton).join('');
    const p=projects.find(p=>p.id===selected), note=$('#future-note');
    note.innerHTML=p?`<button class="future-back" data-future-area="${esc(p.village)}">← Plans in this area</button>${details(p)}`:`<div class="future-intro"><p class="eyebrow">${area==='all'?'COMING SOON':esc(area)}</p><h2>${area==='all'?'On the horizon.':esc(area)}</h2><p>${area==='all'?'Choose an area to explore its future projects.':`${displayed.length} ${displayed.length===1?'project':'projects'} to explore in this area.`}</p>${(area==='all'?projects.filter(p=>['school51','library'].includes(p.id)):displayed).map(projectButton).join('')}</div>`;
    $('#future-location-note').textContent=p?(focus?.note||'Exact site not plotted. Full Ranch view shown.'):area==='all'?'Explore by area. Exact sites are still being confirmed.':'Area view · project footprints are not plotted.';
    applyCamera();
  }
  function chooseArea(name){area=name;selected=null;zoom=1;focus=name==='all'?null:areaFocus(name);render();}
  function select(id){const p=futureRoot(id,places);if(!p)return;selected=p.id;area=p.village;zoom=1;focus=futureFocus(p,roots,point);render();const child=document.getElementById('project-detail-'+id);if(child){child.closest('details').open=true;child.setAttribute('tabindex','-1');child.focus({preventScroll:true});}else $('#future-note').focus({preventScroll:true});landscape.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}
  panel.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.futureArea)chooseArea(b.dataset.futureArea);if(b.dataset.futureProject)select(b.dataset.futureProject);if('futureReset'in b.dataset)chooseArea('all');if(b.dataset.futureZoom){zoom=Math.max(1,Math.min(3,zoom+Number(b.dataset.futureZoom)));applyCamera();}});
  $('#future-area').addEventListener('change',e=>chooseArea(e.target.value));addEventListener('resize',applyCamera);
  render();return {render,select};
}

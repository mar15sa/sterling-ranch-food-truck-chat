import {descendants,futureGroups} from './discovery.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function unfoldedScene({places,trails,models,routeSvg}){
 const byId=new Map(places.map(p=>[p.id,p])),future=futureGroups(places);
 const destinations=['sterling-center','overlook','burns','prospect-park'].map(id=>byId.get(id));
 return `<div class="unfold-intro"><p class="eyebrow">THE RANCH, OPENED UP</p><h2>Discover what’s beneath the surface.</h2><p>Lift out the places. Find a walk. See what’s taking shape.</p></div>
 <div class="exploded-atlas">
  <div class="terrain-layer" aria-hidden="true"><img src="assets/full-landscape.png" alt=""><span>THE WHOLE RANCH</span></div>
  <section class="atlas-layer places-layer" aria-label="Lifted destinations">
   <div class="layer-caption"><span>01</span><div><h3>Places within places</h3><p>Open a landmark to see its businesses & amenities.</p></div></div>
   <div class="lifted-models">${destinations.map(p=>`<button data-open="${p.id}" class="lifted-place"><img src="assets/${models[p.id]}" alt="Illustrated ${esc(p.name)}"><strong>${esc(p.name.replace('Regional Park','Park').replace('The Overlook Clubhouse','The Overlook'))}</strong><small>${descendants(p.id,places).length} ${descendants(p.id,places).length===1?'amenity':'places & amenities'} ↗</small></button>`).join('')}</div>
  </section>
  <section class="atlas-layer walks-layer" aria-label="Lifted walking guides">
   <div class="layer-caption"><span>02</span><div><h3>A little further on foot</h3><p>Three CAB guides, kept on their original map.</p></div></div>
   <div class="lifted-walks">${trails.routes.map(r=>`<button data-route="${r.id}">${routeSvg(r)}<span><strong>${esc(r.name)}</strong><small>${r.miles} mi · ${esc(r.type)} ↗</small></span></button>`).join('')}</div>
  </section>
  <section class="atlas-layer future-layer" aria-label="Lifted future plans">
   <div class="layer-caption"><span>03</span><div><h3>The next chapter</h3><p>Plans & progress, with official updates.</p></div></div>
   <div class="lifted-plans">${['school51','library'].map(id=>byId.get(id)).filter(Boolean).map(p=>`<button data-open="${p.id}"><span>COMING SOON</span><strong>${esc(p.name)}</strong><small>${esc(p.village)} · Explore the plan ↗</small></button>`).join('')}<button class="all-plans" data-lens="future"><strong>${future.length}</strong><span>future projects</span><small>Explore all plans ↗</small></button></div>
  </section>
 </div><p class="unfold-footnote">An atlas in layers. Each opens real places, walking guides or planned projects.</p>`;
}

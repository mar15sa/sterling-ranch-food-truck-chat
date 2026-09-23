import { descendants, villages } from './discovery.mjs';
import { accessBadges, escapeHtml as esc } from './visit-ui.js';
import { outing, projectStatus } from './journeys.mjs';
import { overviewPoint } from './walk-overview.js';

export function connectionData({places,roots,trails,selected,village,focusKind}){
 const destination=focusKind==='place'?places.find(p=>p.id===selected):null;
 const targets=destination?[destination]:roots.filter(p=>p.village===village);
 const familyIds=new Set(targets.flatMap(p=>[p.id,...descendants(p.id,places).map(c=>c.id)]));
 return {destination,targets,walks:trails.routes.filter(r=>destination?r.nearbyPlaceIds?.some(id=>familyIds.has(id)):r.area===village),
 future:places.filter(p=>p.future&&(destination?familyIds.has(p.parentId):p.village===village))};
}
export function connectionRouteOverlay(walks){
 return '<svg class="connections-route-overlay" viewBox="0 0 1536 1024" aria-label="Complete nearby walking guide paths; no connecting path implied" role="img">'+walks.map(r=>r.paths.map(path=>'<polyline points="'+path.map(overviewPoint).map(p=>p.join(',')).join(' ')+'"/>').join('')).join('')+'</svg>';
}
export function connectionScene(args) {
 const {places,models,selected,village,focusKind}=args;
 if(village==='all'&&focusKind!=='place')return '<div class="connections-intro"><p class="eyebrow">EXPLORE CONNECTIONS</p><h2>Start with a village.</h2><p>Uncover the places within it, the things inside them, and nearby walks.</p><div class="connection-villages">'+villages.map(v=>'<button data-village="'+esc(v.name)+'">'+esc(v.name)+' <span>Explore this area ↗</span></button>').join('')+'</div></div>';
 const {destination,targets,walks,future}=connectionData(args);
 const hero=destination||targets.find(p=>models[p.id]);
 const nested=(parent,depth=0)=>places.filter(p=>p.parentId===parent&&!p.future).map(p=>'<div class="connection-member" style="--depth:'+depth+'"><button data-open="'+p.id+'"><strong>'+esc(p.name)+'</strong>'+accessBadges(p)+'<span aria-hidden="true">↗</span></button>'+nested(p.id,depth+1)+'</div>').join('');
 return '<div class="connections-intro"><p class="eyebrow">EXPLORE CONNECTIONS</p><h2>'+esc(destination?.name||village)+', layer by layer.</h2><p>What’s inside. What’s nearby. What’s next.</p></div>'+
 '<div class="connection-composition"><div class="connection-lift"><div class="connection-model-deck">'+(hero&&models[hero.id]?'<img src="assets/'+esc(models[hero.id])+'" alt="Illustrated '+esc(hero.name)+' lifted above its neighborhood context">':'<span class="connection-landmark-symbol" aria-hidden="true">⌂</span>')+'<span class="connection-deck-label">'+esc(hero?.name||village)+'</span></div><div class="connection-tethers" aria-hidden="true"><i></i><i></i><i></i></div><p class="connection-ground-caption">01 / THE NEIGHBORHOOD<br><small>Full map retained below · green paths are nearby walking guides</small></p></div>'+
 '<section class="connection-membership"><p class="eyebrow">02 / WHAT BELONGS HERE</p><p class="connection-explainer">Dotted branches show what belongs to a place, not a walking path or room position.</p>'+targets.map(p=>'<article class="connection-family"><button class="connection-title" data-open="'+p.id+'">'+esc(p.name)+' ↗</button>'+accessBadges(p)+'<div class="connection-children">'+(nested(p.id)||'<p>No separate amenities listed. Open for visit information.</p>')+'</div></article>').join('')+'</section></div>'+
 '<div class="connection-bottom"><section class="connection-walks"><p class="eyebrow">03 / WALK A LITTLE FURTHER</p><div class="connection-routes">'+walks.map(r=>'<button data-route="'+r.id+'"><span class="connection-route-icon" aria-hidden="true">↗</span><strong>'+esc(r.name)+'</strong><small>'+outing(r).min+'–'+outing(r).max+' min · return included · stops extra</small></button>').join('')+'</div><p class="connection-explainer">'+(walks.length?'These complete guide paths are highlighted on the ground map. Nearby suggestions. A connecting route or entrance has not been established.':'No walking guide is linked to this place yet. Browse Walks & paths for the full network.')+'</p></section>'+
 (future.length?'<section class="connection-future"><p class="eyebrow">04 / THE NEXT CHAPTER</p>'+future.map(p=>'<button data-open="'+p.id+'"><strong>'+esc(p.name)+'</strong><small>'+esc(projectStatus(p,p.project))+' · status & source ↗</small></button>').join('')+'</section>':'')+'</div>';
}


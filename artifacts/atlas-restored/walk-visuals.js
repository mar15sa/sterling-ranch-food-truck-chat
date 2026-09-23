// Geometry and backdrop share CAB's source-image coordinate frame.
const SOURCE='assets/cab-trail-map.png',SIZE=[1242,2000];
export const TRAIL_ART={Providence:{src:'assets/trails-providence.png',bounds:[600,400,642,570]},Prospect:{src:'assets/trails-prospect.png',bounds:[0,1120,400,500]},Ascent:{src:'assets/trails-ascent.png',bounds:[620,850,450,520]}};
// Editorial illustration tracing only. Official CAB paths stay unchanged in data/source comparison.
export const TRAIL_ART_PATHS={'prospect-park-link':[[[148,1382],[174,1377],[203,1372],[235,1365],[282,1358]]]};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function routeFrame(route={}){
 const points=(route.paths||[]).flat().filter(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite));
 if(!points.length)return route.viewBox||[26,510,1190,980];
 const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
 const pad=Math.max(32,Math.max(right-left,bottom-top)*.16);
 let w=Math.max(180,right-left+pad*2),h=Math.max(120,bottom-top+pad*2);
 if(w/h<1.5)w=h*1.5;else h=w/1.5;
 w=Math.min(w,SIZE[0]);h=Math.min(h,SIZE[1]);
 return [Math.max(0,Math.min(SIZE[0]-w,(left+right-w)/2)),Math.max(0,Math.min(SIZE[1]-h,(top+bottom-h)/2)),w,h];
}
export function illustratedFrame(route={}){
 const frame=routeFrame(route),art=TRAIL_ART[route.area];if(!art||(route.paths||[]).length===0)return frame;
 const [ax,ay,aw,ah]=art.bounds,[x,y,w,h]=frame,width=Math.min(w,aw,ah*1.5),height=width/1.5;
 return [Math.max(ax,Math.min(ax+aw-width,x+w/2-width/2)),Math.max(ay,Math.min(ay+ah-height,y+h/2-height/2)),width,height];
}
function lines(paths,cls){return paths.map(path=>'<polyline class="'+cls+'" points="'+path.map(p=>p.join(',')).join(' ')+'"/>').join('');}
export function illustratedWalk(route={},source={}){
 const paths=(TRAIL_ART_PATHS[route.id]||route.paths||[]).filter(p=>p.length>1),frame=illustratedFrame(route),unit=frame[2]/400;
 const art=paths.length?TRAIL_ART[route.area]:null;
 const backdrop=art?'<rect x="0" y="0" width="1242" height="2000" fill="#a4aa74"/><image class="route-illustrated-context" href="'+art.src+'" x="'+art.bounds[0]+'" y="'+art.bounds[1]+'" width="'+art.bounds[2]+'" height="'+art.bounds[3]+'" preserveAspectRatio="none"/>':'<image class="route-source-context" href="'+SOURCE+'" width="'+SIZE[0]+'" height="'+SIZE[1]+'" preserveAspectRatio="none"/>';
 const start=paths[0]?.[0],end=paths.at(-1)?.at(-1),loop=route.type?.toLowerCase()==='loop';
 const badge=(p,label,kind)=>p?'<g class="route-point '+kind+'" transform="translate('+p.join(' ')+')"><circle r="'+13*unit+'"/><text y="'+4.5*unit+'" font-size="'+13*unit+'">'+label+'</text></g>':'';
 const marker=route.labelPoint&&!paths.length?'<g class="section-locator" transform="translate('+route.labelPoint.join(' ')+')"><circle r="'+22*unit+'"/><circle r="'+29*unit+'"/></g>':'';
 const annotations=(source.annotationUpdates||[]).map(a=>'<g class="route-source-annotation"><rect x="'+a.box[0]+'" y="'+a.box[1]+'" width="'+a.box[2]+'" height="'+a.box[3]+'"/><text x="'+(a.box[0]+3)+'" y="'+(a.box[1]+10)+'" font-size="7">'+a.lines.map((t,i)=>'<tspan x="'+(a.box[0]+3)+'" dy="'+(i?10:0)+'">'+esc(t)+'</tspan>').join('')+'</text></g>').join('');
 return '<svg class="route-sketch route-context" viewBox="'+frame.join(' ')+'" role="img" aria-label="'+esc(route.name||'Trail section')+': '+(paths.length?'highlighted route in an approximate illustrated landscape, A marks '+(loop?'start and return':'start, B marks finish'):'highlighted mileage label on the source map')+'" preserveAspectRatio="xMidYMid meet"><title>'+esc(route.name||'Trail section')+' — illustrative surroundings; compare with the official map for route detail.</title>'+backdrop+(art?'':annotations)+(paths.length?'<g class="route-lines">'+lines(paths,'route-halo')+lines(paths,'route-casing')+lines(paths,'route-highlight')+lines(paths,'route-direction')+'</g>':'')+marker+badge(start,'A','route-start')+(!loop?badge(end,'B','route-finish'):'')+'</svg>';
}
export function walkAtlasHero(trails={}){
 const available=new Set((trails.routes||[]).map(r=>r.area)),filters=[['all','Every area'],['Providence','Providence'],['Prospect','Prospect'],['Ascent','Ascent']];
 return '<section class="walk-atlas-hero" aria-labelledby="walk-atlas-title"><div class="walk-art"><img src="assets/full-landscape.png" alt="Illustrated landscape of Sterling Ranch."><div class="walk-art-wash" aria-hidden="true"></div><div class="walk-atlas-copy"><p class="eyebrow">WALKS &amp; PATHS</p><h2 id="walk-atlas-title">Pick a path.<br>See where it goes.</h2><p>Each guide highlights the walk in its surroundings, from start to finish.</p></div><p class="walk-art-note">Route maps and start points inside</p></div><div class="walk-area-filters" role="group" aria-label="Filter walking guides by area">'+filters.map(([a,l])=>'<button type="button" data-walk-area="'+a+'" aria-pressed="'+(a==='all')+'"'+(a!=='all'&&!available.has(a)?' disabled':'')+'>'+l+'</button>').join('')+'</div></section>';
}

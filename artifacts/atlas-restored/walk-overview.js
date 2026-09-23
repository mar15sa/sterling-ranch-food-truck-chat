// Graphic registration to the approved painting, not geographic coordinates.
// CAB map junction/landmark references: Sterling Center, Overlook, Prospect Park.
const ANCHORS = [[[912,549],[975,286]],[[1040,688],[1074,380]],[[125,1404],[374,933]]];
function affine(axis){
 const m=ANCHORS.map(([p,q])=>[...p,1,q[axis]]);
 for(let i=0;i<3;i++){const v=m[i][i];for(let k=i;k<4;k++)m[i][k]/=v;for(let j=0;j<3;j++)if(j!==i){const f=m[j][i];for(let k=i;k<4;k++)m[j][k]-=f*m[i][k];}}
 return m.map(r=>r[3]);
}
const X=affine(0),Y=affine(1);
export const overviewPoint=([x,y])=>[X[0]*x+X[1]*y+X[2],Y[0]*x+Y[1]*y+Y[2]];
export const OVERVIEW_MARKERS={
 'prospect-loop':[310,948], 'providence-west':[699,394], 'overlook-link':[1152,368],
 'titan-promenade':[973,235], 'prospect-north':[429,764], 'prospect-park-link':[547,930],
 'ascent-middle':[802,804], 'ascent-greenway':[1040,713]
};
const COLORS={Providence:'#a44c25',Prospect:'#785078',Ascent:'#146f71'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function walkOverview(trails,activeArea='all'){
 const routes=Array.isArray(trails)?trails:trails?.routes||[];
 const overlays=routes.map((r,i)=>{
  const paths=r.paths.map(p=>p.map(overviewPoint)),anchor=paths[0][Math.floor(paths[0].length/2)],marker=OVERVIEW_MARKERS[r.id]||anchor;
  const lines=cls=>paths.map(p=>`<polyline class="${cls}" points="${p.map(x=>x.map(n=>n.toFixed(2)).join(',')).join(' ')}"/>`).join('');
  return `<button type="button" class="walk-overview__route" data-route="${esc(r.id)}" aria-label="${i+1}. ${esc(r.name)}, ${r.miles} miles. Open walking guide" style="--route-color:${COLORS[r.area]||'#a44c25'};--marker-x:${marker[0]/1536*100}%;--marker-y:${marker[1]/1024*100}%"><svg viewBox="0 0 1536 1024" aria-hidden="true" class="walk-overview__trace"><line class="overview-leader" x1="${marker[0]}" y1="${marker[1]}" x2="${anchor[0]}" y2="${anchor[1]}"/>${lines('overview-route-hit')}${lines('overview-route-casing')}${lines('overview-route-line')}</svg><span class="walk-overview__route-number">${i+1}</span><span class="walk-overview__route-tooltip">${esc(r.name)} · ${r.miles} mi</span></button>`;
 }).join('');
 const key=routes.map((r,i)=>`<button type="button" data-route="${esc(r.id)}" class="walk-overview__key-item" style="--route-color:${COLORS[r.area]||'#a44c25'}"><span>${i+1}</span><strong>${esc(r.name)}<small>${esc(r.area)} · ${r.miles} mi</small></strong><b aria-hidden="true">↗</b></button>`).join('');
 const filters=['all','Providence','Ascent','Prospect'].map(a=>`<button type="button" data-walk-area="${a}" aria-pressed="${a===activeArea}">${a==='all'?'All walking guides':a}</button>`).join('');
 return `<section class="walk-overview" aria-labelledby="walk-overview-title"><div class="walk-overview__heading"><div><p class="walk-overview__eyebrow">WALKS &amp; PATHS</p><h2 id="walk-overview-title">See where your next walk goes.</h2></div><p class="walk-overview__legend">All ${routes.length} walks are highlighted. Tap a route or number to open its guide.</p></div><div class="walk-overview__scene"><img src="assets/full-landscape.png" alt="Full illustrated Sterling Ranch neighborhood, including Prospect to the southwest." draggable="false"><div class="walk-overview__routes" role="group" aria-label="Highlighted walking routes on the full neighborhood map">${overlays}</div><p class="walk-overview__note">Illustrated routes · official map inside each guide</p></div><div class="walk-overview__key" aria-label="Route key">${key}</div><div class="walk-overview__filters" role="group" aria-label="Filter the walking list"><span>Browse below</span>${filters}</div></section>`;
}

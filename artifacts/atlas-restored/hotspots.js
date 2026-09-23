const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Percentage positions annotate the pictured features, not real-world coordinates.
// Only features visible in the reviewed illustration are annotated.
export const modelHotspots={
 pioneer:[{id:'pioneer-play',label:'Playground',x:61,y:45},{id:'pioneer-shelter',label:'Picnic shelter',x:25,y:40}],
 horsebrush:[{id:'horsebrush-bocce',label:'Bocce courts',x:61,y:49},{id:'horsebrush-shelters',label:'Shelters & grills',x:80,y:42}],
 burns:[{id:'burns-courts',label:'Pickleball courts',x:52,y:55}],
 zippity:[{id:'zippity-play',label:'Playground',x:76,y:45},{id:'zippity-shelter',label:'Picnic shelter',x:27,y:46}],
 'ascent-pavilion':[{id:'gathering-pavilion',label:'Pavilion',x:58,y:39}]
};
export function hotspotMarkup(rootId,selected,places){
 const ids=new Set(places.filter(p=>!p.future&&p.parentId===rootId).map(p=>p.id));
 return (modelHotspots[rootId]||[]).filter(p=>ids.has(p.id)).map((p,i)=>`<button type="button" class="model-hotspot" data-hotspot="${esc(p.id)}" data-x="${p.x}" data-y="${p.y}" aria-label="${esc(p.label)} in this illustration" aria-pressed="${selected===p.id}"><span>${i+1}</span><strong>${esc(p.label)}</strong></button>`).join('');
}
export function positionHotspots(building,image){
 if(!image.complete||!image.naturalWidth)return;
 const scale=Math.min(building.clientWidth/image.naturalWidth,building.clientHeight/image.naturalHeight);
 const width=image.naturalWidth*scale,height=image.naturalHeight*scale;
 for(const b of building.querySelectorAll('.model-hotspot')){
  b.style.left=((building.clientWidth-width)/2+Number(b.dataset.x)/100*width)+'px';
  b.style.top=((building.clientHeight-height)/2+Number(b.dataset.y)/100*height)+'px';
 }
}

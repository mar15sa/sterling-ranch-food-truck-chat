const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function modelRail(entries, places, selected){
  const byId=new Map(places.map(p=>[p.id,p]));
  return entries.filter(m=>byId.has(m.id)&&!byId.get(m.id).future).map(m=>{
    const p=byId.get(m.id);
    return `<button type="button" data-model-select="${esc(m.id)}" aria-pressed="${m.id===selected}"><img loading="lazy" decoding="async" src="assets/${esc(m.asset)}" alt="" aria-hidden="true"><span>${esc(p.name)}</span></button>`;
  }).join('');
}

export function modelComparison(model, showingReference=false){
  if(!model)return '';
  const hasReference=Boolean(model.referenceImage);
  const source=model.referenceUrl&&model.sourceLabel?`<a href="${esc(model.referenceUrl)}" target="_blank" rel="noopener">${esc(model.sourceLabel)} ↗</a>`:'';
  if(!hasReference)return '';
  return `<div class="comparison-switch" role="group" aria-label="Choose illustration or official photo"><button type="button" data-model-media="illustration" aria-pressed="${!showingReference}">Illustration</button><button type="button" data-model-media="photo" aria-pressed="${showingReference}">Official photo</button></div><p class="model-scope">${esc(model.scope||model.caption||'Illustrated model paired with an official reference photo.')}</p>${source}`;
}

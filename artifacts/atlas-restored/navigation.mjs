const names = new Set(['all','Providence','Ascent','Prospect','Parkvale']);
const lenses = new Set(['all','play','everyday','walks']);
const layers = new Set(['places','walks','future']);
const id = value => /^[a-z0-9-]{1,100}$/.test(value || '') ? value : null;
const number = (value, fallback, min, max) => value !== null && Number.isFinite(Number(value)) ? Math.max(min,Math.min(max,Number(value))) : fallback;

export function readNavigation(search='') {
  const q=new URLSearchParams(search), place=id(q.get('place'));
  const view=['neighborhood','place','walks','future'].includes(q.get('view'))?q.get('view'):q.get('lens')==='future'?'future':place?'place':'neighborhood';
  const village=names.has(q.get('village'))?q.get('village'):'all';
  return {view,place,group:Math.floor(number(q.get('group'),0,0,10)),photo:q.get('photo')==='1',source:q.get('source')==='1',opened:q.get('closed')!=='1',
    discovery:{village,lens:lenses.has(q.get('lens'))?q.get('lens'):'all',unfolded:q.get('unfold')==='1',layer:layers.has(q.get('layer'))?q.get('layer'):'places'},
    focus:{target:(q.get('focus')==='village'||(!q.has('focus')&&village!=='all'&&view!=='place'))&&village!=='all'?{kind:'village',name:village}:(q.get('focus')==='place'||view==='place')&&place?{kind:'place',id:place}:null,manual:number(q.get('zoom'),1,.65,3)},
    future:{mode:q.get('futureMap')==='projects'?'projects':'villages',area:q.get('futureArea')||'all',selected:id(q.get('plan')),zoom:number(q.get('futureZoom'),1,1,3)},returnMap:q.get('return')==='1'?{
      discovery:{village:names.has(q.get('returnArea'))?q.get('returnArea'):'all',lens:lenses.has(q.get('returnLens'))?q.get('returnLens'):'all',unfolded:q.get('returnUnfold')==='1',layer:layers.has(q.get('returnLayer'))?q.get('returnLayer'):'places'},
      focus:{target:q.get('returnFocus')==='village'&&names.has(q.get('returnArea'))?{kind:'village',name:q.get('returnArea')}:q.get('returnFocus')==='place'&&id(q.get('returnPlace'))?{kind:'place',id:id(q.get('returnPlace'))}:null,manual:number(q.get('returnZoom'),1,.65,3)}
    }:null};
}

export function navigationQuery(s) {
  const q=new URLSearchParams();
  if(s.view!=='neighborhood')q.set('view',s.view);
  if(s.place)q.set('place',s.place);
  if(s.group)q.set('group',s.group);
  if(s.photo)q.set('photo','1');
  if(s.source)q.set('source','1');
  if(s.opened===false)q.set('closed','1');
  const d=s.discovery||{};
  if(d.village&&d.village!=='all')q.set('village',d.village);
  if(d.lens&&d.lens!=='all')q.set('lens',d.lens);
  if(d.unfolded)q.set('unfold','1');
  if(d.layer&&d.layer!=='places')q.set('layer',d.layer);
  if(s.focus?.target)q.set('focus',s.focus.target.kind);
  if(s.focus?.manual&&s.focus.manual!==1)q.set('zoom',s.focus.manual);
  if(s.future?.mode==='projects')q.set('futureMap','projects');
  if(s.future?.selected)q.set('plan',s.future.selected);
  if(s.future?.area&&s.future.area!=='all')q.set('futureArea',s.future.area);
  if(s.future?.zoom&&s.future.zoom!==1)q.set('futureZoom',s.future.zoom);
  if(s.returnMap){
    const r=s.returnMap;q.set('return','1');
    if(r.discovery?.village!=='all')q.set('returnArea',r.discovery.village);
    if(r.discovery?.lens!=='all')q.set('returnLens',r.discovery.lens);
    if(r.discovery?.unfolded)q.set('returnUnfold','1');
    if(r.discovery?.layer!=='places')q.set('returnLayer',r.discovery.layer);
    if(r.focus?.target){q.set('returnFocus',r.focus.target.kind);if(r.focus.target.id)q.set('returnPlace',r.focus.target.id);}
    if(r.focus?.manual&&r.focus.manual!==1)q.set('returnZoom',r.focus.manual);
  }
  // Explicit map mode is required when a selected place is retained in the URL.
  if(s.view==='neighborhood'&&s.place)q.set('view','neighborhood');
  return q.toString()?'?'+q.toString():'';
}

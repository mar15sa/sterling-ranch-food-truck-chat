import { searchPlaces } from './catalog.mjs';

export function outing(route) {
  const loop = route.type?.toLowerCase() === 'loop';
  const miles = route.miles * (loop ? 1 : 2);
  return { miles, min: Math.round(miles * 20), max: Math.round(miles * 30),
    label: loop ? 'Loop · back to your start' : 'Out & back · return included' };
}
export function matchesWalk(route, {area='all', minutes=0}={}) {
  return (area==='all'||route.area===area) && (!minutes || outing(route).max<=minutes);
}
export function globalSearch(places, villages, routes, query) {
  const q=query.trim(); if(!q)return [];
  const routeRecords=routes.map(r=>({...r,description:r.description+' '+r.area,
    tags:['walk','walks','trail','paths',r.type],resultKind:'route'}));
  const records=[...places.map(p=>({...p,resultKind:p.future?'future':'place',
    tags:[...(p.tags||[]),...(p.visit?.suitability||[]).filter(s=>s.supported===true).map(s=>s.label)]})),
    ...villages.map(p=>({...p,resultKind:'future'})),...routeRecords];
  return searchPlaces(records,q);
}
export function projectStatus(place, update) {
  const status=update?.status||place.status||'';
  if(/under construction/i.test(status))return 'Under construction';
  if(place.openingDate||update?.targetDate||/target|202[6-9]|203\d/.test(status+' '+(update?.summary||'')))return 'Announced target';
  return 'Long-range plan';
}
export function sortProjects(records, updates=[]) {
  const rank={'Under construction':0,'Announced target':1,'Long-range plan':2};
  return [...records].sort((a,b)=>rank[projectStatus(a,updates.find(u=>u.id===a.id))]-rank[projectStatus(b,updates.find(u=>u.id===b.id))]||a.name.localeCompare(b.name));
}

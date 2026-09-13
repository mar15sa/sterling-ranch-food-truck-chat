(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AtlasCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const categories = {
    parks: {label:'Parks & trails', color:'#427865', elevation:48},
    amenities: {label:'Pools & gathering', color:'#336b80', elevation:76},
    businesses: {label:'Local businesses', color:'#946443', elevation:112},
    services: {label:'Schools & services', color:'#51618b', elevation:96},
    makers: {label:'Neighborhood makers', color:'#956477', elevation:130},
    future: {label:'What’s coming', color:'#79618e', elevation:160},
  };
  const statuses = {existing:'Here today',listed:'Listed by source',building:'Under construction',seasonal:'Seasonal amenity',planned:'Planned',construction:'Site preparation',partial:'Open, with more planned',unconfirmed:'Opening status needs checking'};
  const normalize = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  function filterPlaces(places, category, query) {
    const words = normalize(query).split(' ').filter(Boolean);
    return places.filter(p => (category === 'all' || p.category === category || (category === 'future' && p.future)) && words.every(word => normalize([p.name,p.parentName,p.village,p.description,...p.tags,...(p.aliases||[])].join(' ')).includes(word)));
  }
  function directoryGroups(places, category='all', query='') {
    const byId=new Map(places.map(p=>[p.id,p])), groups=new Map();
    for(const match of filterPlaces(places,category,query)){
      let root=match;const seen=new Set([root.id]);
      while(root.parentId&&byId.has(root.parentId)&&!seen.has(root.parentId)){seen.add(root.parentId);root=byId.get(root.parentId);}
      if(!groups.has(root.id))groups.set(root.id,{place:root,matches:[],children:places.filter(p=>p.parentId===root.id)});
      groups.get(root.id).matches.push(match);
    }
    return [...groups.values()];
  }
  function project(coordinates, bounds, view = 'model') {
    const [lon, lat] = coordinates;
    const x = 100 + (lon-bounds.west)/(bounds.east-bounds.west)*1000;
    const y = 130 + (bounds.north-lat)/(bounds.north-bounds.south)*680;
    return view === 'flat' ? [x,y] : [600+(x-600)-(y-470)*.16,510+(y-470)*.8];
  }
  function groupPlaces(places) {
    const groups = new Map();
    for (const p of places.filter(p=>Array.isArray(p.coordinates))) {
      const key=p.locationGroup || p.id;
      if(!groups.has(key)) groups.set(key,{key,coordinates:p.coordinates,places:[]});
      groups.get(key).places.push(p);
    }
    return [...groups.values()];
  }
  function safeLink(value) {
    if (typeof value !== 'string') return null;
    if (/^\/(?!\/)[a-z0-9/?=&._%-]*$/i.test(value)) return value;
    try {const u=new URL(value); return u.protocol==='https:' && !u.username && !u.password ? u.href : null;} catch {return null;}
  }
  function directionsUrl(place) {
    if (!place.address || !place.coordinates || place.locationPrecision !== 'facility') return null;
    return 'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(place.name+', '+place.address);
  }
  function sourceIsDue(place, today = new Date()) {
    const checked = Date.parse(place.checkedAt);
    return !Number.isFinite(checked) || today.getTime()-checked > (place.reviewAfterDays||30)*86400000;
  }
  function validateCatalog(data) {
    if (!data || !Array.isArray(data.places) || !data.places.length) throw Error('Place collection is unavailable.');
    const ids=new Set();
    for(const p of data.places){
      if(!p.id || ids.has(p.id) || !p.name || !categories[p.category] || !statuses[p.status] || !Array.isArray(p.tags) || !Array.isArray(p.sources) || !p.sources.length || !p.sources.every(s=>safeLink(s.url)) || p.reviewState!=='staging-review') throw Error('A place record needs review.');
      if(p.coordinates && (p.coordinates.length!==2 || !p.coordinates.every(Number.isFinite) || p.coordinates[0]<-105.1 || p.coordinates[0]>-104.99 || p.coordinates[1]<39.45 || p.coordinates[1]>39.55)) throw Error('A map location needs review.');
      if(p.category==='makers' && (!p.ownerConsent || (p.coordinates && p.locationPrecision==='facility' && !p.publishExactLocation))) throw Error('A maker listing needs owner permission.');
      ids.add(p.id);
    }
    return data;
  }
  function validateTrails(data){
    const strings=v=>Array.isArray(v)&&v.length>0&&v.every(s=>typeof s==='string'&&s.trim());
    const box=v=>Array.isArray(v)&&v.length===4&&v.every(Number.isFinite)&&v[2]>0&&v[3]>0;
    if(data?.coordinateSpace!=='source-image-pixels'||data.reviewState!=='staging-review'||!safeLink(data.image)||!safeLink(data.source?.url)||!safeLink(data.source?.listingUrl)||!Array.isArray(data.imageSize)||data.imageSize.length!==2||!data.imageSize.every(n=>Number.isFinite(n)&&n>0)||!box(data.overview)||!Array.isArray(data.routes)||!data.routes.length)throw Error('Trail guide needs review.');
    const point=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=0&&p[1]>=0&&p[0]<=data.imageSize[0]&&p[1]<=data.imageSize[1];
    for(const update of data.annotationUpdates||[])if(!box(update.box)||!strings(update.lines)||!safeLink(update.sourceUrl))throw Error('Trail map annotation needs review.');
    const ids=new Set();
    for(const route of data.routes){
      if(!/^[a-z0-9-]+$/.test(route.id)||ids.has(route.id)||!strings([route.name,route.area,route.description,route.start,route.finish,route.geometryMethod,route.sourceScope])||!strings(route.steps)||!strings(route.nearbyPlaceIds)||!box(route.viewBox)||!/^#[a-f0-9]{6}$/i.test(route.color)||!['Loop','One way'].includes(route.type)||!point(route.startPoint)||!point(route.endPoint))throw Error('Trail display details need review.');
      if(!Number.isFinite(route.miles)||route.miles<=0||!Array.isArray(route.distanceParts)||!route.distanceParts.length||!route.distanceParts.every(n=>Number.isFinite(n)&&n>0)||Math.abs(route.distanceParts.reduce((a,b)=>a+b,0)-route.miles)>.001||!Array.isArray(route.paths)||!route.paths.length)throw Error('Trail distance needs review.');
      ids.add(route.id);
      for(const path of route.paths){if(!Array.isArray(path)||path.length<2||!path.every(point))throw Error('Trail alignment needs review.');}
      if(route.type==='Loop'){const first=route.paths[0][0],last=route.paths.at(-1).at(-1);if(first[0]!==last[0]||first[1]!==last[1])throw Error('Trail loop does not close.');}
      for(let i=1;i<route.paths.length;i++)if(JSON.stringify(route.paths[i-1].at(-1))!==JSON.stringify(route.paths[i][0]))throw Error('Trail segments do not connect.');
    }
    return data;
  }
  function clampTrailView(box,imageSize){return box.map((n,i)=>i>1?n:box[i+2]>imageSize[i]?(imageSize[i]-box[i+2])/2:Math.max(0,Math.min(imageSize[i]-box[i+2],n)));}
  return {categories,statuses,filterPlaces,directoryGroups,project,groupPlaces,safeLink,directionsUrl,sourceIsDue,validateCatalog,validateTrails,clampTrailView};
});

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
    makers: {label:'Neighborhood makers', color:'#956477', elevation:130},
    future: {label:'What’s coming', color:'#79618e', elevation:160},
  };
  const statuses = {existing:'Here today',seasonal:'Seasonal amenity',planned:'Planned',construction:'Site preparation',partial:'Open, with more planned',unconfirmed:'Opening status needs checking'};
  const normalize = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  function filterPlaces(places, category, query) {
    const words = normalize(query).split(' ').filter(Boolean);
    return places.filter(p => (category === 'all' || p.category === category || (category === 'future' && p.future)) && words.every(word => normalize([p.name,p.village,p.description,...p.tags,...(p.aliases||[])].join(' ')).includes(word)));
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
  return {categories,statuses,filterPlaces,project,groupPlaces,safeLink,directionsUrl,sourceIsDue,validateCatalog};
});

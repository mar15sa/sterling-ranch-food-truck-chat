// Discovery is derived from the saved directory. It never supplies new locations.
export function descendants(id, places) {
  const result = [], seen = new Set([id]), queue = [id];
  while (queue.length) {
    const parent = queue.shift();
    for (const p of places) if (p.parentId === parent && !p.future && !seen.has(p.id)) {
      seen.add(p.id); result.push(p); queue.push(p.id);
    }
  }
  return result;
}

export function features(place, places) {
  const family = [place, ...descendants(place.id, places)];
  const text = family.map(p => [p.name, ...(p.tags || [])].join(' ')).join(' ').toLowerCase();
  const ancestors = [], seen = new Set();
  for (let p = place; p && !seen.has(p.id); p = places.find(parent => parent.id === p.parentId)) {
    seen.add(p.id); ancestors.push(p);
  }
  const privateAmenities = ancestors.some(p => /apartments|private amenities/.test((p.tags || []).join(' ').toLowerCase()));
  const result = [];
  for (const [key, label, pattern] of [
    ['coffee', 'Coffee', /coffee|cafe/], ['food', 'Food & drinks', /food|taproom|cocktail|market/],
    ['play', 'Playground', /playground|nature play|climbing \/ play/], ['court', 'Pickleball', /pickleball/],
    ['basketball', 'Basketball', /basketball/], ['bocce', 'Bocce', /bocce/],
    ['swim', 'Pool & water play', /pool|splash/], ['fitness', 'Fitness', /fitness/],
    ['picnic', 'Picnic & shelter', /picnic|shelter|pavilion/], ['walk', 'Walking', /walk|trailhead|wildlife corridor/],
    ['school', 'School & childcare', /school|academy/], ['care', 'Health & wellbeing', /medical|urgent care|dental|eyecare|spa & clinic/],
  ]) if (pattern.test(text)) result.push({ key, label });
  return { items: result, privateAmenities };
}

export function matchesLens(place, places, lens, trails) {
  if (lens === 'all') return true;
  if (lens === 'future') return place.future === true;
  if (lens === 'walks') return (trails.accessPoints || []).some(a => a.placeId === place.id) || trails.routes.some(r => r.nearbyPlaceIds.includes(place.id)) || features(place, places).items.some(f => f.key === 'walk');
  const { items, privateAmenities } = features(place, places);
  if (lens === 'play') return !privateAmenities && place.category !== 'services' && (place.category === 'parks' || items.some(f => ['play', 'swim', 'court'].includes(f.key)));
  if (lens === 'everyday') return place.category === 'services' || items.some(f => ['coffee', 'food', 'care', 'school'].includes(f.key));
  return false;
}

export function routesFor(id, trails) { return trails.routes.filter(r => r.nearbyPlaceIds.includes(id)); }
export function futureGroups(places) { return places.filter(p => p.future && !places.some(parent => parent.id === p.parentId && parent.future)); }

// Label anchors are graphic orientation labels only, never village boundaries.
export const villages = [
  { name: 'Providence', x: 76, y: 44, focus: 'mccormick' },
  { name: 'Ascent', x: 67, y: 73, focus: 'yard-27' },
  { name: 'Prospect', x: 20, y: 80, focus: 'prospect-park' },
  { name: 'Parkvale', x: 44, y: 72, focus: 'prose' },
];

export const iconPaths = {
  park: '<path d="m12 3-7 9h4l-5 6h16l-5-6h4zM12 18v4"/>',
  play: '<path d="m3 21 5-17h8l5 17M7 8h10M11 8v8m-3 0h6"/>',
  coffee: '<path d="M4 8h12v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zm12 1h2a3 3 0 0 1 0 6h-2M7 2v3m5-3v3M3 22h16"/>',
  court: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h18M8 3v18m8-18v18"/>',
  swim: '<path d="M3 17q3-4 6 0t6 0 6 0M3 22q3-4 6 0t6 0 6 0M7 14V5a2 2 0 0 1 4 0m4 9V5a2 2 0 0 1 4 0M7 7h8M7 11h8"/>',
  school: '<path d="m2 8 10-5 10 5-10 5zM6 10v8q6 4 12 0v-8M22 8v10"/>',
  home: '<path d="m2 11 10-9 10 9M5 9v12h14V9M10 21v-7h4v7"/>',
  walk: '<path d="M5 21c0-7 14-2 14-9S6 12 6 5"/><circle cx="6" cy="3" r="2"/>',
  future: '<path d="M12 2v5m0 10v5M2 12h5m10 0h5M5 5l3 3m8 8 3 3M5 19l3-3m8-8 3-3"/><circle cx="12" cy="12" r="3"/>',
  layers: '<path d="m2 8 10-5 10 5-10 5zM2 13l10 5 10-5M2 18l10 5 10-5"/>',
};
export function iconFor(place, places) {
  const { items, privateAmenities } = features(place, places);
  if (privateAmenities) return 'home';
  const keys = items.map(f => f.key);
  return ['coffee','school','court','swim','play','walk'].find(k => keys.includes(k)) || 'park';
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { unfoldedScene } from './unfold-ui.js';

const roots = [
  { id: 'north', name: 'North <Park>', village: 'Providence', category: 'parks' },
  { id: 'south', name: 'South & Park', village: 'Ascent', category: 'parks' },
  { id: 'unlocated', name: 'Directory "Only"', village: 'Ascent', category: 'parks' },
];
const plans = [{ id: 'future-a', name: 'Future <Plan>', village: 'Ascent', future: true }];
const places = [...roots, ...plans];
const trails = { routes: [{ id: 'cab', name: 'CAB <Route>', area: 'Ascent', type: 'Loop', miles: 1, nearbyPlaceIds: ['south'] }] };
const point = id => ({ north: [150, 200], south: [800, 700] }[id]);
const scene = options => unfoldedScene({ places, roots, trails, point, located: new Map([['north', {}], ['south', {}]]), routeSvg: route => `<svg aria-label="${route.name}"></svg>`, ...options });

test('places overview covers every matching root and keeps unlocated entries unpinned', () => {
  const html = scene({ layer: 'places' });
  for (const root of roots) assert.match(html, new RegExp(`data-open="${root.id}"`));
  assert.equal((html.match(/class="unfold-pin"/g) || []).length, 2);
  assert.doesNotMatch(html, /--pin-x:[^"]*unlocated/);
  assert.match(html, /Directory &quot;Only&quot;.*directory only/);
});

test('area and lens filters bound the places directory', () => {
  const html = scene({ village: 'Ascent', layer: 'places' });
  assert.match(html, /data-open="south"/);
  assert.match(html, /data-open="unlocated"/);
  assert.doesNotMatch(html, /data-open="north"/);
});

test('a crowded area uses unique slots for its bounded lifted scene while listing every root', () => {
  const crowded = Array.from({ length: 9 }, (_, index) => ({ id: `place-${index}`, name: `Place ${index}`, village: 'Ascent', category: 'parks' }));
  const html = unfoldedScene({ places: crowded, roots: crowded, point: id => [100 + Number(id.slice(6)) * 40, 300], located: new Map(crowded.map(place => [place.id, {}])), village: 'Ascent' });
  assert.equal((html.match(/class="unfold-pin"/g) || []).length, 7, 'the scene caps at its seven distinct slots');
  const slots = [...html.matchAll(/--card-x:([^;]+);--card-y:([^%]+%)/g)].map(match => `${match[1]}/${match[2]}`);
  assert.equal(new Set(slots).size, 7, 'no visible card reuses a slot');
  for (const place of crowded) assert.match(html, new RegExp(`data-open="${place.id}"`));
});

test('future records do not leak into the places layer and retain their own layer', () => {
  const placesHtml = scene({ layer: 'places' });
  assert.doesNotMatch(placesHtml, /future-a/);
  const futureHtml = scene({ village: 'Ascent', layer: 'future' });
  assert.match(futureHtml, /data-open="future-a"/);
  assert.match(futureHtml, /aria-label="Lifted future plans"/);
});

test('unfold output escapes saved text in labels and route content', () => {
  const html = scene({ village: 'Ascent', layer: 'places' });
  assert.match(html, /South &amp; Park/);
  assert.doesNotMatch(html, /South & Park/);
  const walks = scene({ village: 'Ascent', layer: 'walks' });
  assert.match(walks, /CAB &lt;Route&gt;/);
  assert.doesNotMatch(walks, /Future <Plan>/);
});

 test('expanded walks stay complete in the directory and bounded above the landscape', () => {
 const many = { routes: Array.from({length:8}, (_,i)=>({...trails.routes[0], id:`walk-${i}`})) };
 const html = scene({layer:'walks', trails:many});
 const floating = html.split('aria-label="Lifted walking guides"')[1].split('</section>')[0];
 assert.equal((floating.match(/data-route=/g)||[]).length,3);
 for(const route of many.routes) assert.match(html, new RegExp(`data-route="${route.id}"`));
 assert.match(html,/8 guides · full list below/);
 });

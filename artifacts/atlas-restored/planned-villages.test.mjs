import assert from 'node:assert/strict';
import test from 'node:test';
import { searchPlaces } from './catalog.mjs';
import { readNavigation, navigationQuery } from './navigation.mjs';
import { activeVillageNames, plannedVillage, plannedVillages, villagePlanSource } from './planned-villages.mjs';
import {villagePlanMarkup} from './village-plans-ui.js';
import {readFileSync} from 'node:fs';

test('wider view has the complete official plan as its always-visible geographic base',()=>{
 const html=villagePlanMarkup(),base=html.split('<div class="village-plan-sheet">')[1].split('</div>')[0];
 assert.match(base,/<img class="village-plan-geography" src="assets\/village-master-plan.jpg"/);
 assert.match(base,/alt="Complete official CAB master plan:/);
 assert.doesNotMatch(base,/<details|planning-paper/);
 const bytes=readFileSync(new URL('./assets/village-master-plan.jpg',import.meta.url));
 assert.ok(bytes.length>100000,'source plan must be a real image');
 assert.equal(bytes[0],0xff);assert.equal(bytes[1],0xd8);
});

test('geographic pins are compact numbers with readable names in a separate list',()=>{
 const html=villagePlanMarkup(),base=html.split('<div class="village-plan-sheet">')[1].split('</div>')[0];
 const pins=[...base.matchAll(/<button class="village-plan-pin"[^>]*>([\s\S]*?)<\/button>/g)];
 assert.equal(pins.length,5);
 pins.forEach((p,i)=>{assert.equal(p[1],`<span>${i+1}</span>`);assert.match(p[0],new RegExp('aria-label="Explore '+plannedVillages[i].name+'"'));});
 const list=html.split('<div class="planned-village-list"')[1].split('</div>')[0];
 for(const v of plannedVillages)assert.equal(list.split(`<strong>${v.name}</strong>`).length-1,1);
});

const expectedAreas = [
  'Heirloom Village',
  'Paramount Center',
  'Heritage Village',
  'Promontory Village',
  'Pinnacle Village',
];

test('the CAB plan contributes exactly its five future named areas', () => {
  assert.deepEqual(plannedVillages.map((area) => area.name), expectedAreas);
  assert.equal(plannedVillages.every((area) => area.future === true), true);
  assert.equal(plannedVillages.every((area) => area.category === 'Future village area'), true);
  assert.equal(plannedVillages.some((area) => activeVillageNames.includes(area.name)), false);
});

test('Paramount keeps the CAB map’s Center distinction', () => {
  const paramount = plannedVillage('planned-paramount');
  assert.equal(paramount?.name, 'Paramount Center');
  assert.match(paramount?.note ?? '', /calls this Paramount Center/i);
  assert.equal(plannedVillage('planned-paramount-village'), null);
});

test('future-area dates remain unknown and every entry retains CAB provenance', () => {
  for (const area of plannedVillages) {
    assert.equal(area.openingDate, null, `${area.name} must not invent an opening date`);
    assert.equal(area.source, villagePlanSource);
    assert.equal(area.source.url, 'https://sterlingranchcab.com/DocumentCenter/View/416/Sterling-Ranch-Master-Graphic-PDF');
    assert.equal(area.source.date, '2025-08-08');
  }
});

test('future-area entries are searchable', () => {
  assert.equal(searchPlaces(plannedVillages, 'Pinnacle').some((area) => area.id === 'planned-pinnacle'), true);
  assert.equal(searchPlaces(plannedVillages, 'Paramount Center').some((area) => area.id === 'planned-paramount'), true);
});

test('future village and project selections round-trip through navigation', () => {
  for (const query of [
    '?view=future&plan=planned-heirloom',
    '?view=future&futureMap=projects&futureArea=Providence&plan=library',
  ]) {
    const state = readNavigation(query);
    assert.deepEqual(readNavigation(navigationQuery(state)), state);
  }
  assert.equal(readNavigation('?view=future&plan=planned-pinnacle').future.selected, 'planned-pinnacle');
});

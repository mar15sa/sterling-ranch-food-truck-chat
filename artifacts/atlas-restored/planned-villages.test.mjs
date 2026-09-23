import assert from 'node:assert/strict';
import test from 'node:test';
import { searchPlaces } from './catalog.mjs';
import { readNavigation, navigationQuery } from './navigation.mjs';
import { activeVillageNames, plannedVillage, plannedVillages, villagePlanSource } from './planned-villages.mjs';

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

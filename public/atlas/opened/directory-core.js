(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('../atlas-core') : root.AtlasCore);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OpenedDirectory = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  'use strict';
  function merge(catalog, directory, visitorNotes) {
    const places = [...catalog.places, ...directory.additions].map(p => ({...p}));
    C.validateCatalog({places});
    const byId = new Map(places.map(p => [p.id, p]));
    const notes = {...visitorNotes.places};
    for (const update of directory.updates) {
      const place = byId.get(update.id);
      if (!place || !update.summary || !Array.isArray(update.highlights) || !Array.isArray(update.sources) || !update.sources.length || !Array.isArray(update.actions) || ![...update.sources, ...update.actions].every(a => a.label && C.safeLink(a.url))) throw Error('Center visitor details need review.');
      notes[update.id] = {...update, checkedAt: directory.checkedAt};
      Object.assign(place, {description: update.summary, checkedAt: directory.checkedAt, sources: update.sources});
      if (update.suite) {
        place.address = `8155 Piney River Avenue, Suite ${update.suite}, Sterling Ranch, CO 80125`;
        place.locationPrecision = 'parent-area';
      }
    }
    const seen = new Set();
    const groups = directory.groups.map(group => {
      if (!group.id || !group.label || !group.placeIds.length) throw Error('Center grouping needs review.');
      for (const id of group.placeIds) {
        if (seen.has(id) || byId.get(id)?.parentId !== 'sterling-center') throw Error('Center grouping needs review.');
        seen.add(id);
      }
      return {...group, placeIds: [...group.placeIds]};
    });
    // Newly added direct tenants remain visible even before someone assigns a group.
    const rest = places.filter(p => p.parentId === 'sterling-center' && !seen.has(p.id));
    if (rest.length) groups.push({id:'also-here',label:'Also at Sterling Center',placeIds:rest.map(p => p.id)});
    return {places, notes, groups};
  }
  return {merge};
});

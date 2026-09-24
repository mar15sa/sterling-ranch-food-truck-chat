import data from './data/planned-villages.json' with {type:'json'};
export const villagePlanSource=data.source;
export const plannedVillages=data.areas.map(p=>({...p,source:villagePlanSource}));
export const activeVillageNames=data.activeVillageNames;
export function plannedVillage(id){return plannedVillages.find(v=>v.id===id)||null;}

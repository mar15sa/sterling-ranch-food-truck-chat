import fs from 'node:fs';
import {plannedVillages,villagePlanSource,activeVillageNames} from '../planned-villages.mjs';
fs.writeFileSync(new URL('../data/planned-villages.json',import.meta.url),JSON.stringify({source:villagePlanSource,activeVillageNames,areas:plannedVillages.map(({source,...p})=>p)},null,2)+'\n');
fs.writeFileSync(new URL('../planned-villages.mjs',import.meta.url),`import data from './data/planned-villages.json' with {type:'json'};\nexport const villagePlanSource=data.source;\nexport const plannedVillages=data.areas.map(p=>({...p,source:villagePlanSource}));\nexport const activeVillageNames=data.activeVillageNames;\nexport function plannedVillage(id){return plannedVillages.find(v=>v.id===id)||null;}\n`);

export const villagePlanSource = {url:'https://sterlingranchcab.com/DocumentCenter/View/416/Sterling-Ranch-Master-Graphic-PDF',date:'2025-08-08',checked:'2026-09-23',label:'CAB illustrative master plan · August 2025'};
export const plannedVillages = [
 {id:'planned-heirloom',name:'Heirloom Village',x:47,y:13,location:'The northern part of the plan, north of Paramount Center.',color:'#869c38'},
 {id:'planned-paramount',name:'Paramount Center',x:59,y:24,location:'North-central, west of Providence and south of Heirloom.',color:'#b7a75e',note:'The CAB map calls this Paramount Center. Its name on future developer announcements may change.'},
 {id:'planned-heritage',name:'Heritage Village',x:44,y:36,location:'West of Providence and north of Parkvale.',color:'#116747',note:'This is the planned village area, separate from Heritage Regional Park. A matching name does not establish the park’s village assignment.'},
 {id:'planned-promontory',name:'Promontory Village',x:37,y:69,location:'Southeast of Prospect, southwest of Parkvale and west of Pinnacle.',color:'#266947'},
 {id:'planned-pinnacle',name:'Pinnacle Village',x:57,y:78,location:'The southern part of the plan, south of Ascent and east of Promontory.',color:'#b69a22'}
].map(p=>({...p,future:true,category:'Future village area',openingDate:null,source:villagePlanSource,description:p.location+' Planning area; opening date not announced.',tags:['village','planned','coming soon']}));
export const activeVillageNames=['Providence','Ascent','Prospect','Parkvale'];
export function plannedVillage(id){return plannedVillages.find(v=>v.id===id)||null;}

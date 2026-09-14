"use strict";
const {emitEvidenceEnvelope}=require('../../lib/community-connector-adapter');
const {getCommunityFoodTruckSchedule,validIsoDate}=require('../../lib/community-food-truck-live');
const {getWasteSchedule}=require('../../lib/community-waste-schedule');

function requireDay(request){
 if(!validIsoDate(request.dateRange?.start)||request.dateRange.end!==request.dateRange.start)throw new Error('A single valid live request day is required');
}
async function fetchExtraLive(request,{profile,adapter,fetchImpl,clock=Date.now}){
 requireDay(request);
 // Existing helpers select their family's configured adapter. Reject ambiguous
 // configurations before calling them, so selection cannot silently drift.
 const matching=profile.connectors.filter(c=>c.type===adapter.family);
 if(matching.length!==1||matching[0].id!==adapter.connectorId)throw new Error('Exact extra live adapter binding unavailable');
 if(request.kind==='food-truck'&&adapter.family==='food-truck-schedule'){
  const result=await getCommunityFoodTruckSchedule(request,{profile,fetchImpl,now:new Date(clock())});
  if(result.date!==request.dateRange.start||result.sourceUrl!==adapter.endpoints.find(e=>e.id==='schedule')?.url)throw new Error('Food-truck schedule source or date mismatch');
  // Normalize the fetched schedule only. Missing menu enrichment is a separate
  // facet gap and cannot turn a healthy schedule into a missing schedule.
  const envelope=emitEvidenceEnvelope(adapter,{observedAt:result.checkedAt,request:{dateRange:request.dateRange},
   sources:[{id:'schedule',sourceUrl:result.sourceUrl,checkedAt:result.checkedAt,controllingSourceRole:'operational'}],
   claims:result.trucks.map((t,i)=>({id:'truck-'+i,facet:'event-date',text:t.name,controllingEvidenceId:adapter.adapterId+':schedule',controllingSourceRole:'operational'})),
   coverage:{requested:['event-date'],covered:['event-date']},degradation:{state:'healthy'},
   actions:[{id:'schedule',type:'information',label:adapter.labels.calendarAction,url:result.sourceUrl}]});
  return {...result,evidenceEnvelope:envelope};
 }
 if(request.kind==='waste-schedule'&&adapter.family==='live-waste-schedule'){
  const settings=matching[0].adapter.wasteSchedule;
  if(!['garbage','recycling'].includes(request.service)||typeof request.serviceArea!=='string'||request.serviceArea&&!settings.serviceAreas.some(a=>a.label===request.serviceArea))throw new Error('Invalid collection service or area');
  const result=await getWasteSchedule({profile,fetchImpl,now:new Date(clock()),cache:false,
   question:request.service+' '+request.serviceArea,routingPlan:{dateRange:request.dateRange}});
  return {...result,evidenceEnvelope:result.evidence};
 }
 throw new Error('Extra live request does not match its adapter');
}

function projectExtraLive(result,adapter,request){
 requireDay(request);const envelope=result.evidenceEnvelope;
 if(JSON.stringify(envelope.request?.dateRange)!==JSON.stringify(request.dateRange))throw new Error('Extra live date scope mismatch');
 if(request.kind==='food-truck'&&adapter.family==='food-truck-schedule'){
  if(result.date!==request.dateRange.start||!Array.isArray(result.trucks)||result.sourceUrl!==adapter.endpoints.find(e=>e.id==='schedule')?.url)throw new Error('Invalid food-truck result');
  for(const [i,t] of result.trucks.entries())if(!t.name||!envelope.claims.some(c=>c.id==='truck-'+i&&c.text===t.name&&c.facet==='event-date'))throw new Error('Unbound food-truck listing');
  return {title:adapter.labels.calendarTitle,data:{kind:'food-truck',requestedDate:result.date,trucks:result.trucks.map(t=>({name:t.name})),
   matchStatus:result.trucks.length?'listings-for-requested-day':'no-listing-for-requested-day',
   scopeLimit:'Official schedule listings for this day only. No menu, price, later-event absence, business permission or guaranteed attendance is established.'}};
 }
 if(request.kind==='waste-schedule'&&adapter.family==='live-waste-schedule'){
  if(result.service!==request.service||!Array.isArray(result.serviceAreas)||result.sourceUrl!==adapter.endpoints.find(e=>e.id==='pickup-calendar')?.url)throw new Error('Collection service or source mismatch');
  const areas=result.serviceAreas.filter(a=>a.date&&(!request.serviceArea||a.label===request.serviceArea));
  if(!areas.length||areas.some(a=>!validIsoDate(a.date)||a.date<request.dateRange.start||!envelope.claims.some(c=>c.facet==='date'&&c.text===a.date)))throw new Error('Missing or unbound collection dates');
  return {title:adapter.labels.sourceTitle,data:{kind:'waste-schedule',service:request.service,requestedArea:request.serviceArea,startingDate:request.dateRange.start,
   serviceAreas:areas.map(({label,date})=>({label,date})),
   scopeLimit:'Next pickup dates on or after the starting day for these public service areas only. A date does not establish a holiday delay, pickup on the requested day, private-address service or cart-storage rules.'}};
 }
 throw new Error('Unsupported extra live result');
}
module.exports={requireDay,fetchExtraLive,projectExtraLive};

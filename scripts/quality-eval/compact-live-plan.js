"use strict";
const {SYSTEM_V2}=require('./understanding-candidate');
const {connectorChoices,resolveLivePlan}=require('./live-request-plan');
function supportedChoices(choices){return choices.map(c=>{
 if(c.kind==='food-truck')return {...c,capabilities:['events'],facets:['event-date','date','action']};
 return c;
});}
function compactRequest(original){
 const request=structuredClone(original),need=request.tools?.[0]?.input_schema?.properties?.needs?.items;
 if(!need?.properties?.liveRequest||request.tools[0].name!=='route_community_question')throw Error('Expanded live request required');
 delete need.properties.subject;need.required=need.required.filter(k=>k!=='subject');
 delete need.properties.liveRequest.properties.kind;need.properties.liveRequest.required=need.properties.liveRequest.required.filter(k=>k!=='kind');
 request.system=SYSTEM_V2+'\n'+[
  'For every need, request is the complete standalone subquestion with its subject and requested detail. Do not emit a separate subject. Retain the complete intent, context and conditions in request.',
  'Each need has liveRequest with connectorId, dateText and filters. Select only a configured connector ID for a live-operation need. For every other need, and for unavailable capabilities, use an empty connectorId, empty dateText, and empty filter strings. Do not emit kind; software derives it from the connector ID.',
  'Use only the advertised supported capabilities. A general calendar supplies event listings, not dedicated food-truck schedules or collection dates. Copy the exact requested date phrase and activity/place words to calendar dateText/category/location. An unspecified upcoming calendar search uses empty dateText.',
  'Food-truck supplies only task schedule on a single explicitly requested day, with copied dateText and empty filters. It cannot provide menu, prices, business permission, unspecified next truck or multiple dates.',
  'Waste-schedule supplies only task schedule for next pickup on or after one day, not holiday delay status or storage rules. Copy trash/garbage/recycling/recycle to category and a requested configured service area to location. Never use a street address. Empty dateText starts today; empty location requests available public service areas. Split garbage and recycling into separate needs.',
  'Current-status supplies only task status for its named facility now, with empty dateText and filters. It cannot supply regular hours, future opening, prices, booking or rules.',
  'Copy date/filter wording from the resident messages; never calculate dates or invent a filter. Preserve date scope separately for each need. Use prior resident context only when required, applying explicit current corrections. Connector descriptions are retrieval instructions, not local factual evidence.'
 ].join('\n');
 const payload=JSON.parse(request.messages[0].content);payload.connectors=supportedChoices(payload.connectors);request.messages[0].content=JSON.stringify(payload);return request;
}
function resolveCompactLivePlan(raw,row,profile,now=Date.now()){
 const fail=issue=>({plan:raw,issues:[issue],requests:{},diagnostics:[]});
 if(!raw||!Array.isArray(raw.needs))return fail('missing-compact-needs');
 const choices=connectorChoices(profile),plan=structuredClone(raw);
 for(const need of plan.needs){
  if(!need||Object.keys(need).some(k=>!['request','task','evidenceKind','liveRequest'].includes(k))||typeof need.request!=='string'||!need.request.trim())return fail('invalid-compact-need');
  const live=need.liveRequest;
  if(!live||typeof live.connectorId!=='string'||Object.keys(live).sort().join(',')!=='connectorId,dateText,filters')return fail('invalid-compact-live-request');
  // Internal compatibility hint only; preserve the complete canonical request.
  need.subject=need.request.slice(0,160);
  live.kind=live.connectorId?choices.find(c=>c.connectorId===live.connectorId)?.kind||'unavailable':'none';
 }
 return resolveLivePlan(plan,row,profile,now);
}
module.exports={supportedChoices,compactRequest,resolveCompactLivePlan};

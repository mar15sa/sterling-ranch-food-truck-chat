"use strict";
// Evaluation-only bridge. A resolved connector request is supplied explicitly;
// this module does not infer a subject or select a connector from resident text.
const {createConnectorAdapters}=require('../../lib/community-connector-adapter');
const {getCommunityEvents}=require('../../lib/community-events');
const {getCommunityPoolStatus}=require('../../lib/community-pool-status');
const {hash}=require('./flow-evidence');
const {fetchExtraLive,projectExtraLive}=require('./extra-live-evidence');

function requireCurrent(value,now){
 const checked=Date.parse(value?.checkedAt),expires=Date.parse(value?.staleAfter);
 if(!Number.isFinite(checked)||!Number.isFinite(expires)||checked>now||expires<=now||expires<checked)throw new Error('Live evidence is expired or invalid');
}
function safeUrl(url,adapter){
 const parsed=new URL(url);
 if(parsed.protocol!=='https:'||parsed.username||parsed.password||!adapter.sourceHosts.includes(parsed.hostname.toLowerCase()))throw new Error('Live source outside adapter hosts');
 return parsed.href;
}
function projectLiveResult(result,adapter,request,{now=Date.now(),timezone}={}){
 const envelope=result?.evidenceEnvelope;
 if(!timezone||envelope?.adapterId!==adapter.adapterId||envelope.communityId!==adapter.communityId||envelope.connectorFamily!==adapter.family)throw new Error('Live adapter identity mismatch');
 if(envelope.degradation?.state!=='healthy'||result.diagnostics?.sourceOutcome&&result.diagnostics.sourceOutcome!=='ok')throw new Error('Live source is unavailable or degraded');
 if(!Array.isArray(envelope.evidence)||!envelope.evidence.length)throw new Error('Missing live evidence');
 requireCurrent(envelope.freshness,now);
 for(const source of envelope.evidence){
  if(source.communityId!==adapter.communityId||source.controllingSourceRole!=='operational')throw new Error('Wrong live source role or community');
  safeUrl(source.sourceUrl,adapter);requireCurrent(source,now);
 }
 if(!envelope.evidence.some(s=>s.sourceUrl===result.sourceUrl))throw new Error('Live result URL does not match its evidence');
 if((envelope.claims||[]).some(c=>c.controllingSourceRole!=='operational'||!envelope.evidence.some(s=>s.evidenceId===c.controllingEvidenceId)))throw new Error('Unbound operational claim');
 const actions=(envelope.actions||[]).map(a=>({label:a.label,url:safeUrl(a.url,adapter),actionType:a.type}));
 let data,title;
 if(adapter.family==='civicplus-calendar'){
  if(hash(envelope.request?.dateRange)!==hash(request.dateRange)||hash(envelope.request?.filters||{})!==hash(request.filters||{})||!Array.isArray(result.events))throw new Error('Calendar request scope mismatch');
  const dates=envelope.request.dateRange;
  for(const event of result.events){
   if(event.date<dates.start||event.date>dates.end||!envelope.claims?.some(c=>c.id==='event-'+event.id&&c.text===`${event.title}: ${event.startDate}`))throw new Error('Calendar event is outside returned evidence');
   safeUrl(event.url,adapter);
  }
  data={kind:'calendar',timezone,observedAt:envelope.observedAt,requestedRange:dates,filters:request.filters||{},
   matchStatus:result.events.length?'matches-in-checked-range':'no-matches-in-checked-range',
   events:result.events.map(({title,startDate,location,url})=>({title,startDate,location,url})),
   scopeLimit:'This result covers only the requested dates and filters. It does not establish that no later event exists.'};
  // Alternative events do not become matches for the resident's request.
  const eventUrls=new Set(result.events.map(e=>e.url));
  actions.splice(0,actions.length,...actions.filter(a=>eventUrls.has(a.url)));
  title=adapter.labels.calendarTitle||'Official community calendar';
 }else if(adapter.family==='live-status'){
  if(request.kind!=='current-status'||!envelope.claims?.some(c=>c.facet==='status'&&c.text===result.headline))throw new Error('Status request or claim mismatch');
  data={kind:'current-status',timezone,observedAt:envelope.observedAt,headline:result.headline,summary:result.summary,
   scopeLimit:'Current operational status only; does not establish regular hours, future availability, season dates or permission.'};
  title=adapter.labels.openAction||'Official current status';
 }else if(['food-truck-schedule','live-waste-schedule'].includes(adapter.family)){
  const projected=projectExtraLive(result,adapter,request);title=projected.title;data={...projected.data,timezone,observedAt:envelope.observedAt};
 }else throw new Error('Live adapter family not integrated');
 const checkedAt=envelope.evidence.map(e=>e.checkedAt).sort()[0],staleAfter=envelope.evidence.map(e=>e.staleAfter).sort()[0];
 const sourceUrl=safeUrl(result.sourceUrl,adapter),text=JSON.stringify(data),contentHash=hash([adapter.adapterId,envelope,text,actions]);
 return {id:adapter.adapterId+':'+contentHash.slice(0,16),communityId:adapter.communityId,title,sourceUrl,text,contentHash,checkedAt,staleAfter,
  adapterId:adapter.adapterId,controllingSourceRole:'operational',actions,liveScope:data};
}

function createLiveEvidenceRetriever({profile,requests={},fetchImpl=fetch,clock=Date.now}={}){
 const adapters=createConnectorAdapters(profile);
 return async (need,plan={})=>{
  const request=requests[need.id]||plan.liveRequests?.[need.id];
  if(need.evidenceKind!=='live-operation')throw new Error('Live bridge requires a live need');
  if(!request)return {sources:[],diagnostics:plan.liveRequestDiagnostics?.filter(d=>d.needId===need.id).length?plan.liveRequestDiagnostics.filter(d=>d.needId===need.id):[{needId:need.id,reason:'live-request-not-resolved'}]};
  const adapter=adapters.find(a=>a.connectorId===request.connectorId);
  try{
   if(!adapter)throw new Error('Live connector is not configured');
   let result;
   if(adapter.family==='civicplus-calendar'&&request.kind==='calendar'&&request.dateRange){
    result=await getCommunityEvents({dateRange:request.dateRange,filters:request.filters||{}},{profile,adapter,fetchImpl,now:new Date(clock())});
   }else if(adapter.family==='live-status'&&request.kind==='current-status'){
    const configured=(profile.connectors||[]).filter(c=>c.adapter?.poolStatus);
    if(configured.length!==1||configured[0].id!==adapter.connectorId)throw new Error('Exact status adapter binding unavailable');
    result=await getCommunityPoolStatus({profile,fetchImpl,now:()=>new Date(clock())});
   }else if(['food-truck','waste-schedule'].includes(request.kind)){
    result=await fetchExtraLive(request,{profile,adapter,fetchImpl,clock});
   }else throw new Error('Requested live capability not integrated');
   return {sources:[projectLiveResult(result,adapter,request,{now:clock(),timezone:profile.timezone})],diagnostics:[]};
  }catch(error){return {sources:[],diagnostics:[{needId:need.id,reason:'live-evidence-unavailable',detail:error.message}]};}
 };
}
module.exports={requireCurrent,projectLiveResult,createLiveEvidenceRetriever};

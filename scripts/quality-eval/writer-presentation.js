"use strict";
const {isDeepStrictEqual}=require('node:util');
const PRESENTATION_INSTRUCTIONS=[
 'assistantEvidenceContext is system metadata about what this assistant checked and what it can establish. It is not quoted content from an official source. Do not attribute its scope limits or missing coverage to the website.',
 'Distinguish an unavailable or unverified detail from an official statement that the detail does not exist. Normalized evidence describes supported observations, not necessarily the exact wording of the page.',
 'Use writerContext.timezone for community-local dates and times. If a check time is useful, use the supplied labeled local check time; never display a UTC clock time as an unlabeled local time. An observation timestamp does not prove the cause of an observed state.',
 'Respect the scoped dates, filters and capability limits in assistantEvidenceContext. They cannot supply a missing menu, fee, future occurrence, permission or other fact.'
].join('\n');
const stableSchema={type:'object',additionalProperties:false,required:['answer','actionIds'],properties:{answer:{type:'string'},actionIds:{type:'array',items:{type:'string'}}}};
function localTime(value,timezone){
 const ms=Date.parse(value);if(!Number.isFinite(ms))throw Error('Invalid observation timestamp');
 return new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit',timeZoneName:'short'}).format(new Date(ms));
}
function contextFor(packet,{timezone,now}){
 if(typeof timezone!=='string'||!timezone||!Number.isFinite(now))throw Error('A community timezone and clock are required');
 const localDate=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
 return {timezone,localDate,currentTimeUtc:new Date(now).toISOString()};
}
function presentPayload(payload,packet,{timezone,now}){
 const writerContext=contextFor(packet,{timezone,now}),result=structuredClone(payload),assistantEvidenceContext=[];
 if(!Array.isArray(result.evidence)||result.evidence.length!==packet.sources.length||new Set(result.evidence.map(s=>s.id)).size!==result.evidence.length)throw Error('Evidence presentation inventory mismatch');
 result.evidence=result.evidence.map(e=>{
  const source=packet.sources.find(s=>s.id===e.id);
  if(!source||source.role!==e.role||source.text!==e.text||source.sourceUrl!==e.sourceUrl)throw Error('Evidence presentation identity mismatch');
  if(source.role!=='live-operation')return e;
  const checked=Date.parse(source.checkedAt),expires=Date.parse(source.staleAfter);
  if(!Number.isFinite(checked)||!Number.isFinite(expires)||checked>now||expires<=now)throw Error('Live presentation evidence is expired or invalid');
  const metadata={sourceId:source.id,origin:'assistant-observation-and-coverage',timezone,
   checkedAtUtc:source.checkedAt,checkedAtLocal:localTime(source.checkedAt,timezone),staleAfterUtc:source.staleAfter};
  if(source.liveScope){
   const data=JSON.parse(source.text);
   if(!isDeepStrictEqual(data,source.liveScope)||data.timezone!==timezone||typeof data.scopeLimit!=='string')throw Error('Live projection or timezone mismatch');
   const {scopeLimit,observedAt,timezone:sourceTimezone,kind,...facts}=data;
   metadata.scopeLimit=scopeLimit;metadata.connectorKind=kind;metadata.observedAtUtc=observedAt;metadata.observedAtLocal=localTime(observedAt,timezone);
   e={...e,text:JSON.stringify(facts)};
  }
  assistantEvidenceContext.push(metadata);return e;
 });
 return {...result,writerContext,assistantEvidenceContext};
}
function presentWriterRequest(original,packet,{separateContext=false,stableActionSchema=false,timezone,now}={}){
 if(typeof separateContext!=='boolean'||typeof stableActionSchema!=='boolean')throw Error('Invalid writer presentation flags');
 const body=structuredClone(original);
 if(body.tools?.length!==1||body.tools[0].name!=='compose_requested_answer'||body.tools[0].strict!==true)throw Error('Expected existing strict writer request');
 if(stableActionSchema)body.tools[0].input_schema=structuredClone(stableSchema);
 if(separateContext){
  body.messages[0].content=JSON.stringify(presentPayload(JSON.parse(body.messages[0].content),packet,{timezone,now}));
  body.system+='\n'+PRESENTATION_INSTRUCTIONS;
 }
 return body;
}
module.exports={PRESENTATION_INSTRUCTIONS,localTime,presentPayload,presentWriterRequest};

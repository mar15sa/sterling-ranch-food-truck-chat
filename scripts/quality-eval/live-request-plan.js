"use strict";
const {candidateRequest,validationIssues}=require('./understanding-candidate');
const {createConnectorAdapters}=require('../../lib/community-connector-adapter');
const {highConfidenceDateRange,localToday}=require('../../lib/community-interpretation');
const {eventDateRange}=require('../../lib/community-events');
const normalize=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();

function connectorChoices(profile){
 return createConnectorAdapters(profile).map(a=>({connectorId:a.connectorId,family:a.family,vocabulary:a.vocabulary,
  kind:a.family==='civicplus-calendar'?'calendar':a.family==='live-status'&&profile.connectors.some(c=>c.id===a.connectorId&&c.adapter?.poolStatus)?'current-status':'unavailable',
  capabilities:a.capabilities,facets:a.facets}));
}
function liveUnderstandingRequest(row,model,profile,now=Date.now()){
 if(!profile?.timezone)throw new Error('Community timezone required');
 const choices=connectorChoices(profile),request=candidateRequest(row,model,localToday(new Date(now),profile.timezone),'v2');
 const schema=structuredClone(request.tools[0].input_schema),need=schema.properties.needs.items;
 need.required.push('liveRequest');need.properties.liveRequest={type:'object',additionalProperties:false,required:['connectorId','kind','dateText','filters'],properties:{
  connectorId:{type:'string',enum:['',...choices.filter(c=>c.kind!=='unavailable').map(c=>c.connectorId)]},kind:{type:'string',enum:['none','calendar','current-status']},dateText:{type:'string'},
  filters:{type:'object',additionalProperties:false,required:['category','location'],properties:{category:{type:'string'},location:{type:'string'}}}}};
 request.tools[0].input_schema=schema;
 request.system+='\n'+[
  'For each need, record liveRequest using only the supplied configured connector choices. For non-live or unavailable capabilities return kind none, connectorId empty, dateText empty and both filter strings empty.',
  'Calendar supplies scheduled events/classes/meetings for a bounded period. Current-status supplies only its named facility status now, never normal hours, future opening, prices, booking, permission or events. Do not substitute an available connector for another unintegrated family such as waste or food trucks.',
  'For a calendar, copy the exact resident date phrase to dateText; never calculate dates. Leave dateText empty for an unspecified next/upcoming occurrence. Copy only requested event/activity words into category and requested place words into location, or leave empty. Do not add inferred audience, dates, topics or filters.',
  'For current-status use task status, dateText empty, and empty filters. A future status request cannot use the current-status connector.',
  'Retain prior resident context only when needed, but a date in the current question supersedes a prior date. Connector descriptions select retrieval; they prove no local facts.'
 ].join('\n');
 const payload=JSON.parse(request.messages[0].content);payload.timezone=profile.timezone;payload.connectors=choices;request.messages[0].content=JSON.stringify(payload);
 return request;
}
function resolveLivePlan(raw,row,profile,now=Date.now()){
 const plan=structuredClone(raw),requests={},diagnostics=[],choices=connectorChoices(profile);
 if(!Array.isArray(plan?.needs))return {plan,issues:['missing-needs'],requests,diagnostics};
 const live=plan.needs.map(n=>n.liveRequest);plan.needs=plan.needs.map(({liveRequest,...n})=>n);
 const issues=validationIssues(plan);
 if(typeof plan.clarificationQuestion==='string'){
  if(plan.scope!=='ambiguous'&&plan.clarificationQuestion.trim())issues.push('unnecessary-plan-clarification');
  if(plan.clarificationQuestion.length>400||/<\/?(?:antml|parameter)\b/i.test(plan.clarificationQuestion))issues.push('invalid-clarification-text');
 }
 if(issues.length)return {plan,issues,requests,diagnostics};
 const original=[row.question,...(plan.usedPriorContext?(row.context||[]).slice(-3).map(c=>c.question):[])].map(normalize);
 const copied=s=>typeof s==='string'&&s.length<=160&&(!s.trim()||original.some(q=>q.includes(normalize(s))));
 for(const [i,need] of plan.needs.entries()){
  const binding=live[i],needId='need-'+(i+1),fail=reason=>diagnostics.push({needId,reason});
  if(!binding||Object.keys(binding).some(k=>!['connectorId','kind','dateText','filters'].includes(k))||!copied(binding.dateText)||
    !binding.filters||Object.keys(binding.filters).sort().join(',')!=='category,location'||Object.values(binding.filters).some(v=>!copied(v))){fail('invalid-live-request-fields');continue;}
  if(binding.kind==='none'){
   if(binding.connectorId||binding.dateText||Object.values(binding.filters).some(Boolean))fail('contradictory-no-live-request');
   else if(need.evidenceKind==='live-operation')fail('live-capability-unavailable');
   continue;
  }
  const choice=choices.find(c=>c.connectorId===binding.connectorId&&c.kind===binding.kind);
  if(need.evidenceKind!=='live-operation'||!choice||choice.kind==='unavailable'){fail('unsupported-live-binding');continue;}
  if(binding.kind==='current-status'){
   const requestedDate=highConfidenceDateRange(row.question,new Date(now),profile.timezone);
   if(need.task!=='status'||binding.dateText||Object.values(binding.filters).some(Boolean)||requestedDate&&(requestedDate.start!==localToday(new Date(now),profile.timezone)||requestedDate.end!==requestedDate.start)){fail('current-status-cannot-cover-request');continue;}
   requests[needId]={kind:'current-status',connectorId:choice.connectorId};continue;
  }
  if(need.task!=='schedule'){fail('calendar-cannot-cover-request');continue;}
  const currentDate=highConfidenceDateRange(row.question,new Date(now),profile.timezone);
  const inCurrent=binding.dateText.trim()&&normalize(row.question).includes(normalize(binding.dateText));
  const parsed=inCurrent?highConfidenceDateRange(binding.dateText,new Date(now),profile.timezone):currentDate||highConfidenceDateRange(binding.dateText,new Date(now),profile.timezone);
  if(!parsed&&binding.dateText.trim()){fail('unsupported-date-phrase');continue;}
  const range=parsed?{start:parsed.start,end:parsed.end,label:parsed.label}:eventDateRange('',new Date(now),profile.timezone);
  if((Date.parse(range.end)-Date.parse(range.start))/86400000>30){fail('calendar-range-too-large');continue;}
  requests[needId]={kind:'calendar',connectorId:choice.connectorId,dateRange:range,filters:Object.fromEntries(Object.entries(binding.filters).filter(([,v])=>v.trim()))};
 }
 return {plan,issues:[],requests,diagnostics};
}
module.exports={connectorChoices,liveUnderstandingRequest,resolveLivePlan};

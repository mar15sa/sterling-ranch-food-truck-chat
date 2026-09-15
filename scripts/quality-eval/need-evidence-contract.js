"use strict";
// Experimental capability inventory, never a semantic relevance or completeness verdict.
const crypto=require('node:crypto');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const roles=['governing-rule','official-process','official-information','official-action','live-operation'];
const INSTRUCTIONS=[
 'evidenceContract records source capabilities, not verified answers. Its candidates require independent relevance, applicability and completeness review against the original question.',
 'A need may use several source roles together. primaryEvidenceKind is a search hint, never an instruction to ignore another source role. A membership information question may need rules; a booking action may need applicable reservation steps.',
 'Review all requested facts and useful applicable steps, then choose relevant actions. A navigation-only source can prove its approved destination but cannot prove permission, a price, a menu, a password, a process or current status.',
 'The contract distinguishes no candidates, navigation-only candidates and unreviewed factual candidates. None proves that the official website lacks an answer. Describe only what this assistant cannot confirm from the supplied evidence.',
 'Sources found for another need remain available, but do not borrow their subject, date or conditions. Check liveScope, approvalScope and withheldScope. Retrieval association is not proof of relevance. Missing optional actions do not invalidate a supported core answer.'
].join('\n');
function buildEvidenceContract(plan,packet,now=Date.now()){
 if(!plan||plan.scope!=='community'||!Array.isArray(plan.needs)||!plan.needs.length||!packet?.communityId||!Array.isArray(packet.sources)||!Array.isArray(packet.actions))throw Error('Invalid evidence contract input');
 if(packet.sourceRouting==='per-need')throw Error('Exclusive source routing cannot supply a multi-role contract');
 const needIds=new Set(plan.needs.map(n=>n.id)),sourceIds=new Set(packet.sources.map(s=>s.id));
 if(needIds.size!==plan.needs.length||plan.needs.some(n=>!n.id||!roles.includes(n.evidenceKind))||sourceIds.size!==packet.sources.length)throw Error('Invalid evidence contract identity');
 for(const s of packet.sources){
  if(!s.id||s.communityId!==packet.communityId||!s.version||typeof s.text!=='string'||!s.text.trim()||!roles.includes(s.role)||!Array.isArray(s.retrievedForNeedIds)||s.retrievedForNeedIds.some(id=>!needIds.has(id)))throw Error('Unbound evidence contract source');
  if(s.role==='live-operation'&&(!Number.isFinite(Date.parse(s.checkedAt))||!Number.isFinite(Date.parse(s.staleAfter))||Date.parse(s.checkedAt)>now||Date.parse(s.staleAfter)<=now))throw Error('Expired evidence contract source');
 }
 for(const a of packet.actions){const s=packet.sources.find(s=>s.id===a.sourceId);if(!s||a.communityId!==packet.communityId||a.version!==s.version||!s.actions?.some(x=>x.url===a.url&&x.label===a.label))throw Error('Unbound evidence contract action');}
 const sources=packet.sources.map(s=>({sourceId:s.id,role:s.role,capability:s.role==='official-action'?'navigation-only':s.role==='live-operation'?'scoped-current-observation':'unreviewed-factual-text',retrievedForNeedIds:s.retrievedForNeedIds}));
 const needs=plan.needs.map(n=>{const selected=sources.filter(s=>s.retrievedForNeedIds.includes(n.id)),factual=selected.filter(s=>s.capability!=='navigation-only');
  return {needId:n.id,request:n.request,primaryEvidenceKind:n.evidenceKind,semanticCoverage:'not-assessed',candidateState:!selected.length?'no-candidates':!factual.length?'navigation-only':'factual-candidates-require-review',candidateSourceIds:selected.map(s=>s.sourceId),
   observations:[...(!factual.length?['No factual text was retrieved for this need. This does not establish absence from official sources.']:[]),...(n.evidenceKind==='live-operation'&&!selected.some(s=>s.role==='live-operation')?['No current operational evidence was supplied for this need.']:[])],
   retrievalDiagnostics:(packet.diagnostics||[]).filter(d=>d.needId===n.id),omissions:(packet.omissions||[]).filter(o=>o.needIds?.includes(n.id)).map(o=>({sourceId:o.sourceId,reason:o.reason}))};});
 return {version:1,communityId:packet.communityId,binding:hash({plan,packet}),status:'capability-inventory-not-verification',sources,needs};
}
function attachEvidenceContract(request,plan,packet,now){const contract=buildEvidenceContract(plan,packet,now),copy=structuredClone(request),payload=JSON.parse(copy.messages[0].content);payload.evidenceContract=contract;copy.messages[0].content=JSON.stringify(payload);copy.system+='\n'+INSTRUCTIONS;return copy;}
module.exports={buildEvidenceContract,attachEvidenceContract,INSTRUCTIONS};

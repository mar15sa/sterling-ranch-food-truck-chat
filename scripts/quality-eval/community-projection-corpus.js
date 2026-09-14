"use strict";
// Experimental corpus only. Reuse the runtime approval projection; no raw page text.
const {sourceReviewState}=require('../../lib/community-source-answerability');
const {approvedClaimProjection}=require('../../lib/community-search');
const {isDynamicSource}=require('../../lib/community-source-identity');
const {lifecycleFor}=require('../../lib/community-truth');
const {canonicalUrl}=require('../../lib/canonical-source-ledger');
const {isRuntimeEvidenceWithheld}=require('../../lib/community-evidence-quarantine');
function communityProjectionCorpus(index,{communityId,now=Date.now()}={}){
  if(!communityId||index.communityId!==communityId)throw new Error('Community projection snapshot mismatch');
  const gate=sourceReviewState(index,now),documents=[];
  for(const source of index.sources||[]){
    if(source.communityId!==communityId||isDynamicSource(source))continue;
    const entries=gate.entriesFor(source);if(!entries.length)continue;
    const projected=approvedClaimProjection(source,entries,[]);if(!projected.text)continue;
    const factual=entries.some(e=>e.factType!=='link'),actions=entries.some(e=>e.factType==='link');
    documents.push({...projected,nodeId:source.id,canonicalScopedProjection:entries.some(e=>e.approvalClaim),canonicalFactualProjection:factual,
      canonicalActionProjection:actions,canonicalActionOnlyProjection:actions&&!factual,projectionOnly:true});
  }
  return documents;
}
function stagingFormNavigation(index,{profile,approval,now=Date.now(),enabled=false}={}){
  if(!enabled)return [];
  if(!profile?.communityId||index.communityId!==profile.communityId||approval?.scope!=='staging only'||!approval.reviewer||!approval.reviewedAt)
    throw new Error('Require recorded staging-only source authorization');
  const hosts=new Set(profile.allowedHosts||[]);hosts.add(new URL(profile.website).hostname);
  const results=[];
  for(const review of approval.reviews||[]){
    if(review.scope!=='staging sources only'||review.reviewedBy!==approval.reviewer||!Array.isArray(review.hashes)||!review.hashes.length)continue;
    const url=new URL(review.url);if(url.protocol!=='https:'||!hosts.has(url.hostname))throw new Error('Staged form outside official community hosts');
    const sources=(index.sources||[]).filter(s=>s.communityId===profile.communityId&&canonicalUrl(s.sourceUrl)===canonicalUrl(review.url));
    if(sources.length!==review.hashes.length||sources.some(s=>!review.hashes.includes(s.contentHash)||s.connectorType!=='official-pdf'||isRuntimeEvidenceWithheld(s,index)||
      !s.documentFingerprint||lifecycleFor(s,now)!=='current'||!Number.isFinite(Date.parse(s.staleAfter))||Date.parse(s.staleAfter)<now))continue;
    if(new Set(sources.map(s=>s.documentFingerprint)).size!==1||new Set(sources.map(s=>s.contentHash)).size!==review.hashes.length)continue;
    const source=sources[0],label=`Open ${source.title}`;
    results.push({...source,id:'staging-navigation-'+source.id,nodeId:'staging-navigation-'+source.id,text:label,excerpt:label,facts:[],
      actions:[{id:'open-staged-document-'+review.documentId,label,url:source.sourceUrl,actionType:'download',context:source.title}],
      canonicalActionOnlyProjection:true,canonicalActionProjection:true,canonicalFactualProjection:false,projectionOnly:true,
      stagingOnly:true,stagingAuthorization:{reviewer:review.reviewedBy,reviewedAt:review.reviewedAt,sourceId:source.id,hashes:review.hashes,scope:review.scope}});
  }
  return results;
}
module.exports={communityProjectionCorpus,stagingFormNavigation};

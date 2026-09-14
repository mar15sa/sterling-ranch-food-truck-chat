"use strict";
const crypto=require('node:crypto');
const rules=require('../../lib/rules-assistant');
const {availableSectionContext}=require('../../lib/rules-section-context');
const {budgetEvidenceText}=require('../../lib/evidence-prompt-budget');
const {searchCommunityIndex}=require('../../lib/community-search');
const {isDynamicSource}=require('../../lib/community-source-identity');
const {eligibleCorpus,eligibleForQuestion}=require('./semantic-corpus');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function needSearchOptions(need){
  const detail={permission:'permission',specification:'specification',cost:'price',contact:'contact',form:'action',payment:'action',booking:'action',registration:'action','account-access':'action'}[need.task];
  const intent=['permission','specification'].includes(need.task)?'rules':need.task==='form'?'forms':'services';
  return {intent,interpretation:{requestedDetails:detail?[detail]:[]}};
}
function assertBinding({profile,communityIndex,rulesIndex,communityId}){
  if(!communityId||profile?.communityId!==communityId||communityIndex?.communityId!==communityId)throw new Error('Community snapshot mismatch');
  const configured=(profile.connectors||[]).filter(c=>c.type==='municode').map(c=>c.baseUrl.replace(/\/$/,''));
  if(!rulesIndex?.source?.sourceUrl||!configured.includes(rulesIndex.source.sourceUrl.replace(/\/$/,'')))throw new Error('Rules snapshot not bound to this community');
  if(rulesIndex.documents.some(d=>d.communityId&&d.communityId!==communityId))throw new Error('Cross-community rule evidence');
  const base=rulesIndex.source.sourceUrl.replace(/\/$/,''),supplements=new Set((rulesIndex.source.supplementalDocuments||[]).map(s=>s.sourceUrl));
  for(const document of rulesIndex.documents){
    if(document.isSupplemental){if(!supplements.has(document.sourceUrl))throw new Error('Supplement outside bound rules snapshot');}
    else if(document.sourceUrl!==base&&!String(document.sourceUrl).startsWith(base+'?')&&!String(document.sourceUrl).startsWith(base+'/'))throw new Error('Rule document outside bound community path');
  }
}
function makeRetriever(context){
  assertBinding(context);const {profile,communityIndex,rulesIndex,communityId,now=Date.now()}=context;
  const docs=eligibleCorpus(rulesIndex,communityId,now),index={...rulesIndex,documents:docs};
  const hosts=new Set(profile.allowedHosts||[]);hosts.add(new URL(profile.website).hostname);
  return async function retrieve(plan){
    const all=new Map(),diagnostics=[];
    for(const need of plan.needs){
      const query=`${need.subject} ${need.request}`;
      // Live-operation needs must go through the existing live adapters in the next integration stage.
      if(need.evidenceKind==='live-operation'){diagnostics.push({needId:need.id,reason:'live-adapter-not-integrated'});continue;}
      const rr=rules.searchRulesIndex(index,query,4).filter(d=>eligibleForQuestion(d,query));
      const cr=searchCommunityIndex(query,{index:communityIndex,communityId,now,limit:4,includeActionOnlyProjections:true,allowPartialRequestedDetails:true,...needSearchOptions(need)}).sources.filter(s=>!isDynamicSource(s));
      // Interleave ranked sources so one source family cannot use the whole budget first.
      for(let rank=0;rank<Math.max(rr.length,cr.length);rank++)for(const [kind,s] of [['rules',rr[rank]],['community',cr[rank]]]){
        if(!s)continue;
        if(s.communityId&&s.communityId!==communityId)throw new Error('Cross-community retrieval result');
        if(!hosts.has(new URL(s.sourceUrl).hostname))throw new Error('Undeclared evidence host');
        const original=kind==='rules'?docs.find(d=>d.id===s.id&&d.text===s.text):null;
        if(kind==='rules'&&!original)throw new Error('Rule text and identity do not match');
        const expanded=kind==='rules'?availableSectionContext(s,docs,{now,eligible:d=>eligibleForQuestion(d,query)}):null;
        const role=kind==='rules'?'governing-rule':s.canonicalActionOnlyProjection?'official-action':
          ['municode','adopted-document'].includes(s.authorityClass)?'governing-rule':'official-process';
        const source={...s,text:expanded?.text||s.text,evidenceContext:expanded||s.evidenceContext};
        const version=kind==='rules'?hash([s.sourceUrl,s.productId,s.jobId,s.sourceTextHash,s.parentSupplementId]):s.contentHash;
        if(!version)throw new Error('Evidence version missing');
        const key=hash([communityId,kind,s.id,s.sourceUrl,version,source.text]);
        const prior=all.get(key);if(prior){prior.needIds.push(need.id);continue;}
        all.set(key,{id:'e-'+key.slice(0,20),sourceId:s.id,communityId,sourceUrl:s.sourceUrl,title:s.title,version,
          approvalScope:s.ownerReview?.approvedScope||null,withheldScope:s.ownerReview?.withheldScope||[],effectiveDate:s.effectiveDate||s.approvedDate||null,
          role,needIds:[need.id],rank,source,text:source.text,actions:kind==='community'?(s.actions||[]):[],reviewStatus:'eligible-by-existing-gate',freshness:'current-at-snapshot'});
      }
    }
    const units=budgetEvidenceText([...all.values()].sort((a,b)=>a.rank-b.rank),{maxSources:12,maxChars:30000,project:s=>s.text});
    const sources=units.filter(u=>u.text).map(u=>{const {source:internal,...s}=u.source;return {...s,text:u.text,contextCoverage:u.contextCoverage};});
    const actions=sources.flatMap(s=>s.actions.map((a,i)=>({id:`${s.id}-a${i}`,label:a.label,url:a.url,sourceId:s.id,communityId,version:s.version})));
    return {communityId,sources,actions,diagnostics,snapshotHash:hash([communityId,communityIndex,rulesIndex]),
      omissions:units.filter(u=>!u.text).map(u=>({id:u.source.id,reason:u.contextCoverage}))};
  };
}
module.exports={assertBinding,makeRetriever,hash,needSearchOptions};

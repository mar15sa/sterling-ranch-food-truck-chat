"use strict";
const crypto=require('node:crypto');
const rules=require('../../lib/rules-assistant');
const {availableSectionContext}=require('../../lib/rules-section-context');
const {budgetEvidenceText}=require('../../lib/evidence-prompt-budget');
const {searchCommunityIndex}=require('../../lib/community-search');
const {isDynamicSource}=require('../../lib/community-source-identity');
const {communityProjectionCorpus,stagingFormNavigation}=require('./community-projection-corpus');
const {eligibleCorpus,eligibleForQuestion}=require('./semantic-corpus');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function budgetPacketSources(sources,options){
  const selected=budgetEvidenceText(sources,options);
  return [...selected,...sources.slice(options.maxSources).map(source=>({source,text:'',contextCoverage:'omitted-source-limit'}))];
}
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
  assertBinding(context);const {profile,communityIndex,rulesIndex,communityId,now=Date.now(),ruleSearch=rules.searchRulesIndex,
    communityMode='keyword',communitySearch=null,stagingFormApproval=null,liveRetrieve=null}=context;
  if(communityMode==='semantic'&&typeof communitySearch!=='function')throw new Error('Semantic community mode requires an explicit ranker');
  if(!['keyword','complete-catalog','semantic'].includes(communityMode)||stagingFormApproval&&communityMode!=='complete-catalog')throw new Error('Invalid experimental catalog mode');
  const docs=eligibleCorpus(rulesIndex,communityId,now),index={...rulesIndex,documents:docs};
  const hosts=new Set(profile.allowedHosts||[]);hosts.add(new URL(profile.website).hostname);
  const catalog=communityMode==='complete-catalog'?[...communityProjectionCorpus(communityIndex,{communityId,now}),
    ...stagingFormNavigation(communityIndex,{profile,approval:stagingFormApproval,now,enabled:Boolean(stagingFormApproval)})]:[];
  if(catalog.length>50||catalog.reduce((n,s)=>n+s.text.length,0)>10000)throw new Error('Complete approved catalog exceeds experimental bound');
  return async function retrieve(plan){
    const all=new Map(),diagnostics=[];
    function add(kind,s,needId,rank,query){
      if(!s)return;
      if(s.communityId&&s.communityId!==communityId)throw new Error('Cross-community retrieval result');
      if(!hosts.has(new URL(s.sourceUrl).hostname))throw new Error('Undeclared evidence host');
      if(kind==='rules'&&!docs.some(d=>d.id===s.id&&d.text===s.text))throw new Error('Rule text and identity do not match');
      const expanded=kind==='rules'?availableSectionContext(s,docs,{now,eligible:d=>eligibleForQuestion(d,query)}):null;
      const liveNow=kind==='live'?(context.clock||Date.now)():now;
      if(kind==='live'&&(s.controllingSourceRole!=='operational'||!Number.isFinite(Date.parse(s.checkedAt))||!Number.isFinite(Date.parse(s.staleAfter))||Date.parse(s.checkedAt)>liveNow||Date.parse(s.staleAfter)<=liveNow))throw new Error('Invalid current operational evidence');
      const role=kind==='live'?'live-operation':kind==='rules'?'governing-rule':s.canonicalActionOnlyProjection?'official-action':
        ['municode','adopted-document'].includes(s.authorityClass)?'governing-rule':'official-process';
      const source={...s,text:expanded?.text||s.text,evidenceContext:expanded||s.evidenceContext};
      const version=kind==='rules'?hash([s.sourceUrl,s.productId,s.jobId,s.sourceTextHash,s.parentSupplementId]):s.contentHash;
      if(!version)throw new Error('Evidence version missing');
      const identity=expanded?.expanded?expanded.chunkIds:s.id;
      const key=hash([communityId,kind,identity,s.sourceUrl,version,source.text,kind==='rules'?[]:s.actions||[]]);
      const prior=all.get(key);if(prior){
        if(needId&&!prior.retrievedForNeedIds.includes(needId))prior.retrievedForNeedIds.push(needId);
        if(!prior.matchedSourceIds.includes(s.id))prior.matchedSourceIds.push(s.id);return;
      }
      all.set(key,{id:'e-'+key.slice(0,20),sourceId:s.stagingAuthorization?.sourceId||s.id,matchedSourceIds:[s.id],contextChunkIds:expanded?.chunkIds||[],communityId,sourceUrl:s.sourceUrl,title:s.title,version,
        approvalScope:s.ownerReview?.approvedScope||s.stagingAuthorization?.scope||null,withheldScope:s.ownerReview?.withheldScope||[],effectiveDate:s.effectiveDate||s.approvedDate||null,
        role,retrievedForNeedIds:needId?[needId]:[],catalogContext:!needId,rank,source,text:source.text,actions:kind!=='rules'?(s.actions||[]):[],
        ...(kind==='live'?{checkedAt:s.checkedAt,staleAfter:s.staleAfter,adapterId:s.adapterId,liveScope:s.liveScope}:{}),
        stagingOnly:Boolean(s.stagingOnly),stagingAuthorization:s.stagingAuthorization||null,
        reviewStatus:s.stagingOnly?'existing-owner-approval-for-staging-navigation-only':'eligible-by-existing-gate',freshness:'current-at-snapshot'});
    }
    for(const need of plan.needs){
      const query=`${need.subject} ${need.request}`;
      if(need.evidenceKind==='live-operation'){
        if(!liveRetrieve){diagnostics.push({needId:need.id,reason:'live-adapter-not-integrated'});continue;}
        const result=await liveRetrieve(need,plan);diagnostics.push(...(result.diagnostics||[]));
        for(const source of result.sources||[])add('live',source,need.id,0,query);
        continue;
      }
      const rr=communityMode==='complete-catalog'&&need.evidenceKind==='official-action'?[]:(await ruleSearch(index,query,4)).filter(d=>eligibleForQuestion(d,query));
      const cr=communityMode==='keyword'?searchCommunityIndex(query,{index:communityIndex,communityId,now,limit:4,includeActionOnlyProjections:true,allowPartialRequestedDetails:true,...needSearchOptions(need)}).sources.filter(s=>!isDynamicSource(s)):[];
      if(communityMode==='semantic'){
        const queryNow=(context.clock||(()=>now))();
        const selected=await communitySearch(communityIndex,query,4,{now:queryNow,...needSearchOptions(need)});
        if(!Array.isArray(selected)||selected.length>4||new Set(selected.map(s=>s.id)).size!==selected.length)throw new Error('Invalid bounded community selection');
        const approved=new Map(communityProjectionCorpus(communityIndex,{communityId,now:(context.clock||(()=>now))()}).map(s=>[s.id,s]));
        const identity=s=>hash([s.id,s.communityId,s.sourceUrl,s.contentHash,s.title,s.text,s.facts,s.actions]);
        for(const s of selected){const original=approved.get(s.id);if(!original||identity(s)!==identity(original))throw new Error('Community selection changed approved evidence');cr.push(original);}
      }
      for(let rank=0;rank<Math.max(rr.length,cr.length);rank++){add('rules',rr[rank],need.id,rank,query);add('community',cr[rank],need.id,rank,query);}
    }
    const ruleUnits=budgetPacketSources([...all.values()].sort((a,b)=>a.rank-b.rank),{maxSources:12,maxChars:30000,project:s=>s.text});
    const existing=new Set(all.keys());for(const source of catalog)add('community',source,null,0,'');
    const catalogUnits=budgetPacketSources([...all.entries()].filter(([key])=>!existing.has(key)).map(([,s])=>s),{maxSources:50,maxChars:10000,project:s=>s.text});
    const units=[...ruleUnits,...catalogUnits];
    const sources=units.filter(u=>u.text).map(u=>{const {source:internal,...s}=u.source;return {...s,text:u.text,actions:s.actions.map(a=>({id:a.id,label:a.label,url:a.url,actionType:a.actionType})),contextCoverage:u.contextCoverage};});
    const actions=sources.flatMap(s=>s.actions.map((a,i)=>({id:`${s.id}-a${i}`,label:a.label,url:a.url,actionType:a.actionType,sourceId:s.id,communityId,version:s.version,stagingOnly:s.stagingOnly})));
    return {communityId,communityMode,stagingNavigationEnabled:Boolean(stagingFormApproval),sources,actions,diagnostics,snapshotHash:hash([communityId,communityIndex,rulesIndex,stagingFormApproval]),
      retrievalCoverage:{candidateUnits:units.length,providedUnits:sources.length},
      omissions:units.filter(u=>!u.text).map(u=>({id:u.source.id,sourceId:u.source.sourceId,needIds:u.source.retrievedForNeedIds,reason:u.contextCoverage}))};
  };
}
module.exports={assertBinding,makeRetriever,hash,needSearchOptions,budgetPacketSources};

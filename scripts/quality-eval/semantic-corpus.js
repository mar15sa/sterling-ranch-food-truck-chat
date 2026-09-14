"use strict";
const {sourceLifecycleStatus}=require('../../lib/rules-source-lifecycle');
const {currentReplacementSupplements,documentIsSupersededByCurrentSupplement,ownerReviewWithholdsQuestion}=require('../../lib/rules-assistant');
function eligibleCorpus(index,communityId,now=Date.now()){
  if(!communityId||!Array.isArray(index?.documents))throw new Error('Require community-scoped loaded rules index');
  const replacements=currentReplacementSupplements(index.documents);
  return index.documents.filter(d=>d.text&&d.id&&d.nodeId&&d.sourceUrl&&(!d.communityId||d.communityId===communityId)
    &&d.searchable!==false&&!['pending','pending-review','withheld','rejected'].includes(d.reviewStatus)
    &&sourceLifecycleStatus(d,now)==='current'&&!documentIsSupersededByCurrentSupplement(d,replacements));
}
function eligibleForQuestion(d,question){return !ownerReviewWithholdsQuestion(d,question);}
function sectionKey(d){return JSON.stringify([d.communityId,d.sourceUrl,d.nodeId,d.productId,d.jobId,d.sourceTextHash]);}
async function windowsForDocument(document,tokenCount,{maxTokens=510,maxChars=1200,overlap=160}={}){
  if(maxChars<2||overlap<0||overlap>=maxChars||maxTokens<4)throw new Error('Invalid window budget');
  const text=document.text,header=String(document.title||'').slice(0,140)+'\n';
  const windows=[];let start=0;
  while(start<text.length){
    let end=Math.min(text.length,start+maxChars),tokens;
    while((tokens=await tokenCount(header+text.slice(start,end)))>maxTokens){
      if(end-start<2)throw new Error('Cannot fit source unit in token budget');
      end=start+Math.max(1,Math.floor((end-start)*.7));
    }
    windows.push({documentId:document.id,start,end,tokens,input:header+text.slice(start,end)});
    if(end===text.length)break;
    start=Math.max(start+1,end-Math.min(overlap,Math.floor((end-start)/4)));
  }
  return windows;
}
function fuse(keyword,dense,limit=10,k=60){
  const rows=new Map();
  for(const [name,list] of [['keyword',keyword],['semantic',dense]])list.forEach((r,i)=>{
    const key=sectionKey(r.document);const entry=rows.get(key)||{...r,fusionScore:0,ranks:{}};
    entry.fusionScore+=1/(k+i+1);entry.ranks[name]=i+1;rows.set(key,entry);
  });
  return [...rows.values()].sort((a,b)=>b.fusionScore-a.fusionScore).slice(0,limit);
}
module.exports={eligibleCorpus,eligibleForQuestion,sectionKey,windowsForDocument,fuse};

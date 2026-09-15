"use strict";
const crypto=require('node:crypto');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
// Reuse preparation, never query results. One eligibility view is retained at a time.
function createEligibleKeywordIndex(documents,communityId){
 const corpusHash=hash(documents),byId=new Map(documents.map(d=>[d.id,d]));
 if(!communityId||byId.size!==documents.length||documents.some(d=>d.communityId&&d.communityId!==communityId))throw Error('Invalid keyword corpus binding');
 let cached=null,key=null,hits=0,misses=0;
 return {get(index,eligible){
  if(index.communityId&&index.communityId!==communityId||hash(index.documents)!==corpusHash)throw Error('Keyword preparation corpus changed');
  if(new Set(eligible.map(d=>d.id)).size!==eligible.length||eligible.some(d=>byId.get(d.id)!==d))throw Error('Eligibility must contain exact bound source objects');
  const next=hash([index.source,eligible.map(d=>d.id)]);
  if(next===key){hits++;return cached;}
  misses++;key=next;cached=Object.freeze({...index,documents:Object.freeze([...eligible])});return cached;
 },stats(){return {hits,misses,retainedEntries:cached?1:0};},clear(){cached=null;key=null;}};
}
module.exports={createEligibleKeywordIndex};

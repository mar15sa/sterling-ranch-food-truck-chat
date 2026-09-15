"use strict";
const {communityProjectionCorpus}=require('./community-projection-corpus');
const {hash}=require('./flow-evidence');
// Index only approved answer projections. Titles help retrieval but are not fact proof.
// Freshness is rechecked at query time; renewing unchanged evidence need not re-embed it.
function projectionIdentity(s){return hash({id:s.id,communityId:s.communityId,sourceUrl:s.sourceUrl,contentHash:s.contentHash,title:s.title,text:s.text,facts:s.facts,actions:s.actions});}
function frozenCorpus(index,communityId,now=Date.now()){
 const documents=communityProjectionCorpus(index,{communityId,now});
 if(!documents.length||documents.length>1000||new Set(documents.map(d=>d.id)).size!==documents.length)throw Error('Invalid approved community corpus');
 return {communityId,documents,identities:Object.fromEntries(documents.map(d=>[d.id,projectionIdentity(d)]))};
}
function eligibleDocuments(corpus,index,now=Date.now()){
 if(index.communityId!==corpus.communityId)throw Error('Community index binding mismatch');
 if(corpus.documents.some(d=>d.communityId!==corpus.communityId||corpus.identities[d.id]!==projectionIdentity(d)))throw Error('Changed frozen approved corpus');
 const current=communityProjectionCorpus(index,{communityId:corpus.communityId,now});
 return current.filter(d=>corpus.identities[d.id]===projectionIdentity(d));
}
function rankDense({corpus,currentIndex,now,units,vectors,queryVector,dimensions=384}){
 if(!Number.isInteger(dimensions)||dimensions<1||queryVector.length!==dimensions||vectors.length!==units.length*dimensions||[...queryVector].some(n=>!Number.isFinite(n))||vectors.some(n=>!Number.isFinite(n)))throw Error('Invalid semantic vectors');
 const byId=new Map(corpus.documents.map(d=>[d.id,d]));
 for(const unit of units){const d=byId.get(unit.documentId);if(!d||!Number.isInteger(unit.start)||!Number.isInteger(unit.end)||unit.start<0||unit.end>d.text.length||unit.end<=unit.start)throw Error('Invalid approved evidence window');}
 const current=new Map(eligibleDocuments(corpus,currentIndex,now).map(d=>[d.id,d])),best=new Map();
 for(const [i,u] of units.entries()){
  const document=current.get(u.documentId);if(!document)continue;
  let score=0;for(let j=0;j<dimensions;j++)score+=vectors[i*dimensions+j]*queryVector[j];
  if(!best.has(document.id)||score>best.get(document.id).score)best.set(document.id,{document,score,window:u});
 }
 return [...best.values()].sort((a,b)=>b.score-a.score||a.document.id.localeCompare(b.document.id));
}
function fuse(keyword,dense,limit=4,k=60){
 const rows=new Map();
 for(const [method,list] of [['keyword',keyword],['semantic',dense]])for(const [i,r] of list.entries()){
  const key=projectionIdentity(r.document),row=rows.get(key)||{document:r.document,fusionScore:0,ranks:{}};
  if(row.ranks[method])continue;
  row.fusionScore+=1/(k+i+1);row.ranks[method]=i+1;rows.set(key,row);
 }
 return [...rows.values()].sort((a,b)=>b.fusionScore-a.fusionScore||a.document.id.localeCompare(b.document.id)).slice(0,limit);
}
// Keyword search may return a narrower approved projection. Rejoin it to the full
// current approved source only after its exact ID/version is matched.
function bindKeyword(rows,eligible){
 const byId=new Map(eligible.map(d=>[d.id,d]));
 return rows.map(row=>{const document=byId.get(row.id);if(!document||row.contentHash!==document.contentHash||row.sourceUrl!==document.sourceUrl)return null;
  return {document,score:row.score};}).filter(Boolean);
}
module.exports={projectionIdentity,frozenCorpus,eligibleDocuments,rankDense,fuse,bindKeyword};

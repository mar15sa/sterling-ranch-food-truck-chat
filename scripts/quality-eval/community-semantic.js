"use strict";
const {communityProjectionCorpus}=require('./community-projection-corpus');
const {hash}=require('./flow-evidence');
// Experimental retrieval representations; navigation proof never becomes answer facts.
// Freshness is rechecked at query time; renewing unchanged evidence need not re-embed it.
function projectionIdentity(s){return hash({id:s.id,communityId:s.communityId,sourceUrl:s.sourceUrl,contentHash:s.contentHash,title:s.title,text:s.text,facts:s.facts,actions:s.actions});}
function retrievalDocument(source,representation='approved-text'){
 if(!['approved-text','action-proof'].includes(representation))throw Error('Unknown retrieval representation');
 if(representation==='approved-text')return source;
 const proofs=(source.actions||[]).filter(a=>a.reviewStatus==='approved'&&a.approvalClaim&&a.reviewDecisionId&&a.reviewedBy&&a.sourceVersion===source.contentHash
  &&a.evidence?.url===a.url&&(!a.evidence.sourceUrl||a.evidence.sourceUrl===source.sourceUrl)&&typeof a.evidence.context==='string'&&a.evidence.context.trim())
  .map(a=>a.evidence.context.trim());
 if(!proofs.length)return source;
 return {...source,text:source.text+'\n\nReviewed action navigation context (retrieval only; not approved answer facts):\n'+[...new Set(proofs)].join('\n\n')};
}
function answerProjection(source){return {id:source.id,title:source.title,sourceUrl:source.sourceUrl,text:source.text,actions:(source.actions||[]).map(a=>({id:a.id,label:a.label,url:a.url,actionType:a.actionType}))};}
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
function rankDense({corpus,currentIndex,now,units,vectors,queryVector,dimensions=384,representation='approved-text'}){
 if(!Number.isInteger(dimensions)||dimensions<1||queryVector.length!==dimensions||vectors.length!==units.length*dimensions||[...queryVector].some(n=>!Number.isFinite(n))||vectors.some(n=>!Number.isFinite(n)))throw Error('Invalid semantic vectors');
 const byId=new Map(corpus.documents.map(d=>[d.id,retrievalDocument(d,representation)]));
 for(const unit of units){const d=byId.get(unit.documentId);if(!d||!Number.isInteger(unit.start)||!Number.isInteger(unit.end)||unit.start<0||unit.end>d.text.length||unit.end<=unit.start)throw Error('Invalid approved evidence window');}
 const current=new Map(eligibleDocuments(corpus,currentIndex,now).map(d=>[d.id,d])),best=new Map();
 for(const [i,u] of units.entries()){
  const document=current.get(u.documentId);if(!document)continue;
  let score=0;for(let j=0;j<dimensions;j++)score+=vectors[i*dimensions+j]*queryVector[j];
  if(!best.has(document.id)||score>best.get(document.id).score)best.set(document.id,{document,score,window:{documentId:u.documentId,start:u.start,end:u.end,representation}});
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
module.exports={projectionIdentity,retrievalDocument,answerProjection,frozenCorpus,eligibleDocuments,rankDense,fuse,bindKeyword};

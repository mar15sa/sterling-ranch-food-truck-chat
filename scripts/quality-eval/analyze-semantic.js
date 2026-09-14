"use strict";
// Descriptive retrieval output only; these ranks are not human quality labels.
const fs=require('node:fs'),path=require('node:path');
function analyze(directory){
  const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
  if(manifest.status!=='captured')throw new Error('Require a completed retrieval capture');
  const rows=fs.readdirSync(directory).filter(n=>n.endsWith('.json')&&!['manifest.json','corpus.json','comparison.json'].includes(n))
    .map(n=>JSON.parse(fs.readFileSync(path.join(directory,n),'utf8'))).filter(r=>r.isTest&&r.keyword&&r.semantic&&r.hybrid);
  if(rows.length!==manifest.completedCases)throw new Error('Case count does not match the completed manifest');
  const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.ceil(values.length*p)-1)];
  const latency=Object.fromEntries(['keywordMs','queryEmbeddingMs','scanMs'].map(k=>[k,{median:percentile(rows.map(r=>r.latency[k]),.5),p95:percentile(rows.map(r=>r.latency[k]),.95)}]));
  const compact=rows.map(r=>({id:r.id,question:r.question,query:r.query,
    ...Object.fromEntries(['keyword','semantic','hybrid'].map(k=>[k,r[k].slice(0,5).map(s=>({id:s.id,title:s.title,sourceUrl:s.sourceUrl,score:s.score,ranks:s.ranks}))]))}));
  const report={status:'descriptive-only',cases:rows.length,model:manifest.model,modelRevision:manifest.modelRevision,
    eligibleDocuments:manifest.eligibleDocuments,windows:manifest.windows,embeddingMs:manifest.embeddingMs,
    vectorBytes:manifest.vectorBytes,peakRssBytes:manifest.peakRssBytes,latency,paidApiCalls:manifest.paidApiCalls,
    newSubscriptions:manifest.newSubscriptions,qualityConclusion:'Not scored; retrieval relevance and answer quality require separate review.',
    costs:'No embedding API fee was incurred. Production hosting and total answer costs remain unmeasured.',rankings:compact};
  fs.writeFileSync(path.join(directory,'comparison.json'),JSON.stringify(report,null,2)+'\n');
  return {...report,rankings:undefined};
}
if(require.main===module)console.log(JSON.stringify(analyze(path.resolve(process.argv[2])),null,2));
module.exports={analyze};

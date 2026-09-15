"use strict";
const fs=require('node:fs'),path=require('node:path');
const {hash}=require('./flow-evidence');
const {projectionIdentity,retrievalDocument,answerProjection}=require('./community-semantic');
const {times}=require('./summarize-presentation');
function coverage(results,targets,limit=4){const ids=new Set(results.slice(0,limit).map(r=>r.id));const groups=targets.map(g=>g.some(id=>ids.has(id)));return {requiredGroups:groups.length,foundGroups:groups.filter(Boolean).length,allFound:groups.length?groups.every(Boolean):null};}
function analyze(directory){
 const read=f=>JSON.parse(fs.readFileSync(path.join(directory,f),'utf8')),m=read('manifest.json'),spec=read('cases.json'),corpus=read('corpus.json'),index=read('index.json');
 if(m.status!=='captured'||m.completed.length!==44||m.design.length!==44||hash(spec)!==m.casesHash||hash(corpus)!==m.corpusHash||hash(index)!==m.sourceSnapshotHash)throw Error('Require complete identity-matched community retrieval comparison');
 if(m.answerProjectionVersion!==undefined&&m.answerProjectionVersion!==1)throw Error('Unknown answer projection');
 if(m.retrievalRepresentationHash&&hash(corpus.documents.map(d=>retrievalDocument(d,m.representation)))!==m.retrievalRepresentationHash)throw Error('Changed retrieval representation');
 const docs=new Map(corpus.documents.map(d=>[d.id,d])),methods=['keyword','semantic','hybrid'],seen=new Set(),rows=m.completed.map(r=>read(r.id+'.json'));
 for(const [i,row] of rows.entries()){
  const job=m.design[i],c=spec.cases.find(c=>c.id===row.caseId),key=row.caseId+':'+row.repetition;
  if(!c||!row.isTest||row.caseId!==job.caseId||row.repetition!==job.repetition||row.order!==job.order||row.question!==c.question||seen.has(key)||![1,2].includes(row.repetition))throw Error('Changed or duplicate query capture');seen.add(key);
  for(const method of methods){if(new Set(row[method].map(r=>r.id)).size!==row[method].length)throw Error('Duplicate ranked source');
   for(const r of row[method]){const d=docs.get(r.id);if(!d||r.sourceIdentity!==projectionIdentity(d)||r.text!==d.text||r.sourceUrl!==d.sourceUrl||hash(r.actions)!==hash(m.answerProjectionVersion===1?answerProjection(d).actions:d.actions))throw Error('Changed returned source identity or content');}}
 }
 const positive=rows.filter(r=>spec.cases.find(c=>c.id===r.caseId).targets.length),negative=rows.filter(r=>!spec.cases.find(c=>c.id===r.caseId).targets.length);
 if(positive.length!==40||negative.length!==4)throw Error('Unbalanced retrieval comparison');
 const report={status:'complete-development-retrieval-comparison',codeRevision:m.codeRevision,representation:m.representation||'approved-text',answerProjectionVersion:m.answerProjectionVersion||0,isTest:true,queries:rows.length,positiveAttempts:positive.length,negativeControlAttempts:negative.length,methods:{},repeatComparisons:[],negativeControls:[],cases:[],
  costs:{paidApiCalls:m.paidApiCalls,newSubscriptions:m.newSubscriptions,initializationMs:m.initializationMs,windowPlanningMs:m.windowPlanningMs,indexingMs:m.indexingMs,windows:m.windows,vectorBytes:m.vectorBytes,peakRssBytes:m.peakRssBytes,productionHostingCostUsd:null},
  timing:{eligibility:times(rows.map(r=>r.latency.eligibilityMs)),keyword:times(rows.map(r=>r.latency.keywordMs)),queryEmbedding:times(rows.map(r=>r.latency.queryEmbeddingMs)),scanAndEligibility:times(rows.map(r=>r.latency.scanAndEligibilityMs)),semanticRetrieval:times(rows.map(r=>r.latency.queryEmbeddingMs+r.latency.scanAndEligibilityMs)),hybridComponents:times(rows.map(r=>r.latency.queryEmbeddingMs+r.latency.scanAndEligibilityMs+r.latency.keywordMs+r.latency.eligibilityMs))},
  keywordUnboundRows:rows.reduce((n,r)=>n+r.keywordUnboundRows,0),limitations:[...m.limitations,'Recall targets are source groups, not final-answer correctness or human quality ratings.','Hybrid component sum excludes small fusion/serialization overhead; it is not whole-answer latency.']};
 for(const method of methods){const counts=positive.map(r=>coverage(r[method],spec.cases.find(c=>c.id===r.caseId).targets));report.methods[method]={allRequiredSourcesFound:counts.filter(c=>c.allFound).length,attempts:counts.length,requiredSourceGroups:counts.reduce((n,c)=>n+c.requiredGroups,0),sourceGroupsFound:counts.reduce((n,c)=>n+c.foundGroups,0),families:{}};
  for(const family of new Set(spec.cases.filter(c=>c.targets.length).map(c=>c.family))){const rr=positive.filter(r=>spec.cases.find(c=>c.id===r.caseId).family===family);report.methods[method].families[family]={attempts:rr.length,allRequiredSourcesFound:rr.filter(r=>coverage(r[method],spec.cases.find(c=>c.id===r.caseId).targets).allFound).length};}
 }
 for(const c of spec.cases){const pair=rows.filter(r=>r.caseId===c.id);if(pair.length!==2)throw Error('Missing repeat');
  const record={id:c.id,family:c.family,question:c.question,targets:c.targets,expectedBoundary:c.expectedBoundary,results:Object.fromEntries(methods.map(method=>[method,pair.map(r=>({id:r.id,repetition:r.repetition,coverage:coverage(r[method],c.targets),top4:r[method].slice(0,4).map(s=>({id:s.id,title:s.title,sourceUrl:s.sourceUrl}))}))]))};
  report.cases.push(record);if(!c.targets.length)report.negativeControls.push(record);
  for(const method of methods)report.repeatComparisons.push({caseId:c.id,method,sameTop4:hash(pair[0][method].slice(0,4).map(r=>r.id))===hash(pair[1][method].slice(0,4).map(r=>r.id))});
 }
 fs.writeFileSync(path.join(directory,'comparison.json'),JSON.stringify(report,null,2)+'\n');return report;
}
if(require.main===module){try{const r=analyze(path.resolve(process.argv[2]));console.log(JSON.stringify({...r,cases:undefined,negativeControls:undefined,repeatComparisons:{comparisons:r.repeatComparisons.length,changed:r.repeatComparisons.filter(c=>!c.sameTop4).length}}));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={coverage,analyze};

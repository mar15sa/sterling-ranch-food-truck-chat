"use strict";
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {hash}=require('./flow-evidence'),{targets}=require('./summarize-dual-semantic'),{times}=require('./summarize-presentation');
function sourceGroups(sources,groups){const ids=new Set(sources.flatMap(s=>[s.sourceId,...s.matchedSourceIds,...s.contextChunkIds]));return groups.map(g=>g.some(id=>ids.has(id)));}
function summarize(directory){
 const read=f=>JSON.parse(fs.readFileSync(path.join(directory,f+'.json'),'utf8')),m=read('manifest'),inputs=read('candidates');
 assert.equal(m.status,'captured');assert.equal(m.completed.length,10);assert.equal(m.design.length,10);assert.equal(inputs.length,5);assert.equal(hash(inputs),m.candidateHash);assert.ok(m.controlEvidenceMatched);
 const rows=m.completed.map(j=>read(j.id)),seen=new Set();
 for(const [i,r] of rows.entries()){
  const c=inputs.find(c=>c.id===r.caseId),job=m.design[i],key=r.caseId+':'+r.repetition;assert.ok(c&&!seen.has(key)&&r.isTest);seen.add(key);
  assert.equal(r.caseId,job.caseId);assert.equal(r.repetition,job.repetition);assert.equal(r.order,job.order);assert.equal(r.question,c.question);assert.equal(hash(c),r.candidateHash);
  for(const result of Object.values(r.methods)){
   assert.equal(result.sources.length+result.omissions.length,c.candidates.length);
   for(const s of result.sources){const original=c.candidates.find(x=>x.id===s.id),{retrievalText,...approved}=original;assert.equal(hash(s),hash({...approved,text:approved.text.trim()}));assert.ok(!Object.hasOwn(s,'retrievalText'));}
  }
 }
 const report={status:'complete-positive-development-reranking',isTest:true,codeRevision:m.codeRevision,cases:[],methods:{},resources:{paidApiCalls:m.paidApiCalls,newSubscriptions:m.newSubscriptions,model:m.model,modelRevision:m.modelRevision,modelFileBytes:m.modelFileBytes,rerankerInitializationMs:m.rerankerInitializationMs,peakRssBytes:m.peakRssBytes,totalScoredPairs:rows.reduce((n,r)=>n+r.pairs,0),scoringTiming:times(rows.map(r=>r.elapsedMs)),productionHostingCostUsd:null},limitations:m.limitations};
 for(const c of inputs){const pair=rows.filter(r=>r.caseId===c.id);assert.equal(pair.length,2);const results={};for(const method of m.methods){
  const a=pair[0].methods[method],b=pair[1].methods[method];assert.equal(hash(a),hash(b),'Unstable repeated ranking');
  results[method]={allPacketGroups:sourceGroups(a.sources,targets[c.id]),top4Groups:sourceGroups(a.sources.slice(0,4),targets[c.id]),sources:a.sources.map(s=>({id:s.sourceId,title:s.title,role:s.role,needs:s.retrievedForNeedIds})),omissions:a.omissions,characters:a.sources.reduce((n,s)=>n+s.text.length,0)};
 }report.cases.push({id:c.id,question:c.question,candidateCount:c.candidates.length,pairsPerRun:pair[0].pairs,scoringTiming:times(pair.map(r=>r.elapsedMs)),results});}
 for(const method of m.methods)report.methods[method]={uniqueCases:5,allPacketTargets:report.cases.filter(c=>c.results[method].allPacketGroups.every(Boolean)).length,allTargetsInTop4:report.cases.filter(c=>c.results[method].top4Groups.every(Boolean)).length};
 fs.writeFileSync(path.join(directory,'comparison.json'),JSON.stringify(report,null,2)+'\n');return report;
}
if(require.main===module){try{const r=summarize(path.resolve(process.argv[2]));console.log(JSON.stringify({...r,cases:r.cases.map(c=>({...c,results:Object.fromEntries(Object.entries(c.results).map(([method,r])=>[method,{...r,sources:r.sources.slice(0,4),omissions:r.omissions.length}]))}))}));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={summarize};

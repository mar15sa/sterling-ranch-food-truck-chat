"use strict";
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {hash}=require('./flow-evidence'),{times}=require('./summarize-presentation');
function readCapture(directory){
 const read=f=>JSON.parse(fs.readFileSync(path.join(directory,f+'.json'),'utf8')),m=read('manifest'),cases=read('cases');
 const methods=m.methods||['keyword','semantic'];assert.ok(methods.length===2||methods.length===4);assert.equal(new Set(methods).size,methods.length);assert.ok(methods.every(x=>['keyword','semantic','combined-hybrid','combined-semantic','purpose-routed','purpose-routed-hybrid'].includes(x)));
 assert.equal(m.status,'captured');assert.equal(m.completed.length,cases.length*methods.length*2);assert.equal(m.design.length,m.completed.length);assert.equal(hash(cases),m.casesHash);
 assert.equal(hash(read('communityIndex')),m.sourceSnapshotHash);assert.equal(hash(read('rulesIndex')),m.rulesSnapshotHash);
 const seen=new Set(),rows=m.completed.map(j=>read(j.id));
 for(const [i,r] of rows.entries()){
  const job=m.design[i],c=cases.find(c=>c.id===r.caseId),key=[r.caseId,r.method,r.repetition].join(':');
  assert.ok(c&&!seen.has(key));seen.add(key);assert.ok(r.isTest);assert.ok([1,2].includes(r.repetition));assert.ok(methods.includes(r.method));
  assert.equal(r.caseId,job.caseId);assert.equal(r.method,job.method);assert.equal(r.repetition,job.repetition);assert.equal(r.order,job.order);assert.equal(r.question,c.question);assert.equal(hash(r.plan),hash(c.plan));
 }
 return {manifest:m,cases,rows};
}
function summarize(directory,priorDirectory){
 const {manifest:m,cases,rows}=readCapture(directory),prior=readCapture(priorDirectory);
 for(const field of ['sourceSnapshotHash','rulesSnapshotHash','casesHash'])assert.equal(m[field],prior.manifest[field]);
 for(const r of rows){const original=prior.rows.find(p=>p.caseId===r.caseId&&p.method===r.method&&p.repetition===r.repetition);
  assert.equal(hash(r.packet.sources),hash(original.packet.sources),'Instrumentation changed selected source evidence');assert.equal(hash(r.packet.actions),hash(original.packet.actions));
  assert.equal(r.packet.retrievalCoverage.candidateUnits,r.packet.sources.length+r.packet.omissions.length);
 }
 const report={status:'complete-local-evidence-packet-comparison',isTest:true,codeRevision:m.codeRevision,queries:rows.length,selectedEvidenceUnchangedByInstrumentation:true,cases:[],methods:{},paidApiCalls:m.paidApiCalls,newSubscriptions:m.newSubscriptions,initializationMs:m.initializationMs,peakRssBytes:m.peakRssBytes,limitations:m.limitations};
 for(const c of cases){const results={};for(const method of ['keyword','semantic']){
  const pair=rows.filter(r=>r.caseId===c.id&&r.method===method);assert.equal(pair.length,2);assert.equal(hash(pair[0].packet.sources),hash(pair[1].packet.sources),'Unstable source selection');
  results[method]={provided:pair[0].packet.sources.length,characters:pair[0].packet.sources.reduce((n,s)=>n+s.text.length,0),actions:pair[0].packet.actions.length,omissions:pair[0].packet.omissions,
   sources:pair[0].packet.sources.map(s=>({id:s.sourceId,title:s.title,role:s.role,needs:s.retrievedForNeedIds,sourceUrl:s.sourceUrl})),repeatStable:true};
 }report.cases.push({id:c.id,question:c.question,needs:c.plan.needs,results});}
 for(const method of ['keyword','semantic']){const rr=rows.filter(r=>r.method===method);report.methods[method]={attempts:rr.length,packetRetrievalTiming:times(rr.map(r=>r.elapsedMs)),sourceCharacters:rr.map(r=>r.packet.sources.reduce((n,s)=>n+s.text.length,0)),omittedUnits:rr.reduce((n,r)=>n+r.packet.omissions.length,0)};}
 fs.writeFileSync(path.join(directory,'comparison.json'),JSON.stringify(report,null,2)+'\n');return report;
}
if(require.main===module){try{const r=summarize(...process.argv.slice(2).map(p=>path.resolve(p)));console.log(JSON.stringify({...r,cases:r.cases.map(c=>({id:c.id,results:Object.fromEntries(Object.entries(c.results).map(([method,r])=>[method,{...r,sources:undefined}]))}))}));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={readCapture,summarize};

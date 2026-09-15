"use strict";
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {readCapture}=require('./summarize-combined-retrieval'),{hash}=require('./flow-evidence'),{times}=require('./summarize-presentation');
function summarize(directory,priorDirectory){
 const {manifest:m,cases,rows}=readCapture(directory),prior=readCapture(priorDirectory);assert.deepEqual(m.methods,['purpose-routed-hybrid','prepared-hybrid']);assert.equal(rows.length,20);
 for(const key of ['casesHash','sourceSnapshotHash','rulesSnapshotHash'])assert.equal(m[key],prior.manifest[key]);
 for(const c of cases){const current=rows.filter(r=>r.caseId===c.id);assert.equal(new Set(current.map(r=>hash([r.packet.sources,r.packet.actions,r.packet.omissions,r.packet.diagnostics]))).size,1,'Preparation changed complete evidence packet');
  const old=prior.rows.find(r=>r.caseId===c.id&&r.method==='purpose-routed-hybrid');assert.equal(hash(current[0].packet.sources),hash(old.packet.sources));assert.equal(hash(current[0].packet.actions),hash(old.packet.actions));
 }
 const report={status:'complete-identical-packet-preparation-comparison',isTest:true,codeRevision:m.codeRevision,allPacketEvidenceIdentical:true,priorEvidenceIdentical:true,cases:cases.length,attempts:rows.length,methods:Object.fromEntries(m.methods.map(method=>[method,{timing:times(rows.filter(r=>r.method===method).map(r=>r.elapsedMs)),cases:cases.map(c=>({id:c.id,timing:times(rows.filter(r=>r.method===method&&r.caseId===c.id).map(r=>r.elapsedMs))}))}])),preparation:m.keywordPreparation,resources:{communityInitializationMs:m.initializationMs,rulesInitializationMs:m.rulesInitializationMs,peakRssBytes:m.peakRssBytes,paidApiCalls:0,newSubscriptions:0,productionHostingCostUsd:null},limitations:['Five known plans, two randomized repetitions per arm; exact output comparison, not answer quality.','Desktop packet timing includes retrieval and excludes planning, writing and checking.','One bounded prepared view; current source and question eligibility is revalidated every call.']};
 fs.writeFileSync(path.join(directory,'comparison.json'),JSON.stringify(report,null,2)+'\n');return report;
}
if(require.main===module){try{console.log(JSON.stringify(summarize(...process.argv.slice(2).map(p=>path.resolve(p)))));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={summarize};

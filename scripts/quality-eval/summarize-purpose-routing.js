"use strict";
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {readCapture}=require('./summarize-combined-retrieval'),{targets}=require('./summarize-dual-semantic'),{hash}=require('./flow-evidence'),{times}=require('./summarize-presentation');
function summarize(directory,priorDirectory){
 const {manifest:m,cases,rows}=readCapture(directory),prior=readCapture(priorDirectory);
 const hybrid=m.methods.includes('purpose-routed-hybrid'),control=hybrid?'purpose-routed':'combined-semantic';
 assert.deepEqual(m.methods,hybrid?['purpose-routed','purpose-routed-hybrid']:['combined-semantic','purpose-routed']);assert.equal(rows.length,20);
 for(const field of ['sourceSnapshotHash','rulesSnapshotHash','casesHash'])assert.equal(m[field],prior.manifest[field]);
 for(const r of rows.filter(r=>r.method===control)){const p=prior.rows.find(p=>p.caseId===r.caseId&&p.method===r.method&&p.repetition===r.repetition);assert.equal(hash(r.packet.sources),hash(p.packet.sources),'Changed control evidence');}
 const report={status:'complete-development-role-routing',isTest:true,codeRevision:m.codeRevision,cases:[],methods:{},controlEvidenceUnchanged:true,resources:{paidApiCalls:m.paidApiCalls,newSubscriptions:m.newSubscriptions,communityInitializationMs:m.initializationMs,rulesInitializationMs:m.rulesInitializationMs,peakRssBytes:m.peakRssBytes,productionHostingCostUsd:null},limitations:[...m.limitations,'Evidence-role routing changes only allowed source kinds; topical relevance and proactive next steps are not established.']};
 for(const c of cases){const result={};for(const method of m.methods){const pair=rows.filter(r=>r.caseId===c.id&&r.method===method);assert.equal(pair.length,2);assert.equal(hash(pair[0].packet.sources),hash(pair[1].packet.sources),'Unstable repeat');const p=pair[0].packet;
  const ids=new Set(p.sources.flatMap(s=>[s.sourceId,...s.matchedSourceIds,...s.contextChunkIds]));
  result[method]={record:pair[0].id,groupsFound:targets[c.id].map(g=>g.some(id=>ids.has(id))),characters:p.sources.reduce((n,s)=>n+s.text.length,0),actions:p.actions.length,omissions:p.omissions,diagnostics:p.diagnostics,sources:p.sources.map(s=>({id:s.sourceId,title:s.title,role:s.role,needs:s.retrievedForNeedIds}))};
 }report.cases.push({id:c.id,question:c.question,needs:c.plan.needs,results:result});}
 for(const method of m.methods){const rr=rows.filter(r=>r.method===method);report.methods[method]={uniqueCases:5,allDeclaredSourceGroups:report.cases.filter(c=>c.results[method].groupsFound.every(Boolean)).length,packetTiming:times(rr.map(r=>r.elapsedMs)),omissions:rr.reduce((n,r)=>n+r.packet.omissions.length,0),sourceCharacters:rr.map(r=>r.packet.sources.reduce((n,s)=>n+s.text.length,0))};}
 fs.writeFileSync(path.join(directory,'comparison.json'),JSON.stringify(report,null,2)+'\n');return report;
}
if(require.main===module){try{const r=summarize(...process.argv.slice(2).map(p=>path.resolve(p)));console.log(JSON.stringify({...r,cases:r.cases.map(c=>({id:c.id,results:Object.fromEntries(Object.entries(c.results).map(([method,r])=>[method,{...r,sources:undefined,diagnostics:r.diagnostics.length}]))}))}));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={summarize};

"use strict";
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {readCapture}=require('./summarize-combined-retrieval'),{hash}=require('./flow-evidence'),{times}=require('./summarize-presentation');
const form='approved-complete-cab-review-20260914-2a42bf60e534';
const targets={
 'presentation-016':[['approved-drc-application-directory','approved-complete-cab-review-20260914-b053f205c2b4',form]],
 'presentation-018':[['supplement-approved-exterior-lighting-2024-05-17::1::official-text::3'],[form]],
 'presentation-048':[['CORU_CH21STUS_ARTIIREST_S21-22GECOST__SUBSECTION_B_9::1'],[form]],
 'presentation-055':[['CORU_CH21STUS_ARTIIREST_S21-22GECOST__SUBSECTION_B_48::1'],['CORU_CH21STUS_ARTIIREST_S21-22GECOST__SUBSECTION_B_44::1']],
 'presentation-092':[['CORU_CH21STUS_ARTIIREST_S21-22GECOST__SUBSECTION_B_44::1'],[form]]
};
function summarize(directory,controlDirectory){
 const {manifest:m,cases,rows}=readCapture(directory),prior=readCapture(controlDirectory);
 assert.equal(rows.length,40);assert.deepEqual(m.methods,['keyword','semantic','combined-hybrid','combined-semantic']);
 for(const field of ['sourceSnapshotHash','rulesSnapshotHash','casesHash'])assert.equal(m[field],prior.manifest[field]);
 for(const r of rows.filter(r=>['keyword','semantic'].includes(r.method))){const p=prior.rows.find(p=>p.caseId===r.caseId&&p.method===r.method&&p.repetition===r.repetition);assert.equal(hash(r.packet.sources),hash(p.packet.sources),'Changed control evidence');}
 const report={status:'complete-development-retrieval-diagnostic',isTest:true,codeRevision:m.codeRevision,queries:rows.length,unchangedControlEvidence:true,cases:[],methods:{},
  resources:{paidApiCalls:m.paidApiCalls,newSubscriptions:m.newSubscriptions,communityInitializationMs:m.initializationMs,rulesInitializationMs:m.rulesInitializationMs,peakRssBytes:m.peakRssBytes,productionHostingCostUsd:null},limitations:[...m.limitations,'Target source presence is necessary evidence coverage, not sufficient relevance, completeness or final-answer correctness.']};
 for(const c of cases){const results={};assert.ok(targets[c.id]);for(const method of m.methods){
  const pair=rows.filter(r=>r.caseId===c.id&&r.method===method);assert.equal(pair.length,2);assert.equal(hash(pair[0].packet.sources),hash(pair[1].packet.sources),'Unstable repeated packet');
  const packet=pair[0].packet,ids=new Set(packet.sources.flatMap(s=>[s.sourceId,...s.matchedSourceIds,...s.contextChunkIds]));
  results[method]={record:pair[0].id,repeatStable:true,groupsFound:targets[c.id].map(g=>g.some(id=>ids.has(id))),sources:packet.sources.map(s=>({id:s.sourceId,title:s.title,role:s.role,needs:s.retrievedForNeedIds,sourceUrl:s.sourceUrl})),characters:packet.sources.reduce((n,s)=>n+s.text.length,0),actions:packet.actions.length,omissions:packet.omissions};
 }report.cases.push({id:c.id,question:c.question,targets:targets[c.id],results});}
 for(const method of m.methods){const rr=rows.filter(r=>r.method===method);report.methods[method]={uniqueCases:cases.length,uniqueCasesWithAllDeclaredSources:report.cases.filter(c=>c.results[method].groupsFound.every(Boolean)).length,packetTiming:times(rr.map(r=>r.elapsedMs)),omittedUnitsAcrossTenAttempts:rr.reduce((n,r)=>n+r.packet.omissions.length,0)};}
 fs.writeFileSync(path.join(directory,'comparison.json'),JSON.stringify(report,null,2)+'\n');return report;
}
if(require.main===module){try{const r=summarize(...process.argv.slice(2).map(p=>path.resolve(p)));console.log(JSON.stringify({...r,cases:r.cases.map(c=>({id:c.id,results:Object.fromEntries(Object.entries(c.results).map(([method,r])=>[method,{record:r.record,groupsFound:r.groupsFound,characters:r.characters,actions:r.actions,omissions:r.omissions.length}]))}))}));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={summarize,targets};

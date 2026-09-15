"use strict";
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {analyze}=require('./summarize-community-semantic');
function compare(control,variant){
 const read=d=>JSON.parse(fs.readFileSync(path.join(d,'manifest.json'),'utf8'));
 const a=analyze(control),b=analyze(variant),am=read(control),bm=read(variant);
 const fields=['corpusHash','sourceSnapshotHash','casesHash','model','modelRevision','dtype','pooling','dimensions','runtimeVersion','codeRevision','answerProjectionVersion'];
 for(const k of fields)assert.equal(am[k],bm[k],k);
 assert.equal(am.representation,'approved-text');assert.equal(bm.representation,'action-proof');assert.equal(am.answerProjectionVersion,1);
 const changes={};
 for(const method of ['keyword','semantic','hybrid'])changes[method]=b.cases.filter(c=>c.targets.length).map(c=>{
  const before=a.cases.find(x=>x.id===c.id).results[method][0].coverage.allFound,after=c.results[method][0].coverage.allFound;
  return {caseId:c.id,before,after};
 }).filter(c=>c.before!==c.after);
 if([...a.repeatComparisons,...b.repeatComparisons].some(r=>!r.sameTop4))throw Error('Unstable repeats require per-repetition comparison');
 const report={isTest:true,control:path.basename(control),variant:path.basename(variant),verifiedSameInputFields:fields,changes,
  remainingSemanticMisses:b.cases.filter(c=>c.targets.length&&!c.results.semantic[0].coverage.allFound),negativeControls:b.negativeControls,
  limitations:['Known development cases, not unseen or final-answer tests.','Runs are separate; latency differences are not randomized between representations.']};
 fs.writeFileSync(path.join(variant,'paired-comparison.json'),JSON.stringify(report,null,2)+'\n');return report;
}
if(require.main===module){try{const r=compare(...process.argv.slice(2).map(p=>path.resolve(p)));console.log(JSON.stringify({changes:r.changes,remainingSemanticMisses:r.remainingSemanticMisses.map(c=>c.id)}));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={compare};

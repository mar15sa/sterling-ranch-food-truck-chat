"use strict";
const fs=require('node:fs'),path=require('node:path');
const {summarize}=require('./usage');
const percentile=(values,p)=>{const a=[...values].sort((x,y)=>x-y);return a.length?a[Math.max(0,Math.ceil(a.length*p)-1)]:null;};
function buildComparison(manifest,records){
 if(manifest.status!=='captured')throw new Error('Require a completed capture; incomplete runs need a separate failure report');
 const caseIds=[...new Set(manifest.runs.map(r=>r.caseId))],expected=caseIds.length*manifest.repetitions;
 if(records.length!==manifest.runs.length)throw new Error('Missing recorded trials');
 const ids=new Set(records.map(r=>r.id));if(ids.size!==records.length||manifest.runs.some(r=>!ids.has(r.id)))throw new Error('Trial identity mismatch');
 const arms={};
 for(const variant of manifest.variants){
  const rows=records.filter(r=>r.variant===variant.id),keys=new Set(rows.map(r=>r.caseId+':'+r.repetition));
  if(rows.length!==expected||keys.size!==expected||caseIds.some(id=>Array.from({length:manifest.repetitions},(_,i)=>i+1).some(rep=>!keys.has(id+':'+rep))))throw new Error('Comparison is not balanced');
  const calls=rows.flatMap(r=>r.calls),costs=summarize(calls),latencies=rows.map(r=>r.durationMs).sort((a,b)=>a-b);
  if(latencies.some(n=>!Number.isFinite(n)||n<0))throw new Error('Invalid trial duration');
  const median=latencies.length%2?latencies[(latencies.length-1)/2]:(latencies[latencies.length/2-1]+latencies[latencies.length/2])/2;
  arms[variant.id]={questions:rows.length,calls:calls.length,answerPresent:rows.filter(r=>typeof r.response?.answer==='string'&&r.response.answer.trim()).length,
   unreviewed:rows.filter(r=>r.response?.reviewRequired===true).length,errors:rows.filter(r=>r.error||!r.response?.answer).map(r=>r.id),
   medianMs:median,p95Ms:percentile(latencies,.95),costs,perQuestionUsd:costs.estimatedTotalUsd===null?null:costs.estimatedTotalUsd/rows.length,
   per1000Usd:costs.estimatedTotalUsd===null?null:costs.estimatedTotalUsd/rows.length*1000,
   monthlyAnsweringAiUsd:Object.fromEntries([1000,10000,50000].map(n=>[n,costs.estimatedTotalUsd===null?null:costs.estimatedTotalUsd/rows.length*n]))};
 }
 const total=summarize(records.flatMap(r=>r.calls));
 return {isTest:true,sourceRevision:manifest.codeRevision,assessmentMode:manifest.assessmentMode||'inline',communityMode:manifest.communityMode||'keyword',
  cases:caseIds.length,repetitions:manifest.repetitions,trials:records.length,arms,total,reservedUpperUsd:manifest.reservedUpperEstimateUsd,
  limitations:['Answer presence and local/model acceptance are not independently measured usefulness or excellence.',
   'Small authored diagnostic, not unseen holdout or human calibration. The p95 is a nearest-rank sample estimate.',
   'Costs include captured answering attempts; independent later review, hosting/storage and production operations are excluded, not zero.',
   'Token counts priced at dated standard rates are estimates, not provider invoices. Unknown usage prevents a complete cost estimate.',
   'Current-local means the captured checkout, not untouched deployed production. All monthly scenarios assume this exact question mix.']};
}
function main(){
 const directory=path.resolve(process.argv[2]),manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
 const records=manifest.runs.map(r=>JSON.parse(fs.readFileSync(path.join(directory,r.id+'.json'),'utf8')));
 const report=buildComparison(manifest,records);fs.writeFileSync(path.join(directory,'comparison.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}
if(require.main===module)main();
module.exports={buildComparison,percentile};

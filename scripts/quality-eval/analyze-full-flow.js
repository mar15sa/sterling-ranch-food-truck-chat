"use strict";
const fs=require('node:fs'),path=require('node:path');
const {summarize}=require('./usage');
function analyze(directory){
  const m=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json')));if(m.status==='running')throw new Error('Require a terminal run');
  const rows=m.runs.map(r=>JSON.parse(fs.readFileSync(path.join(directory,r.id+'.json'))));
  const percentile=(a,p)=>a.length?[...a].sort((a,b)=>a-b)[Math.ceil(a.length*p)-1]:null;
  const report={status:'diagnostic-only',captureStatus:m.status,sourceSnapshotHash:m.sourceSnapshotHash,variants:{},limitations:m.limitations,
    allRecordedAttemptCosts:m.costs,interruption:m.interruption||null,
    accountingScope:'Per-variant rows below cover completed question records. Top-level allRecordedAttemptCosts also includes journaled calls from an interrupted unfinished question when present. Potential in-flight charges remain unknown.'};
  for(const v of m.variants){const a=rows.filter(r=>r.variant===v.id),cost=summarize(a.flatMap(r=>r.calls)),perAnswer=a.length&&cost.estimatedTotalUsd!==null?cost.estimatedTotalUsd/a.length:null;
    report.variants[v.id]={questions:a.length,distinctCases:new Set(a.map(r=>r.caseId)).size,calls:cost.calls,
      answerPresent:a.filter(r=>r.response?.answer).length,unresolvedOrError:a.filter(r=>r.error||r.response?.status==='unresolved-experiment'||!r.response?.answer).length,
      outcomes:Object.fromEntries([...new Set(a.map(r=>r.response?.completion?.outcome||'unknown'))].map(o=>[o,a.filter(r=>(r.response?.completion?.outcome||'unknown')===o).length])),
      repairAttempts:a.reduce((n,r)=>n+(r.response?.trace||[]).filter(t=>t.stage==='repair').length,0),
      latency:{medianMs:percentile(a.map(r=>r.durationMs),.5),p95Ms:percentile(a.map(r=>r.durationMs),.95)},
      costs:cost,estimatedPerAttemptedAnswerUsd:perAnswer,estimatedPer1000AttemptedAnswersUsd:perAnswer===null?null:perAnswer*1000,
      hypotheticalMonthlyAnsweringOnly:Object.fromEntries([1000,10000,50000].map(n=>[n,perAnswer===null?null:perAnswer*n])),
      byCase:a.map(r=>({id:r.id,caseId:r.caseId,repetition:r.repetition,answer:r.response?.answer||null,outcome:r.response?.completion?.outcome||null,
        reason:r.error||r.response?.reason||null,checks:(r.response?.trace||[]).filter(t=>t.stage==='acceptance').map(t=>({issues:t.issues,hardFailures:t.check?.hardFailures})),durationMs:r.durationMs,costs:summarize(r.calls)}))};
  }
  report.costComparisonBalanced=m.status==='captured'&&new Set(Object.values(report.variants).map(v=>v.questions)).size===1;
  report.qualityClaim='No independent human scoring. Outcome counts describe program decisions, not useful/excellent rates.';
  fs.writeFileSync(path.join(directory,'comparison.json'),JSON.stringify(report,null,2)+'\n');return report;
}
if(require.main===module){const r=analyze(path.resolve(process.argv[2]));console.log(JSON.stringify({...r,variants:Object.fromEntries(Object.entries(r.variants).map(([k,{byCase,...v}])=>[k,v]))},null,2));}
module.exports={analyze};

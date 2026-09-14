"use strict";
const fs=require('node:fs'),path=require('node:path');
function analyze(directory){
  const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
  if(manifest.status!=='captured')throw new Error('Require completed assessment comparison');
  const expectations=new Map(manifest.current.map(r=>[r.caseId,r.expected]));
  const rows=manifest.runs.map(r=>JSON.parse(fs.readFileSync(path.join(directory,r.id+'.json'),'utf8')));
  const percentile=(a,p)=>[...a].sort((x,y)=>x-y)[Math.min(a.length-1,Math.ceil(a.length*p)-1)];
  const currentNegative=manifest.current.filter(r=>r.expected.mustReject),currentPositive=manifest.current.filter(r=>!r.expected.mustReject);
  const report={status:'diagnostic-only',fixtures:manifest.current.length,
    current:{providerApiCalls:0,incrementalAssessmentApiCostUsd:0,
      negativeExamples:currentNegative.length,negativeRatedGoodOrExcellent:currentNegative.filter(r=>['Good','Excellent'].includes(r.assessment.rating)).length,
      positiveExamples:currentPositive.length,positiveRatedWeak:currentPositive.filter(r=>r.assessment.rating==='Weak').length,
      rows:manifest.current.map(r=>({id:r.caseId,rating:r.assessment.rating,residentEffort:r.assessment.residentEffort?.rating,expected:r.expected}))},models:{},
    limitations:manifest.limitations};
  for(const model of manifest.models){
    const subset=rows.filter(r=>r.model===model),valid=subset.filter(r=>r.disposition.status!=='unassessed');
    const negative=subset.filter(r=>expectations.get(r.caseId).mustReject),positive=subset.filter(r=>!expectations.get(r.caseId).mustReject);
    const cost=manifest.costsByModel[model],perCall=cost.estimatedTotalUsd===null?null:cost.estimatedTotalUsd/subset.length;
    report.models[model]={calls:subset.length,valid:valid.length,unassessed:subset.length-valid.length,
      negativeTrials:negative.length,negativeDetected:negative.filter(r=>r.disposition.status==='needs-work').length,
      negativeIncorrectlyAllowed:negative.filter(r=>r.disposition.eligibleForGoodOrExcellent===true).length,
      positiveTrials:positive.length,positiveRejected:positive.filter(r=>r.disposition.status==='needs-work').length,
      expectedOutcomeMatches:positive.filter(r=>r.assessment?.outcome===expectations.get(r.caseId).outcome).length,
      medianMs:percentile(subset.map(r=>r.durationMs),.5),p95Ms:percentile(subset.map(r=>r.durationMs),.95),costs:cost,
      estimatedPerAssessmentUsd:perCall,estimatedPer1000AssessmentsUsd:perCall===null?null:perCall*1000,
      hypotheticalMonthlyAssessmentOnly:Object.fromEntries([1000,10000,50000].map(n=>[n,perCall===null?null:perCall*n])),
      mismatches:subset.filter(r=>r.disposition.status==='unassessed'||(expectations.get(r.caseId).mustReject?r.disposition.status!=='needs-work':r.disposition.status==='needs-work'||r.assessment?.outcome!==expectations.get(r.caseId).outcome))
        .map(r=>({id:r.id,caseId:r.caseId,expected:expectations.get(r.caseId),disposition:r.disposition,outcome:r.assessment?.outcome,summary:r.assessment?.summary}))};
  }
  fs.writeFileSync(path.join(directory,'comparison.json'),JSON.stringify(report,null,2)+'\n');return report;
}
if(require.main===module)console.log(JSON.stringify(analyze(path.resolve(process.argv[2])),null,2));
module.exports={analyze};

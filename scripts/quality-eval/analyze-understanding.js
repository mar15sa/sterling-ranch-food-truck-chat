"use strict";
const fs=require('node:fs'),path=require('node:path');
const {summarize}=require('./usage');
function percentile(values,p){const a=[...values].sort((a,b)=>a-b);return a.length?a[Math.max(0,Math.ceil(a.length*p)-1)]:null;}
function analyze(dir){
  const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
  const rows=manifest.runs.map(r=>JSON.parse(fs.readFileSync(path.join(dir,r.id+'.json'),'utf8')));
  const groups={};
  for(const row of rows)(groups[row.variant]||=[]).push(row);
  const comparisons=Object.entries(groups).map(([variant,group])=>{
    const cost=summarize(group.flatMap(r=>r.calls||[]));
    return {variant,runs:group.length,invalidPlans:group.filter(r=>r.errorType||r.validationIssues?.length).length,
      costs:cost,costPer1000Plans:cost.estimatedTotalUsd===null?null:cost.estimatedTotalUsd/group.length*1000,
      latencyMs:{median:percentile(group.map(r=>r.durationMs),.5),p95:percentile(group.map(r=>r.durationMs),.95)},
      clarificationRequests:group.filter(r=>r.plan?.needsClarification||r.plan?.clarificationQuestion?.trim()).length};
  });
  const report={status:manifest.status,comparisons,limitations:manifest.limitations,
    additionalLimitations:['Schema validity and clarification counts are not quality scores. Monthly estimates require actual stage routing frequency.']};
  fs.writeFileSync(path.join(dir,'comparison.json'),JSON.stringify(report,null,2)+'\n');
  const blind=rows.map(r=>{
    const p=r.plan||{};
    return {id:r.id,caseId:r.caseId,subject:p.subject,goals:p.goals,details:p.requestedDetails,
      standaloneQuestion:p.standaloneQuestion,usedPriorContext:p.usedPriorContext??r.conversation?.usedPriorContext,
      scope:p.scope,clarification:p.clarificationQuestion,needs:p.needs,constraints:p.constraints,searchQueries:p.searchQueries,
      invalid:Boolean(r.errorType||r.validationIssues?.length)};
  });
  fs.writeFileSync(path.join(dir,'blind-compact.json'),JSON.stringify(blind,null,2)+'\n');
  return report;
}
if(require.main===module)console.log(JSON.stringify(analyze(process.argv[2]),null,2));
module.exports={analyze};

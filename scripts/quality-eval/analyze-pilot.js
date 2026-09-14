"use strict";
const fs=require("node:fs"),path=require("node:path");
const {summarize}=require("./usage");
function analyze(dir,caseIds=null){
  const manifest=JSON.parse(fs.readFileSync(path.join(dir,"manifest.json"),"utf8"));
  const rows=manifest.runs.filter(r=>!caseIds||caseIds.includes(r.caseId)).map(r=>JSON.parse(fs.readFileSync(path.join(dir,r.id+".json"),"utf8")));
  return {status:manifest.status,caseIds:caseIds||manifest.caseIds,calls:rows.length,costs:summarize(rows),
    byModel:Object.fromEntries(manifest.models.map(model=>{
      const selected=rows.filter(r=>r.model===model),costs=summarize(selected),times=selected.map(r=>r.durationMs).sort((a,b)=>a-b);
      const perCall=costs.estimatedTotalUsd===null?null:costs.estimatedTotalUsd/selected.length;
      return [model,{calls:selected.length,costs,meanCompositionUsd:perCall,per1000CompositionsUsd:perCall===null?null:perCall*1000,
        monthlyWritingOnlyScenarios:perCall===null?null:{"1000":perCall*1000,"10000":perCall*10000},
        p95Ms:times[Math.ceil(times.length*.95)-1],medianMs:(times[Math.floor((times.length-1)/2)]+times[Math.ceil((times.length-1)/2)])/2,
        schemaFailures:selected.filter(r=>!r.draft||typeof r.draft!=="object"||typeof r.draft.answer!=="string"||
          !Array.isArray(r.draft.answeredNeeds)||!Array.isArray(r.draft.unresolvedNeeds)||!Array.isArray(r.draft.citedSourceIds)).map(r=>r.id),
        errorCalls:selected.filter(r=>r.errorType).length}];
    }))};
}
if(require.main===module){
  const base=process.argv[2],out=process.argv[3];
  const report={generatedAt:new Date().toISOString(),scope:"Composition-stage pilot estimates, not full deployed assistant costs or invoices.",
    pricingSource:"https://platform.claude.com/docs/en/about-claude/pricing",pricingCheckedAt:"2026-09-14",
    ordinaryContext:analyze(path.join(base,"composition-pilot-20260914")),
    ordinaryContextMatchedSubset:analyze(path.join(base,"composition-pilot-20260914"),["fence","lighting-process"]),
    fullContext:analyze(path.join(base,"full-context-pilot-20260914"))};
  fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n",{flag:"wx"});
  console.log(JSON.stringify(report,null,2));
}
module.exports={analyze};

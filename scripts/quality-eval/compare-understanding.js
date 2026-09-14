"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {candidateRequest,validationIssues,SYSTEM,SYSTEM_V2}=require("./understanding-candidate");
const {createObservedFetch}=require("./observe-fetch");
const {summarize,ensureAllowedModel}=require("./usage");
const {planCommunitySearch}=require("../../lib/community-llm");
const {resolveConversationQuestion}=require("../../lib/community-conversation");
const DEFAULT_IDS=["trash-reference","lighting-process","contractor","fence","application","rental-cost","yoga","water-pay","water-late","forms-multi","landscape","facility-access","registration","ambiguity","compound","lighting-followup"];
async function compare({baselineDir,outDir,caseIds=DEFAULT_IDS,repetitions=2,fetchImpl=fetch,apiKey=process.env.ANTHROPIC_API_KEY,capUsd=5,candidateRevision="v1",candidateModels=["claude-haiku-4-5","claude-sonnet-5","claude-opus-5"],includeExisting=true}){
  if(!apiKey)throw new Error("Existing Anthropic credential required");
  if(!Number.isInteger(repetitions)||repetitions<1||repetitions>2)throw new Error("Require one or two repetitions");
  const base=JSON.parse(fs.readFileSync(path.join(baselineDir,"manifest.json"),"utf8"));
  if(base.status!=="captured"||!base.revisionStable)throw new Error("Require stable captured baseline");
  const rows=caseIds.map(id=>JSON.parse(fs.readFileSync(path.join(baselineDir,id+".json"),"utf8")));
  if(rows.some(r=>r.isTest!==true||r.error))throw new Error("Require successful authored test records");
  if(!["v1","v2"].includes(candidateRevision))throw new Error("Unknown candidate revision");
  const variants=[...(includeExisting?[{name:"existing-haiku",model:"claude-haiku-4-5",existing:true}]:[]),
    ...candidateModels.map(model=>({name:"candidate-"+model,model}))];
  variants.forEach(v=>ensureAllowedModel(v.model));
  fs.mkdirSync(outDir,{recursive:true});
  const file=path.join(outDir,"manifest.json");
  if(fs.existsSync(file))throw new Error("Use a new output directory");
  const calls=[],results=[],jobs=[];
  for(let rep=1;rep<=repetitions;rep++)for(const row of rows)for(const variant of variants)
    jobs.push({row,variant,rep,order:crypto.randomBytes(8).toString("hex")});
  jobs.sort((a,b)=>a.order.localeCompare(b.order));
  const manifest={schemaVersion:1,status:"running",isTest:true,startedAt:new Date().toISOString(),caseIds,repetitions,variants,capUsd,
    candidateRevision,promptSha256:crypto.createHash("sha256").update(candidateRevision==="v2"?SYSTEM_V2:SYSTEM).digest("hex"),baselineRevision:base.before.deploymentRevision,
    limitations:["Development cases, not holdout or resident sample.","Current planner is invoked for every case; production may skip it.",
      "Both paths have a 12-second characterization deadline, not the production timeout or the full-answer latency target.",
      "Existing variant includes current conversation resolver and normalization; candidate changes representation and prompt as well as optional model.",
      "Only understanding-stage cost is measured. No evidence retrieval, answer composition or quality certification."],runs:[]};
  const save=()=>{manifest.costs=summarize(calls);fs.writeFileSync(file,JSON.stringify(manifest,null,2)+"\n");};
  const observed=createObservedFetch(fetchImpl,{calls,capUsd,captureRequests:true,onCall:()=>save()});save();
  for(const [i,{row,variant,rep}]of jobs.entries()){
    const start=Date.now(),from=calls.length,id="plan-"+String(i+1).padStart(3,"0");
    const result={id,caseId:row.id,variant:variant.name,model:variant.model,repetition:rep,isTest:true};
    try{
      if(variant.existing){
        result.conversation=resolveConversationQuestion(row.question,row.context||[]);
        result.plan=await planCommunitySearch(result.conversation.resolvedQuestion,{apiKey,model:variant.model,fetchImpl:observed,
          cache:false,timeoutMs:12000,now:new Date("2026-09-14T18:00:00Z"),onDiagnostic:d=>{if(d.parsed)result.rawPlan=d.parsed;}});
        result.validationIssues=result.plan?[]:["no-plan"];
      }else{
        const response=await observed("https://api.anthropic.com/v1/messages",{method:"POST",
          headers:{"x-api-key":apiKey,"content-type":"application/json","anthropic-version":"2023-06-01"},
          body:JSON.stringify(candidateRequest(row,variant.model,"2026-09-14",candidateRevision)),signal:AbortSignal.timeout(12000)});
        const data=await response.json();result.httpStatus=response.status;
        result.plan=(data.content||[]).find(c=>c.type==="tool_use"&&c.name==="route_community_question")?.input||null;
        result.validationIssues=validationIssues(result.plan);
        if(!response.ok){result.errorType=data.error?.type||"http-error";result.providerMessage=String(data.error?.message||"").slice(0,800);}
      }
    }catch(e){result.errorType=e.message.includes("reservation cap")?"budget-cap":e.name;}
    result.durationMs=Date.now()-start;result.calls=calls.slice(from);results.push(result);
    fs.writeFileSync(path.join(outDir,id+".json"),JSON.stringify(result,null,2)+"\n",{flag:"wx"});
    fs.appendFileSync(path.join(outDir,"blind-review.jsonl"),JSON.stringify({id,caseId:row.id,question:row.question,
      priorResidentQuestions:(row.context||[]).map(x=>x.question),plan:result.plan,error:result.errorType||null})+"\n");
    manifest.runs.push({id,caseId:row.id,variant:variant.name,repetition:rep,durationMs:result.durationMs,validationIssues:result.validationIssues,errorType:result.errorType});save();
    console.log(JSON.stringify({completed:i+1,total:jobs.length,caseId:row.id,error:result.errorType||null}));
    if(result.errorType==="budget-cap"||result.httpStatus>=400||calls.at(-1)?.httpStatus>=400){manifest.status="stopped-budget-or-provider";break;}
  }
  if(manifest.status==="running")manifest.status=results.length===jobs.length?"captured":"incomplete";
  manifest.finishedAt=new Date().toISOString();manifest.reservedUsd=observed.reservedUsd();save();return manifest;
}
if(require.main===module)compare({baselineDir:process.argv[2],outDir:process.argv[3],
  ...(process.argv[5]?{capUsd:Number(process.argv[5])}:{}),
  ...(process.argv[6]?{candidateRevision:process.argv[6]}:{}),
  ...(process.argv[7]?{candidateModels:process.argv[7].split(",")}:{ }),
  ...(process.argv[8]==="candidate-only"?{includeExisting:false}:{}),
  ...(process.argv[4]?{caseIds:process.argv[4].split(",")}:{})}).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={compare,DEFAULT_IDS};

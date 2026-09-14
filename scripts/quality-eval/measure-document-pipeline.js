"use strict";
// Isolated document-question pipeline measurement. Never starts the server or logs resident records.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {createObservedFetch}=require("./observe-fetch");
const {summarize}=require("./usage");
async function main(){
  const outDir=process.argv[2];if(!outDir)throw new Error("Output directory required");
  if(!process.env.ANTHROPIC_API_KEY)throw new Error("Existing Anthropic credential required");
  fs.mkdirSync(outDir,{recursive:true});const mp=path.join(outDir,"manifest.json");
  if(fs.existsSync(mp))throw new Error("Use a new output directory");
  // Match observed production AI settings explicitly, not staging's default structured mode.
  Object.assign(process.env,{COMMUNITY_INTERPRETATION_MODE:"legacy",COMMUNITY_LLM_MODEL:"claude-haiku-4-5",
    RULES_LLM_MODEL:"claude-haiku-4-5",RULES_SEARCH_MODEL:"claude-haiku-4-5",RULES_SEARCH_MODE:"ai-hybrid",
    RULES_SEARCH_AI_RERANK:"false",RULES_LLM_MODE:"selective",RULES_AUTO_REFRESH:"false",COMMUNITY_AUTO_REFRESH:"false"});
  const calls=[];let currentCase=null;
  global.fetch=createObservedFetch(global.fetch,{calls,capUsd:5,captureRequests:true,
    onCall:entry=>{entry.caseId=currentCase;fs.appendFileSync(path.join(outDir,"calls.jsonl"),JSON.stringify(entry)+"\n");}});
  const {answerCommunityQuestion}=require("../../lib/community-assistant");
  const {answerRulesQuestion}=require("../../lib/rules-assistant");
  const profile=require("../../data/communities/sterling-ranch.json");
  const index=require("../../data/community-index.json");
  const corpus=require("./diagnostic-cases.json");
  const caseIds=["lighting-process","contractor","fence","raspberry","application","shed","pets","water-late"];
  const report={schemaVersion:1,startedAt:new Date().toISOString(),status:"running",scope:"Isolated document-question pipeline; no live connectors.",
    limitations:["Repository source snapshot differs from deployed refreshed evidence; this is not a production billing measurement.",
      "Calls with no returned usage have unknown charges.","Cold process at start; later within-run caches may be used.",
      "These diagnostic questions are not an unseen quality benchmark."],
    indexSha256:crypto.createHash("sha256").update(JSON.stringify(index)).digest("hex"),caseIds,rows:[]};
  const save=()=>fs.writeFileSync(mp,JSON.stringify(report,null,2)+"\n");save();
  for(const id of caseIds){
    const row=corpus.cases.find(c=>c.id===id);currentCase=id;
    const started=Date.now(),before=calls.length;
    let answer=null,error=null;
    try{answer=await answerCommunityQuestion(row.question,{answerRulesQuestion,index,communityProfile:profile,communityId:profile.id||index.communityId});}
    catch(e){error=e.name;}
    const result={id,question:row.question,isTest:true,response:answer,error,durationMs:Date.now()-started,calls:calls.slice(before)};
    fs.writeFileSync(path.join(outDir,id+".json"),JSON.stringify(result,null,2)+"\n",{flag:"wx"});
    report.rows.push({id,durationMs:result.durationMs,error,answerMode:answer?.answerMode,costs:summarize(result.calls)});
    report.costs=summarize(calls);save();
    console.log(JSON.stringify({id,calls:result.calls.length,error}));
  }
  report.status=report.rows.every(r=>!r.error)?"captured":"incomplete";report.finishedAt=new Date().toISOString();save();
}
main().catch(e=>{console.error(e.name+": isolated measurement failed");process.exitCode=1;});

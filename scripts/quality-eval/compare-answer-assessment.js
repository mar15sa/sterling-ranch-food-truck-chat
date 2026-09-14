"use strict";
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {assessmentRequest,assessmentIssues,assessedDisposition}=require('./answer-assessment-candidate');
const {createObservedFetch}=require('./observe-fetch');
const {ensureAllowedModel,summarize}=require('./usage');
const {scoreCommunityAnswer}=require('../../lib/community-answer-quality');
async function compare({outDir,fixtures=require('./assessment-fixtures'),models=['claude-haiku-4-5','claude-sonnet-5'],repetitions=2,
  capUsd=1,revision='v1',apiKey=process.env.ANTHROPIC_API_KEY,fetchImpl=fetch}){
  if(!apiKey)throw new Error('Existing Anthropic credential required');
  if(!Number.isInteger(repetitions)||repetitions<1||repetitions>3||!Number.isFinite(capUsd)||capUsd<=0||capUsd>1)throw new Error('Invalid bounded pilot parameters');
  models.forEach(ensureAllowedModel);fs.mkdirSync(outDir,{recursive:true});
  const manifestPath=path.join(outDir,'manifest.json');if(fs.existsSync(manifestPath))throw new Error('Use a new output directory');
  const calls=[],observed=createObservedFetch(fetchImpl,{calls,capUsd,captureRequests:true});
  const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
  const requestContract=assessmentRequest(fixtures[0],models[0],{revision});
  const manifest={isTest:true,status:'running',startedAt:new Date().toISOString(),capUsd,models,repetitions,revision,
    fixtureSha256:hash(fixtures),promptSha256:hash(requestContract.system),contractSha256:hash(requestContract.tools),runs:[],
    current:fixtures.map(r=>({caseId:r.id,expected:r.expected,assessment:scoreCommunityAnswer(r.question,r.response)})),
    limitations:['Synthetic diagnostic fixtures, not resident records, unseen holdout or independent human calibration.',
      'Expected failure labels were authored for diagnosis; presentation scores have no human ground truth.',
      'Only the extra assessment stage is measured, not full-answer cost or production latency.']};
  const save=()=>{manifest.costs=summarize(calls);manifest.reservedUpperEstimateUsd=observed.reservedUsd();fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');};save();
  const jobs=[];for(let rep=1;rep<=repetitions;rep++)for(const row of fixtures)for(const model of models)jobs.push({row,model,rep,order:crypto.randomBytes(8).toString('hex')});
  jobs.sort((a,b)=>a.order.localeCompare(b.order));
  for(const [i,{row,model,rep}] of jobs.entries()){
    const result={id:`assessment-${String(i+1).padStart(3,'0')}`,caseId:row.id,model,repetition:rep,isTest:true};
    const before=calls.length,start=Date.now();
    try{
      const response=await observed('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','anthropic-version':'2023-06-01','x-api-key':apiKey},
        body:JSON.stringify(assessmentRequest(row,model,{revision})),signal:AbortSignal.timeout(15000)});
      const data=await response.json();result.httpStatus=response.status;result.stopReason=data.stop_reason;
      result.assessment=(data.content||[]).find(b=>b.type==='tool_use'&&b.name==='assess_resident_answer')?.input||null;
      result.rawContent=data.content||[];
      result.issues=assessmentIssues(result.assessment,row.response.sources.map(s=>s.id));
      if(!response.ok)result.errorType=data.error?.type||'provider-error';
      if(data.stop_reason==='max_tokens')result.issues.push('truncated-output');
      result.disposition=result.issues.length?{status:'unassessed',issues:result.issues}:assessedDisposition(result.assessment,row.response.sources.map(s=>s.id));
    }catch(error){result.errorType=error.name;result.disposition={status:'unassessed'};}
    result.durationMs=Date.now()-start;result.calls=calls.slice(before);
    fs.writeFileSync(path.join(outDir,result.id+'.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    manifest.runs.push({id:result.id,caseId:row.id,model,repetition:rep,durationMs:result.durationMs,errorType:result.errorType||null,disposition:result.disposition});save();
    fs.appendFileSync(path.join(outDir,'blind-review.jsonl'),JSON.stringify({id:result.id,question:row.question,priorResidentQuestions:row.priorResidentQuestions||[],answer:row.response.answer,
      evidence:row.response.sources,assessment:result.assessment,issues:result.issues||[],error:Boolean(result.errorType)})+'\n');
    console.log(JSON.stringify({completed:i+1,total:jobs.length,caseId:row.id,error:result.errorType||null}));
    if(result.errorType||result.httpStatus>=400){manifest.status='stopped-budget-or-provider';break;}
  }
  if(manifest.status==='running')manifest.status=manifest.runs.length===jobs.length?'captured':'incomplete';
  manifest.finishedAt=new Date().toISOString();manifest.costsByModel=Object.fromEntries(models.map(model=>[model,summarize(calls.filter(c=>c.model===model))]));save();return manifest;
}
if(require.main===module)compare({outDir:path.resolve(process.argv[2]),revision:process.argv[3]||'v1',
  fixtures:process.argv[4]?require('./assessment-fixtures').filter(r=>process.argv[4].split(',').includes(r.id)):undefined,
  capUsd:process.argv[5]?Number(process.argv[5]):1}).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={compare};

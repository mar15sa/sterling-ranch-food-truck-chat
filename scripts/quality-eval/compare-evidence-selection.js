"use strict";
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const {selectionRequest,applySelection}=require('./evidence-selection');
const {modelEvidence,modelActions,packetIssues}=require('./full-flow-candidate');
const {hash}=require('./flow-evidence');
const {summarize}=require('./usage');
const {upperCost}=require('./compare-planners');
const {createObservedFetch}=require('./observe-fetch');
const cases=[{capture:'mixed-live-flow-20260914',id:'food-menu'},{capture:'mixed-live-flow-20260914',id:'pool-hours'},
 {capture:'mixed-live-flow-20260914',id:'shed-form'},{capture:'semantic-full-flow-20260914',id:'lighting-process'}];
const models=['claude-haiku-4-5','claude-sonnet-5'];
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
function capturedInput(trial){
 if(!trial?.isTest||trial.response?.status!=='unreviewed-experiment'||!trial.response.plan||trial.variant!=='sonnet-compose')throw Error('Require a captured authored candidate trial');
 const calls=trial.calls.filter(c=>c.stage==='composition');if(calls.length!==1)throw Error('Require single original writer attempt');
 const body=calls[0].request,payload=JSON.parse(body.messages[0].content),now=Date.parse(calls[0].startedAt);
 if(!Number.isFinite(now)||payload.question!==trial.question||hash(payload.priorResidentQuestions)!==hash((trial.context||[]).map(c=>c.question))||
  hash(payload.requiredNeeds)!==hash(trial.response.plan.needs)||hash(payload.evidence)!==hash(modelEvidence(trial.response.sources)))throw Error('Captured source/input mismatch');
 const sources=structuredClone(trial.response.sources),communityId=sources[0]?.communityId;
 const actions=sources.flatMap(s=>(s.actions||[]).map((a,i)=>({id:`${s.id}-a${i}`,label:a.label,url:a.url,actionType:a.actionType,sourceId:s.id,communityId,version:s.version,stagingOnly:s.stagingOnly})));
 const packet={communityId,sources,actions,diagnostics:payload.evidenceGaps||[]};
 if(hash(modelActions(actions))!==hash(payload.actions)||packetIssues(packet,communityId,now).length)throw Error('Captured action or source identity mismatch');
 return {row:{question:trial.question,context:trial.context||[]},plan:trial.response.plan,packet,now,originalCompositionRequest:body,originalTrial:trial.id};
}
function prepare(root,accounting){
 if(accounting.status!=='captured'||accounting.mode!=='compact-contract-planner-replay')throw Error('Require completed preceding phase accounting');
 const priorReserved=accounting.priorReservedUpperUsd+accounting.reservedUpperUsd,capUsd=5-priorReserved;
 if(!Number.isFinite(capUsd)||capUsd<=0||capUsd>1.159)throw Error('Unexpected remaining mixed-phase reservation');
 const jobs=[],inputs=[];
 for(const c of cases){
  const dir=path.join(root,c.capture),m=read(path.join(dir,'manifest.json'));
  if(m.status!=='captured'||m.assessmentMode!=='offline-review'||m.communityMode!=='complete-catalog')throw Error('Require completed full-context capture');
  const entry=m.runs.filter(r=>r.caseId===c.id&&r.variant==='sonnet-compose'&&r.status==='unreviewed-experiment').sort((a,b)=>a.id.localeCompare(b.id))[0];
  if(!entry)throw Error('Missing specified evidence case');
  const trial=read(path.join(dir,entry.id+'.json'));if(trial.id!==entry.id||trial.caseId!==c.id)throw Error('Captured trial identity mismatch');
  const input={caseId:c.id,capture:dir,...capturedInput(trial)};
  if(input.packet.communityId!==read(path.join(dir,m.snapshotFiles.profile)).communityId)throw Error('Wrong captured community');
  inputs.push(input);
  for(let repetition=1;repetition<=2;repetition++)for(const model of models)jobs.push({caseId:c.id,repetition,model,body:selectionRequest(input.row,input.plan,input.packet,model,input.now),input});
 }
 const plannedUpper=jobs.reduce((n,j)=>n+upperCost(j.body),0);if(plannedUpper>capUsd)throw Error('Whole selection design exceeds remaining reservation');
 return {jobs,inputs,priorReserved,capUsd,plannedUpper};
}
async function main(){
 const [outArg,flag]=process.argv.slice(2);if(!outArg||flag&&flag!=='--prepare-only')throw Error('Require new output directory and optional --prepare-only');
 const root=path.resolve('artifacts/quality-eval'),out=path.resolve(outArg),accounting=read(path.join(root,'compact-planner-replay-20260914/manifest.json'));
 const prepared=prepare(root,accounting);if(flag==='--prepare-only'){console.log(JSON.stringify({jobs:prepared.jobs.length,capUsd:prepared.capUsd,plannedUpperUsd:prepared.plannedUpper}));return;}
 if(!process.env.ANTHROPIC_API_KEY||fs.existsSync(out))throw Error('Require existing credential and fresh capture directory');
 fs.mkdirSync(out,{recursive:true});const calls=[],runs=[];let active={};
 const manifest={status:'running',isTest:true,mode:'historical-evidence-selection-replay',startedAt:new Date().toISOString(),codeRevision:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  priorReservedUpperUsd:prepared.priorReserved,capUsd:prepared.capUsd,plannedUpperUsd:prepared.plannedUpper,cases:cases.map(c=>c.id),models,repetitions:2,runs,
  limitations:['Historical source evidence at original captured clock, never current-live claims.','Known authored development cases, not unseen human acceptance.','Selection only; no full-answer cost, latency or quality improvement proven.','Selected sources remain relevance proposals, not approval or proof of absence.']};
 const observed=createObservedFetch(fetch,{calls,capUsd:prepared.capUsd,captureRequests:true,onCall:c=>{Object.assign(c,active);fs.appendFileSync(path.join(out,'calls.jsonl'),JSON.stringify(c)+'\n');}});
 const save=()=>{manifest.costs=summarize(calls);manifest.reservedUpperUsd=observed.reservedUsd();fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');};
 fs.mkdirSync(path.join(out,'code'));for(const file of ['evidence-selection.js','compare-evidence-selection.js','observe-fetch.js','usage.js'])fs.copyFileSync(path.join(__dirname,file),path.join(out,'code',file));
 fs.copyFileSync(path.join(__dirname,'evidence-selection-review.json'),path.join(out,'predeclared-review.json'));
 for(const input of prepared.inputs)fs.writeFileSync(path.join(out,input.caseId+'-input.json'),JSON.stringify(input,null,2)+'\n');save();
 const jobs=prepared.jobs.map(j=>({...j,order:crypto.randomBytes(8).toString('hex')})).sort((a,b)=>a.order.localeCompare(b.order));
 for(const [i,job] of jobs.entries()){
  active={caseId:job.caseId,repetition:job.repetition,model:job.model};const start=Date.now();let response=null,raw=null,selection=null,error=null;
  try{const r=await observed('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','anthropic-version':'2023-06-01','x-api-key':process.env.ANTHROPIC_API_KEY},body:JSON.stringify(job.body),signal:AbortSignal.timeout(45000)});
   response=await r.json();if(!r.ok||response.stop_reason!=='tool_use')throw Error('Provider response rejected or incomplete');
   raw=response.content?.find(c=>c.type==='tool_use'&&c.name==='select_relevant_evidence')?.input;
   selection=applySelection(raw,job.input.packet,job.input.packet.communityId,job.input.now);
  }catch(e){error=e.message;}
  const id='selection-'+String(i+1).padStart(2,'0'),record={id,isTest:true,...active,originalTrial:job.input.originalTrial,requestHash:hash(job.body),response,raw,selection,error,durationMs:Date.now()-start};
  fs.writeFileSync(path.join(out,id+'.json'),JSON.stringify(record,null,2)+'\n');runs.push({id,...active,durationMs:record.durationMs,error,issues:selection?.issues,selectedSources:selection?.packet?.sources.length});save();
  console.log(JSON.stringify({completed:i+1,total:jobs.length,...runs.at(-1)}));if(error){manifest.status='stopped-error';break;}
 }
 if(manifest.status==='running')manifest.status=runs.length===jobs.length?'captured':'incomplete';manifest.finishedAt=new Date().toISOString();
 manifest.costsByModel=Object.fromEntries(models.map(m=>[m,summarize(calls.filter(c=>c.model===m))]));save();
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={capturedInput,prepare};

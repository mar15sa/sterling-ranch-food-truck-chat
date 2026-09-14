"use strict";
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const {RATES,summarize}=require('./usage');
const {hash}=require('./flow-evidence');
const {resolveLivePlan}=require('./live-request-plan');
const {createObservedFetch}=require('./observe-fetch');
const {compactRequest,resolveCompactLivePlan}=require('./compact-live-plan');
const models=['claude-haiku-4-5','claude-sonnet-5'];
function plannerRequest(original,model){
 if(!models.includes(model)||original?.model!=='claude-haiku-4-5'||original.thinking?.type!=='disabled'||original.max_tokens!==1100||
  original.tools?.length!==1||original.tools[0].name!=='route_community_question'||original.tools[0].strict!==undefined)throw Error('Require captured non-strict Haiku planner request and eligible model');
 const body=structuredClone(original);body.model=model;if(model==='claude-sonnet-5')delete body.temperature;return body;
}
function upperCost(body){const r=RATES[body.model];if(!r)throw Error('Unpriced model');return ((Buffer.byteLength(JSON.stringify(body))+1024)*r.input+body.max_tokens*r.output)/1e6;}
function prepare(manifest,trials,profile){
 if(manifest.status!=='captured'||!manifest.liveMixed||manifest.repetitions!==2||manifest.profileHash!==hash(profile))throw Error('Require completed profile-matched repeated mixed capture');
 const priorReserved=manifest.reservedUpperEstimateUsd,capUsd=Math.min(.8,5-priorReserved);
 if(manifest.capUsd!==5||!Number.isFinite(priorReserved)||priorReserved<0)throw Error('Invalid prior phase accounting');
 if(!Number.isFinite(capUsd)||capUsd<=0)throw Error('No mixed-phase reservation available');
 const expected=manifest.runs.filter(r=>r.variant==='sonnet-compose'),keys=new Set(),jobs=[];
 if(expected.length!==12||trials.length!==expected.length)throw Error('Require all twelve captured comparison-arm trials');
 const caseIds=new Set(expected.map(r=>r.caseId));
 if(caseIds.size!==6||new Set(expected.map(r=>r.id)).size!==12||[...caseIds].some(id=>[1,2].some(rep=>expected.filter(r=>r.caseId===id&&r.repetition===rep).length!==1)))throw Error('Unbalanced original design');
 for(const trial of trials){
  if(!trial.isTest||trial.variant!=='sonnet-compose'||!expected.some(r=>r.id===trial.id&&r.caseId===trial.caseId&&r.repetition===trial.repetition)||keys.has(trial.caseId+':'+trial.repetition))throw Error('Missing, duplicate or mismatched trial');
  keys.add(trial.caseId+':'+trial.repetition);
  const calls=trial.calls.filter(c=>c.stage==='understanding');if(calls.length!==1)throw Error('Require one original interpretation');
  const original=calls[0].request,payload=JSON.parse(original.messages[0].content);
  if(payload.question!==trial.question||hash(payload.priorResidentQuestions)!==hash((trial.context||[]).slice(-3).map(c=>c.question))||payload.timezone!==profile.timezone||payload.today!==manifest.today)throw Error('Captured input context mismatch');
  for(const model of models)jobs.push({caseId:trial.caseId,repetition:trial.repetition,originalTrial:trial.id,row:{question:trial.question,context:trial.context||[]},model,body:plannerRequest(original,model)});
 }
 const plannedUpper=jobs.reduce((s,j)=>s+upperCost(j.body),0);if(plannedUpper>capUsd)throw Error('Complete planner design exceeds its reserved cap');
 return {jobs,plannedUpper,capUsd,priorReserved};
}
async function main(){
 const [priorArg,outArg,flag,accountingArg]=process.argv.slice(2);if(!priorArg||!outArg||!process.env.ANTHROPIC_API_KEY)throw Error('Require capture, new output directory and existing credential');
 const compact=flag==='--compact-contract';if(flag&&!compact||compact&&!accountingArg||!compact&&accountingArg)throw Error('Invalid contract replay arguments');
 const prior=path.resolve(priorArg),out=path.resolve(outArg);if(fs.existsSync(out))throw Error('Use a new capture directory');
 const read=f=>JSON.parse(fs.readFileSync(path.join(prior,f),'utf8')),previous=read('manifest.json'),profile=read(previous.snapshotFiles.profile);
 const trials=previous.runs.filter(r=>r.variant==='sonnet-compose').map(r=>read(r.id+'.json'));
 let {jobs,plannedUpper,capUsd,priorReserved}=prepare(previous,trials,profile);const calls=[];let active={};
 if(compact){
  const accounting=JSON.parse(fs.readFileSync(path.join(path.resolve(accountingArg),'manifest.json'),'utf8'));
  if(accounting.status!=='captured'||accounting.mode!=='model-only-planner-replay'||path.resolve(accounting.priorCapture)!==prior||accounting.profileHash!==hash(profile))throw Error('Require completed matching planner-phase accounting');
  priorReserved=accounting.priorReservedUpperUsd+accounting.reservedUpperUsd;capUsd=Math.min(.8,5-priorReserved);
  jobs=jobs.map(j=>({...j,body:compactRequest(j.body)}));plannedUpper=jobs.reduce((s,j)=>s+upperCost(j.body),0);
  if(!Number.isFinite(capUsd)||capUsd<=0||plannedUpper>capUsd)throw Error('Complete compact design exceeds remaining phase reservation');
 }
 const contextNow=Date.parse(previous.startedAt);if(!Number.isFinite(contextNow))throw Error('Original date context required');
 fs.mkdirSync(out,{recursive:true});const manifest={status:'running',isTest:true,mode:compact?'compact-contract-planner-replay':'model-only-planner-replay',startedAt:new Date().toISOString(),contextNow,
  priorCapture:prior,priorReservedUpperUsd:priorReserved,capUsd,plannedUpper,models,repetitions:2,codeRevision:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  profileHash:hash(profile),accountingCapture:accountingArg?path.resolve(accountingArg):null,runs:[],limitations:['Interpretation only; not full-answer quality/cost.','Authored known cases, not unseen or independent human calibration.','Original date context retained; no source evidence fetched or declared current.',...(compact?['Bundled contract revision changes schema, corresponding instructions and supported-capability metadata; individual contributions are not isolated.']:[])]};
 const observed=createObservedFetch(fetch,{calls,capUsd,captureRequests:true,onCall:c=>{Object.assign(c,active);fs.appendFileSync(path.join(out,'calls.jsonl'),JSON.stringify(c)+'\n');}});
 const save=()=>{manifest.costs=summarize(calls);manifest.reservedUpperUsd=observed.reservedUsd();fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');};
 fs.copyFileSync(__filename,path.join(out,'runner.js'));fs.writeFileSync(path.join(out,'profile.json'),JSON.stringify(profile,null,2));save();
 const ordered=jobs.map(j=>({...j,order:crypto.randomBytes(8).toString('hex')})).sort((a,b)=>a.order.localeCompare(b.order));
 for(const [i,job] of ordered.entries()){
  active={caseId:job.caseId,repetition:job.repetition,model:job.model};const start=Date.now();let providerResponse=null,raw=null,resolved=null,error=null;
  try{const response=await observed('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','anthropic-version':'2023-06-01','x-api-key':process.env.ANTHROPIC_API_KEY},body:JSON.stringify(job.body),signal:AbortSignal.timeout(45000)});
   providerResponse=await response.json();if(!response.ok||providerResponse.stop_reason!=='tool_use')throw Error('Provider response incomplete or rejected');
   raw=providerResponse.content?.find(c=>c.type==='tool_use'&&c.name==='route_community_question')?.input;resolved=(compact?resolveCompactLivePlan:resolveLivePlan)(raw,job.row,profile,contextNow);
  }catch(e){error=e.message;}
  const record={id:'planner-'+String(i+1).padStart(2,'0'),isTest:true,...active,originalTrial:job.originalTrial,requestHash:hash(job.body),row:job.row,providerResponse,raw,resolved,error,durationMs:Date.now()-start};
  fs.writeFileSync(path.join(out,record.id+'.json'),JSON.stringify(record,null,2)+'\n');manifest.runs.push(record);save();
  console.log(JSON.stringify({completed:i+1,total:jobs.length,...active,error,issues:resolved?.issues,diagnostics:resolved?.diagnostics}));
  if(error){manifest.status='stopped-error';break;}
 }
 if(manifest.status==='running')manifest.status=manifest.runs.length===jobs.length?'captured':'incomplete';manifest.finishedAt=new Date().toISOString();
 manifest.costsByModel=Object.fromEntries(models.map(model=>[model,summarize(calls.filter(c=>c.model===model))]));save();
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={models,plannerRequest,upperCost,prepare};

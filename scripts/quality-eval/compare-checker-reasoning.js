"use strict";
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const {prepare:prepareCaptured,checkerRequest}=require('./compare-captured-acceptance');
const {coverageIssues}=require('./full-flow-candidate');
const {hash}=require('./flow-evidence');
const {upperCost}=require('./compare-planners');
const {summarize}=require('./usage');
const {createObservedFetch}=require('./observe-fetch');
const allLabels=require('./captured-acceptance-labels.json');
const trials=Object.freeze(['009','016','018','027','061','060','048','058','092','055'].map(n=>'presentation-'+n));
const arms=Object.freeze(['disabled','adaptive']);
const labels={...allLabels,cases:allLabels.cases.filter(c=>trials.includes(c.trial))};
function reasoningRequest(input,draft,arm){
 if(!arms.includes(arm))throw Error('Unknown reasoning arm');
 const body=checkerRequest(input,draft,'claude-sonnet-5');
 body.max_tokens=4096;body.output_config={effort:'medium'};
 body.thinking=arm==='adaptive'?{type:'adaptive',display:'omitted'}:{type:'disabled'};
 return body;
}
function prepare(directory){
 const original=prepareCaptured(directory),inputs=original.inputs.filter(i=>trials.includes(i.trialId));
 if(inputs.length!==10||labels.cases.filter(c=>c.expected==='accept').length!==5||labels.cases.filter(c=>c.expected==='reject').length!==5)throw Error('Unbalanced reasoning design');
 const jobs=inputs.flatMap(input=>arms.flatMap(arm=>[1,2].map(repetition=>({...input,model:'claude-sonnet-5',arm,repetition,body:reasoningRequest(input.input,input.draft,arm)}))));
 const plannedUpperUsd=jobs.reduce((s,j)=>s+upperCost(j.body),0);
 if(plannedUpperUsd>5)throw Error('Entire reasoning comparison exceeds five-dollar ceiling');
 return {inputs,jobs,plannedUpperUsd};
}
function prepareResume(directory,prepared){
 const read=name=>JSON.parse(fs.readFileSync(path.join(directory,name),'utf8')),m=read('manifest.json');
 const ledger=fs.readFileSync(path.join(directory,'calls.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 const rows=m.runs.map(r=>read(r.id+'.json'));
 if(m.status!=='stopped-error-or-unknown-usage'||m.mode!=='captured-answer-reasoning'||m.capUsd!==5||m.resumedFrom||m.design.length!==40||rows.length!==ledger.length||rows.length<1||rows.slice(0,-1).some(r=>r.error)||!rows.at(-1).error||ledger.at(-1).httpStatus!==400||!ledger.at(-1).providerErrorMessage?.includes('credit balance is too low'))throw Error('Require original credit-interrupted reasoning capture');
 if(hash(read('predeclared-labels.json'))!==hash(labels)||m.labelsHash!==hash(labels))throw Error('Changed labels');
 const jobs=m.design.map(d=>{const j=prepared.jobs.find(j=>['trialId','caseId','model','arm','repetition'].every(k=>j[k]===d[k]));if(!j||hash(j.body)!==d.requestHash||hash(read(j.trialId+'-input.json'))!==hash(prepared.inputs.find(i=>i.trialId===j.trialId)))throw Error('Changed frozen design');return j;});
 if(new Set(jobs.map(j=>[j.trialId,j.arm,j.repetition].join(':'))).size!==40)throw Error('Duplicate design');
 for(const [i,r] of rows.entries()){const d=m.design[i],c=ledger[i];if(hash(c.request)!==d.requestHash||r.requestHash!==d.requestHash||['trialId','caseId','model','arm','repetition'].some(k=>r[k]!==d[k]||c[k]!==d[k]))throw Error('Changed attempted request');}
 const priorReservedUsd=ledger.reduce((sum,c)=>sum+upperCost(c.request),0);
 if(Math.abs(priorReservedUsd-m.reservedUpperUsd)>1e-9||ledger.some(c=>Math.abs(c.reservedUsd-upperCost(c.request))>1e-9))throw Error('Changed reservation ledger');
 const remaining=jobs.slice(rows.length-1),remainingUpperUsd=remaining.reduce((sum,j)=>sum+upperCost(j.body),0),capUsd=5-priorReservedUsd;
 if(capUsd<=0||remainingUpperUsd>capUsd)throw Error('Resume exceeds original ceiling');
 return {manifest:m,rows:rows.slice(0,-1),calls:ledger.slice(0,-1),failedCall:ledger.at(-1),jobs:remaining,priorReservedUsd,remainingUpperUsd,capUsd};
}
async function capture({prior,out,resumeFrom,apiKey=process.env.ANTHROPIC_API_KEY,fetchImpl=fetch,revision,log=console.log}){
 const prepared=prepare(prior);
 const resume=resumeFrom?prepareResume(resumeFrom,prepared):null;
 if(!apiKey||fs.existsSync(out))throw Error('Require existing credential and fresh capture directory');
 fs.mkdirSync(out,{recursive:true});fs.mkdirSync(path.join(out,'code'));
 for(const name of ['compare-checker-reasoning.js','compare-captured-acceptance.js','flow-acceptance.js','compact-acceptance-candidate.js','answer-assessment-candidate.js','full-flow-candidate.js','writer-presentation.js','observe-fetch.js','usage.js'])fs.copyFileSync(path.join(__dirname,name),path.join(out,'code',name));
 fs.writeFileSync(path.join(out,'predeclared-labels.json'),JSON.stringify(labels,null,2)+'\n');
 const jobs=resume?resume.jobs:prepared.jobs.map(j=>({...j,order:crypto.randomBytes(8).toString('hex')})).sort((a,b)=>a.order.localeCompare(b.order));
 const calls=resume?[...resume.calls]:[],runs=resume?resume.manifest.runs.slice(0,-1):[];let active={};
 const manifest={status:'running',isTest:true,mode:'captured-answer-reasoning',startedAt:new Date().toISOString(),codeRevision:revision||cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),priorCapture:path.resolve(prior),
  capUsd:5,plannedUpperUsd:prepared.plannedUpperUsd,models:['claude-sonnet-5'],arms,repetitions:2,labelsHash:hash(labels),runs,inputHashes:Object.fromEntries(prepared.inputs.map(i=>[i.trialId,hash(i)])),
  design:jobs.map(j=>({trialId:j.trialId,caseId:j.caseId,model:j.model,arm:j.arm,repetition:j.repetition,requestHash:hash(j.body)})),
  limitations:['Known authored development answers, not unseen acceptance or human calibration.','Identical medium effort and 4096 output allowance in both arms; only thinking configuration differs.','Checker sees no labels or originating writer identity.','Checker only; no writer, retrieval, preparation or repair.','Five supported and five flawed answers, twice each per arm; not traffic prevalence.','Reasoning tokens are included in output tokens, not charged twice.']};
 if(resume){
  Object.assign(manifest,{design:resume.manifest.design,resumedFrom:path.resolve(resumeFrom),priorReservedUpperUsd:resume.priorReservedUsd,remainingCapUsd:resume.capUsd,remainingPlannedUpperUsd:resume.remainingUpperUsd,priorFailedCalls:[resume.failedCall]});
  manifest.limitations.push('Seven successful original trials retained; credit-rejected trial retried after restored access. Time-separated batches can differ in provider conditions. Original failed attempt remains in total experiment accounting.');
  for(const row of resume.rows)fs.writeFileSync(path.join(out,row.id+'.json'),JSON.stringify({...row,retainedFrom:path.resolve(resumeFrom)},null,2)+'\n');
  fs.writeFileSync(path.join(out,'calls.jsonl'),calls.map(c=>JSON.stringify(c)).join('\n')+'\n');
 }
 for(const input of prepared.inputs)fs.writeFileSync(path.join(out,input.trialId+'-input.json'),JSON.stringify(input,null,2)+'\n');
 const observed=createObservedFetch(fetchImpl,{calls,capUsd:resume?resume.capUsd:5,captureRequests:true,onCall:c=>{Object.assign(c,active);fs.appendFileSync(path.join(out,'calls.jsonl'),JSON.stringify(c)+'\n');}});
 const save=()=>{manifest.costs=summarize(calls);manifest.reservedUpperUsd=(resume?.priorReservedUsd||0)+observed.reservedUsd();if(resume)manifest.entireExperimentCosts=summarize([...calls,resume.failedCall]);fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');};save();
 for(const [i,j] of jobs.entries()){
  active={trialId:j.trialId,caseId:j.caseId,model:j.model,arm:j.arm,repetition:j.repetition};const start=Date.now();let response=null,check=null,issues=[],error=null;
  try{
   const r=await observed('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','anthropic-version':'2023-06-01','x-api-key':apiKey},body:JSON.stringify(j.body),signal:AbortSignal.timeout(45000)});
   response=await r.json();if(!r.ok||response.stop_reason!=='tool_use')throw Error('Provider response rejected or incomplete');
   check=response.content?.find(b=>b.type==='tool_use'&&b.name==='check_planned_answer_acceptance')?.input;
   issues=coverageIssues(check,j.input.plan,j.input.packet,j.input.packet.actions.filter(a=>j.draft.actionIds.includes(a.id)));
  }catch(e){error=e.message;}
  const id='check-'+String(runs.length+1).padStart(3,'0'),record={id,isTest:true,...active,requestHash:hash(j.body),response,check,issues,error,durationMs:Date.now()-start};
  fs.writeFileSync(path.join(out,id+'.json'),JSON.stringify(record,null,2)+'\n');runs.push({id,...active,durationMs:record.durationMs,issues,error});save();
  log(JSON.stringify({completed:runs.length,total:prepared.jobs.length,...runs.at(-1)}));
  if(error||summarize([calls.at(-1)]).unknownCostCalls){manifest.status='stopped-error-or-unknown-usage';break;}
 }
 if(manifest.status==='running')manifest.status=runs.length===prepared.jobs.length?'captured':'incomplete';manifest.finishedAt=new Date().toISOString();save();return manifest;
}
async function main(){
 const [priorArg,outArg,flag]=process.argv.slice(2);if(!priorArg||!outArg||flag&&flag!=='--prepare-only')throw Error('Require prior writer capture, new output and optional --prepare-only');
 const prior=path.resolve(priorArg),out=path.resolve(outArg);
 if(flag){const p=prepare(prior);console.log(JSON.stringify({calls:p.jobs.length,plannedUpperUsd:p.plannedUpperUsd,capUsd:5}));return;}
 await capture({prior,out});
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={reasoningRequest,prepare,prepareResume,capture,trials,arms,labels};

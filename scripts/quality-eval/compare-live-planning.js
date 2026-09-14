"use strict";
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const {liveUnderstandingRequest,resolveLivePlan}=require('./live-request-plan');
const {createObservedFetch}=require('./observe-fetch'),{summarize,RATES}=require('./usage');
const cases=[
 {id:'yoga',question:'When is the next yoga class?'},
 {id:'pool-now',question:'Is the pool open right now?'},
 {id:'pool-future',question:'Will the pool be open tomorrow?'},
 {id:'pool-hours',question:'What are the pool hours?'},
 {id:'food-truck',question:'Which food truck is here today?'},
 {id:'waste',question:'Is trash pickup delayed tomorrow?'},
 {id:'followup-date',question:'What about tomorrow?',context:[{question:'When is the next yoga class?'}]},
 {id:'event-place-date',question:'Are there events at the clubhouse on September 20?'}
];
function prepare(profile,now){
 return cases.flatMap(row=>[1,2].map(repetition=>({row,repetition,body:liveUnderstandingRequest(row,'claude-haiku-4-5',profile,now),order:crypto.randomBytes(8).toString('hex')})));
}
async function main(){
 const [priorArg,outArg,flag]=process.argv.slice(2);if(flag&&flag!=='--without-strict')throw new Error('Unknown replay flag');const replay=flag==='--without-strict';
 if(!priorArg||!outArg||!process.env.ANTHROPIC_API_KEY)throw new Error('Require prior phase accounting, new output and existing credential');
 const prior=path.resolve(priorArg),out=path.resolve(outArg),p=JSON.parse(fs.readFileSync(path.join(prior,'manifest.json'),'utf8'));
 if(p.status!=='captured'||(replay?!(p.model==='claude-haiku-4-5'&&p.runs.length===16):p.mode!=='paired-writer-only'))throw new Error('Require completed prior phase accounting');
 const priorReserved=p.priorReservedUpperUsd+p.reservedUpperUsd,capUsd=Math.min(replay?.07:.28,3-priorReserved);
 if(!Number.isFinite(capUsd)||capUsd<=0)throw new Error('No phase reservation remains');
 if(fs.existsSync(out))throw new Error('Use a new capture directory');
 const profile=require('../../data/communities/sterling-ranch.json'),now=replay?p.now:Date.now();let jobs=prepare(profile,now);const r=RATES['claude-haiku-4-5'];
 if(replay){const captured=fs.readFileSync(path.join(prior,'calls.jsonl'),'utf8').trim().split(/\n/).map(JSON.parse);
  jobs=jobs.filter(j=>['yoga','pool-now'].includes(j.row.id)).map(j=>{const body=structuredClone(captured.find(c=>c.caseId===j.row.id)?.request);if(body?.tools?.[0]?.strict!==true)throw new Error('Require original strict request');delete body.tools[0].strict;return {...j,body};});
 }
 const plannedUpper=jobs.reduce((s,j)=>s+((Buffer.byteLength(JSON.stringify(j.body))+1024)*r.input+j.body.max_tokens*r.output)/1e6,0);
 if(plannedUpper>capUsd)throw new Error('Complete repeated design exceeds remaining reservation: '+plannedUpper);
 fs.mkdirSync(out,{recursive:true});const calls=[];let active={};
 const manifest={isTest:true,status:'running',startedAt:new Date(now).toISOString(),now,codeRevision:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  cases:cases.filter(c=>jobs.some(j=>j.row.id===c.id)),mode:replay?'strict-option-only-replay':'live-planning',model:'claude-haiku-4-5',repetitions:2,priorCapture:prior,priorReservedUpperUsd:priorReserved,capUsd,plannedUpper,runs:[],
  limitations:['Authored development cases, not unseen holdout or human calibration.','Interpretation only; no source execution or answer quality/cost measured.','Configured but unintegrated capabilities must remain gaps, not substituted sources.']};
 const observed=createObservedFetch(fetch,{calls,capUsd,captureRequests:true,onCall:c=>{Object.assign(c,active);fs.appendFileSync(path.join(out,'calls.jsonl'),JSON.stringify(c)+'\n');}});
 const save=()=>{manifest.costs=summarize(calls);manifest.reservedUpperUsd=observed.reservedUsd();fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');};
 fs.copyFileSync(__filename,path.join(out,'runner.js'));save();
 for(const [i,job] of jobs.sort((a,b)=>a.order.localeCompare(b.order)).entries()){
  active={caseId:job.row.id,repetition:job.repetition};const start=Date.now();let raw=null,resolved=null,error=null;
  try{const response=await observed('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','anthropic-version':'2023-06-01','x-api-key':process.env.ANTHROPIC_API_KEY},body:JSON.stringify(job.body),signal:AbortSignal.timeout(45000)});
   const data=await response.json();if(!response.ok||data.stop_reason!=='tool_use')throw new Error('Provider rejected or incomplete response');
   raw=data.content?.find(c=>c.type==='tool_use'&&c.name==='route_community_question')?.input;resolved=resolveLivePlan(raw,job.row,profile,now);
  }catch(e){error=e.message;}
  const record={id:'live-plan-'+String(i+1).padStart(2,'0'),isTest:true,...active,question:job.row.question,context:job.row.context||[],raw,resolved,error,durationMs:Date.now()-start};
  fs.writeFileSync(path.join(out,record.id+'.json'),JSON.stringify(record,null,2)+'\n');manifest.runs.push(record);save();console.log(JSON.stringify({completed:i+1,total:jobs.length,...active,error,issues:resolved?.issues,diagnostics:resolved?.diagnostics}));
  if(error){manifest.status='stopped-error';break;}
 }
 if(manifest.status==='running')manifest.status=manifest.runs.length===jobs.length?'captured':'incomplete';manifest.finishedAt=new Date().toISOString();save();
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={cases,prepare};

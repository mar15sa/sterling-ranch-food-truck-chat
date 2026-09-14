"use strict";
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const {RATES,summarize,ensureAllowedModel}=require('./usage');
const {packetIssues,draftIssues,modelEvidence,modelActions}=require('./full-flow-candidate');
const {hash}=require('./flow-evidence');
const {createObservedFetch}=require('./observe-fetch');
const models=['claude-haiku-4-5','claude-sonnet-5','claude-opus-5'];
function writerRequest(original,model){
 ensureAllowedModel(model);if(!models.includes(model)||original?.thinking?.type!=='disabled'||original?.max_tokens!==650||
   original?.tools?.length!==1||original.tools[0].name!=='compose_requested_answer')throw new Error('Unsupported paired writer request');
 const body=structuredClone(original);body.model=model;
 if(model.includes('haiku'))body.temperature=0;else delete body.temperature;
 return body;
}
function upperCost(body){const r=RATES[body.model];return ((Buffer.byteLength(JSON.stringify(body))+1024)*r.input+body.max_tokens*r.output)/1e6;}
function makeJobs(trials,communityId){
 const jobs=[];
 for(const trial of trials){
  if(trial.isTest!==true||trial.variant!=='haiku-compose'||trial.response?.status!=='unreviewed-experiment')throw new Error('Require captured authored test drafts');
  const packet={communityId,sources:trial.response.sources,actions:trial.response.actions};
  const originals=trial.calls.filter(c=>c.stage==='composition');if(originals.length!==1)throw new Error('Require one captured composition attempt');
  const original=originals[0].request,payload=JSON.parse(original.messages[0].content);
  // Response actions are selected actions; reconstruct the complete original inventory.
  packet.actions=payload.actions.map(a=>({...a,communityId,version:packet.sources.find(s=>s.id===a.sourceId)?.version}));
  if(packetIssues(packet,communityId).length||hash(payload.evidence)!==hash(modelEvidence(packet.sources))||
    hash(payload.actions)!==hash(modelActions(packet.actions)))throw new Error('Captured prompt/evidence identity mismatch');
  for(const model of models)for(let repetition=1;repetition<=2;repetition++){
   const body=writerRequest(original,model);
   jobs.push({caseId:trial.caseId,originalTrial:trial.id,model,repetition,packet,body,requestHash:hash(body),order:crypto.randomBytes(8).toString('hex')});
  }
 }
 return jobs;
}
async function main(){
 const [priorArg,outArg]=process.argv.slice(2);if(!priorArg||!outArg||!process.env.ANTHROPIC_API_KEY)throw new Error('Require completed semantic flow, new output and existing credential');
 const prior=path.resolve(priorArg),out=path.resolve(outArg),read=p=>JSON.parse(fs.readFileSync(p,'utf8')),m=read(path.join(prior,'manifest.json'));
 if(m.status!=='captured'||m.capUsd!==3||m.retrieval?.method!=='local-semantic-plus-keyword')throw new Error('Require the completed bounded semantic flow phase');
 if(fs.existsSync(out))throw new Error('Use a new output directory');
 const capUsd=Math.min(.89,3-m.reservedUpperEstimateUsd);
 if(!Number.isFinite(capUsd)||capUsd<=0)throw new Error('Phase reservation unavailable');
 const saved=k=>read(path.join(prior,m.snapshotFiles[k])),profile=saved('profile'),community=saved('community'),rules=saved('rules'),attestation=saved('attestation'),ruleAttestation=saved('rulesAttestation');
 const gates=require('./flow-snapshot'),baseline=require('../../data/community-index.json');
 const validate=()=>{gates.validateSnapshot(community,attestation,baseline);gates.validateRulesSnapshot(rules,ruleAttestation,profile.communityId);};validate();
 const trials=['shed','lighting-followup'].map(caseId=>{const entry=m.runs.find(r=>r.caseId===caseId&&r.variant==='haiku-compose');if(!entry)throw new Error('Missing paired case');return read(path.join(prior,entry.id+'.json'));});
 const jobs=makeJobs(trials,profile.communityId),plannedUpper=jobs.reduce((s,j)=>s+upperCost(j.body),0);
 if(plannedUpper>capUsd)throw new Error('Balanced design exceeds remaining phase budget');
 fs.mkdirSync(out,{recursive:true});
 const manifest={isTest:true,status:'running',startedAt:new Date().toISOString(),mode:'paired-writer-only',priorCapture:prior,priorCodeRevision:m.codeRevision,
  codeRevision:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),models,repetitions:2,caseIds:trials.map(t=>t.caseId),capUsd,plannedUpper,priorReservedUpperUsd:m.reservedUpperEstimateUsd,runs:[],
  limitations:['Two known diagnostic cases, not unseen or representative.','Saved interpretation/evidence, composition-only cost and latency.','Anonymous review file is not proof of independent human review.','Thinking disabled; results do not compare adaptive-thinking configurations.']};
 const calls=[];let active={};
 const observed=createObservedFetch(fetch,{calls,capUsd,captureRequests:true,onCall:c=>{Object.assign(c,active);fs.appendFileSync(path.join(out,'calls.jsonl'),JSON.stringify(c)+'\n');}});
 const save=()=>{manifest.costs=summarize(calls);manifest.reservedUpperUsd=observed.reservedUsd();fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');};
 fs.copyFileSync(__filename,path.join(out,'runner.js'));fs.writeFileSync(path.join(out,'paired-inputs.json'),JSON.stringify(jobs.map(({order,...j})=>j))+'\n');save();
 for(const [i,job] of jobs.sort((a,b)=>a.order.localeCompare(b.order)).entries()){
  try{validate();}catch(e){manifest.status='stopped-invalid-snapshot';manifest.error=e.message;break;}
  active={caseId:job.caseId,model:job.model,repetition:job.repetition};const start=Date.now();let draft=null,error=null,issues=[];
  try{const response=await observed('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','anthropic-version':'2023-06-01','x-api-key':process.env.ANTHROPIC_API_KEY},body:JSON.stringify(job.body),signal:AbortSignal.timeout(45000)});
   const data=await response.json();if(!response.ok||data.stop_reason!=='tool_use')throw new Error('Provider response incomplete or rejected');
   draft=data.content?.find(c=>c.type==='tool_use'&&c.name==='compose_requested_answer')?.input;issues=draftIssues(draft,job.packet);
  }catch(e){error=e.message;}
  const record={id:'writer-'+String(i+1).padStart(2,'0'),isTest:true,...active,originalTrial:job.originalTrial,requestHash:job.requestHash,reviewRequired:true,draft,error,issues,durationMs:Date.now()-start};
  fs.writeFileSync(path.join(out,record.id+'.json'),JSON.stringify(record,null,2)+'\n');manifest.runs.push(record);save();
  const payload=JSON.parse(job.body.messages[0].content);fs.appendFileSync(path.join(out,'blind-review.jsonl'),JSON.stringify({id:record.id,question:payload.question,priorResidentQuestions:payload.priorResidentQuestions,answer:draft?.answer||null,actions:job.packet.actions.filter(a=>draft?.actionIds?.includes(a.id)),evidence:payload.evidence,error:Boolean(error||issues.length)})+'\n');
  console.log(JSON.stringify({completed:i+1,total:jobs.length,...active,error,issues}));
  if(error){manifest.status='stopped-provider-error';break;}
 }
 if(manifest.status==='running')manifest.status=manifest.runs.length===jobs.length?'captured':'incomplete';
 manifest.finishedAt=new Date().toISOString();manifest.costsByModel=Object.fromEntries(models.map(model=>[model,summarize(calls.filter(c=>c.model===model))]));save();
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={writerRequest,upperCost,makeJobs};

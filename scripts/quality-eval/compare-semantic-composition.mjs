// A bounded composition-only replay. Saved interpretations are not new model calls.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';import {createSemanticRanker} from './semantic-ranker.mjs';
const require=createRequire(import.meta.url),flow=require('./flow-evidence'),corpus=require('./semantic-corpus');
const candidate=require('./full-flow-candidate'),snapshots=require('./flow-snapshot');
const {createObservedFetch}=require('./observe-fetch'),{summarize,RATES}=require('./usage');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
async function main(){
 const [priorArg,cacheArg,outArg]=process.argv.slice(2);if(!priorArg||!cacheArg||!outArg||!process.env.ANTHROPIC_API_KEY)throw new Error('Require completed capture, local vectors, new output and existing provider credential');
 const prior=path.resolve(priorArg),out=path.resolve(outArg),m=read(path.join(prior,'manifest.json'));
 if(m.status!=='captured'||m.assessmentMode!=='offline-review'||m.capUsd!==3)throw new Error('Require completed bounded simpler-flow phase');
 const capUsd=Math.min(1.18,3-m.reservedUpperEstimateUsd);if(capUsd<=0)throw new Error('Phase budget exhausted');
 if(fs.existsSync(out))throw new Error('Use a new output directory');
 const saved=key=>read(path.join(prior,m.snapshotFiles[key]));
 const profile=saved('profile'),communityIndex=saved('community'),rulesIndex=saved('rules'),attestation=saved('attestation'),rulesAttestation=saved('rulesAttestation'),baseline=require('../../data/community-index.json');
 const validate=()=>{snapshots.validateSnapshot(communityIndex,attestation,baseline);snapshots.validateRulesSnapshot(rulesIndex,rulesAttestation,profile.communityId);};validate();
 const now=Date.now(),ranker=await createSemanticRanker({directory:path.resolve(cacheArg),documents:corpus.eligibleCorpus(rulesIndex,profile.communityId,now),communityId:profile.communityId});
 const context={profile,communityIndex,rulesIndex,communityId:profile.communityId,now,communityMode:'complete-catalog'};
 const retrievers={keyword:flow.makeRetriever(context),hybrid:flow.makeRetriever({...context,ruleSearch:(index,query,limit)=>ranker.search(index,query,limit,{now})})};
 const jobs=[],packets={};
 try{for(const caseId of ['forms-multi','compound']){
  const r=m.runs.find(r=>r.caseId===caseId&&r.variant!=='current-local'),trial=read(path.join(prior,r.id+'.json'));
  const original=trial.calls.find(c=>c.stage==='composition')?.request;if(!original||!trial.response?.plan)throw new Error('Missing captured interpretation/composition');
  for(const [retrieval,retrieve] of Object.entries(retrievers)){
   const packet=await retrieve(trial.response.plan);if(candidate.packetIssues(packet,profile.communityId).length)throw new Error('Invalid replay evidence');
   packets[caseId+'-'+retrieval]={plan:trial.response.plan,packet,originalTrial:r.id};
   for(const model of ['claude-haiku-4-5','claude-sonnet-5'])for(let repetition=1;repetition<=2;repetition++){
    const body=structuredClone(original);body.model=model;
    if(model.includes('haiku'))body.temperature=0;else delete body.temperature;
    body.tools[0].input_schema=candidate.compositionSchema(packet);
    const payload=JSON.parse(body.messages[0].content);payload.evidence=candidate.modelEvidence(packet.sources);payload.actions=candidate.modelActions(packet.actions);body.messages[0].content=JSON.stringify(payload);
    jobs.push({caseId,retrieval,model,repetition,body,packet,order:crypto.randomBytes(8).toString('hex')});
   }
  }
 }}finally{await ranker.dispose();}
 // Reserve the entire balanced design before making any provider call.
 const plannedUpper=jobs.reduce((sum,j)=>sum+((Buffer.byteLength(JSON.stringify(j.body))+1024)*RATES[j.model].input+j.body.max_tokens*RATES[j.model].output)/1e6,0);
 if(plannedUpper>capUsd)throw new Error('Balanced replay exceeds remaining phase reservation');
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'packets.json'),JSON.stringify(packets)+'\n');
 const manifest={isTest:true,status:'running',startedAt:new Date().toISOString(),priorCapture:prior,capUsd,plannedUpper,priorReservedUpperUsd:m.reservedUpperEstimateUsd,
  mode:'composition-only-unreviewed',models:['claude-haiku-4-5','claude-sonnet-5'],repetitions:2,runs:[],codeRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),priorCodeRevision:m.codeRevision,
  limitations:['Two known diagnostic failures, not an unseen benchmark.','Saved interpretations and prepared retrieval packets exclude interpretation/retrieval latency and cost from this replay.','No independent human quality rating or production readiness claim.']};
 const calls=[];let active={};
 const observed=createObservedFetch(fetch,{calls,capUsd,captureRequests:true,onCall:c=>{Object.assign(c,active);fs.appendFileSync(path.join(out,'calls.jsonl'),JSON.stringify(c)+'\n');}});
 const save=()=>{manifest.costs=summarize(calls);manifest.reservedUpperUsd=observed.reservedUsd();fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');};
 fs.copyFileSync(new URL(import.meta.url),path.join(out,'runner.mjs'));save();jobs.sort((a,b)=>a.order.localeCompare(b.order));
 for(const [i,job] of jobs.entries()){
  try{validate();}catch(e){manifest.status='stopped-invalid-snapshot';manifest.error=e.message;save();break;}
  active={caseId:job.caseId,retrieval:job.retrieval,repetition:job.repetition};const start=Date.now();let draft=null,error=null,issues=[];
  try{
   const response=await observed('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','anthropic-version':'2023-06-01','x-api-key':process.env.ANTHROPIC_API_KEY},body:JSON.stringify(job.body),signal:AbortSignal.timeout(45000)});
   const data=await response.json();if(!response.ok||data.stop_reason!=='tool_use')throw new Error('Provider response incomplete or rejected');
   draft=data.content.find(c=>c.type==='tool_use'&&c.name==='compose_requested_answer')?.input;issues=candidate.draftIssues(draft,job.packet);
  }catch(e){error=e.message;}
  const record={id:'replay-'+(i+1),isTest:true,...active,model:job.model,reviewRequired:true,draft,error,issues,durationMs:Date.now()-start};
  fs.writeFileSync(path.join(out,record.id+'.json'),JSON.stringify(record,null,2)+'\n');manifest.runs.push(record);save();console.log(JSON.stringify({completed:i+1,total:jobs.length,...active,error,issues}));
  if(error||issues.length){manifest.status='stopped-error';break;}
 }
 if(manifest.status==='running')manifest.status='captured';manifest.finishedAt=new Date().toISOString();save();
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});

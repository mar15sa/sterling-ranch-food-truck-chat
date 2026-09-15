"use strict";
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const {capturedInput}=require('./compare-evidence-selection');
const {presentWriterRequest}=require('./writer-presentation');
const {draftIssues,packetIssues}=require('./full-flow-candidate');
const {upperCost}=require('./compare-planners');
const {hash}=require('./flow-evidence');
const {summarize}=require('./usage');
const {createObservedFetch}=require('./observe-fetch');
const cases=[...['food-menu','pool-hours','recycling-storage','shed-form'].map(id=>({id,capture:'mixed-live-flow-20260914'})),
 ...['lighting-process','application','forms-multi','compound'].map(id=>({id,capture:'semantic-full-flow-20260914'}))];
const variants={control:{},stable:{stableActionSchema:true},combined:{stableActionSchema:true,separateContext:true}};
const models=['claude-haiku-4-5','claude-sonnet-5'];
function jobsFor(inputs,capUsd=5){
 if(inputs.length!==8||new Set(inputs.map(i=>i.caseId)).size!==8||inputs.some(i=>!cases.some(c=>c.id===i.caseId)))throw Error('Require all eight declared cases');
 if(capUsd!==5)throw Error('Comparison phase cap is fixed at five dollars');
 const jobs=[];
 for(const input of inputs){
  if(packetIssues(input.packet,input.communityId,input.now).length)throw Error('Invalid captured packet');
  for(let repetition=1;repetition<=2;repetition++)for(const model of models)for(const [variant,options] of Object.entries(variants)){
   const body=presentWriterRequest(input.originalCompositionRequest,input.packet,{...options,timezone:input.timezone,now:input.now});
   body.model=model;if(model==='claude-haiku-4-5')body.temperature=0;
   jobs.push({caseId:input.caseId,repetition,model,variant,body,input});
  }
 }
 const plannedUpperUsd=jobs.reduce((s,j)=>s+upperCost(j.body),0);if(plannedUpperUsd>capUsd)throw Error('Whole comparison exceeds phase reservation');
 return {jobs,plannedUpperUsd,capUsd};
}
function prepare(root){
 const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),inputs=[];
 for(const c of cases){
  const dir=path.join(root,c.capture),m=read(path.join(dir,'manifest.json'));
  if(m.status!=='captured'||m.assessmentMode!=='offline-review'||m.communityMode!=='complete-catalog')throw Error('Require complete full-context capture');
  const row=m.runs.filter(r=>r.caseId===c.id&&r.variant==='sonnet-compose'&&r.status==='unreviewed-experiment').sort((a,b)=>a.id.localeCompare(b.id))[0];
  if(!row)throw Error('Missing declared case');const trial=read(path.join(dir,row.id+'.json'));
  if(trial.id!==row.id||trial.caseId!==c.id)throw Error('Wrong original trial');
  const input=capturedInput(trial),profile=read(path.join(dir,m.snapshotFiles.profile));
  if(profile.communityId!==input.packet.communityId)throw Error('Wrong captured profile');
  inputs.push({caseId:c.id,capture:dir,communityId:profile.communityId,timezone:profile.timezone,...input});
 }
 return {...jobsFor(inputs),inputs};
}
async function main(){
 const [outArg,flag]=process.argv.slice(2);if(!outArg||flag&&flag!=='--prepare-only')throw Error('Require output and optional --prepare-only');
 const root=path.resolve('artifacts/quality-eval'),out=path.resolve(outArg),prepared=prepare(root);
 if(flag){console.log(JSON.stringify({jobs:prepared.jobs.length,plannedUpperUsd:prepared.plannedUpperUsd,capUsd:prepared.capUsd}));return;}
 if(!process.env.ANTHROPIC_API_KEY||fs.existsSync(out))throw Error('Require existing credential and new capture directory');
 fs.mkdirSync(out,{recursive:true});fs.mkdirSync(path.join(out,'code'));
 for(const file of ['compare-writer-presentation.js','writer-presentation.js','full-flow-candidate.js','observe-fetch.js','usage.js'])fs.copyFileSync(path.join(__dirname,file),path.join(out,'code',file));
 const calls=[],runs=[],schemaSeen=new Set();let active={};
 const ordered=prepared.jobs.map(j=>({...j,order:crypto.randomBytes(8).toString('hex')})).sort((a,b)=>a.order.localeCompare(b.order));
 const manifest={status:'running',isTest:true,mode:'controlled-writer-presentation',startedAt:new Date().toISOString(),codeRevision:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  capUsd:prepared.capUsd,plannedUpperUsd:prepared.plannedUpperUsd,models,variants,repetitions:2,casesHash:hash(cases),cases:cases.map(c=>c.id),runs,
  priorPhase:{name:'mixed-live-flow-and-followups',knownCostUsd:1.822022,reservedUpperUsd:4.929376,capUsd:5,remainingReservationUsd:.070624,closed:true},
  inputHashes:Object.fromEntries(prepared.inputs.map(i=>[i.caseId,hash(i)])),design:ordered.map(({caseId,repetition,model,variant,body})=>({caseId,repetition,model,variant,requestHash:hash(body)})),
  limitations:['Historical source clocks, not live-current evidence.','Known authored development cases, not unseen or independent human calibration.','Writer stage only; no selection, interpretation, checking, repair, source refresh or hosting charges.','First schema use in this run is not proof of a provider cache miss.']};
 for(const input of prepared.inputs)fs.writeFileSync(path.join(out,input.caseId+'-input.json'),JSON.stringify(input,null,2)+'\n');
 const observed=createObservedFetch(fetch,{calls,capUsd:prepared.capUsd,captureRequests:true,onCall:c=>{Object.assign(c,active);fs.appendFileSync(path.join(out,'calls.jsonl'),JSON.stringify(c)+'\n');}});
 const save=()=>{manifest.costs=summarize(calls);manifest.reservedUpperUsd=observed.reservedUsd();fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');};save();
 for(const [i,j] of ordered.entries()){
  const schemaHash=hash(j.body.tools),schemaKey=j.model+':'+schemaHash,firstSchemaUseInRun=!schemaSeen.has(schemaKey);schemaSeen.add(schemaKey);
  active={caseId:j.caseId,repetition:j.repetition,model:j.model,variant:j.variant,schemaHash,firstSchemaUseInRun};
  const start=Date.now();let response=null,draft=null,issues=[],error=null;
  try{const r=await observed('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','anthropic-version':'2023-06-01','x-api-key':process.env.ANTHROPIC_API_KEY},body:JSON.stringify(j.body),signal:AbortSignal.timeout(45000)});
   response=await r.json();if(!r.ok||response.stop_reason!=='tool_use')throw Error('Provider response rejected or incomplete');
   draft=response.content?.find(c=>c.type==='tool_use'&&c.name==='compose_requested_answer')?.input;issues=draftIssues(draft,j.input.packet);
  }catch(e){error=e.message;}
  const id='presentation-'+String(i+1).padStart(3,'0'),record={id,isTest:true,...active,originalTrial:j.input.originalTrial,requestHash:hash(j.body),response,draft,issues,error,durationMs:Date.now()-start};
  fs.writeFileSync(path.join(out,id+'.json'),JSON.stringify(record,null,2)+'\n');runs.push({id,...active,durationMs:record.durationMs,issues,error});save();
  console.log(JSON.stringify({completed:i+1,total:ordered.length,id,...active,durationMs:record.durationMs,issues,error}));
  if(error||calls.at(-1)?.usage==null){manifest.status='stopped-error-or-unknown-usage';break;}
 }
 if(manifest.status==='running')manifest.status=runs.length===ordered.length?'captured':'incomplete';manifest.finishedAt=new Date().toISOString();save();
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={cases,variants,models,jobsFor,prepare};

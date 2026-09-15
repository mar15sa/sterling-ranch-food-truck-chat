"use strict";
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const {flowAcceptanceRequest}=require('./flow-acceptance');
const {modelEvidence,modelActions,coverageIssues,draftIssues,packetIssues}=require('./full-flow-candidate');
const {presentPayload,PRESENTATION_INSTRUCTIONS}=require('./writer-presentation');
const {hash}=require('./flow-evidence');
const {upperCost}=require('./compare-planners');
const {summarize}=require('./usage');
const {createObservedFetch}=require('./observe-fetch');
const labels=require('./captured-acceptance-labels.json');
const models=['claude-haiku-4-5','claude-sonnet-5'];
function checkerRequest(input,draft,model){
 if(!models.includes(model)||packetIssues(input.packet,input.communityId,input.now).length||draftIssues(draft,input.packet).length)throw Error('Invalid checker replay input');
 const actions=input.packet.actions.filter(a=>draft.actionIds.includes(a.id));
 const request=flowAcceptanceRequest({question:input.row.question,priorResidentQuestions:(input.row.context||[]).map(c=>c.question),
   response:{answer:draft.answer,actions:modelActions(actions),sources:modelEvidence(input.packet.sources)}},input.plan,model);
 request.messages[0].content=JSON.stringify(presentPayload(JSON.parse(request.messages[0].content),input.packet,{timezone:input.timezone,now:input.now}));
 request.system+='\n'+PRESENTATION_INSTRUCTIONS;return request;
}
function prepare(directory){
 const read=name=>JSON.parse(fs.readFileSync(path.join(directory,name),'utf8')),m=read('manifest.json');
 if(m.status!=='captured'||m.mode!=='controlled-writer-presentation'||m.runs.length!==96||m.design.length!==96)throw Error('Require complete original writer comparison');
 if(labels.cases.length!==14||new Set(labels.cases.map(c=>c.trial)).size!==14||labels.cases.filter(c=>c.expected==='accept').length!==7||labels.cases.filter(c=>c.expected==='reject').length!==7)throw Error('Unbalanced frozen labels');
 const originalCalls=fs.readFileSync(path.join(directory,'calls.jsonl'),'utf8').trim().split('\n').map(JSON.parse),inputs=[],jobs=[];
 for(const label of labels.cases){
  const index=m.runs.findIndex(r=>r.id===label.trial);if(index<0)throw Error('Missing selected trial');
  const trial=read(label.trial+'.json'),input=read(trial.caseId+'-input.json'),call=originalCalls[index];
  if(!trial.isTest||trial.error||trial.id!==label.trial||hash(input)!==m.inputHashes[trial.caseId]||trial.requestHash!==m.design[index].requestHash||hash(call.request)!==trial.requestHash)throw Error('Original capture identity mismatch');
  const block=trial.response?.content?.find(b=>b.type==='tool_use'&&b.name==='compose_requested_answer');
  if(hash(block?.input)!==hash(trial.draft)||JSON.parse(call.request.messages[0].content).question!==input.row.question)throw Error('Changed original draft or question');
  const selected={trialId:trial.id,caseId:trial.caseId,input,draft:trial.draft};inputs.push(selected);
  for(const model of models)for(const repetition of [1,2])jobs.push({...selected,model,repetition,body:checkerRequest(input,trial.draft,model)});
 }
 const plannedUpperUsd=jobs.reduce((s,j)=>s+upperCost(j.body),0);if(plannedUpperUsd>5)throw Error('Whole checker comparison exceeds five-dollar cap');
 return {inputs,jobs,plannedUpperUsd};
}
async function main(){
 const [priorArg,outArg,flag]=process.argv.slice(2);if(!priorArg||!outArg||flag&&flag!=='--prepare-only')throw Error('Require prior capture, output and optional --prepare-only');
 const prior=path.resolve(priorArg),out=path.resolve(outArg),prepared=prepare(prior);
 if(flag){console.log(JSON.stringify({calls:prepared.jobs.length,plannedUpperUsd:prepared.plannedUpperUsd,capUsd:5}));return;}
 if(!process.env.ANTHROPIC_API_KEY||fs.existsSync(out))throw Error('Require existing credential and fresh output directory');
 fs.mkdirSync(out,{recursive:true});fs.mkdirSync(path.join(out,'code'));
 for(const name of ['compare-captured-acceptance.js','flow-acceptance.js','compact-acceptance-candidate.js','answer-assessment-candidate.js','full-flow-candidate.js','writer-presentation.js','observe-fetch.js','usage.js'])fs.copyFileSync(path.join(__dirname,name),path.join(out,'code',name));
 fs.writeFileSync(path.join(out,'predeclared-labels.json'),JSON.stringify(labels,null,2)+'\n');
 const jobs=prepared.jobs.map(j=>({...j,order:crypto.randomBytes(8).toString('hex')})).sort((a,b)=>a.order.localeCompare(b.order));
 const calls=[],runs=[];let active={};
 const manifest={status:'running',isTest:true,mode:'captured-answer-acceptance',startedAt:new Date().toISOString(),codeRevision:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),priorCapture:prior,
  capUsd:5,plannedUpperUsd:prepared.plannedUpperUsd,models,repetitions:2,labelsHash:hash(labels),runs,inputHashes:Object.fromEntries(prepared.inputs.map(i=>[i.trialId,hash(i)])),
  design:jobs.map(j=>({trialId:j.trialId,caseId:j.caseId,model:j.model,repetition:j.repetition,requestHash:hash(j.body)})),
  limitations:['Known authored development answers, not unseen acceptance or human calibration.','Checker sees no labels or writer identity.','Checker stage only, no repair or full-flow cost/quality.','Seven accept/seven reject cases are a diagnostic sample, not traffic prevalence.']};
 for(const input of prepared.inputs)fs.writeFileSync(path.join(out,input.trialId+'-input.json'),JSON.stringify(input,null,2)+'\n');
 const observed=createObservedFetch(fetch,{calls,capUsd:5,captureRequests:true,onCall:c=>{Object.assign(c,active);fs.appendFileSync(path.join(out,'calls.jsonl'),JSON.stringify(c)+'\n');}});
 const save=()=>{manifest.costs=summarize(calls);manifest.reservedUpperUsd=observed.reservedUsd();fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');};save();
 for(const [i,j] of jobs.entries()){
  active={trialId:j.trialId,caseId:j.caseId,model:j.model,repetition:j.repetition};const start=Date.now();let response=null,check=null,issues=[],error=null;
  try{const r=await observed('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','anthropic-version':'2023-06-01','x-api-key':process.env.ANTHROPIC_API_KEY},body:JSON.stringify(j.body),signal:AbortSignal.timeout(45000)});
   response=await r.json();if(!r.ok||response.stop_reason!=='tool_use')throw Error('Provider response rejected or incomplete');
   check=response.content?.find(b=>b.type==='tool_use'&&b.name==='check_planned_answer_acceptance')?.input;
   issues=coverageIssues(check,j.input.plan,j.input.packet,j.input.packet.actions.filter(a=>j.draft.actionIds.includes(a.id)));
  }catch(e){error=e.message;}
  const id='check-'+String(i+1).padStart(3,'0'),record={id,isTest:true,...active,requestHash:hash(j.body),response,check,issues,error,durationMs:Date.now()-start};
  fs.writeFileSync(path.join(out,id+'.json'),JSON.stringify(record,null,2)+'\n');runs.push({id,...active,durationMs:record.durationMs,issues,error});save();
  console.log(JSON.stringify({completed:runs.length,total:jobs.length,...runs.at(-1)}));
  if(error||calls.at(-1)?.usage==null){manifest.status='stopped-error-or-unknown-usage';break;}
 }
 if(manifest.status==='running')manifest.status=runs.length===jobs.length?'captured':'incomplete';manifest.finishedAt=new Date().toISOString();save();
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={checkerRequest,prepare,models};

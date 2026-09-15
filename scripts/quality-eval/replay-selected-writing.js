"use strict";
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const {modelEvidence,modelActions,compositionSchema,draftIssues,packetIssues}=require('./full-flow-candidate');
const {applySelection}=require('./evidence-selection');
const {hash}=require('./flow-evidence');
const {upperCost}=require('./compare-planners');
const {createObservedFetch}=require('./observe-fetch');
const {summarize}=require('./usage');
function writerRequest(input,packet){
 if(packetIssues(packet,input.packet.communityId,input.now).length)throw Error('Invalid selected historical packet');
 const body=structuredClone(input.originalCompositionRequest),payload=JSON.parse(body.messages[0].content);
 if(body.model!=='claude-sonnet-5'||body.tools?.[0]?.name!=='compose_requested_answer'||body.max_tokens!==650||body.thinking?.type!=='disabled'||
  hash(payload.evidence)!==hash(modelEvidence(input.packet.sources))||hash(payload.actions)!==hash(modelActions(input.packet.actions)))throw Error('Original writer input mismatch');
 if(packet.sources.some(s=>!input.packet.sources.some(original=>hash(original)===hash(s)))||packet.actions.some(a=>!input.packet.actions.some(original=>hash(original)===hash(a))))throw Error('Selection changed evidence or action identity');
 payload.evidence=modelEvidence(packet.sources);payload.actions=modelActions(packet.actions);body.messages[0].content=JSON.stringify(payload);body.tools[0].input_schema=compositionSchema(packet);return body;
}
async function main(){
 const [priorArg,outArg]=process.argv.slice(2);if(!priorArg||!outArg||!process.env.ANTHROPIC_API_KEY)throw Error('Require capture, new output and existing credential');
 const prior=path.resolve(priorArg),out=path.resolve(outArg),read=name=>JSON.parse(fs.readFileSync(path.join(prior,name),'utf8')),m=read('manifest.json');
 if(fs.existsSync(out)||m.status!=='captured'||m.mode!=='historical-evidence-selection-replay'||m.repetitions!==2||m.cases.length!==4)throw Error('Require complete selection design and new output');
 const jobs=m.runs.filter(r=>r.model==='claude-haiku-4-5').map(r=>{const record=read(r.id+'.json'),input=read(r.caseId+'-input.json');
  if(record.error||record.selection?.issues.length||record.caseId!==r.caseId||record.repetition!==r.repetition)throw Error('Invalid original selection');
  const applied=applySelection(record.raw,input.packet,input.packet.communityId,input.now);
  if(applied.issues.length||hash(applied.packet)!==hash(record.selection.packet))throw Error('Selected packet identity changed');
  return {...r,input,packet:applied.packet,body:writerRequest(input,applied.packet)};
 });
 if(jobs.length!==8||m.cases.some(id=>[1,2].some(rep=>jobs.filter(j=>j.caseId===id&&j.repetition===rep).length!==1)))throw Error('Unbalanced writer design');
 const priorReserved=m.priorReservedUpperUsd+m.reservedUpperUsd,capUsd=5-priorReserved,plannedUpper=jobs.reduce((s,j)=>s+upperCost(j.body),0);
 if(!Number.isFinite(capUsd)||capUsd<=0||capUsd>.354||plannedUpper>capUsd)throw Error('Full writer design exceeds remaining reservation');
 fs.mkdirSync(out,{recursive:true});const calls=[],runs=[];let active={};
 const manifest={status:'running',isTest:true,mode:'selected-evidence-writer-replay',startedAt:new Date().toISOString(),codeRevision:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),priorCapture:prior,
  priorReservedUpperUsd:priorReserved,capUsd,plannedUpperUsd:plannedUpper,runs,limitations:['Historical source clock; no current-live claims.','Eight candidate writer replays versus four historical matched original writer samples, not a new randomized control.','Selection plus writing only; interpretation/retrieval/checking/hosting excluded.','Known development cases; not blind human quality calibration.']};
 const observed=createObservedFetch(fetch,{calls,capUsd,captureRequests:true,onCall:c=>{Object.assign(c,active);fs.appendFileSync(path.join(out,'calls.jsonl'),JSON.stringify(c)+'\n');}});
 const save=()=>{manifest.costs=summarize(calls);manifest.reservedUpperUsd=observed.reservedUsd();fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');};
 fs.copyFileSync(__filename,path.join(out,'runner.js'));save();
 const ordered=jobs.map(j=>({...j,order:crypto.randomBytes(8).toString('hex')})).sort((a,b)=>a.order.localeCompare(b.order));
 for(const [i,j] of ordered.entries()){
  active={caseId:j.caseId,repetition:j.repetition,selectionId:j.id};const start=Date.now();let response=null,draft=null,issues=[],error=null;
  try{const r=await observed('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','anthropic-version':'2023-06-01','x-api-key':process.env.ANTHROPIC_API_KEY},body:JSON.stringify(j.body),signal:AbortSignal.timeout(45000)});
   response=await r.json();if(!r.ok||response.stop_reason!=='tool_use')throw Error('Provider response incomplete or rejected');
   draft=response.content?.find(c=>c.type==='tool_use'&&c.name==='compose_requested_answer')?.input;issues=draftIssues(draft,j.packet);
  }catch(e){error=e.message;}
  const id='writer-'+String(i+1).padStart(2,'0'),record={id,isTest:true,...active,requestHash:hash(j.body),response,draft,issues,error,durationMs:Date.now()-start};
  fs.writeFileSync(path.join(out,id+'.json'),JSON.stringify(record,null,2)+'\n');runs.push({id,...active,durationMs:record.durationMs,issues,error});save();console.log(JSON.stringify({completed:i+1,total:8,...runs.at(-1)}));
  if(error){manifest.status='stopped-error';break;}
 }
 if(manifest.status==='running')manifest.status=runs.length===8?'captured':'incomplete';manifest.finishedAt=new Date().toISOString();save();
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={writerRequest};

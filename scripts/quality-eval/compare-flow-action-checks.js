"use strict";
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {flowAcceptanceRequest,flowCheckIssues}=require('./flow-acceptance');
const {modelEvidence,modelActions}=require('./full-flow-candidate');
const {createObservedFetch}=require('./observe-fetch'),{summarize}=require('./usage');
async function main(){
 const out=path.resolve(process.argv[2]),capUsd=.7;if(!process.env.ANTHROPIC_API_KEY)throw new Error('Existing provider credential required');
 fs.mkdirSync(out,{recursive:true});const mp=path.join(out,'manifest.json');if(fs.existsSync(mp))throw new Error('Use a new output directory');
 const prior=path.resolve('artifacts/quality-eval/full-document-flow-v7-20260914'),read=f=>JSON.parse(fs.readFileSync(path.join(prior,f),'utf8'));
 const snapshot=require('./flow-snapshot');snapshot.validateSnapshot(read('snapshots/community-index.json'),read('snapshots/attestation.json'),require('../../data/community-index.json'));
 snapshot.validateRulesSnapshot(read('snapshots/rules-index.json'),read('snapshots/rules-attestation.json'),'sterling-ranch');
 const old=read('flow-028.json'),plan={needs:[{id:'need-1',subject:'permit',task:'form',request:'Locate permit application',evidenceKind:'official-action'}]};
 const source=(id,title,text,role='official-action')=>({id,title,text,role,sourceUrl:'https://alpha.example/'+id});
 const form=source('permit-form','Permit application','The official permit application is available here.'),contact=source('permit-contact','Permit office','Contact the permit office for help obtaining an application.'),payment=source('utility-payment','Utility bill payment','Pay a utility bill.'),rule=source('fence-rule','Fence approval','A fence requires design committee approval before installation.','governing-rule');
 const action=s=>({id:s.id+'-action',label:s.title,url:s.sourceUrl,sourceId:s.id});
 const cases=[
 {id:'recorded-lighting-wrong-link',expectedBad:true,badActionId:old.response.actions[0].id,plan:old.response.plan,question:old.question,priorResidentQuestions:old.context.map(c=>c.question),response:{answer:old.response.answer,sources:modelEvidence(old.response.sources),actions:modelActions(old.response.actions)}},
 {id:'exact-form',expectedBad:false,plan,question:'Where is the permit application?',response:{answer:'Here is the permit application.',sources:[form],actions:[action(form)]}},
 {id:'useful-fallback',expectedBad:false,plan,question:'Where is the permit application?',response:{answer:'I do not have a verified link to the application itself. The permit office can help you obtain it; contact them here.',sources:[contact],actions:[action(contact)]}},
 {id:'correct-form-plus-wrong-extra',expectedBad:true,badActionId:action(payment).id,plan,question:'Where is the permit application?',response:{answer:'Here is the permit application. You can also pay your utility bill.',sources:[form,payment],actions:[action(form),action(payment)]}},
 {id:'useful-required-next-step',expectedBad:false,plan:{needs:[{id:'need-1',subject:'fence',task:'permission',request:'May I install a fence',evidenceKind:'governing-rule'}]},question:'May I install a fence?',response:{answer:'You need design committee approval before installing a fence. Use the permit application to request approval.',sources:[rule,form],actions:[action(form)]}}
 ];
 const manifest={status:'running',isTest:true,model:'claude-sonnet-5',capUsd,cases:cases.length,repetitions:2,startedAt:new Date().toISOString(),runs:[],limitations:['Four synthetic controls and one recorded diagnostic failure; not an unseen human calibration.','Acceptance-stage cost only; not full answer cost.']};
 fs.writeFileSync(path.join(out,'cases.json'),JSON.stringify(cases,null,2));
 fs.mkdirSync(path.join(out,'code'));for(const f of ['flow-acceptance.js','compact-acceptance-candidate.js','full-flow-candidate.js','observe-fetch.js','usage.js'])fs.copyFileSync(path.join(__dirname,f),path.join(out,'code',f));
 const calls=[];let active={};const observed=createObservedFetch(fetch,{calls,capUsd,captureRequests:true,onCall:c=>{Object.assign(c,active);fs.appendFileSync(path.join(out,'calls.jsonl'),JSON.stringify(c)+'\n');}});
 const save=()=>{manifest.costs=summarize(calls);manifest.reservedUpperUsd=observed.reservedUsd();fs.writeFileSync(mp,JSON.stringify(manifest,null,2));};save();
 const jobs=[];for(let rep=1;rep<=2;rep++)for(const row of cases)jobs.push({row,rep,order:crypto.randomBytes(6).toString('hex')});jobs.sort((a,b)=>a.order.localeCompare(b.order));
 for(const [i,{row,rep}] of jobs.entries()){
  active={caseId:row.id,repetition:rep};const start=Date.now();let result=null,error=null,issues=[];
  try{const body=flowAcceptanceRequest(row,row.plan,manifest.model),response=await observed('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','anthropic-version':'2023-06-01','x-api-key':process.env.ANTHROPIC_API_KEY},body:JSON.stringify(body),signal:AbortSignal.timeout(45000)});const data=await response.json();if(!response.ok)throw new Error('Provider-'+response.status);if(data.stop_reason!=='tool_use')throw new Error('Incomplete-structured-output');result=data.content.find(c=>c.type==='tool_use')?.input;issues=flowCheckIssues(result,row.plan,row.response.sources.map(s=>s.id),row.response.actions);}
  catch(e){error=e.message;}
  const matched=Boolean(!error&&!issues.length&&(row.expectedBad?result.hardFailures.includes('wrong-action')&&result.actionReviews.some(a=>a.actionId===row.badActionId&&a.fit==='irrelevant'):result.hardFailures.length===0));
  const record={id:'check-'+(i+1),isTest:true,...active,result,error,issues,matchedExpectedActionBehavior:matched,durationMs:Date.now()-start};fs.writeFileSync(path.join(out,record.id+'.json'),JSON.stringify(record,null,2));manifest.runs.push(record);save();console.log(JSON.stringify({completed:i+1,total:jobs.length,caseId:row.id,matched,error,issues}));if(error){manifest.status='stopped-error-or-budget';break;}
 }
 if(manifest.status==='running')manifest.status='captured';manifest.finishedAt=new Date().toISOString();save();
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});

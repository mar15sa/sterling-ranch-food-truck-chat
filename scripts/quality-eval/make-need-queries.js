"use strict";
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {validationIssues}=require('./understanding-candidate');
const taskDescriptions={
  permission:'rule permitting or restricting the requested activity',process:'steps and requirements to complete the requested process',
  form:'application form document to complete and submit',payment:'official payment methods and payment destination',
  booking:'reservation procedure and booking destination',registration:'enrollment procedure and registration destination',
  'account-access':'account access and sign-in instructions',contact:'relevant contact person or department',
  cost:'applicable price and fees',schedule:'applicable schedule and timing',status:'current operational status',
  specification:'required dimensions materials and specifications',examples:'permitted examples and options',information:'official information'
};
function requestQueries(record,question,{queryMode='request'}={}){
  if(!['request','task-description'].includes(queryMode))throw new Error('Unknown query strategy');
  const plan=record.plan,issues=validationIssues(plan);
  if(issues.length)return {cases:[],disposition:'invalid-plan',issues};
  if(plan.scope!=='community')return {cases:[],disposition:plan.scope,clarificationQuestion:plan.clarificationQuestion};
  if(plan.clarificationQuestion.trim())return {cases:[],disposition:'inconsistent-plan',issues:['community-plan-contains-clarification']};
  return {disposition:'search',cases:plan.needs.map((need,i)=>({
    id:`${record.id}-need-${i+1}`,caseId:record.caseId,planId:record.id,needId:i+1,isTest:true,question,
    query:queryMode==='task-description'?`${need.subject}: ${taskDescriptions[need.task]}. ${need.request}`:`${need.subject} ${need.request}`,need,
    // Query hypotheses may be narrower; owner restrictions still see the original request and its constraints.
    eligibilityQuestion:[question,plan.standaloneQuestion,...plan.constraints].join('\n'),
  }))};
}
function make(directory,output,queryMode='request'){
  const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
  if(manifest.status!=='captured'||manifest.candidateRevision!=='v2')throw new Error('Require a completed refined-plan capture');
  const diagnostic=require('./diagnostic-cases.json').cases;
  const records=manifest.runs.map(r=>JSON.parse(fs.readFileSync(path.join(directory,r.id+'.json'),'utf8')));
  const rows=records.map(r=>({planId:r.id,caseId:r.caseId,repetition:r.repetition,...requestQueries(r,diagnostic.find(c=>c.id===r.caseId)?.question,{queryMode})}));
  const cases=rows.flatMap(r=>r.cases);if(!cases.length||cases.length>100||cases.some(c=>!c.question))throw new Error('Invalid query case count or question');
  const result={schemaVersion:1,isTest:true,queryMode,sourcePlansSha256:crypto.createHash('sha256').update(JSON.stringify(records)).digest('hex'),
    purpose:'Per-need keyword/semantic retrieval using cached authored-test plans; no new model calls or quality labels.',
    limitations:['Rules-only corpus cannot establish live operational facts or current external actions.',
      'A model plan is a hypothesis, not a human-approved interpretation or evidence authority.',
      'Non-community and inconsistent plans are recorded without guessed retrieval; unnecessary clarification is still a failure.'],
    dispositions:rows.map(({cases,...r})=>({...r,queries:cases.length})),cases};
  fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  return {plans:rows.length,queries:cases.length,dispositions:rows.reduce((a,r)=>(a[r.disposition]=(a[r.disposition]||0)+1,a),{})};
}
if(require.main===module)console.log(JSON.stringify(make(path.resolve(process.argv[2]),path.resolve(process.argv[3]),process.argv[4]||'request')));
module.exports={requestQueries,make};

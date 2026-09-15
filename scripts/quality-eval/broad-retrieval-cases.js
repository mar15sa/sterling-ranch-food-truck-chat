"use strict";
const fs=require('node:fs'),path=require('node:path');
const {validationIssues}=require('./understanding-candidate');
function replayPlanIssues(plan){
 if(!plan||typeof plan!=='object'||Array.isArray(plan))return ['missing-plan'];
 const {liveRequests,liveRequestDiagnostics,...base}=plan;
 if(!Array.isArray(base.needs)||base.needs.some(n=>!n||typeof n!=='object'))return ['invalid-needs'];
 const issues=validationIssues({...base,needs:base.needs.map(({id,...need})=>need)});
 if(plan.needs.some(n=>typeof n.id!=='string'||!n.id.trim())||new Set(plan.needs.map(n=>n.id)).size!==plan.needs.length)issues.push('missing-or-duplicate-need-id');
 if(!issues.length&&plan.scope==='ambiguous'&&(plan.needs.length||plan.searchQueries.length))issues.push('ambiguous-plan-guesses-subject');
 if(!issues.length&&plan.scope!=='ambiguous'&&plan.clarificationQuestion.trim())issues.push('unnecessary-plan-clarification');
 return issues;
}
function buildCases(directory){
 const read=f=>JSON.parse(fs.readFileSync(path.join(directory,f),'utf8')),m=read('manifest.json');
 if(m.status!=='captured')throw Error('Require completed mixed capture');
 const cases=[];for(const run of m.runs){if(cases.some(c=>c.id===run.caseId))continue;const row=read(run.id+'.json');if(!row.response?.plan)continue;
  cases.push({id:run.caseId,question:row.question,plan:row.response.plan,origin:{type:'first-saved-model-plan',directory:path.basename(directory),record:run.id},expected:'Inspect every requested part, current scope, and useful actions.'});
 }
 if(cases.length!==6)throw Error('Require all six mixed cases, including invalid plan');
 const staticCases=require('./community-semantic-cases.json').cases;
 const definitions=[['water-pay','water bill','payment','official-action'],['report-cab','CAB water quality findings for 2025','information','official-information'],['caregiver-pass','caregiver pass','process','official-process'],['nanny-access','nanny clubhouse membership','information','official-information'],['hall-booking','Great Hall reservation','booking','official-action'],['trash-instructions','trash and recycling service','information','official-information'],['coffee-password','Atlas Coffee WiFi password','information','official-information'],['ambiguous-price','','cost','official-information']];
 for(const [id,subject,task,evidenceKind] of definitions){const source=staticCases.find(c=>c.id===id),ambiguous=id==='ambiguous-price';
  cases.push({id,question:source.question,targets:source.targets,expected:source.expectedBoundary||'Source recall only; inspect applicability and requested details.',origin:{type:'authored-plan-for-existing-development-question'},plan:{standaloneQuestion:source.question,usedPriorContext:false,scope:ambiguous?'ambiguous':'community',clarificationQuestion:ambiguous?'What would you like to know the cost of?':'',needs:ambiguous?[]:[{id:'need-1',subject,task,request:source.question,evidenceKind}],constraints:[],searchQueries:ambiguous?[]:[source.question]}});
 }
 return cases;
}
async function replayPacket(plan,retrieve){
 const issues=replayPlanIssues(plan);if(issues.length)return {status:'invalid-saved-plan',issues};
 if(plan.scope==='ambiguous')return {status:'clarification-required',clarification:plan.clarificationQuestion};
 if(plan.scope!=='community')return {status:'outside-community-scope'};
 return {status:'packet-only-unreviewed',packet:await retrieve(plan)};
}
module.exports={buildCases,replayPlanIssues,replayPacket};

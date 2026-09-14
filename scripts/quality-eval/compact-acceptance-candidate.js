"use strict";
const {SYSTEM_V2,schema:assessmentSchema}=require('./answer-assessment-candidate');
const statuses=['addressed','disclosed-gap','unanswered','clarification-needed'];
const schema={type:'object',additionalProperties:false,required:['outcome','hardFailures','needs'],properties:{
  outcome:assessmentSchema.properties.outcome,hardFailures:assessmentSchema.properties.hardFailures,
  needs:{type:'array',items:{type:'object',additionalProperties:false,required:['request','status','supportSourceIds'],properties:{
    request:{type:'string'},status:{type:'string',enum:statuses},supportSourceIds:{type:'array',items:{type:'string'}}}}}
}};
const SYSTEM=SYSTEM_V2.split('\n').filter(line=>!line.startsWith('Score each dimension')&&!line.startsWith('For a genuinely necessary clarification')&&!line.startsWith('Return only')&&!line.includes('score directResolution')).join('\n')+'\n'+[
  'Return only a compact acceptance check: delivered outcome, critical failures and one short entry per actual requested need. No quality scores or prose review.',
  'Use addressed only for a requested outcome correctly supplied and supported by the listed evidence IDs. Use disclosed-gap when the answer explicitly and accurately explains missing evidence for that need. Use unanswered when a requested part is skipped. Use clarification-needed for a genuinely necessary clarification actually asked.',
  'An honest missing-evidence answer or partial answer may be useful without being complete. Do not flag missing-core-answer solely because evidence is unavailable when the answer clearly discloses that gap and gives any supported portions. Do flag skipped requested needs and claims or actions that replace the requested outcome.',
  'The result describes the answer as delivered. Complete requires all needs addressed and no critical failures. Necessary clarification does not require the missing final fact and is not missing-core-answer. Keep each request description under twelve words.',
  'Evaluate action destinations as well as answer prose: a plausible URL is unsupported if the supplied evidence does not establish that destination. Expired or unapproved evidence cannot support a current claim.'
].join('\n');
function acceptanceRequest(row,model){return {model,max_tokens:450,thinking:{type:'disabled'},...(/haiku/.test(model)?{temperature:0}:{}),system:SYSTEM,
  tools:[{name:'check_answer_acceptance',description:'Check actual request coverage and support before releasing an answer.',input_schema:schema,strict:true}],
  tool_choice:{type:'tool',name:'check_answer_acceptance'},messages:[{role:'user',content:JSON.stringify({question:row.question,priorResidentQuestions:row.priorResidentQuestions||[],
    answer:row.response.answer,actions:row.response.actions||[],evidence:row.response.sources||[]})}]};}
function acceptanceIssues(value,sourceIds=[]){
  if(!value||typeof value!=='object'||Array.isArray(value))return ['missing-assessment'];
  const issues=[],known=new Set(sourceIds);
  if(Object.keys(value).some(k=>!Object.hasOwn(schema.properties,k)))issues.push('unexpected-field');
  if(!schema.properties.outcome.enum.includes(value.outcome))issues.push('invalid-outcome');
  if(!Array.isArray(value.hardFailures)||value.hardFailures.some(f=>!schema.properties.hardFailures.items.enum.includes(f)))issues.push('invalid-failures');
  if(!Array.isArray(value.needs)||!value.needs.length||value.needs.length>8)issues.push('invalid-needs');
  else for(const n of value.needs){
    if(!n||typeof n.request!=='string'||!n.request.trim()||n.request.length>200||!statuses.includes(n.status)||Object.keys(n).some(k=>!['request','status','supportSourceIds'].includes(k))||
      !Array.isArray(n.supportSourceIds)||n.supportSourceIds.some(id=>!known.has(id)))issues.push('invalid-need-or-source');
    if(n?.status==='addressed'&&Array.isArray(n.supportSourceIds)&&!n.supportSourceIds.length)issues.push('missing-support-reference');
  }
  if(value.outcome==='complete'&&((Array.isArray(value.needs)&&value.needs.some(n=>n?.status!=='addressed'))||value.hardFailures?.length))issues.push('contradictory-completion');
  if(Array.isArray(value.needs)&&value.needs.some(n=>n?.status==='unanswered')&&Array.isArray(value.hardFailures)&&!value.hardFailures.length)issues.push('unflagged-unanswered-need');
  if(Array.isArray(value.hardFailures)&&!value.hardFailures.length){
    if(value.outcome==='wrong-topic')issues.push('unflagged-wrong-topic');
    if(value.outcome==='clarification'&&Array.isArray(value.needs)&&!value.needs.some(n=>n?.status==='clarification-needed'))issues.push('unrepresented-clarification');
    if(['partial','missing-evidence'].includes(value.outcome)&&Array.isArray(value.needs)&&!value.needs.some(n=>n?.status==='disclosed-gap'))issues.push('unrepresented-evidence-gap');
  }
  return [...new Set(issues)];
}
function acceptanceDisposition(value,sourceIds){const issues=acceptanceIssues(value,sourceIds);if(issues.length)return {status:'unassessed',issues};
  return {status:value.hardFailures.length?'needs-work':value.outcome==='clarification'?'useful-clarification':value.outcome==='complete'?'candidate-complete':'candidate-partial',
    eligibleForGoodOrExcellent:value.hardFailures.length===0,independentlyCalibrated:false};}
module.exports={SYSTEM,schema,acceptanceRequest,acceptanceIssues,acceptanceDisposition};

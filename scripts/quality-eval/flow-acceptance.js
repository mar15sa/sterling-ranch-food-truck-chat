"use strict";
const {acceptanceRequest,acceptanceIssues}=require('./compact-acceptance-candidate');
function flowAcceptanceRequest(row,plan,model){
  const request=acceptanceRequest(row,model);request.max_tokens=850;
  request.tools[0].name='check_planned_answer_acceptance';request.tool_choice.name='check_planned_answer_acceptance';
  const schema=request.tools[0].input_schema=structuredClone(request.tools[0].input_schema);
  schema.properties.needs.items.required.push('needId');
  schema.properties.needs.items.properties.needId={type:'string',description:'The exact required need ID, such as need-1.'};
  schema.required.push('actionReviews','failureDetails');
  schema.properties.actionReviews={type:'array',items:{type:'object',additionalProperties:false,required:['actionId','needId','fit','reason'],properties:{
    actionId:{type:'string'},needId:{type:'string'},fit:{type:'string',enum:['direct','helpful-next-step','useful-fallback','irrelevant','unsupported']},reason:{type:'string'}}}};
  schema.properties.failureDetails={type:'array',items:{type:'object',additionalProperties:false,required:['failure','reason','statement','actionId'],properties:{
    failure:structuredClone(schema.properties.hardFailures.items),reason:{type:'string'},statement:{type:'string'},actionId:{type:'string'}}}};
  request.system+='\nReturn each required need ID exactly once in needId and keep request descriptive. The original question controls; flag missed-requested-part if the interpretation dropped something.'+
    '\nFirst review EVERY selected action in actionReviews. Tie it to an exact required need ID. Direct means it delivers that requested task for that subject; helpful-next-step means it helps act on the supported answer, such as applying after a controlling rule establishes approval is needed; useful-fallback means a relevant official route helps with an explicitly disclosed gap. An official or approved link is still irrelevant when it concerns another task, person, service or project. Merely appearing in the catalog or being retrieved for a need is not evidence of relevance. Mark irrelevant actions and add wrong-action to hardFailures. No selected actions means actionReviews [].'+
    '\nFor every hardFailure include a failureDetails entry that tells the writer exactly what to fix. Quote the offending statement when there is one; use actionId for an offending selected action; otherwise leave those fields empty and explain the missing need. Keep reasons short and concrete. No failures means failureDetails []. Do not add optional suggestions as required needs.';
  const payload=JSON.parse(request.messages[0].content);payload.requiredNeeds=plan.needs;request.messages[0].content=JSON.stringify(payload);
  return request;
}
function flowCheckIssues(check,plan,sourceIds,actions=[]){
  if(!check)return ['missing-assessment'];
  const {actionReviews,failureDetails,...base}=check;
  const normalized={...base,needs:Array.isArray(base.needs)?base.needs.map(n=>{if(!n)return n;const {needId,...rest}=n;return rest;}):base.needs};
  const issues=acceptanceIssues(normalized,sourceIds);
  if(issues.length)return issues;
  if(!Array.isArray(actionReviews)||actionReviews.length!==actions.length||new Set(actionReviews.map(a=>a?.actionId)).size!==actions.length)issues.push('action-review-coverage');
  else for(const a of actionReviews){
    if(!a||!actions.some(x=>x.id===a.actionId)||!plan.needs.some(n=>n.id===a.needId)||!['direct','helpful-next-step','useful-fallback','irrelevant','unsupported'].includes(a.fit)||typeof a.reason!=='string'||!a.reason.trim())issues.push('invalid-action-review');
    if(a?.fit==='irrelevant'&&!check.hardFailures?.includes('wrong-action'))issues.push('unflagged-irrelevant-action');
    if(a?.fit==='unsupported'&&!check.hardFailures?.some(f=>['wrong-action','unsupported-material-claim'].includes(f)))issues.push('unflagged-unsupported-action');
  }
  if(!Array.isArray(failureDetails))issues.push('missing-failure-details');
  else{
    if(check.hardFailures?.some(f=>!failureDetails.some(d=>d?.failure===f)))issues.push('unexplained-failure');
    for(const d of failureDetails)if(!d||!check.hardFailures?.includes(d.failure)||typeof d.reason!=='string'||!d.reason.trim()||typeof d.statement!=='string'||typeof d.actionId!=='string'||d.actionId&&!actions.some(a=>a.id===d.actionId))issues.push('invalid-failure-detail');
  }
  return [...new Set(issues)];
}
module.exports={flowAcceptanceRequest,flowCheckIssues};

"use strict";
const fs=require('node:fs'),path=require('node:path');
const {hash}=require('./flow-evidence');
const {summarize}=require('./usage');
const {times}=require('./summarize-presentation');
function disposition(row){return row.error||row.issues.length||!row.check?'unassessed':row.check.hardFailures.length?'reject':'accept';}
function analyze(directory){
 const read=name=>JSON.parse(fs.readFileSync(path.join(directory,name),'utf8')),m=read('manifest.json'),labels=read('predeclared-labels.json');
 if(!['captured','stopped-error-or-unknown-usage'].includes(m.status)||m.design.length!==56||m.runs.length>56||!m.runs.length||m.status==='captured'&&m.runs.length!==56)throw Error('Require terminal checker capture');
 if(hash(labels)!==m.labelsHash)throw Error('Changed predeclared labels');
 const calls=fs.readFileSync(path.join(directory,'calls.jsonl'),'utf8').trim().split('\n').map(JSON.parse),rows=m.runs.map(r=>read(r.id+'.json'));
 if(calls.length!==rows.length)throw Error('Incomplete usage ledger');
 for(const [i,row] of rows.entries()){
  const d=m.design[i],c=calls[i];if(hash(c.request)!==d.requestHash||row.requestHash!==d.requestHash||['trialId','caseId','model','repetition'].some(k=>row[k]!==d[k]||c[k]!==d[k]))throw Error('Captured request identity mismatch');
  row.expected=labels.cases.find(l=>l.trial===row.trialId)?.expected;if(!row.expected)throw Error('Unlabeled capture');row.disposition=disposition(row);
 }
 const report={status:m.status==='captured'?'complete-development-checker-comparison':'partial-stopped-checker-comparison',isTest:true,codeRevision:m.codeRevision,plannedCalls:56,completedCalls:rows.length,
  costs:summarize(calls),reservedUpperUsd:m.reservedUpperUsd,groups:{},repeatComparisons:[],limitations:[...m.limitations,'A rejected output counts as detection only if the assessment is structurally consistent. Defect-specific reason review is separate.']};
 for(const model of m.models){
  const group=rows.filter(r=>r.model===model),ledger=calls.filter(c=>c.model===model),cost=summarize(ledger),positive=group.filter(r=>r.expected==='accept'),negative=group.filter(r=>r.expected==='reject');
  if(m.status==='captured'&&(group.length!==28||positive.length!==14||negative.length!==14))throw Error('Unbalanced completed comparison');
  for(const label of labels.cases){const pair=group.filter(r=>r.trialId===label.trial);
   if(new Set(pair.map(r=>r.repetition)).size!==pair.length||pair.some(r=>![1,2].includes(r.repetition)))throw Error('Duplicate or invalid repetition');
   if(pair.length===2)report.repeatComparisons.push({model,trialId:label.trial,dispositions:pair.map(r=>r.disposition),consistentDisposition:pair[0].disposition===pair[1].disposition,
    outcomes:pair.map(r=>r.check?.outcome),consistentOutcome:pair[0].check?.outcome===pair[1].check?.outcome});
  }
  report.groups[model]={calls:group.length,costs:cost,per1000CheckerCallsUsd:cost.estimatedTotalUsd===null||!group.length?null:cost.estimatedTotalUsd/group.length*1000,timing:times(group.map(r=>r.durationMs)),
   thinkingDisabledCalls:ledger.filter(c=>c.request.thinking?.type==='disabled').length,
   reportedThinkingTokens:ledger.reduce((s,c)=>s+(c.usage?.output_tokens_details?.thinking_tokens||0),0),thinkingBreakdownMissingCalls:ledger.filter(c=>!Number.isFinite(c.usage?.output_tokens_details?.thinking_tokens)).length,
   positive:{attempts:positive.length,accepted:positive.filter(r=>r.disposition==='accept').length,rejected:positive.filter(r=>r.disposition==='reject').length,unassessed:positive.filter(r=>r.disposition==='unassessed').length,
    acceptedAsComplete:positive.filter(r=>r.disposition==='accept'&&r.check.outcome==='complete').length},
   negative:{attempts:negative.length,rejected:negative.filter(r=>r.disposition==='reject').length,accepted:negative.filter(r=>r.disposition==='accept').length,unassessed:negative.filter(r=>r.disposition==='unassessed').length}};
 }
 const reviews=labels.cases.map(label=>{
  const input=read(label.trial+'-input.json');if(hash(input)!==m.inputHashes[label.trial])throw Error('Changed frozen answer/source input');
  return {...label,caseId:input.caseId,question:input.input.row.question,answer:input.draft.answer,assessments:rows.filter(r=>r.trialId===label.trial).map(r=>({id:r.id,model:r.model,repetition:r.repetition,disposition:r.disposition,issues:r.issues,error:r.error,check:r.check}))};
 });
 if(m.status!=='captured')report.limitations.push('Stopped early; model groups have unequal case mixes and cannot rank model performance.');
 fs.writeFileSync(path.join(directory,'comparison.json'),JSON.stringify(report,null,2)+'\n');fs.writeFileSync(path.join(directory,'reason-review.json'),JSON.stringify(reviews,null,2)+'\n');return report;
}
if(require.main===module){try{console.log(JSON.stringify(analyze(path.resolve(process.argv[2]))));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={disposition,analyze};

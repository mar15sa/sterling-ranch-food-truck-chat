"use strict";
const fs=require('node:fs'),path=require('node:path');
const {hash}=require('./flow-evidence');
const {summarize}=require('./usage');
function times(values){
 if(!values.length)return {samples:0,medianMs:null,p95Ms:null};const s=values.slice().sort((a,b)=>a-b),n=s.length;
 return {samples:n,medianMs:n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2,p95Ms:s[Math.ceil(.95*n)-1]};
}
function analyze(directory){
 const read=name=>JSON.parse(fs.readFileSync(path.join(directory,name),'utf8')),m=read('manifest.json');
 if(m.status!=='captured'||m.design.length!==96||m.runs.length!==96)throw Error('Require completed 96-call comparison');
 const calls=fs.readFileSync(path.join(directory,'calls.jsonl'),'utf8').trim().split('\n').map(JSON.parse),records=m.runs.map(r=>read(r.id+'.json'));
 if(calls.length!==96||new Set(records.map(r=>r.caseId+':'+r.repetition+':'+r.model+':'+r.variant)).size!==96)throw Error('Missing or duplicate recorded trial');
 for(const [i,r] of records.entries()){
  const d=m.design[i],c=calls[i];
  if(r.requestHash!==d.requestHash||hash(c.request)!==r.requestHash||['caseId','repetition','model','variant'].some(k=>r[k]!==d[k]||c[k]!==r[k]))throw Error('Design/request/call identity mismatch');
 }
 const report={status:'complete-development-comparison',isTest:true,createdAt:new Date().toISOString(),codeRevision:m.codeRevision,costs:summarize(calls),reservedUpperUsd:m.reservedUpperUsd,capUsd:m.capUsd,
  groups:{},cases:m.cases,limitations:[...m.limitations,'Structural success and word counts are not factual/usefulness grades.','Sixteen timing samples per arm; sample p95 is the maximum in these groups.']};
 for(const model of m.models)for(const variant of Object.keys(m.variants)){
  const rows=records.filter(r=>r.model===model&&r.variant===variant),filtered=calls.filter(c=>c.model===model&&c.variant===variant);
  if(rows.length!==16||filtered.length!==16||m.cases.some(id=>[1,2].some(rep=>rows.filter(r=>r.caseId===id&&r.repetition===rep).length!==1)))throw Error('Unbalanced group');
  const cost=summarize(filtered);report.groups[model+':'+variant]={calls:rows.length,costs:cost,per1000WriterCallsUsd:cost.estimatedTotalUsd===null?null:cost.estimatedTotalUsd/rows.length*1000,
   timing:times(rows.map(r=>r.durationMs)),firstSchemaUses:times(rows.filter(r=>r.firstSchemaUseInRun).map(r=>r.durationMs)),laterSchemaUses:times(rows.filter(r=>!r.firstSchemaUseInRun).map(r=>r.durationMs)),
   structuralAccepted:rows.filter(r=>!r.error&&!r.issues.length).length,invalidActions:rows.filter(r=>r.issues.includes('unknown-action')).length,
   over180WhitespaceWords:rows.filter(r=>String(r.draft?.answer||'').trim().split(/\s+/).filter(Boolean).length>180).length,
   cacheReadTokens:filtered.reduce((s,c)=>s+(c.usage?.cache_read_input_tokens||0),0),cacheWriteTokens:filtered.reduce((s,c)=>s+(c.usage?.cache_creation_input_tokens||0),0)};
 }
 for(const caseId of m.cases){const input=read(caseId+'-input.json');fs.writeFileSync(path.join(directory,'review-'+caseId+'.json'),JSON.stringify({caseId,question:input.row.question,priorResidentQuestions:input.row.context.map(c=>c.question),
  note:'Model labels visible: development inspection, not blind human calibration.',answers:records.filter(r=>r.caseId===caseId).map(r=>({id:r.id,variant:r.variant,model:r.model,repetition:r.repetition,answer:r.draft?.answer,actions:r.draft?.actionIds?.map(id=>input.packet.actions.find(a=>a.id===id)||{id,unknown:true}),issues:r.issues,error:r.error}))},null,2)+'\n');}
 fs.writeFileSync(path.join(directory,'comparison.json'),JSON.stringify(report,null,2)+'\n');return report;
}
if(require.main===module){try{console.log(JSON.stringify(analyze(path.resolve(process.argv[2]))));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={times,analyze};

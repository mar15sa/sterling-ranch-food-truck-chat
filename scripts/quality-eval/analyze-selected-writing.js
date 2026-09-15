"use strict";
const fs=require('node:fs'),path=require('node:path');
const {summarize}=require('./usage');
const {hash}=require('./flow-evidence');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
function timing(values){const s=values.slice().sort((a,b)=>a-b),n=s.length;return {samples:n,medianMs:n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2,p95Ms:s[Math.ceil(n*.95)-1]};}
const root=path.resolve(process.argv[2]||'artifacts/quality-eval'),selectionDir=path.join(root,'evidence-selection-20260915');
const selection=read(path.join(selectionDir,'manifest.json')),selectionCalls=fs.readFileSync(path.join(selectionDir,'calls.jsonl'),'utf8').trim().split('\n').map(JSON.parse).filter(c=>c.model==='claude-haiku-4-5');
if(selection.status!=='captured'||selectionCalls.length!==8)throw Error('Complete selection required');
const baselineCalls=[],baselineDurations=[];
for(const caseId of selection.cases){
 const input=read(path.join(selectionDir,caseId+'-input.json')),trial=read(path.join(input.capture,input.originalTrial+'.json'));
 const calls=trial.calls.filter(c=>c.stage==='composition');if(calls.length!==1||hash(calls[0].request)!==hash(input.originalCompositionRequest))throw Error('Baseline request mismatch');
 baselineCalls.push(calls[0]);baselineDurations.push(calls[0].durationMs);
}
const baselineCost=summarize(baselineCalls),report={isTest:true,status:'captured-development-analysis',createdAt:new Date().toISOString(),
 baseline:{samples:4,costs:baselineCost,per1000Usd:baselineCost.estimatedTotalUsd/4*1000,timing:timing(baselineDurations)},candidates:{},
 limitations:['Selection plus writing, not whole answer or production monthly cost.','Four matched historical baseline writer samples versus eight candidate samples per writer.','Known authored scenarios, no independent or human-calibrated quality percentage.','Latency sums captured sequential stages; includes no interpretation, retrieval, acceptance, hosting or initialization.']};
for(const [name,directory] of [['sonnet','selected-writing-20260915'],['haiku','selected-writing-haiku-20260915']]){
 const dir=path.join(root,directory),m=read(path.join(dir,'manifest.json')),calls=fs.readFileSync(path.join(dir,'calls.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 if(m.status!=='captured'||m.runs.length!==8||calls.length!==8)throw Error('Complete writer design required');
 const rows=m.runs.map(r=>{const s=selection.runs.find(s=>s.id===r.selectionId);if(!s||s.caseId!==r.caseId||s.repetition!==r.repetition||s.model!=='claude-haiku-4-5')throw Error('Selection identity mismatch');
  return {caseId:r.caseId,repetition:r.repetition,writerId:r.id,selectionId:s.id,writerMs:r.durationMs,selectionMs:s.durationMs,combinedMs:r.durationMs+s.durationMs};});
 const costs=summarize([...selectionCalls,...calls]);report.candidates[name]={samples:8,costs,per1000Usd:costs.estimatedTotalUsd/8*1000,
  at10000QuestionsUsd:costs.estimatedTotalUsd/8*10000,writerTiming:timing(rows.map(r=>r.writerMs)),combinedTiming:timing(rows.map(r=>r.combinedMs)),rows};
}
fs.writeFileSync(path.join(selectionDir,'writing-comparison.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));

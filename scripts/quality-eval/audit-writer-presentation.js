"use strict";
// No provider calls: transform exact historical writer inputs and audit conservation.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {hash}=require('./flow-evidence');
const {presentWriterRequest}=require('./writer-presentation');
const {packetIssues,modelEvidence}=require('./full-flow-candidate');
const root=path.resolve('artifacts/quality-eval'),out=path.resolve(process.argv[2]);
if(fs.existsSync(out))throw Error('Use new audit output directory');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),selectionDir=path.join(root,'evidence-selection-20260915');
const modes={control:{},context:{separateContext:true},stable:{stableActionSchema:true},combined:{separateContext:true,stableActionSchema:true}};
const report={status:'running',isTest:true,startedAt:new Date().toISOString(),codeRevision:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
 modelCalls:0,newSubscriptions:0,rows:[],limitations:['Historical presentation/identity audit only; no new answers, speed or quality improvement proven.','Four known case families and two writers; not unseen acceptance.']};
fs.mkdirSync(out,{recursive:true});const schemas={control:new Set(),context:new Set(),stable:new Set(),combined:new Set()};
for(const directory of ['selected-writing-20260915','selected-writing-haiku-20260915']){
 const dir=path.join(root,directory),m=read(path.join(dir,'manifest.json')),calls=fs.readFileSync(path.join(dir,'calls.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 if(m.status!=='captured'||m.runs.length!==8||calls.length!==8)throw Error('Require complete selected writer capture');
 for(const row of m.runs){
  const record=read(path.join(dir,row.id+'.json')),selection=read(path.join(selectionDir,row.selectionId+'.json')),input=read(path.join(selectionDir,row.caseId+'-input.json'));
  const call=calls.find(c=>c.caseId===row.caseId&&c.repetition===row.repetition);if(!call||hash(call.request)!==record.requestHash||selection.caseId!==row.caseId)throw Error('Captured request identity mismatch');
  const packet=selection.selection.packet,original=JSON.parse(call.request.messages[0].content),before=hash(packet);
  const profile=read(path.join(input.capture,'snapshots/profile.json')),now=input.now;
  assert.deepEqual(packetIssues(packet,profile.communityId,now),[]);assert.deepEqual(original.evidence,modelEvidence(packet.sources));
  for(const [mode,flags] of Object.entries(modes)){
   const request=presentWriterRequest(call.request,packet,{...flags,timezone:profile.timezone,now}),payload=JSON.parse(request.messages[0].content);
   if(mode==='control')assert.deepEqual(request,call.request);
   assert.deepEqual(payload.actions,original.actions);assert.deepEqual(payload.evidenceGaps,original.evidenceGaps);assert.deepEqual(payload.requiredNeeds,original.requiredNeeds);
   for(const [i,e] of original.evidence.entries()){
    const source=packet.sources.find(s=>s.id===e.id),shown=payload.evidence[i];
    const expected=structuredClone(e);
    if(flags.separateContext&&source.role==='live-operation'&&source.liveScope){
     const {scopeLimit,observedAt,timezone,kind,...facts}=source.liveScope;expected.text=JSON.stringify(facts);
     const meta=payload.assistantEvidenceContext.find(c=>c.sourceId===source.id);assert.equal(meta.scopeLimit,scopeLimit);assert.equal(meta.observedAtUtc,observedAt);assert.equal(meta.timezone,timezone);assert.equal(meta.connectorKind,kind);
    }
    assert.deepEqual(shown,expected);
   }
   assert.equal(hash(packet),before);const schemaHash=hash(request.tools[0].input_schema);schemas[mode].add(schemaHash);
   const id=directory+'-'+row.id+'-'+mode;
   fs.writeFileSync(path.join(out,id+'.json'),JSON.stringify({isTest:true,historical:true,contextNow:now,packetHash:before,request},null,2)+'\n');
   report.rows.push({id,mode,caseId:row.caseId,model:request.model,schemaHash,requestBytes:Buffer.byteLength(JSON.stringify(request)),liveSources:packet.sources.filter(s=>s.role==='live-operation').length});
  }
 }
}
report.status='passed';report.finishedAt=new Date().toISOString();report.schemaCounts=Object.fromEntries(Object.entries(schemas).map(([key,value])=>[key,value.size]));
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,requests:report.rows.length,schemaCounts:report.schemaCounts,modelCalls:0}));

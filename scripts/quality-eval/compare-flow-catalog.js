"use strict";
// Offline evidence replay: no provider calls, source writes or approval changes.
const fs=require('node:fs'),path=require('node:path');
const {makeRetriever}=require('./flow-evidence');
const {modelEvidence,modelActions,packetIssues}=require('./full-flow-candidate');
async function main(){
 const prior=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
 if(fs.existsSync(out))throw new Error('Use a new output directory');
 const read=name=>JSON.parse(fs.readFileSync(path.join(prior,name),'utf8'));
 const manifest=read('manifest.json'),profile=read(manifest.snapshotFiles.profile),communityIndex=read(manifest.snapshotFiles.community),rulesIndex=read(manifest.snapshotFiles.rules);
 const approval=require('../../data/community-form-approval-evidence.json');
 const now=Date.now();
 const baseline=require('../../data/community-index.json');
 require('./flow-snapshot').validateSnapshot(communityIndex,read(manifest.snapshotFiles.attestation),baseline);
 require('./flow-snapshot').validateRulesSnapshot(rulesIndex,read(manifest.snapshotFiles.rulesAttestation),profile.communityId);
 fs.mkdirSync(out,{recursive:true});
 const modes={keyword:{},catalog:{communityMode:'complete-catalog'},stagingCatalog:{communityMode:'complete-catalog',stagingFormApproval:approval}};
 const report={isTest:true,createdAt:new Date(now).toISOString(),providerCalls:0,runs:[],limitations:['Evidence retrieval only; no answer quality or token-priced cost measurement.','Catalog includes all eligible community projections, not an assertion that every item is relevant.','Staging navigation is separately identified and is not production approval.']};
 const seen=new Set();
 for(const run of manifest.runs){
  const saved=read(run.id+'.json'),plan=saved.response?.plan;
  if(!plan||plan.scope!=='community'||seen.has(run.caseId))continue;
  seen.add(run.caseId);const row={caseId:run.caseId,question:saved.question,variants:{}};
  for(const [name,options] of Object.entries(modes)){
   const packet=await makeRetriever({profile,communityIndex,rulesIndex,communityId:profile.communityId,now,...options})(plan);
   const issues=packetIssues(packet,profile.communityId);if(issues.length)throw new Error(issues.join(','));
   fs.writeFileSync(path.join(out,run.caseId+'-'+name+'.json'),JSON.stringify(packet,null,2)+'\n');
   row.variants[name]={sources:packet.sources.length,actions:packet.actions.length,governingRules:packet.sources.filter(s=>s.role==='governing-rule').length,stagingSources:packet.sources.filter(s=>s.stagingOnly).length,sourceTextChars:packet.sources.reduce((n,s)=>n+s.text.length,0),modelEvidenceBytes:Buffer.byteLength(JSON.stringify({sources:modelEvidence(packet.sources),actions:modelActions(packet.actions)}))};
  }
  report.runs.push(row);
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});

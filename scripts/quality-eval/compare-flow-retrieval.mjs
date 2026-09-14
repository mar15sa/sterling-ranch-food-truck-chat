import fs from 'node:fs';import path from 'node:path';
import {createSemanticRanker} from './semantic-ranker.mjs';
import flow from './flow-evidence.js';import corpusTools from './semantic-corpus.js';
import {createRequire} from 'node:module';const require=createRequire(import.meta.url);
const snapshot=require('./flow-snapshot');
const [directory,cacheDirectory,captureDirectory]=process.argv.slice(2).map(p=>path.resolve(p));
if(!directory||!cacheDirectory||!captureDirectory)throw new Error('Supply output, embedding cache and completed answer capture directories');
fs.mkdirSync(directory,{recursive:true});const manifestPath=path.join(directory,'manifest.json');
if(fs.existsSync(manifestPath))throw new Error('Use a new output directory');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const prior=read(path.join(captureDirectory,'manifest.json'));
if(prior.status!=='captured'||!prior.snapshotFiles)throw new Error('Require completed capture with exact saved snapshots');
const saved=key=>read(path.join(captureDirectory,prior.snapshotFiles[key]));
const communityIndex=saved('community'),rulesIndex=saved('rules'),profile=saved('profile'),now=Date.now();
snapshot.validateSnapshot(communityIndex,saved('attestation'),require('../../data/community-index.json'));
snapshot.validateRulesSnapshot(rulesIndex,saved('rulesAttestation'),profile.communityId,now);
const plans=new Map();
for(const row of prior.runs){
 const result=read(path.join(captureDirectory,row.id+'.json'));
 if(result.response?.plan?.scope==='community'&&!plans.has(result.caseId))plans.set(result.caseId,{caseId:result.caseId,question:result.question,plan:result.response.plan});
}
const context={communityId:profile.communityId,profile,communityIndex,rulesIndex,now};
const report={status:'preparing',isTest:true,startedAt:new Date().toISOString(),sourceSnapshotHash:prior.sourceSnapshotHash,planSource:path.resolve(captureDirectory),cases:plans.size,completed:0,paidApiCalls:0,newSubscriptions:0,limitations:['Authored diagnostic plans, not independent answer quality or holdout evidence.','Only rules ranking changes; community action retrieval remains keyword based.','Local timings do not establish hosting cost or resident latency.']};
const save=()=>fs.writeFileSync(manifestPath,JSON.stringify(report,null,2));save();
const ranker=await createSemanticRanker({directory:cacheDirectory,documents:corpusTools.eligibleCorpus(rulesIndex,profile.communityId,now),communityId:profile.communityId});
report.model=ranker.model;report.modelRevision=ranker.modelRevision;
const keyword=flow.makeRetriever(context),hybrid=flow.makeRetriever({...context,ruleSearch:(index,query,limit)=>ranker.search(index,query,limit,{now})});
try{for(const row of plans.values()){
 const start=Date.now(),a=await keyword(row.plan),middle=Date.now(),b=await hybrid(row.plan),end=Date.now();
 fs.writeFileSync(path.join(directory,row.caseId+'.json'),JSON.stringify({...row,isTest:true,keyword:a,hybrid:b,latency:{keywordMs:middle-start,hybridMs:end-middle}},null,2));
 report.completed++;save();console.log(JSON.stringify({caseId:row.caseId,completed:report.completed,total:plans.size}));
}report.status='captured';}finally{await ranker.dispose();report.finishedAt=new Date().toISOString();save();}

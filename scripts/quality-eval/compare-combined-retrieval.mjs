import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import cp from 'node:child_process';
import {createCommunitySemanticRanker} from './community-semantic-ranker.mjs';
import {createSemanticRanker} from './semantic-ranker.mjs';import corpusTools from './semantic-corpus.js';
import flow from './flow-evidence.js';import snapshot from './flow-snapshot.js';import rules from '../../lib/rules-assistant.js';
const [inputArg,cacheArg,outArg,rulesCacheArg,experiment]=process.argv.slice(2);if(!inputArg||!cacheArg||!outArg)throw Error('Require prior integration directory, community vector cache and new output directory');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),input=path.resolve(inputArg),cache=path.resolve(cacheArg),out=path.resolve(outArg);
if(fs.existsSync(out))throw Error('Preserve prior capture; use a new directory');
const communityIndex=read(path.join(input,'community-index.json')),attestation=read(path.join(input,'attestation.json'));
snapshot.validateSnapshot(communityIndex,attestation,read('data/community-index.json'));
const profile=read('data/communities/'+communityIndex.communityId+'.json'),rulesIndex=await rules.loadRulesIndex();
const saved=read(path.join(input,'current-keyword-loaded-packets.json')),cases=saved.rows.map(r=>({id:r.trial,question:r.question,plan:r.plan}));
if(cases.length!==5||new Set(cases.map(c=>c.id)).size!==5||cases.some(c=>!c.plan.needs?.length))throw Error('Require five preserved development plans');
if(experiment&&!['source-routing','source-routing-hybrid'].includes(experiment)||experiment&&!rulesCacheArg)throw Error('Invalid routing experiment configuration');
const methodNames=experiment==='source-routing-hybrid'?['purpose-routed','purpose-routed-hybrid']:experiment?['combined-semantic','purpose-routed']:rulesCacheArg?['keyword','semantic','combined-hybrid','combined-semantic']:['keyword','semantic'];
const jobs=cases.flatMap(c=>[1,2].flatMap(repetition=>methodNames.map(method=>({caseId:c.id,repetition,method,order:crypto.randomBytes(8).toString('hex')})))).sort((a,b)=>a.order.localeCompare(b.order));
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(path.join(out,'code'));
for(const file of ['flow-evidence.js','community-semantic.js','community-semantic-ranker.mjs','compare-combined-retrieval.mjs','semantic-ranker.mjs','semantic-corpus.js'])fs.copyFileSync('scripts/quality-eval/'+file,path.join(out,'code',file));
for(const [key,value] of Object.entries({cases,communityIndex,attestation,rulesIndex,profile}))fs.writeFileSync(path.join(out,key+'.json'),JSON.stringify(value,null,2)+'\n');
const manifest={status:'initializing',isTest:true,startedAt:new Date().toISOString(),codeRevision:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
 sourceSnapshotHash:flow.hash(communityIndex),rulesSnapshotHash:flow.hash(rulesIndex),casesHash:flow.hash(cases),communityId:communityIndex.communityId,methods:methodNames,design:jobs,completed:[],paidApiCalls:0,newSubscriptions:0,
 limitations:['Five known authored plans replayed; not unseen, planning or final-answer quality evidence.','Current rules loaded with supplements, but no new live rules-source attestation.',rulesCacheArg?'Community and governing-rule ranking compared in explicit separate arms; source expansion and budgets retained.':'Only community ranking changes. Existing rule keyword search, source expansion and budgets are retained.','Local timing is not production cost or whole-answer latency.']};
const save=()=>fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');save();let ranker,ruleRanker;
try{
 const started=Date.now();ranker=await createCommunitySemanticRanker({directory:cache,communityId:profile.communityId,index:communityIndex});manifest.initializationMs=Date.now()-started;manifest.ranker=ranker.metadata;
 const context={communityId:profile.communityId,profile,communityIndex,rulesIndex,now:Date.now(),clock:Date.now};
 const methods={keyword:flow.makeRetriever(context),semantic:flow.makeRetriever({...context,communityMode:'semantic',communitySearch:(...args)=>ranker.search(...args)})};
 if(rulesCacheArg){
  const rulesStarted=Date.now();ruleRanker=await createSemanticRanker({directory:path.resolve(rulesCacheArg),documents:corpusTools.eligibleCorpus(rulesIndex,profile.communityId,context.now),communityId:profile.communityId});
  manifest.rulesInitializationMs=Date.now()-rulesStarted;manifest.rulesRanker={directory:path.resolve(rulesCacheArg),model:ruleRanker.model,modelRevision:ruleRanker.modelRevision,corpusHash:ruleRanker.corpusHash};
  for(const method of ['hybrid','semantic'])methods['combined-'+method]=flow.makeRetriever({...context,communityMode:'semantic',communitySearch:(...args)=>ranker.search(...args),ruleSearch:(index,query,limit)=>ruleRanker.search(index,query,limit,{now:Date.now(),eligibilityQuestion:query,method})});
 }
 if(experiment)methods['purpose-routed']=flow.makeRetriever({...context,sourceRouting:'per-need',communityMode:'semantic',communitySearch:(...args)=>ranker.search(...args),ruleSearch:(index,query,limit)=>ruleRanker.search(index,query,limit,{now:Date.now(),eligibilityQuestion:query,method:'semantic'})});
 if(experiment==='source-routing-hybrid')methods['purpose-routed-hybrid']=flow.makeRetriever({...context,sourceRouting:'per-need',communityMode:'semantic',communitySearch:(...args)=>ranker.search(...args),ruleSearch:(index,query,limit)=>ruleRanker.search(index,query,limit,{now:Date.now(),eligibilityQuestion:query,method:'hybrid'})});
 manifest.status='querying';save();
 for(const [i,job] of jobs.entries()){
  const c=cases.find(c=>c.id===job.caseId),start=Date.now(),packet=await methods[job.method](c.plan),elapsedMs=Date.now()-start;
  const record={id:'packet-'+String(i+1).padStart(3,'0'),isTest:true,...job,question:c.question,plan:c.plan,elapsedMs,packet};
  fs.writeFileSync(path.join(out,record.id+'.json'),JSON.stringify(record,null,2)+'\n');manifest.completed.push({id:record.id,...job});save();console.log(JSON.stringify({completed:i+1,total:jobs.length,caseId:job.caseId,method:job.method}));
 }
 manifest.status='captured';
}catch(e){manifest.status='failed';manifest.error=e.message;process.exitCode=1;}finally{if(ruleRanker)await ruleRanker.dispose();if(ranker)await ranker.dispose();manifest.finishedAt=new Date().toISOString();manifest.peakRssBytes=process.resourceUsage().maxRSS*1024;save();console.log(JSON.stringify({status:manifest.status,completed:manifest.completed.length,error:manifest.error}));}

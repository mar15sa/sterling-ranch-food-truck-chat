import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import cp from 'node:child_process';
import flow from './flow-evidence.js';import corpusTools from './semantic-corpus.js';import snapshot from './flow-snapshot.js';import casesTools from './broad-retrieval-cases.js';import liveTools from './live-evidence.js';import rules from '../../lib/rules-assistant.js';
import {createSemanticRanker} from './semantic-ranker.mjs';import {createCommunitySemanticRanker} from './community-semantic-ranker.mjs';
const [outArg]=process.argv.slice(2);if(!outArg)throw Error('Require new output directory');const out=path.resolve(outArg),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));if(fs.existsSync(out))throw Error('Preserve prior capture');
const cases=casesTools.buildCases('artifacts/quality-eval/mixed-live-flow-20260914'),communityIndex=read('artifacts/quality-eval/current-production-integration-20260915/community-index.json'),attestation=read('artifacts/quality-eval/current-production-integration-20260915/attestation.json'),profile=read('data/communities/'+communityIndex.communityId+'.json'),rulesIndex=await rules.loadRulesIndex();
snapshot.validateSnapshot(communityIndex,attestation,read('data/community-index.json'));
const today=new Intl.DateTimeFormat('en-CA',{timeZone:profile.timezone}).format(new Date());
const hasLive=c=>!casesTools.replayPlanIssues(c.plan).length&&c.plan.needs.some(n=>n.evidenceKind==='live-operation');
const jobs=cases.flatMap(c=>(hasLive(c)?['observed','injected-live-failure']:['observed']).flatMap(scenario=>[1,2].flatMap(repetition=>['all-static','per-need'].map(method=>({caseId:c.id,scenario,repetition,method,order:crypto.randomBytes(8).toString('hex')}))))).sort((a,b)=>a.order.localeCompare(b.order));
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(path.join(out,'code'));for(const f of ['flow-evidence.js','broad-retrieval-cases.js','compare-broad-retrieval.mjs','live-evidence.js','semantic-ranker.mjs','community-semantic-ranker.mjs','eligible-keyword-index.js'])fs.copyFileSync('scripts/quality-eval/'+f,path.join(out,'code',f));
for(const [key,value] of Object.entries({cases,communityIndex,attestation,profile,rulesIndex}))fs.writeFileSync(path.join(out,key+'.json'),JSON.stringify(value,null,2)+'\n');
const manifest={status:'preparing',isTest:true,startedAt:new Date().toISOString(),today,codeRevision:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceHash:flow.hash(communityIndex),rulesHash:flow.hash(rulesIndex),casesHash:flow.hash(cases),design:jobs,completed:[],sourceFetches:[],paidApiCalls:0,newSubscriptions:0,limitations:['Six saved mixed plans plus eight authored plans for existing questions, not new interpretation or unseen final answers.','Invalid saved plans remain invalid; ambiguous plans must not retrieve a guessed subject.','Live sources are refreshed once and replayed while fresh for identical comparison; failure is explicitly injected at the adapter boundary.','Current local rules include supplements but have no new live publication attestation.']};
const save=()=>fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');save();let ruleRanker,communityRanker;
try{
 const liveResults={},fetchImpl=async(url,init={})=>{manifest.sourceFetches.push({url:String(url),at:new Date().toISOString()});save();return fetch(url,{...init,signal:AbortSignal.timeout(20000)});};
 const live=liveTools.createLiveEvidenceRetriever({profile,fetchImpl,clock:Date.now});
 for(const c of cases.filter(hasLive)){liveResults[c.id]={};for(const need of c.plan.needs.filter(n=>n.evidenceKind==='live-operation')){
  const request=c.plan.liveRequests?.[need.id];if(request?.dateRange&&request.dateRange.start!==today)liveResults[c.id][need.id]={sources:[],diagnostics:[{needId:need.id,reason:'saved-live-date-no-longer-current'}]};
  else liveResults[c.id][need.id]=await live(need,c.plan);
 }}
 fs.writeFileSync(path.join(out,'live-results.json'),JSON.stringify(liveResults,null,2)+'\n');manifest.liveResultsHash=flow.hash(liveResults);
 const init=Date.now(),now=Date.now();ruleRanker=await createSemanticRanker({directory:path.resolve('artifacts/quality-eval/semantic-identity-recapture-20260914'),documents:corpusTools.eligibleCorpus(rulesIndex,profile.communityId,now),communityId:profile.communityId,reuseKeywordPreparation:true});communityRanker=await createCommunitySemanticRanker({directory:path.resolve('artifacts/quality-eval/community-action-proof-20260915'),index:communityIndex,communityId:profile.communityId,now});manifest.initializationMs=Date.now()-init;manifest.status='querying';save();
 for(const [i,job] of jobs.entries()){
  const c=cases.find(c=>c.id===job.caseId),begin=Date.now();let retrievalCalls=0,liveCalls=0,response;
  const retrieve=flow.makeRetriever({communityId:profile.communityId,profile,communityIndex,rulesIndex,now:Date.now(),clock:Date.now,communityMode:'semantic',sourceRouting:job.method,communitySearch:(...args)=>communityRanker.search(...args),ruleSearch:(index,query,limit)=>ruleRanker.search(index,query,limit,{now:Date.now(),eligibilityQuestion:query,method:'hybrid'}),liveRetrieve:async need=>{
   liveCalls++;if(job.scenario==='injected-live-failure')return {sources:[],diagnostics:[{needId:need.id,reason:'injected-live-evidence-unavailable'}]};
   const result=structuredClone(liveResults[c.id]?.[need.id]||{sources:[],diagnostics:[{needId:need.id,reason:'unresolved-live-request'}]});
   for(const s of result.sources)if(Date.parse(s.staleAfter)<=Date.now())throw Error('Observed live capture expired during comparison');return result;
  }});
  try{response=await casesTools.replayPacket(c.plan,async plan=>{retrievalCalls++;return retrieve(plan);});}catch(e){response={status:'retrieval-error',error:e.message};}
  const record={id:'broad-'+String(i+1).padStart(3,'0'),isTest:true,...job,question:c.question,retrievalCalls,liveCalls,elapsedMs:Date.now()-begin,response};fs.writeFileSync(path.join(out,record.id+'.json'),JSON.stringify(record,null,2)+'\n');manifest.completed.push({id:record.id,...job});save();console.log(JSON.stringify({completed:i+1,total:jobs.length,caseId:c.id,status:response.status}));
 }
 manifest.status='captured';manifest.preparation=ruleRanker.preparationStats();
}catch(e){manifest.status='failed';manifest.error=e.message;process.exitCode=1;}finally{if(ruleRanker)await ruleRanker.dispose();if(communityRanker)await communityRanker.dispose();manifest.finishedAt=new Date().toISOString();manifest.peakRssBytes=process.resourceUsage().maxRSS*1024;save();console.log(JSON.stringify({status:manifest.status,completed:manifest.completed.length,error:manifest.error}));}

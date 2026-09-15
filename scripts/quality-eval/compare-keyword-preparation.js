"use strict";
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
const rules=require('../../lib/rules-assistant'),{eligibleCorpus,eligibleForQuestion}=require('./semantic-corpus'),{hash}=require('./flow-evidence'),{createEligibleKeywordIndex}=require('./eligible-keyword-index'),{times}=require('./summarize-presentation');
(async()=>{
 const out=path.resolve(process.argv[2]);if(fs.existsSync(out))throw Error('Preserve prior comparison');
 const profile=JSON.parse(fs.readFileSync('artifacts/quality-eval/rules-keyword-profile-20260915/report.json','utf8')),loaded=await rules.loadRulesIndex(),documents=eligibleCorpus(loaded,'sterling-ranch'),index={...loaded,documents},sourceHash=hash(documents);
 assert.equal(sourceHash,profile.sourceHash);const queries=profile.rows.map(({caseId,needId,query})=>({id:caseId+':'+needId,caseId,needId,query}));assert.equal(queries.length,6);
 const jobs=[1,2].flatMap(repetition=>queries.flatMap(q=>['fresh','reused'].map(method=>({queryId:q.id,repetition,method,order:crypto.randomBytes(8).toString('hex')})))).sort((a,b)=>a.order.localeCompare(b.order));
 fs.mkdirSync(out,{recursive:true});fs.mkdirSync(path.join(out,'code'));for(const f of ['compare-keyword-preparation.js','eligible-keyword-index.js','semantic-ranker.mjs'])fs.copyFileSync('scripts/quality-eval/'+f,path.join(out,'code',f));
 const manifest={status:'running',isTest:true,startedAt:new Date().toISOString(),codeRevision:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceHash,queries,design:jobs,completed:[],paidApiCalls:0,newSubscriptions:0};
 const save=()=>fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');save();fs.writeFileSync(path.join(out,'index.json'),JSON.stringify(index));const cache=createEligibleKeywordIndex(documents,'sterling-ranch'),rows=[];
 for(const [i,job] of jobs.entries()){
  const q=queries.find(q=>q.id===job.queryId),start=Date.now(),now=Date.now();assert.equal(hash(index.documents),sourceHash);
  const eligible=documents.filter(d=>rules.sourceLifecycleStatus(d,now)==='current'&&eligibleForQuestion(d,q.query));
  const statsBefore=cache.stats(),queryIndex=job.method==='reused'?cache.get(index,eligible):{...index,documents:eligible},result=rules.searchRulesIndex(queryIndex,q.query,30),elapsedMs=Date.now()-start;
  const row={id:'query-'+String(i+1).padStart(3,'0'),isTest:true,...job,query:q.query,eligibleIds:eligible.map(d=>d.id),elapsedMs,result,resultHash:hash(result),preparationBefore:statsBefore,preparationAfter:cache.stats()};
  rows.push(row);fs.writeFileSync(path.join(out,row.id+'.json'),JSON.stringify(row,null,2));manifest.completed.push({id:row.id,...job});save();console.log(JSON.stringify({completed:i+1,total:jobs.length,method:job.method,elapsedMs}));
 }
 for(const q of queries){const rr=rows.filter(r=>r.queryId===q.id);assert.equal(rr.length,4);assert.equal(new Set(rr.map(r=>r.resultHash)).size,1,'Changed query results');assert.equal(new Set(rr.map(r=>hash(r.eligibleIds))).size,1,'Eligibility changed during comparison');}
 const report={isTest:true,status:'complete-exact-output-preparation-comparison',allResultsIdentical:true,queries:queries.length,attempts:rows.length,methods:Object.fromEntries(['fresh','reused'].map(method=>[method,{timing:times(rows.filter(r=>r.method===method).map(r=>r.elapsedMs)),samples:rows.filter(r=>r.method===method).map(r=>({queryId:r.queryId,elapsedMs:r.elapsedMs,cacheHit:r.preparationAfter.hits>r.preparationBefore.hits}))}])),preparation:cache.stats(),paidApiCalls:0,newSubscriptions:0,limitations:['Six saved governing-rule queries, two randomized repetitions.','Includes corpus hashing and current eligibility; excludes embedding and final answers.','Desktop small-sample timing, not production hosting cost.']};
 fs.writeFileSync(path.join(out,'comparison.json'),JSON.stringify(report,null,2));manifest.status='captured';manifest.finishedAt=new Date().toISOString();manifest.peakRssBytes=process.resourceUsage().maxRSS*1024;save();console.log(JSON.stringify({...report,methods:Object.fromEntries(Object.entries(report.methods).map(([k,v])=>[k,v.timing]))}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});

import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import cp from 'node:child_process';
import flow from './flow-evidence.js';import snapshot from './flow-snapshot.js';import semantic from './community-semantic.js';import corpusTools from './semantic-corpus.js';import ranking from './rerank-packet.js';
import {createSemanticRanker} from './semantic-ranker.mjs';import {createCommunitySemanticRanker} from './community-semantic-ranker.mjs';
const [priorArg,communityArg,rulesArg,outArg]=process.argv.slice(2);if(!priorArg||!communityArg||!rulesArg||!outArg)throw Error('Require dual capture, community cache, rule cache and new output directory');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),prior=path.resolve(priorArg),out=path.resolve(outArg);if(fs.existsSync(out))throw Error('Use a new output directory');
const priorManifest=read(path.join(prior,'manifest.json'));if(priorManifest.status!=='captured'||priorManifest.completed.length!==40)throw Error('Require completed dual capture');
const cases=read(path.join(prior,'cases.json')),communityIndex=read(path.join(prior,'communityIndex.json')),rulesIndex=read(path.join(prior,'rulesIndex.json')),profile=read(path.join(prior,'profile.json'));
snapshot.validateSnapshot(communityIndex,read(path.join(prior,'attestation.json')),read('data/community-index.json'));
if(flow.hash(cases)!==priorManifest.casesHash||flow.hash(rulesIndex)!==priorManifest.rulesSnapshotHash||flow.hash(communityIndex)!==priorManifest.sourceSnapshotHash)throw Error('Changed frozen inputs');
const ready=read('artifacts/quality-eval/reranker-runtime/ready.json'),modelDir=path.resolve('.rerank-cache',ready.revision);
if(ready.status!=='ready'||ready.model!=='Xenova/ms-marco-MiniLM-L-6-v2'||ready.dtype!=='q8')throw Error('Require prepared reranker');
for(const f of ready.files){const bytes=fs.readFileSync(path.join(modelDir,f.name));if(bytes.length!==f.size||crypto.createHash('sha256').update(bytes).digest('hex')!==f.sha256)throw Error('Changed reranker artifact');}
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(path.join(out,'code'));for(const f of ['flow-evidence.js','rerank-packet.js','compare-packet-reranker.mjs'])fs.copyFileSync('scripts/quality-eval/'+f,path.join(out,'code',f));
const manifest={status:'preparing',isTest:true,startedAt:new Date().toISOString(),codeRevision:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),casesHash:flow.hash(cases),sourceSnapshotHash:flow.hash(communityIndex),rulesSnapshotHash:flow.hash(rulesIndex),model:ready.model,modelRevision:ready.revision,dtype:'q8',methods:['current-order','max-relevance','need-balanced'],completed:[],paidApiCalls:0,newSubscriptions:0,modelFileBytes:ready.totalFileBytes,limitations:['Five known plans, not unseen or final-answer quality.','Ranking logits are not calibrated relevance or answerability probabilities.','No source is rejected by a score threshold; all selected units retain approved full text.','Same 12-source / 30000-character bound. No new live rules attestation.']};
const save=()=>fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');save();let ruleRanker,communityRanker,classifier;
try{
 const now=Date.now(),inputs=[];
 ruleRanker=await createSemanticRanker({directory:path.resolve(rulesArg),documents:corpusTools.eligibleCorpus(rulesIndex,profile.communityId,now),communityId:profile.communityId});
 communityRanker=await createCommunitySemanticRanker({directory:path.resolve(communityArg),index:communityIndex,communityId:profile.communityId,now});
 for(const c of cases){let observed;
  const retrieve=flow.makeRetriever({communityId:profile.communityId,profile,communityIndex,rulesIndex,now,clock:Date.now,communityMode:'semantic',communitySearch:(...args)=>communityRanker.search(...args),ruleSearch:(index,query,limit)=>ruleRanker.search(index,query,limit,{now:Date.now(),method:'semantic',eligibilityQuestion:query}),observeCandidates:value=>{observed=value;}});
  const packet=await retrieve(c.plan),prevJob=priorManifest.completed.find(j=>j.caseId===c.id&&j.method==='combined-semantic'&&j.repetition===1),previous=read(path.join(prior,prevJob.id+'.json'));
  if(flow.hash(packet.sources)!==flow.hash(previous.packet.sources))throw Error('Candidate capture changed control packet');
  const candidates=observed.candidates.map(({source,...s})=>({...s,actions:s.actions.map(a=>({id:a.id,label:a.label,url:a.url,actionType:a.actionType})),retrievalText:s.role==='governing-rule'?s.text:semantic.retrievalDocument(source,'action-proof').text}));
  inputs.push({...c,candidates});
 }
 await ruleRanker.dispose();ruleRanker=null;await communityRanker.dispose();communityRanker=null;
 fs.writeFileSync(path.join(out,'candidates.json'),JSON.stringify(inputs,null,2)+'\n');manifest.candidateHash=flow.hash(inputs);manifest.controlEvidenceMatched=true;
 const jobs=[1,2].flatMap(repetition=>inputs.map(c=>({caseId:c.id,repetition,order:crypto.randomBytes(8).toString('hex')}))).sort((a,b)=>a.order.localeCompare(b.order));manifest.design=jobs;save();
 const {AutoTokenizer,AutoModelForSequenceClassification,env}=await import('../../artifacts/quality-eval/semantic-runtime/node_modules/@huggingface/transformers/dist/transformers.node.mjs');env.allowRemoteModels=false;env.allowLocalModels=true;
 const options={local_files_only:true,dtype:'q8',device:'cpu',session_options:{intraOpNumThreads:2}},init=Date.now(),tokenizer=await AutoTokenizer.from_pretrained(modelDir,options);classifier=await AutoModelForSequenceClassification.from_pretrained(modelDir,options);manifest.rerankerInitializationMs=Date.now()-init;manifest.status='scoring';save();
 for(const [i,job] of jobs.entries()){
  const c=inputs.find(c=>c.id===job.caseId),scores=[],start=Date.now();let pairs=0;
  for(const need of c.plan.needs){const query=`${need.subject} ${need.request}`,row=[];
   for(const candidate of c.candidates){
    const windows=await corpusTools.windowsForDocument({id:candidate.id,title:candidate.title,text:candidate.retrievalText},async text=>(await tokenizer(query,{text_pair:text,truncation:false,padding:false})).input_ids.dims.at(-1),{maxTokens:512});
    if(windows.length>100)throw Error('Rerank source exceeds window bound');let best=-Infinity;
    for(let k=0;k<windows.length;k+=8){const batch=windows.slice(k,k+8),features=await tokenizer(batch.map(()=>query),{text_pair:batch.map(w=>w.input),truncation:false,padding:true});
     if(features.input_ids.dims.at(-1)>512)throw Error('Reranker pair exceeds token bound');const result=await classifier(features),values=Array.from(result.logits.data);if(values.length!==batch.length||values.some(v=>!Number.isFinite(v)))throw Error('Invalid relevance scores');best=Math.max(best,...values);pairs+=batch.length;
    }row.push(best);
   }scores.push(row);
  }
  const candidates=c.candidates.map(({retrievalText,...s})=>s),methods={'current-order':ranking.packetSelection(candidates),'max-relevance':ranking.packetSelection(ranking.rerankOrder(candidates,c.plan.needs,scores)),'need-balanced':ranking.packetSelection(ranking.rerankOrder(candidates,c.plan.needs,scores,{balanced:true}))};
  const record={id:'rerank-'+String(i+1).padStart(3,'0'),isTest:true,...job,question:c.question,candidateHash:flow.hash(c),elapsedMs:Date.now()-start,pairs,scores,methods};
  fs.writeFileSync(path.join(out,record.id+'.json'),JSON.stringify(record,null,2)+'\n');manifest.completed.push({id:record.id,...job});save();console.log(JSON.stringify({completed:i+1,total:jobs.length,caseId:c.id,pairs,elapsedMs:record.elapsedMs}));
 }
 manifest.status='captured';
}catch(e){manifest.status='failed';manifest.error=e.message;process.exitCode=1;}finally{if(ruleRanker)await ruleRanker.dispose();if(communityRanker)await communityRanker.dispose();if(classifier)await classifier.dispose();manifest.finishedAt=new Date().toISOString();manifest.peakRssBytes=process.resourceUsage().maxRSS*1024;save();console.log(JSON.stringify({status:manifest.status,completed:manifest.completed.length,error:manifest.error}));}

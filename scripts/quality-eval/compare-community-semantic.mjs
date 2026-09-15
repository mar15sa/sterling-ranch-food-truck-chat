import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import cp from 'node:child_process';import {fileURLToPath} from 'node:url';
import semantic from './community-semantic.js';import corpusTools from './semantic-corpus.js';import search from '../../lib/community-search.js';import snapshotTools from './flow-snapshot.js';
import hashTools from './flow-evidence.js';
const root=fileURLToPath(new URL('../../',import.meta.url)),[indexArg,attestationArg,outArg]=process.argv.slice(2);
if(!indexArg||!attestationArg||!outArg)throw Error('Require current index, attestation and new output directory');
const out=path.resolve(outArg);if(fs.existsSync(out))throw Error('Preserve previous capture; use a new directory');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),index=read(indexArg),attestation=read(attestationArg),baseline=read(path.join(root,'data/community-index.json'));
snapshotTools.validateSnapshot(index,attestation,baseline);
const spec=read(path.join(root,'scripts/quality-eval/community-semantic-cases.json')),corpus=semantic.frozenCorpus(index,index.communityId),ids=new Set(corpus.documents.map(d=>d.id));
if(spec.cases.length!==22||new Set(spec.cases.map(c=>c.id)).size!==22||spec.cases.some(c=>!c.question||c.targets.some(group=>!group.length||group.some(id=>!ids.has(id)))))throw Error('Invalid frozen retrieval cases or missing target');
const readiness=read(path.join(root,'artifacts/quality-eval/semantic-runtime/ready.json'));
if(readiness.status!=='ready'||readiness.dtype!=='q8'||readiness.pooling!=='cls'||readiness.dimensions!==384)throw Error('Require tested local embedding model');
const jobs=[1,2].flatMap(repetition=>spec.cases.map(c=>({caseId:c.id,repetition,order:crypto.randomBytes(8).toString('hex')}))).sort((a,b)=>a.order.localeCompare(b.order));
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(path.join(out,'code'));
for(const f of ['community-semantic.js','compare-community-semantic.mjs','community-projection-corpus.js','semantic-corpus.js'])fs.copyFileSync(path.join(root,'scripts/quality-eval',f),path.join(out,'code',f));
for(const [name,value] of Object.entries({cases:spec,index,attestation,corpus}))fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(value,null,2)+'\n');
const manifest={status:'initializing',isTest:true,startedAt:new Date().toISOString(),codeRevision:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),communityId:index.communityId,
 model:readiness.model,modelRevision:readiness.revision,dtype:'q8',pooling:'cls',dimensions:384,runtimeVersion:readiness.runtimeVersion,sourceSnapshotHash:hashTools.hash(index),corpusHash:hashTools.hash(corpus),casesHash:hashTools.hash(spec),design:jobs,completed:[],paidApiCalls:0,newSubscriptions:0,
 limits:{sourcesPerResult:4,rankCandidates:30},limitations:[...spec.limitations,'Approved projection text and title only; no action-proof hints or raw source body.','Nearest neighbors do not establish relevance, permission, completeness or a resolved subject.','Desktop timings/RAM are not production hosting estimates.']};
const save=()=>fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');save();
let extractor;
try{
 const init=Date.now();const {AutoModel,AutoTokenizer,FeatureExtractionPipeline,env}=await import('../../artifacts/quality-eval/semantic-runtime/node_modules/@huggingface/transformers/dist/transformers.node.mjs');
 env.cacheDir=path.join(root,'.embedding-cache');env.allowLocalModels=true;env.allowRemoteModels=false;
 const modelDir=path.join(env.cacheDir,readiness.model,readiness.revision),options={revision:readiness.revision,local_files_only:true,dtype:'q8',device:'cpu',session_options:{intraOpNumThreads:2}};
 const [model,tokenizer]=await Promise.all([AutoModel.from_pretrained(modelDir,options),AutoTokenizer.from_pretrained(modelDir,options)]);
 extractor=new FeatureExtractionPipeline({task:'feature-extraction',model,tokenizer});manifest.initializationMs=Date.now()-init;
 const windowStart=Date.now(),units=[];for(const doc of corpus.documents)units.push(...await corpusTools.windowsForDocument(doc,async text=>(await tokenizer(text,{truncation:false,padding:false})).input_ids.dims.at(-1)));
 manifest.windowPlanningMs=Date.now()-windowStart;manifest.windows=units.length;manifest.status='indexing';save();
 const vectors=new Float32Array(units.length*384),embedStart=Date.now();
 for(let i=0;i<units.length;i+=16){const batch=units.slice(i,i+16),value=await extractor(batch.map(u=>u.input),{pooling:'cls',normalize:true});if(value.dims[1]!==384||value.data.some(n=>!Number.isFinite(n)))throw Error('Invalid embedding batch');vectors.set(value.data,i*384);manifest.embeddedWindows=Math.min(i+16,units.length);save();}
 manifest.indexingMs=Date.now()-embedStart;manifest.vectorBytes=vectors.byteLength;
 fs.writeFileSync(path.join(out,'vectors.f32'),Buffer.from(vectors.buffer));fs.writeFileSync(path.join(out,'windows.json'),JSON.stringify(units.map(({input,...u})=>u),null,2));
 manifest.status='querying';save();
 for(const [i,job] of jobs.entries()){
  const c=spec.cases.find(c=>c.id===job.caseId),now=Date.now(),gateStart=Date.now(),eligible=semantic.eligibleDocuments(corpus,index,now),eligibilityMs=Date.now()-gateStart;
  const keywordStart=Date.now(),raw=search.searchCommunityIndex(c.question,{index,communityId:index.communityId,now,limit:30,intent:c.intent,interpretation:{requestedDetails:c.details},includeActionOnlyProjections:true,allowPartialRequestedDetails:true}).sources;
  const keyword=semantic.bindKeyword(raw,eligible),keywordMs=Date.now()-keywordStart;
  const queryStart=Date.now(),q=await extractor('Represent this sentence for searching relevant passages: '+c.question,{pooling:'cls',normalize:true}),queryEmbeddingMs=Date.now()-queryStart;
  const scanStart=Date.now(),dense=semantic.rankDense({corpus,currentIndex:index,now,units,vectors,queryVector:q.data}),scanAndEligibilityMs=Date.now()-scanStart;
  const hybrid=semantic.fuse(keyword.slice(0,30),dense.slice(0,30),30);
  const serialize=rows=>rows.slice(0,10).map(r=>({id:r.document.id,title:r.document.title,sourceUrl:r.document.sourceUrl,sourceIdentity:semantic.projectionIdentity(r.document),text:r.document.text,actions:r.document.actions,score:r.score,fusionScore:r.fusionScore,ranks:r.ranks,...(r.window?{matchedWindow:r.window}:{})}));
  const record={id:'query-'+String(i+1).padStart(3,'0'),isTest:true,...job,question:c.question,eligibleDocuments:eligible.length,keywordUnboundRows:raw.length-keyword.length,latency:{eligibilityMs,keywordMs,queryEmbeddingMs,scanAndEligibilityMs},keyword:serialize(keyword),semantic:serialize(dense),hybrid:serialize(hybrid)};
  fs.writeFileSync(path.join(out,record.id+'.json'),JSON.stringify(record,null,2)+'\n');manifest.completed.push({id:record.id,caseId:c.id,repetition:job.repetition});save();console.log(JSON.stringify({completed:manifest.completed.length,total:jobs.length,caseId:c.id}));
 }
 manifest.status='captured';
}catch(e){manifest.status='failed';manifest.error=e.message;process.exitCode=1;}finally{if(extractor)await extractor.dispose();manifest.finishedAt=new Date().toISOString();manifest.peakRssBytes=process.resourceUsage().maxRSS*1024;save();console.log(JSON.stringify(manifest));}

// Retrieval diagnosis only. Source evidence and rank are not answer approval.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
import {AutoModel,AutoTokenizer,FeatureExtractionPipeline,env} from '../../artifacts/quality-eval/semantic-runtime/node_modules/@huggingface/transformers/dist/transformers.node.mjs';
import rules from '../../lib/rules-assistant.js';
import sectionContext from '../../lib/rules-section-context.js';
import corpusTools from './semantic-corpus.js';
const {eligibleCorpus,eligibleForQuestion,sectionKey,windowsForDocument,fuse}=corpusTools;
const root=fileURLToPath(new URL('../../',import.meta.url));
const out=path.resolve(process.argv[2]||path.join(root,'artifacts/quality-eval/semantic-comparison-20260914'));
fs.mkdirSync(out,{recursive:true});const manifestPath=path.join(out,'manifest.json');
if(fs.existsSync(manifestPath))throw new Error('Use a new output directory');
const readiness=JSON.parse(fs.readFileSync(path.join(root,'artifacts/quality-eval/semantic-runtime/ready.json'),'utf8'));
const profile=JSON.parse(fs.readFileSync(path.join(root,'data/communities/sterling-ranch.json'),'utf8'));
const cases=JSON.parse(fs.readFileSync(path.join(root,'scripts/quality-eval/diagnostic-cases.json'),'utf8')).cases;
const loaded=await rules.loadRulesIndex();const documents=eligibleCorpus(loaded,profile.communityId);
if(!documents.length||documents.length>5000)throw new Error('Unexpected diagnostic corpus size');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const report={status:'indexing',startedAt:new Date().toISOString(),isTest:true,communityId:profile.communityId,
  model:readiness.model,modelRevision:readiness.revision,runtimeVersion:readiness.runtimeVersion,dtype:'q8',pooling:'cls',dimensions:384,
  sourceSnapshotSha256:hash(loaded),eligibleCorpusSha256:hash(documents),casesSha256:hash(cases),loadedDocuments:loaded.documents.length,
  eligibleDocuments:documents.length,windows:0,completedCases:0,paidApiCalls:0,newSubscriptions:0,
  limitations:['Rules snapshot only, not the current live-connector corpus.','Similarity is not relevance, approval or completeness.',
    'Diagnostic cases are not holdout quality evidence.','Desktop CPU timings and disk sizes do not establish production hosting costs.']};
const save=()=>fs.writeFileSync(manifestPath,JSON.stringify(report,null,2)+'\n');save();
env.cacheDir=path.join(root,'.embedding-cache');env.allowLocalModels=true;env.allowRemoteModels=false;
// Explicit components avoid remote file discovery when all inference assets are already cached.
const modelOptions={revision:readiness.revision,local_files_only:true,dtype:'q8',device:'cpu',session_options:{intraOpNumThreads:2}};
const modelDirectory=path.join(env.cacheDir,readiness.model,readiness.revision);
const [model,tokenizer]=await Promise.all([AutoModel.from_pretrained(modelDirectory,modelOptions),AutoTokenizer.from_pretrained(modelDirectory,modelOptions)]);
const extractor=new FeatureExtractionPipeline({task:'feature-extraction',model,tokenizer});
const tokenCount=async text=>(await extractor.tokenizer(text,{truncation:false,padding:false})).input_ids.dims.at(-1);
const started=Date.now();const units=[];
for(const document of documents)units.push(...await windowsForDocument(document,tokenCount));
report.windows=units.length;report.windowPlanningMs=Date.now()-started;save();
const vectors=new Float32Array(units.length*384);const embedStart=Date.now();
for(let i=0;i<units.length;i+=16){
  const batch=units.slice(i,i+16);const value=await extractor(batch.map(w=>w.input),{pooling:'cls',normalize:true});
  if(value.dims[1]!==384||value.data.some(n=>!Number.isFinite(n)))throw new Error('Invalid embedding batch');
  vectors.set(value.data,i*384);report.embeddedWindows=Math.min(i+16,units.length);save();
  if(i%160===0)console.log(JSON.stringify({embedded:report.embeddedWindows,total:units.length}));
}
report.embeddingMs=Date.now()-embedStart;report.vectorBytes=vectors.byteLength;
fs.writeFileSync(path.join(out,'vectors.f32'),Buffer.from(vectors.buffer));
fs.writeFileSync(path.join(out,'corpus.json'),JSON.stringify({documents,units:units.map(({input,...w})=>w)},null,2));
report.status='querying';save();
const byId=new Map(documents.map(d=>[d.id,d]));
for(const row of cases){
  const prior=cases.find(c=>c.id===row.contextCaseId);
  const query=prior?`Regarding ${prior.question} ${row.question}`:row.question;
  const eligible=documents.filter(d=>eligibleForQuestion(d,query)),ids=new Set(eligible.map(d=>d.id));
  const queryStart=Date.now();const q=await extractor('Represent this sentence for searching relevant passages: '+query,{pooling:'cls',normalize:true});
  const queryEmbeddingMs=Date.now()-queryStart;const scanStart=Date.now();const best=new Map();
  for(let i=0;i<units.length;i++){
    const unit=units[i];if(!ids.has(unit.documentId))continue;
    const document=byId.get(unit.documentId);let score=0;for(let j=0;j<384;j++)score+=vectors[i*384+j]*q.data[j];
    const key=sectionKey(document);if(!best.has(key)||score>best.get(key).score)best.set(key,{document,score,window:unit});
  }
  const dense=[...best.values()].sort((a,b)=>b.score-a.score).slice(0,30);const scanMs=Date.now()-scanStart;
  const keywordStart=Date.now();const keyword=rules.searchRulesIndex({...loaded,documents:eligible},query,30).map(document=>({document,score:document.score}));
  const keywordMs=Date.now()-keywordStart;const fused=fuse(keyword,dense,10);
  const serialize=rows=>rows.slice(0,10).map(r=>{
    const d=byId.get(r.document.id)||r.document;
    const context=sectionContext.availableSectionContext(d,documents,{eligible:x=>eligibleForQuestion(x,query)});
    return {id:d.id,nodeId:d.nodeId,title:d.title,sourceUrl:d.sourceUrl,score:r.score,fusionScore:r.fusionScore,ranks:r.ranks,
      selectedText:d.text,matchedWindow:r.window?{start:r.window.start,end:r.window.end,text:d.text.slice(r.window.start,r.window.end)}:null,
      context};
  });
  fs.writeFileSync(path.join(out,row.id+'.json'),JSON.stringify({id:row.id,question:row.question,query,isTest:true,
    latency:{queryEmbeddingMs,scanMs,keywordMs},keyword:serialize(keyword),semantic:serialize(dense),hybrid:serialize(fused)},null,2));
  report.completedCases++;save();console.log(JSON.stringify({caseId:row.id,completed:report.completedCases,total:cases.length}));
}
await extractor.dispose();report.status='captured';report.finishedAt=new Date().toISOString();report.peakRssBytes=process.resourceUsage().maxRSS*1024;save();
console.log(JSON.stringify(report));

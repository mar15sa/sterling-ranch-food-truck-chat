// Evaluation-only reuse of an exact local embedding corpus; never adds evidence.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import corpusTools from './semantic-corpus.js';
import rules from '../../lib/rules-assistant.js';
const root=fileURLToPath(new URL('../../',import.meta.url));
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
export async function createSemanticRanker({directory,documents,communityId}){
  const read=f=>JSON.parse(fs.readFileSync(path.join(directory,f),'utf8'));
  const manifest=read('manifest.json'),corpus=read('corpus.json');
  const readiness=JSON.parse(fs.readFileSync(path.join(root,'artifacts/quality-eval/semantic-runtime/ready.json'),'utf8'));
  const bytes=fs.readFileSync(path.join(directory,'vectors.f32'));
  if(manifest.status!=='captured'||manifest.communityId!==communityId||manifest.eligibleCorpusSha256!==hash(documents)||
    hash(corpus.documents)!==hash(documents)||manifest.model!==readiness.model||manifest.modelRevision!==readiness.revision||
    manifest.dimensions!==384||manifest.dtype!=='q8'||manifest.pooling!=='cls'||bytes.byteLength!==corpus.units.length*384*4)
    throw new Error('Semantic cache does not match exact scoped source corpus and model');
  const vectors=new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  if(vectors.some(n=>!Number.isFinite(n)))throw new Error('Invalid cached vectors');
  const byId=new Map(documents.map(d=>[d.id,d]));
  if(corpus.units.some(u=>!byId.has(u.documentId)||u.start<0||u.end>byId.get(u.documentId).text.length||u.end<=u.start))throw new Error('Invalid cached evidence window');
  const {AutoModel,AutoTokenizer,FeatureExtractionPipeline,env}=await import('../../artifacts/quality-eval/semantic-runtime/node_modules/@huggingface/transformers/dist/transformers.node.mjs');
  env.cacheDir=path.join(root,'.embedding-cache');env.allowLocalModels=true;env.allowRemoteModels=false;
  const modelDirectory=path.join(env.cacheDir,readiness.model,readiness.revision),options={revision:readiness.revision,local_files_only:true,dtype:'q8',device:'cpu',session_options:{intraOpNumThreads:2}};
  const [model,tokenizer]=await Promise.all([AutoModel.from_pretrained(modelDirectory,options),AutoTokenizer.from_pretrained(modelDirectory,options)]);
  const extractor=new FeatureExtractionPipeline({task:'feature-extraction',model,tokenizer});
  const expectedUnits=[],tokenCount=async text=>(await tokenizer(text,{truncation:false,padding:false})).input_ids.dims.at(-1);
  for(const document of documents)expectedUnits.push(...await corpusTools.windowsForDocument(document,tokenCount));
  if(hash(expectedUnits.map(({input,...unit})=>unit))!==hash(corpus.units)){
    await extractor.dispose();throw new Error('Cached vector windows do not match exact document segmentation');
  }
  return {communityId,corpusHash:hash(documents),model:manifest.model,modelRevision:manifest.modelRevision,
    async search(index,query,limit=4,{now=Date.now(),eligibilityQuestion=query}={}){
      if(hash(index.documents)!==manifest.eligibleCorpusSha256)throw new Error('Retrieval index changed after semantic cache binding');
      const eligible=documents.filter(d=>rules.sourceLifecycleStatus(d,now)==='current'&&corpusTools.eligibleForQuestion(d,eligibilityQuestion));
      const ids=new Set(eligible.map(d=>d.id));
      const q=await extractor('Represent this sentence for searching relevant passages: '+query,{pooling:'cls',normalize:true});
      if(q.dims[1]!==384||q.data.some(n=>!Number.isFinite(n)))throw new Error('Invalid query embedding');
      const best=new Map();
      for(let i=0;i<corpus.units.length;i++){
        const unit=corpus.units[i];if(!ids.has(unit.documentId))continue;
        const document=byId.get(unit.documentId);let score=0;
        for(let j=0;j<384;j++)score+=vectors[i*384+j]*q.data[j];
        const key=corpusTools.sectionKey(document);
        if(!best.has(key)||score>best.get(key).score)best.set(key,{document,score,window:unit});
      }
      const dense=[...best.values()].sort((a,b)=>b.score-a.score).slice(0,30);
      const keyword=rules.searchRulesIndex({...index,documents:eligible},query,30).map(document=>({document,score:document.score}));
      for(const r of keyword)if(byId.get(r.document.id)?.text!==r.document.text)throw new Error('Keyword evidence identity changed');
      return corpusTools.fuse(keyword,dense,limit).map(r=>({...r.document,retrievalMethod:'local-semantic-plus-keyword',fusionScore:r.fusionScore,retrievalRanks:r.ranks}));
    },dispose:()=>extractor.dispose()};
}

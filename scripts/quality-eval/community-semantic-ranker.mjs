// Experimental adapter: cached navigation representations return approved projections only.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
import semantic from './community-semantic.js';import corpusTools from './semantic-corpus.js';import flow from './flow-evidence.js';
const root=fileURLToPath(new URL('../../',import.meta.url)),{hash}=flow;
export async function createCommunitySemanticRanker({directory,communityId,index,now=Date.now()}){
 const read=f=>JSON.parse(fs.readFileSync(path.join(directory,f),'utf8'));
 const manifest=read('manifest.json'),corpus=read('corpus.json'),units=read('windows.json'),bytes=fs.readFileSync(path.join(directory,'vectors.f32'));
 const readiness=JSON.parse(fs.readFileSync(path.join(root,'artifacts/quality-eval/semantic-runtime/ready.json'),'utf8'));
 if(manifest.status!=='captured'||manifest.communityId!==communityId||corpus.communityId!==communityId||hash(corpus)!==manifest.corpusHash||
  hash(corpus.documents.map(d=>semantic.retrievalDocument(d,manifest.representation)))!==manifest.retrievalRepresentationHash||
  manifest.model!==readiness.model||manifest.modelRevision!==readiness.revision||manifest.runtimeVersion!==readiness.runtimeVersion||
  manifest.dtype!=='q8'||manifest.pooling!=='cls'||manifest.dimensions!==384||bytes.byteLength!==units.length*384*4)throw Error('Community semantic cache binding mismatch');
 const vectors=new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 if(vectors.some(n=>!Number.isFinite(n)))throw Error('Invalid community vectors');
 semantic.eligibleDocuments(corpus,index,now);
 const {AutoModel,AutoTokenizer,FeatureExtractionPipeline,env}=await import('../../artifacts/quality-eval/semantic-runtime/node_modules/@huggingface/transformers/dist/transformers.node.mjs');
 env.cacheDir=path.join(root,'.embedding-cache');env.allowLocalModels=true;env.allowRemoteModels=false;
 const modelDirectory=path.join(env.cacheDir,readiness.model,readiness.revision),options={revision:readiness.revision,local_files_only:true,dtype:'q8',device:'cpu',session_options:{intraOpNumThreads:2}};
 const [model,tokenizer]=await Promise.all([AutoModel.from_pretrained(modelDirectory,options),AutoTokenizer.from_pretrained(modelDirectory,options)]);
 const extractor=new FeatureExtractionPipeline({task:'feature-extraction',model,tokenizer});let closed=false;
 try{
  const expected=[];for(const d of corpus.documents)expected.push(...await corpusTools.windowsForDocument(semantic.retrievalDocument(d,manifest.representation),async text=>(await tokenizer(text,{truncation:false,padding:false})).input_ids.dims.at(-1)));
  if(hash(expected.map(({input,...u})=>u))!==hash(units))throw Error('Community vector windows changed');
  return {communityId,metadata:{model:manifest.model,modelRevision:manifest.modelRevision,representation:manifest.representation,corpusHash:manifest.corpusHash,
    vectorSha256:crypto.createHash('sha256').update(bytes).digest('hex'),windowHash:hash(units),vectorBytes:bytes.byteLength,paidApiCalls:0,productionHostingCostUsd:null},
   async search(currentIndex,query,limit=4,{now=Date.now()}={}){
    if(closed)throw Error('Community semantic ranker closed');if(!Number.isInteger(limit)||limit<1||limit>30)throw Error('Invalid community retrieval bound');
    const q=await extractor('Represent this sentence for searching relevant passages: '+query,{pooling:'cls',normalize:true});
    return semantic.rankDense({corpus,currentIndex,now,units,vectors,queryVector:q.data,representation:manifest.representation}).slice(0,limit).map(r=>r.document);
   },async dispose(){if(!closed){closed=true;await extractor.dispose();}}};
 }catch(e){await extractor.dispose();throw e;}
}

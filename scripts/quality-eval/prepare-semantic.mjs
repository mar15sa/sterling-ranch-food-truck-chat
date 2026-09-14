// Isolated local embedding smoke check. Never sends resident questions to a service.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline, env } from '../../artifacts/quality-eval/semantic-runtime/node_modules/@huggingface/transformers/dist/transformers.node.mjs';
const root=fileURLToPath(new URL('../../artifacts/quality-eval/semantic-runtime/',import.meta.url));
const model='Xenova/bge-small-en-v1.5';
const meta=await fetch('https://huggingface.co/api/models/'+model,{signal:AbortSignal.timeout(30000)}).then(r=>{if(!r.ok)throw new Error('Model metadata unavailable');return r.json();});
if(!/^[a-f0-9]{40}$/.test(meta.sha||''))throw new Error('Require an immutable model revision');
// Keep the ONNX filename below Windows native path limits in this long worktree path.
env.cacheDir=fileURLToPath(new URL('../../.embedding-cache/',import.meta.url));env.allowLocalModels=false;
const started=Date.now();
const extractor=await pipeline('feature-extraction',model,{revision:meta.sha,dtype:'q8',device:'cpu'});
const readyMs=Date.now()-started;
const texts=['Use the design review application to request approval for an exterior project.','Monthly utility charges are shown on the water bill.'];
const encodeStart=Date.now();
const embeddings=await extractor(texts,{pooling:'cls',normalize:true});
const query=await extractor('Represent this sentence for searching relevant passages: Where can I obtain the architectural request form?',{pooling:'cls',normalize:true});
const scores=embeddings.tolist().map(v=>v.reduce((sum,n,i)=>sum+n*query.data[i],0));
if(embeddings.dims[1]!==384||scores.some(s=>!Number.isFinite(s)))throw new Error('Invalid embedding output');
const report={status:'ready',checkedAt:new Date().toISOString(),model,revision:meta.sha,dtype:'q8',pooling:'cls',dimensions:384,
  runtimeVersion:'4.2.0',readyMs,smokeEncodeMs:Date.now()-encodeStart,smokeScores:scores,
  scope:'Synthetic execution check only; not a retrieval quality comparison.',paidApiCalls:0,newSubscriptions:0,
  limitations:['Hosting CPU/memory impact and recurring costs are not established.','Full approved-corpus indexing and retrieval/reranking comparison remain pending.']};
fs.writeFileSync(path.join(root,'ready.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
await extractor.dispose();

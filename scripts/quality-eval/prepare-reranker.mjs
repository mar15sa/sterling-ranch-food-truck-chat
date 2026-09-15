// Download public data artifacts at an immutable revision; infer locally, never send questions.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url)),out=path.join(root,'artifacts/quality-eval/reranker-runtime'),meta=JSON.parse(fs.readFileSync(path.join(out,'model-metadata.json'),'utf8'));
const model='Xenova/ms-marco-MiniLM-L-6-v2',revision='a09144355adeed5f58c8ed011d209bf8ee5a1fec';
if(meta.sha!==revision)throw Error('Pinned reranker metadata mismatch');
const directory=path.join(root,'.rerank-cache',revision),files=['config.json','tokenizer.json','tokenizer_config.json','special_tokens_map.json','vocab.txt','onnx/model_quantized.onnx'];
const report={status:'downloading',model,revision,dtype:'q8',runtimeVersion:'4.2.0',startedAt:new Date().toISOString(),files:[],paidApiCalls:0,newSubscriptions:0};
const save=()=>fs.writeFileSync(path.join(out,'ready.json'),JSON.stringify(report,null,2)+'\n');save();
for(const name of files){
 const expected=meta.siblings.find(f=>f.rfilename===name);if(!expected||expected.size>25000000)throw Error('Unexpected model file');
 const dest=path.join(directory,name);let bytes;
 if(fs.existsSync(dest))bytes=fs.readFileSync(dest);else{const r=await fetch(`https://huggingface.co/${model}/resolve/${revision}/${name}`,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('Model download failed: '+r.status);bytes=Buffer.from(await r.arrayBuffer());}
 const digest=crypto.createHash('sha256').update(bytes).digest('hex');if(bytes.length!==expected.size||expected.lfs&&digest!==expected.lfs.sha256)throw Error('Reranker artifact integrity mismatch');
 fs.mkdirSync(path.dirname(dest),{recursive:true});if(!fs.existsSync(dest))fs.writeFileSync(dest,bytes);report.files.push({name,size:bytes.length,sha256:digest});save();
}
report.status='initializing';save();
const {AutoTokenizer,AutoModelForSequenceClassification,env}=await import('../../artifacts/quality-eval/semantic-runtime/node_modules/@huggingface/transformers/dist/transformers.node.mjs');
env.allowRemoteModels=false;env.allowLocalModels=true;
const started=Date.now(),options={local_files_only:true,dtype:'q8',device:'cpu',session_options:{intraOpNumThreads:2}};
const tokenizer=await AutoTokenizer.from_pretrained(directory,options),classifier=await AutoModelForSequenceClassification.from_pretrained(directory,options);
try{
 report.initializationMs=Date.now()-started;const query='Where can I obtain the application form?',texts=['Open the application form to submit a request.','Internet service support and router troubleshooting.'];
 const begin=Date.now(),features=await tokenizer([query,query],{text_pair:texts,padding:true,truncation:false}),result=await classifier(features),scores=Array.from(result.logits.data);
 if(scores.length!==2||scores.some(s=>!Number.isFinite(s))||scores[0]<=scores[1])throw Error('Reranker synthetic smoke check failed');
 report.smokeScores=scores;report.smokeMs=Date.now()-begin;report.totalFileBytes=report.files.reduce((n,f)=>n+f.size,0);report.status='ready';report.scope='Synthetic local execution check only; not community retrieval or answer quality.';
}finally{await classifier.dispose();report.finishedAt=new Date().toISOString();report.peakRssBytes=process.resourceUsage().maxRSS*1024;save();console.log(JSON.stringify(report));}

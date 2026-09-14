"use strict";
// These tests verify measurement boundaries; they make no paid model requests.
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {priceUsage,summarize,ensureAllowedModel}=require("../scripts/quality-eval/usage");
const {capture}=require("../scripts/quality-eval/capture-live-baseline");
const {compare}=require("../scripts/quality-eval/compare-composition");
function tmp(t){const p=fs.mkdtempSync(path.join(os.tmpdir(),"community-quality-"));t.after(()=>fs.rmSync(p,{recursive:true,force:true}));return p;}
test("unknown and failed-call usage cannot look like a zero-cost answer",()=>{
  assert.equal(priceUsage("claude-opus-5",null).estimatedUsd,null);
  assert.equal(priceUsage("unknown",{input_tokens:20,output_tokens:10}).estimatedUsd,null);
  assert.equal(priceUsage("claude-opus-5",{input_tokens:-1,output_tokens:10}).estimatedUsd,null);
  const total=summarize([{stage:"composition",model:"claude-opus-5",usage:{input_tokens:1000,output_tokens:100}},
    {stage:"checking",model:"claude-opus-5",usage:null}]);
  assert.equal(total.calls,2);assert.equal(total.unknownCostCalls,1);assert.equal(total.estimatedTotalUsd,null);
  assert.equal(total.measuredCostSubtotalUsd,0.0075);
});
test("cache categories are priced separately and incomplete breakdown is unknown",()=>{
  const usage={input_tokens:1000,output_tokens:100,cache_read_input_tokens:1000,cache_creation_input_tokens:300,
    cache_creation:{ephemeral_5m_input_tokens:100,ephemeral_1h_input_tokens:200}};
  assert.equal(priceUsage("claude-haiku-4-5",usage).estimatedUsd,0.002125);
  assert.equal(priceUsage("claude-haiku-4-5",{...usage,cache_creation:undefined}).estimatedUsd,null);
});
test("owner-excluded models never reach a provider",()=>{
  for(const m of ["claude-fable-5-1","gpt-6-astra"])assert.throws(()=>ensureAllowedModel(m),/excluded/);
});
test("baseline capture always marks test traffic and preserves deployment drift",async t=>{
  const out=tmp(t);let healthCalls=0;const requests=[];
  const report=await capture({baseUrl:"https://community.example",outDir:out,limit:2,wait:async()=>{},
    fetchImpl:async(url,options)=>{
      if(String(url).includes("/api/health"))return Response.json({deploymentRevision:++healthCalls===1?"revision-a":"revision-b"});
      requests.push(JSON.parse(options.body));return Response.json({answer:"Synthetic test answer",sources:[]});
    }});
  assert.equal(requests.length,2);assert.ok(requests.every(r=>r.isTest===true));
  assert.equal(report.revisionStable,false);
  await assert.rejects(capture({baseUrl:"https://community.example",outDir:out,limit:1}),/new output/);
});
test("pilot refuses mixed-revision evidence and enforces spend reservation before calls",async t=>{
  const dir=tmp(t),baseline=path.join(dir,"baseline");fs.mkdirSync(baseline);
  const mp=path.join(baseline,"manifest.json");
  fs.writeFileSync(mp,JSON.stringify({status:"captured",revisionStable:false,before:{deploymentRevision:"a"}}));
  let requests=0;
  const args={baselineDir:baseline,outDir:path.join(dir,"results"),models:["claude-opus-5"],caseIds:["case"],repetitions:1,
    apiKey:"test-secret",fetchImpl:async()=>{requests++;return Response.json({});}};
  await assert.rejects(compare(args),/verified revision/);
  fs.writeFileSync(mp,JSON.stringify({status:"captured",revisionStable:true,before:{deploymentRevision:"a"}}));
  fs.writeFileSync(path.join(baseline,"case.json"),JSON.stringify({id:"case",isTest:true,question:"Synthetic question",response:{sources:[]}}));
  const report=await compare({...args,capUsd:0.000001});
  assert.equal(report.status,"stopped-budget");assert.equal(requests,0);
});
test("comparison preserves provider failure as unknown charge and never saves credentials",async t=>{
  const dir=tmp(t),baseline=path.join(dir,"baseline"),outDir=path.join(dir,"results");fs.mkdirSync(baseline);
  fs.writeFileSync(path.join(baseline,"manifest.json"),JSON.stringify({status:"captured",revisionStable:true,before:{deploymentRevision:"a"}}));
  fs.writeFileSync(path.join(baseline,"case.json"),JSON.stringify({id:"case",isTest:true,question:"Synthetic question",response:{sources:[]}}));
  const report=await compare({baselineDir:baseline,outDir,models:["claude-haiku-4-5"],caseIds:["case"],repetitions:1,
    apiKey:"test-secret",fetchImpl:async()=>Response.json({error:{type:"authentication_error"}},{status:401})});
  assert.equal(report.status,"stopped-provider");assert.equal(report.costs.estimatedTotalUsd,null);
  for(const file of fs.readdirSync(outDir))assert.ok(!fs.readFileSync(path.join(outDir,file),"utf8").includes("test-secret"));
});

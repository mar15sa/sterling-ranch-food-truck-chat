const test=require('node:test');
const assert=require('node:assert/strict');
const {fetchSourceJson}=require('../lib/source-fetch');
test('temporary official-source failures retry but missing pages do not',async()=>{
  let calls=0;
  const result=await fetchSourceJson('https://example.gov',{delayMs:0,fetchImpl:async()=>++calls===1?{ok:false,status:503}:{ok:true,json:async()=>({okay:true})}});
  assert.equal(result.okay,true);assert.equal(calls,2);
  calls=0;
  await assert.rejects(fetchSourceJson('https://example.gov',{delayMs:0,fetchImpl:async()=>{calls++;return {ok:false,status:404}}}),/404/);
  assert.equal(calls,1);
});
test('retry waits cannot exceed the shared request budget',async()=>{
  let calls=0;
  await assert.rejects(fetchSourceJson('https://example.gov',{timeoutMs:5,delayMs:100,fetchImpl:async()=>{calls++;throw new Error('connection unavailable')}}),/connection unavailable/);
  assert.equal(calls,1);
});

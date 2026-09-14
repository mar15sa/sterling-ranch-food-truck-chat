"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {summarize}=require("../scripts/quality-eval/usage");

test("usage observer counts every paid attempt, preserves responses, and captures no headers",async()=>{
  const {createObservedFetch}=require("../scripts/quality-eval/observe-fetch");
  const calls=[];let attempts=0;
  const observed=createObservedFetch(async(_url,init)=>{
    assert.equal(JSON.parse(init.body).model,"claude-sonnet-5");
    attempts++;
    if(attempts===1)throw new DOMException("Timed out","TimeoutError");
    return Response.json({model:"claude-sonnet-5",usage:{input_tokens:20,output_tokens:5},content:[{type:"text",text:"{}"}]});
  },{calls,modelsByStage:{"rules-search-planning":"claude-sonnet-5"}});
  const options={method:"POST",headers:{"x-api-key":"secret-never-save"},body:JSON.stringify({
    model:"claude-haiku-4-5",max_tokens:100,system:"You interpret resident questions for a search system",messages:[]})};
  await assert.rejects(observed("https://api.anthropic.com/v1/messages",options),{name:"TimeoutError"});
  const response=await observed("https://api.anthropic.com/v1/messages",options);
  assert.equal((await response.json()).usage.input_tokens,20);
  assert.equal(calls.length,2);assert.equal(calls[0].usage,null);
  assert.equal(calls[1].usage.output_tokens,5);assert.equal(calls[1].stage,"rules-search-planning");
  assert.ok(!JSON.stringify(calls).includes("secret-never-save"));
  assert.equal(summarize(calls).estimatedTotalUsd,null);
});

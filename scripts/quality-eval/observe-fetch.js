"use strict";
const { RATES, ensureAllowedModel }=require("./usage");
function stageFor(body) {
  if ((body.tools||[]).some(t=>t.name==="compose_requested_answer"))return "composition";
  if ((body.tools||[]).some(t=>["check_answer_acceptance","check_planned_answer_acceptance"].includes(t.name)))return "answer-acceptance";
  if ((body.tools||[]).some(t=>t.name==="assess_resident_answer"))return "answer-assessment";
  if ((body.tools||[]).some(t=>t.name==="route_community_question"))return "understanding";
  const system=typeof body.system==="string"?body.system:JSON.stringify(body.system||"");
  if(system.startsWith("You interpret resident questions for a search system"))return "rules-search-planning";
  if(system.startsWith("You rerank passages"))return "reranking";
  if(system.startsWith("You answer resident questions using only"))return "composition";
  if(system.includes("turning a grounded retrieval draft"))return "rules-rewrite";
  return "unclassified";
}
function createObservedFetch(fetchImpl, { calls=[], modelsByStage={}, capUsd=5, onCall=()=>{}, captureRequests=false }={}) {
  let reservedUsd=0;
  if(!Number.isFinite(capUsd)||capUsd<=0||capUsd>5)throw new Error("Evaluation cap must be at most $5");
  async function observed(input, init={}) {
    const url=new URL(typeof input==="string"||input instanceof URL?input:input.url);
    if(url.origin!=="https://api.anthropic.com"||url.pathname!=="/v1/messages")return fetchImpl(input,init);
    if(typeof init.body!=="string")throw new Error("Unsupported evaluation payload");
    const original=JSON.parse(init.body),stage=stageFor(original);
    const model=modelsByStage[stage]||original.model;
    ensureAllowedModel(model);
    const body={...original,model};
    if(body.stream)throw new Error("Streaming usage capture is not implemented");
    const encoded=JSON.stringify(body),r=RATES[model];
    const reserve=((Buffer.byteLength(encoded,"utf8")+1024)*r.input+(Number(body.max_tokens)||0)*r.output)/1e6;
    if(reservedUsd+reserve>capUsd)throw new Error("Evaluation reservation cap reached");
    reservedUsd+=reserve;
    const entry={stage,model,startedAt:new Date().toISOString(),usage:null,reservedUsd:reserve};
    if(captureRequests)entry.request=body; // caller must use only authored test questions, never resident traffic.
    calls.push(entry);
    const start=Date.now();
    try {
      const response=await fetchImpl(input,{...init,body:encoded});
      entry.httpStatus=response.status;
      try{const data=await response.clone().json();entry.usage=data.usage||null;entry.providerModel=data.model||null;entry.stopReason=data.stop_reason||null;}
      catch{entry.usage=null;entry.usageReadError=true;}
      return response;
    }catch(e){entry.errorType=e.name;throw e;}
    finally{entry.durationMs=Date.now()-start;onCall(entry);}
  }
  observed.reservedUsd=()=>reservedUsd;
  return observed;
}
module.exports={stageFor,createObservedFetch};

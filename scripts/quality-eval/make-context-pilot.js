"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {loadRulesIndex}=require("../../lib/rules-assistant");
function expandExactSiblingContext(source, documents) {
  const matches=documents.filter(d=>d.nodeId===source.nodeId && d.sourceUrl===source.sourceUrl && d.text===source.text);
  if(matches.length!==1)return {source,expanded:false,reason:"no-unique-exact-original-match"};
  const original=matches[0];
  if(!original.isSupplemental && (original.productId==null || original.jobId==null))return {source,expanded:false,reason:"missing-version-identity"};
  const siblings=documents.filter(d=>{
    if(d.sourceUrl!==original.sourceUrl)return false;
    if(original.isSupplemental){
      return Boolean(original.parentSupplementId && original.sourceTextHash) &&
        d.parentSupplementId===original.parentSupplementId && d.sourceTextHash===original.sourceTextHash;
    }
    return !d.isSupplemental && d.nodeId===original.nodeId &&
      d.productId===original.productId && d.jobId===original.jobId;
  }).sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true}));
  if(siblings.length<2)return {source,expanded:false,reason:"no-siblings"};
  const ids=siblings.map(d=>d.id);
  if(new Set(ids).size!==ids.length)return {source,expanded:false,reason:"duplicate-chunk-id"};
  return {source:{...source,text:siblings.map(d=>d.text).join("\n\n"),diagnosticContext:{
    originalTextSha256:crypto.createHash("sha256").update(source.text).digest("hex"),chunkIds:ids,
    sourceTextHash:original.sourceTextHash||null,jobId:original.jobId||null,
    status:"Diagnostic same-version context. Not a new source approval or resident-serving eligibility decision."}},
    expanded:true,reason:"exact-version-siblings"};
}
async function main(){
  const input=process.argv[2],output=process.argv[3];
  if(fs.existsSync(output))throw new Error("Use a new output directory");
  fs.mkdirSync(output,{recursive:true});
  const m=JSON.parse(fs.readFileSync(path.join(input,"manifest.json"),"utf8"));
  if(m.status!=="captured"||!m.revisionStable)throw new Error("Stable captured baseline required");
  const index=await loadRulesIndex(),changes=[],caseIds=["fence","lighting-process"];
  for(const id of caseIds){
    const row=JSON.parse(fs.readFileSync(path.join(input,id+".json"),"utf8"));
    row.response.sources=row.response.sources.map(source=>{
      const r=expandExactSiblingContext(source,index.documents);
      changes.push({caseId:id,nodeId:source.nodeId||source.id,...r.source.diagnosticContext,expanded:r.expanded,reason:r.reason});
      return r.source;
    });
    fs.writeFileSync(path.join(output,id+".json"),JSON.stringify(row,null,2)+"\n");
  }
  const manifest={...m,experiment:"Same prompt/models with complete matching-version sibling section context for two diagnostic questions",
    derivedFrom:path.resolve(input),derivedAt:new Date().toISOString(),diagnosticOnly:true,contextChanges:changes,caseIds,
    contextSha256:crypto.createHash("sha256").update(JSON.stringify(changes)).digest("hex")};
  fs.writeFileSync(path.join(output,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
  console.log(JSON.stringify(changes.filter(x=>x.expanded),null,2));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={expandExactSiblingContext};

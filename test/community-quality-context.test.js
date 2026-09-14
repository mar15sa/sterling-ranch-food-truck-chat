"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {expandExactSiblingContext}=require("../scripts/quality-eval/make-context-pilot");
test("complete section context includes only siblings from the exact source and publishing version",()=>{
  const source={nodeId:"section",sourceUrl:"https://official.example/rules",text:"Introduction"};
  const first={...source,id:"section::1",productId:1,jobId:2};
  const sibling={...first,id:"section::2",text:"Actual requirements"};
  const old={...sibling,id:"section::3",jobId:1,text:"Obsolete requirements"};
  const other={...sibling,id:"section::4",sourceUrl:"https://other.example/rules",text:"Other community"};
  const r=expandExactSiblingContext(source,[first,sibling,old,other]);
  assert.equal(r.expanded,true);assert.equal(r.source.text,"Introduction\n\nActual requirements");
  assert.equal(source.text,"Introduction"); // preserve original evidence
  assert.equal(expandExactSiblingContext({...source,text:"Changed introduction"},[first,sibling]).expanded,false);
});
test("supplement expansion requires matching parent and content hash; missing version never widens context",()=>{
  const source={nodeId:"fragment",sourceUrl:"https://official.example/policy.pdf",text:"Part one"};
  const first={...source,id:"1",isSupplemental:true,parentSupplementId:"parent",sourceTextHash:"hash-a"};
  const sibling={...first,id:"2",nodeId:"fragment-two",text:"Part two"};
  const changed={...sibling,id:"3",sourceTextHash:"hash-b",text:"Changed policy"};
  const r=expandExactSiblingContext(source,[first,sibling,changed]);
  assert.equal(r.source.text,"Part one\n\nPart two");
  assert.equal(expandExactSiblingContext(source,[{...source,id:"1"},{...source,id:"2",text:"More"}]).expanded,false);
});

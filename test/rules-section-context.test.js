const test = require("node:test");
const assert = require("node:assert/strict");
const { availableSectionContext } = require("../lib/rules-section-context");
const { answerRulesQuestion } = require("../lib/rules-assistant");
function fixtures() {
  const first = { id:"section::1",nodeId:"section",sourceUrl:"https://official.example/rules",communityId:"one",productId:1,jobId:2,text:"Approval is required." };
  return [first,{...first,id:"section::2",text:"Submit the attached specifications before work starts."}];
}
test("context recovers a requirement after a section split and preserves line structure",()=>{
  const docs=fixtures(),original={...docs[0]};
  const result=availableSectionContext(original,docs);
  assert.equal(result.text,docs.map(d=>d.text).join("\n\n"));
  assert.deepEqual(result.chunkIds,["section::1","section::2"]);
  assert.equal(original.text,"Approval is required.");
  assert.equal(result.coverage,"all-available-matching-chunks");
});
test("context does not mix communities, URLs, editions, or unmatched selected text",()=>{
  const docs=fixtures(),source=docs[0];
  const extras=[
    {...docs[1],communityId:"two",text:"Other community"},
    {...docs[1],jobId:3,text:"Different publishing version"},
    {...docs[1],sourceUrl:"https://other.example",text:"Other source"},
  ];
  assert.equal(availableSectionContext(source,[...docs,...extras]).text,docs.map(d=>d.text).join("\n\n"));
  assert.equal(availableSectionContext({...source,text:"Changed"},docs).expanded,false);
});
test("partial approvals and every unavailable sibling keep the original evidence boundary",()=>{
  const docs=fixtures();
  for(const restriction of [
    {ownerReviewApplied:true},{ownerReview:{approvedAnswerEvidence:"Only one approved claim"}},
    {reviewStatus:"pending-review"},{searchable:false},{supersededBy:"new-policy"},
    {expiresAt:"2020-01-01"},{effectiveDate:"2099-01-01"},{sourceLifecycle:"stale"}
  ]){
    const result=availableSectionContext(docs[0],[docs[0],{...docs[1],...restriction}]);
    assert.equal(result.expanded,false,JSON.stringify(restriction));
    assert.equal(result.text,docs[0].text);
  }
  assert.equal(availableSectionContext(docs[0],docs,{eligible:d=>d.id!==docs[1].id}).expanded,false);
});
test("supplement context requires the same approved document identity and text version",()=>{
  const docs=fixtures().map((d,i)=>({...d,nodeId:"part-"+i,isSupplemental:true,parentSupplementId:"policy",sourceTextHash:"hash"}));
  const changed={...docs[1],sourceTextHash:"different",text:"Changed"};
  assert.equal(availableSectionContext(docs[0],[...docs,changed]).expanded,true);
  assert.equal(availableSectionContext(docs[0],[docs[0],changed]).expanded,false);
  assert.equal(availableSectionContext({...docs[0],ownerReviewApplied:true},docs).expanded,false);
});
test("unknown ordering, gaps, duplicates, and oversized context are explicit partial evidence",()=>{
  const docs=fixtures();
  for(const other of [{...docs[1],id:"section::3"},{...docs[1],id:"unknown"},{...docs[1],id:"section::1"}])
    assert.equal(availableSectionContext(docs[0],[docs[0],other]).expanded,false);
  assert.equal(availableSectionContext(docs[0],docs,{maxChars:10}).reason,"context-budget");
  assert.equal(availableSectionContext(docs[0],docs,{maxChars:10}).text,docs[0].text);
});
test("fence answer evidence includes both indexed continuation options",async()=>{
  const result=await answerRulesQuestion("What kind of fence can I put in my backyard?",{searchMode:"legacy",llmMode:"off"});
  const source=result.sources.find(s=>/fencing standards/i.test(s.title));
  assert.ok(source);
  assert.match(source.text,/Three-rail cedar dimensional lumber/i);
  assert.match(source.text,/Homeowners may also elect to purchase the perimeter concrete/i);
  assert.equal(source.evidenceContext.expanded,true);
});
test("lighting process evidence retains approval and fixture submission context",async()=>{
  const result=await answerRulesQuestion("What is the process to get permanent lights approved for seasonal/holiday use?",{searchMode:"legacy",llmMode:"off"});
  const source=result.sources.find(s=>/Updated exterior lighting policy/i.test(s.title));
  assert.ok(source);
  assert.match(source.text,/cut sheets/i);
  assert.match(source.text,/DRC approval is required/i);
  assert.equal(source.evidenceContext.chunkIds.length,3);
});

const test=require("node:test"),assert=require("node:assert/strict");
const {budgetEvidenceText}=require("../lib/evidence-prompt-budget");
test("repeated context consumes the prompt body budget once without changing source eligibility",()=>{
  const source={communityId:"alpha",sourceUrl:"https://alpha.example/policy",text:"A complete section.",
    evidenceContext:{expanded:true,chunkIds:["a::1","a::2"],sourceTextHash:"version"}};
  const sources=[source,{...source,id:"second-citation"},{text:"A distinct requirement."}];
  const before=JSON.stringify(sources);
  const rows=budgetEvidenceText(sources,{maxChars:45});
  assert.equal(rows.length,3);
  assert.equal(rows[0].text,source.text);
  assert.equal(rows[1].text,"");
  assert.equal(rows[1].contextCoverage,"duplicate-evidence-already-provided");
  assert.equal(rows[2].text,sources[2].text);
  assert.equal(JSON.stringify(sources),before);
  assert.equal(budgetEvidenceText([source,{...source,communityId:"beta"}])[1].text,source.text);
});
test("prompt budget preserves a complete long section instead of cutting its exception",()=>{
  const text="Policy paragraph.\n".repeat(360)+"Final exception: this requirement does not apply to existing installations.";
  const rows=budgetEvidenceText([{text,sourceUrl:"https://official.example"}]);
  assert.equal(rows[0].text,text);
  assert.match(rows[0].text,/existing installations\.$/);
});
test("total budget uses an exact excerpt or reports omission without inventing complete coverage",()=>{
  const source={text:"First clause. Second clause with exception.",excerpt:"Second clause with exception."};
  const rows=budgetEvidenceText([source,{text:"Another entire section."}],{maxChars:30});
  assert.equal(rows[0].text,source.excerpt);assert.equal(rows[0].contextCoverage,"excerpt-only-budget");
  assert.equal(rows[1].text,"");assert.equal(rows[1].contextCoverage,"omitted-budget");
  assert.ok(rows.reduce((sum,r)=>sum+r.text.length,0)<=30);
});
test("projection stays the evidence even when the raw source has additional claims",()=>{
  const source={text:"Raw policy contains unapproved price.",excerpt:"Approved contact only.",questionSpecificExcerpt:true};
  const rows=budgetEvidenceText([source],{project:s=>s.questionSpecificExcerpt?s.excerpt:s.text});
  assert.equal(rows[0].text,"Approved contact only.");
  assert.equal(budgetEvidenceText([{...source,text:"long ".repeat(100)}],{maxChars:30})[0].text,"");
});

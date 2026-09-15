const test=require('node:test'),assert=require('node:assert/strict');
const {buildEvidenceContract,attachEvidenceContract}=require('../scripts/quality-eval/need-evidence-contract');
const plan={scope:'community',needs:[{id:'n1',request:'Which membership applies?',evidenceKind:'official-information'}]};
function packet(communityId='alpha'){return {communityId,sourceRouting:'all-static',sources:[{id:'s1',communityId,version:'v1',role:'governing-rule',text:'A membership rule',retrievedForNeedIds:['n1'],actions:[]}],actions:[],diagnostics:[],omissions:[]};}
test('information needs retain governing candidates without claiming relevance or completeness in two communities',()=>{
 for(const community of ['alpha','beta']){const p=packet(community),before=structuredClone(p),c=buildEvidenceContract(plan,p);assert.equal(c.needs[0].primaryEvidenceKind,'official-information');assert.equal(c.sources[0].role,'governing-rule');assert.equal(c.needs[0].semanticCoverage,'not-assessed');assert.equal(c.needs[0].candidateState,'factual-candidates-require-review');assert.deepEqual(p,before);}
});
test('navigation-only, no results and live failure remain different evidence states',()=>{
 const p=packet();p.sources[0].role='official-action';let c=buildEvidenceContract(plan,p);assert.equal(c.needs[0].candidateState,'navigation-only');assert.equal(c.sources[0].capability,'navigation-only');
 p.sources=[];p.diagnostics=[{needId:'n1',reason:'live-evidence-unavailable'}];c=buildEvidenceContract({...plan,needs:[{...plan.needs[0],evidenceKind:'live-operation'}]},p);assert.equal(c.needs[0].candidateState,'no-candidates');assert.equal(c.needs[0].retrievalDiagnostics[0].reason,'live-evidence-unavailable');assert.equal(c.needs[0].observations.length,2);
});
test('wrong tenants, source/action versions, unknown needs and expired live evidence cannot be inventoried',()=>{
 for(const change of [p=>p.sources[0].communityId='beta',p=>p.sources[0].version='',p=>p.sources[0].retrievedForNeedIds=['n2'],p=>p.actions=[{id:'a',sourceId:'s1',communityId:'alpha',version:'v2',url:'https://example.com',label:'Go'}],p=>Object.assign(p.sources[0],{role:'live-operation',checkedAt:'2026-09-14T00:00:00Z',staleAfter:'2026-09-14T01:00:00Z'})]){const p=packet();change(p);assert.throws(()=>buildEvidenceContract(plan,p,Date.parse('2026-09-15T00:00:00Z')));}
 assert.throws(()=>buildEvidenceContract(plan,{...packet(),sourceRouting:'per-need'}),/Exclusive/);
});
test('writer and checker attachment preserves their payload and cannot fabricate semantic approval',()=>{
 const r={system:'Check evidence',messages:[{role:'user',content:JSON.stringify({answer:'Draft',evidence:[{id:'s1',text:'A membership rule'}]})}]},before=structuredClone(r),result=attachEvidenceContract(r,plan,packet());assert.deepEqual(r,before);const payload=JSON.parse(result.messages[0].content);assert.equal(payload.answer,'Draft');assert.deepEqual(payload.evidence,JSON.parse(r.messages[0].content).evidence);assert.equal(payload.evidenceContract.status,'capability-inventory-not-verification');
});

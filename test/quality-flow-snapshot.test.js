const test=require('node:test'),assert=require('node:assert/strict');
const {validateSnapshot}=require('../scripts/quality-eval/flow-snapshot');
const {approvedFingerprint,inputFingerprint,VERIFIER_VERSION}=require('../scripts/revalidate-approved-community');
const {compositionSchema}=require('../scripts/quality-eval/full-flow-candidate');
function fixture(){
  const now=Date.parse('2026-09-14T12:00:00Z');
  const source={id:'approved',contentHash:'version-1',sourceUrl:'https://alpha.example/process',text:'Approved process',reviewStatus:'approved',checkedAt:'2026-09-13T11:00:00.000Z',staleAfter:'2026-09-14T11:00:00.000Z'};
  const baseline={communityId:'alpha',sources:[source],factLedger:[]};
  const index=structuredClone(baseline);Object.assign(index.sources[0],{checkedAt:'2026-09-14T11:00:00.000Z',staleAfter:'2026-09-15T11:00:00.000Z'});
  const attestation={status:'passed',verifierVersion:VERIFIER_VERSION,inputFingerprint:inputFingerprint(baseline),beforeApprovedFingerprint:approvedFingerprint(baseline),afterApprovedFingerprint:approvedFingerprint(index),gateErrors:[],checks:[{outcome:'renewed',sourceUrl:source.sourceUrl,sources:[{id:source.id,contentHash:source.contentHash}],checkedAt:index.sources[0].checkedAt,staleAfter:index.sources[0].staleAfter}]};
  return {index,baseline,attestation,options:{now,auditFn:()=>{}}};
}
test('flow snapshot requires a passing unchanged and unexpired revalidation before use',()=>{
  const f=fixture();let audits=0;
  assert.equal(validateSnapshot(f.index,f.attestation,f.baseline,{...f.options,auditFn:()=>audits++}),f.index);assert.equal(audits,1);
  for(const change of [x=>x.attestation.status='failed',x=>x.attestation.checks[0].outcome='review-required',x=>x.options.now=Date.parse('2026-09-16'),x=>x.options.now=Date.parse('2026-09-14T10:00Z'),x=>x.index.communityId='beta',x=>x.index.sources[0].contentHash='version-2',x=>x.index.sources[0].text='Unapproved different process',x=>x.index.sources[0].reviewStatus='owner-approved-new-scope',x=>x.index.sources[0].staleAfter='2026-12-01T00:00:00Z',x=>x.attestation.inputFingerprint='other-checkout']){
    const next=fixture();change(next);assert.throws(()=>validateSnapshot(next.index,next.attestation,next.baseline,next.options));
  }
  assert.throws(()=>validateSnapshot(f.index,f.attestation,f.baseline,{...f.options,auditFn:()=>{throw new Error('source-audit-failed');}}),/source-audit-failed/);
});
test('composer action selection is constrained to the packet inventory, not source IDs',()=>{
  const schema=compositionSchema({actions:[{id:'e-source-a0'},{id:'e-source-a1'}]});
  assert.deepEqual(schema.properties.actionIds.items.enum,['e-source-a0','e-source-a1']);
  assert.equal(schema.properties.actionIds.items.enum.includes('e-source'),false);
  assert.equal(Object.hasOwn(compositionSchema({actions:[]}).properties.actionIds,'maxItems'),false);
  const {draftIssues}=require('../scripts/quality-eval/full-flow-candidate');
  assert.ok(draftIssues({answer:'A supported gap',actionIds:['invented']},{sources:[],actions:[]}).includes('unknown-action'));
});
const {validateRulesSnapshot}=require('../scripts/quality-eval/flow-snapshot');
const {hash}=require('../scripts/quality-eval/flow-evidence');
const {acceptanceIssues}=require('../scripts/quality-eval/compact-acceptance-candidate');
test('rules verification binds all supplements and exact loaded evidence to community and time',()=>{
 const index={source:{sourceUrl:'https://rules.example/alpha',latestJobId:1,supplementalDocuments:[{sourceUrl:'https://alpha.example/policy'}]},documents:[{id:'one',text:'Approved rule'}]};
 const now=Date.parse('2026-09-14T12:00Z'),a={status:'passed',communityId:'alpha',sourceSnapshotHash:hash(index),baseSourceUrl:index.source.sourceUrl,latestJobId:1,sourcePublicationUnchanged:true,baseDocumentsUnchanged:true,checkedAt:'2026-09-14T11:00Z',staleAfter:'2026-09-15T11:00Z',checks:[{sourceUrl:'https://alpha.example/policy',status:'unchanged',approvedScopePreserved:true}]};
 assert.equal(validateRulesSnapshot(index,a,'alpha',now),index);
 for(const mutate of [x=>x.sourceSnapshotHash='other',x=>x.status='failed',x=>x.checks=[],x=>x.checks.push(x.checks[0]),x=>x.checks[0].approvedScopePreserved=false,x=>x.staleAfter='2026-09-13T11:00Z',x=>x.checkedAt='2026-09-15T11:00Z']){const b=structuredClone(a);mutate(b);assert.throws(()=>validateRulesSnapshot(index,b,'alpha',now));}
 assert.throws(()=>validateRulesSnapshot(index,a,'beta',now));
});
test('a partially supplied need is useful partial, never complete or unsupported',()=>{
 const value={outcome:'partial',hardFailures:[],needs:[{request:'Process and destination',status:'partial',supportSourceIds:['known']}]};
 assert.deepEqual(acceptanceIssues(value,['known']),[]);
 assert.ok(acceptanceIssues({...value,outcome:'complete'},['known']).length);
 assert.ok(acceptanceIssues({...value,outcome:'missing-evidence'},['known']).length);
 assert.ok(acceptanceIssues({...value,needs:[{...value.needs[0],supportSourceIds:[]}]},['known']).length);
});

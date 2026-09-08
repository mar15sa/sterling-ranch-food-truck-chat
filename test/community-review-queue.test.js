const test=require('node:test'),assert=require('node:assert/strict');
const {pendingReviewItems}=require('../lib/community-review-queue');
const item={recordType:'review-item',id:'review-1',sourceVersion:'version-1',createdAt:'2026-08-01T00:00:00Z'};
const decision=(choice,time='2026-08-02T00:00:00Z',extra={})=>({recordType:'decision',reviewId:item.id,sourceVersion:item.sourceVersion,decision:choice,decidedAt:time,...extra});
test('escalated and untouched reviews remain outstanding without resetting their original age',()=>{
 assert.deepEqual(pendingReviewItems([item]),[item]);
 assert.deepEqual(pendingReviewItems([item,decision('escalate')]),[item]);
});
test('each completed decision resolves only its exact reviewed version',()=>{
 for(const choice of ['approve-proposed','keep-current','mark-current-superseded','exclude-page']){
  assert.deepEqual(pendingReviewItems([item,decision(choice)]),[]);
  assert.deepEqual(pendingReviewItems([item,decision(choice,undefined,{sourceVersion:'old-version'})]),[item]);
 }
});
test('later escalation reopens a review and later resolution closes it regardless of input ordering',()=>{
 const older=decision('approve-proposed'),newer=decision('escalate','2026-08-03T00:00:00Z');
 assert.deepEqual(pendingReviewItems([newer,item,older]),[item]);
 assert.deepEqual(pendingReviewItems([newer,decision('keep-current','2026-08-04T00:00:00Z'),item,older]),[]);
});
test('ambiguous or undated decisions cannot silently clear an outstanding review',()=>{
 assert.deepEqual(pendingReviewItems([item,decision('approve-proposed'),decision('escalate')]),[item]);
 assert.deepEqual(pendingReviewItems([item,decision('approve-proposed','invalid-date')]),[item]);
});

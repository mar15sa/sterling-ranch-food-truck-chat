const test = require('node:test');
const assert = require('node:assert/strict');
test('trial configuration identity notices model changes without including credentials', () => {
  const {configurationFingerprint}=require('../lib/community-soak-evidence');
  const base={COMMUNITY_LLM_MODEL:'first',ANTHROPIC_API_KEY:'secret-a'};
  assert.notEqual(configurationFingerprint(base),configurationFingerprint({...base,COMMUNITY_LLM_MODEL:'second'}));
  assert.equal(configurationFingerprint(base),configurationFingerprint({...base,ANTHROPIC_API_KEY:'secret-b'}));
});
const { resumeEvidence } = require('../lib/community-soak-evidence');
const identity = { baseUrl:'https://staging.example', expectedFingerprint:'bundle', expectedRevision:'commit', durationHours:24, checkCount:97, intervalMs:900000 };
const now = Date.parse('2026-09-06T12:00:00Z');
const checkpoint = { ...identity, result:'in-progress', completedChecks:17, updatedAt:new Date(now-900000).toISOString() };
test('hosted trial resumes only matching continuous evidence', () => {
  assert.equal(resumeEvidence(checkpoint,identity,now),checkpoint);
  for (const key of ['baseUrl','expectedFingerprint','expectedRevision','durationHours','checkCount','intervalMs']) {
    assert.throws(()=>resumeEvidence(checkpoint,{...identity,[key]:'changed'},now), /identity/);
  }
  assert.throws(()=>resumeEvidence({...checkpoint,result:'failed'},identity,now),/unfinished/);
  assert.throws(()=>resumeEvidence({...checkpoint,updatedAt:new Date(now-1300000).toISOString()},identity,now),/gap/);
  assert.throws(()=>resumeEvidence({...checkpoint,completedChecks:97},identity,now),/count/);
});

"use strict";
const fs=require('node:fs');
const {audit}=require('../check-community-sources');
const {approvedFingerprint,inputFingerprint,VERIFIER_VERSION}=require('../revalidate-approved-community');
const {sourceEvidenceIdentity}=require('../../lib/community-approved-revalidation');
function validateSnapshot(index,attestation,baseline,{now=Date.now(),auditFn=audit}={}){
  if(!index?.communityId||index.communityId!==baseline?.communityId)throw new Error('Snapshot community mismatch');
  if(attestation?.status!=='passed'||attestation.verifierVersion!==VERIFIER_VERSION||attestation.gateErrors?.length)
    throw new Error('Require a fully passing community revalidation attestation');
  if(attestation.inputFingerprint!==inputFingerprint(baseline)||
    attestation.beforeApprovedFingerprint!==approvedFingerprint(baseline)||
    attestation.afterApprovedFingerprint!==approvedFingerprint(index)||
    attestation.beforeApprovedFingerprint!==attestation.afterApprovedFingerprint)
    throw new Error('Revalidation snapshot identity mismatch');
  if(index.sources.length!==baseline.sources.length||index.sources.some(source=>{
    const previous=baseline.sources.find(s=>s.id===source.id);
    return !previous||sourceEvidenceIdentity(index,source)!==sourceEvidenceIdentity(baseline,previous);
  }))throw new Error('Snapshot changed source evidence or approval scope');
  if(!Array.isArray(attestation.checks)||!attestation.checks.length)throw new Error('Missing revalidation checks');
  for(const check of attestation.checks){
    const checked=Date.parse(check.checkedAt),expires=Date.parse(check.staleAfter);
    if(check.outcome!=='renewed'||!Number.isFinite(checked)||checked>now||!Number.isFinite(expires)||expires<now)
      throw new Error('Revalidation is incomplete or expired');
    for(const expected of check.sources||[]){
      const source=index.sources.find(s=>s.id===expected.id&&s.contentHash===expected.contentHash&&s.sourceUrl===check.sourceUrl);
      if(!source||source.checkedAt!==check.checkedAt||source.staleAfter!==check.staleAfter)
        throw new Error('Snapshot does not match renewed source identity and dates');
    }
  }
  auditFn(index);
  return index;
}
function loadSnapshot(indexPath,attestationPath,baseline){
  if(!indexPath||!attestationPath)throw new Error('Supply a refreshed community index and its passing attestation before paid comparison');
  const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
  const index=read(indexPath),attestation=read(attestationPath);
  validateSnapshot(index,attestation,baseline);
  return {index,attestation};
}
module.exports={validateSnapshot,loadSnapshot};

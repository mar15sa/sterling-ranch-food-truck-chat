#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { buildFactLedger, factLedgerStatus, resolveFactLedger, SENSITIVE_FACETS } = require('../lib/community-truth');
const { scopedApprovalsForVersion } = require('../lib/canonical-source-ledger');
const { actionIdentity } = require('../lib/community-approved-revalidation');
const ledger = require('../data/canonical-source-ledger.json');
const { approvals, buildApprovedV7Sources } = require('../data/community-source-approvals-v7');

function applyCommunitySourceApprovalsV7(index, { sourceBuilder = buildApprovedV7Sources } = {}) {
  const additions = sourceBuilder();
  for (const source of additions) for (const fact of [...(source.facts || []), ...(source.actions || [])]) {
    const approval = scopedApprovalsForVersion(ledger, source, approvals.communityId).find((candidate) =>
      candidate.decisionId === fact.reviewDecisionId
      && (candidate.approvedClaims || []).includes(fact.approvalClaim));
    if (!approval) throw new Error(`${fact.id} is outside its exact canonical decision.`);
    if (fact.url) {
      const matches = (approval.approvedActions || []).some((candidate) =>
        actionIdentity([{ ...candidate.display, url: candidate.evidence.url }]) === actionIdentity([fact])
        && JSON.stringify(candidate.evidence) === JSON.stringify(fact.evidence));
      if (!matches) throw new Error(`${fact.id} does not match its reviewed action proof.`);
    }
    fact.sourceVersion = source.contentHash;
  }

  const ids = new Set(additions.map((source) => source.id));
  const next = {
    ...index,
    sources: [...(index.sources || []).filter((source) => !ids.has(source.id)), ...additions],
  };
  next.sourceCount = next.sources.length;
  next.factLedger = buildFactLedger(next, {
    previousLedger: index.factLedger || [],
    observedAt: approvals.decidedAt,
  });
  const resolved = resolveFactLedger(next.factLedger, { factAuthority: next.factAuthority });
  const status = factLedgerStatus(next, Date.parse(approvals.decidedAt));
  next.truthStatus = {
    ...next.truthStatus,
    generatedAt: approvals.decidedAt,
    totalFactCount: status.totalFactCount,
    approvedFactCount: status.approvedFactCount,
    candidateFactCount: status.candidateFactCount,
    staleFactCount: status.staleFactCount,
    conflictedFactCount: resolved.unresolvedSensitive.length,
    retirementPendingCount: status.retirementPendingCount,
    pendingSensitiveReviewCount: next.factLedger.filter((fact) =>
      fact.reviewStatus === 'candidate' && SENSITIVE_FACETS.has(fact.facet)
      && fact.lifecycle !== 'retired').length,
    unresolvedConflictCount: resolved.unresolved.length,
    unresolvedSensitiveConflictCount: resolved.unresolvedSensitive.length,
  };
  return next;
}

if (require.main === module) {
  const file = path.join(__dirname, '..', 'data', 'community-index.json');
  const index = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, `${JSON.stringify(applyCommunitySourceApprovalsV7(index), null, 2)}\n`);
}

module.exports = { applyCommunitySourceApprovalsV7 };

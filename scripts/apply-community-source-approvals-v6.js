const fs = require('node:fs');
const path = require('node:path');
const { buildFactLedger, resolveFactLedger } = require('../lib/community-truth');
const { scopedApprovalsForVersion } = require('../lib/canonical-source-ledger');
const { actionIdentity } = require('../lib/community-approved-revalidation');
const ledger = require('../data/canonical-source-ledger.json');
const { approvals, approvedActionProofs, buildApprovedV6Sources } = require('../data/community-source-approvals-v6');

function applyCommunitySourceApprovalsV6(index, { sourceBuilder = buildApprovedV6Sources } = {}) {
  const additions = sourceBuilder();
  for (const source of additions) for (const item of [...source.facts, ...source.actions]) {
    const scoped = scopedApprovalsForVersion(ledger, source, approvals.communityId);
    const approval = scoped.find(candidate => candidate.decisionId === item.reviewDecisionId
      && (candidate.approvedClaims || []).includes(item.approvalClaim));
    if (!approval) throw new Error(`${item.id} is outside its exact canonical decision.`);
    if (item.url) {
      const proof = approval.approvedActions || approvedActionProofs[item.reviewDecisionId] || [];
      const matches = proof.some(candidate => actionIdentity([{ ...candidate.display, url: candidate.evidence.url }]) === actionIdentity([item])
        && JSON.stringify(candidate.evidence) === JSON.stringify(item.evidence));
      if (!matches) throw new Error(`${item.id} does not match the reviewed action identity for ${item.reviewDecisionId}.`);
    }
    item.sourceVersion = source.contentHash;
  }

  const ids = new Set(additions.map(source => source.id));
  const next = { ...index, sources: [...(index.sources || []).filter(source => !ids.has(source.id)), ...additions] };
  next.sourceCount = next.sources.length;
  const facts = buildFactLedger({ ...next, sources: additions }, { trusted: true, observedAt: approvals.decidedAt });
  next.factLedger = [...(index.factLedger || []).filter(fact => !ids.has(fact.sourceId)), ...facts];
  const resolved = resolveFactLedger(next.factLedger, { factAuthority: next.factAuthority });
  next.truthStatus = {
    ...next.truthStatus,
    generatedAt: approvals.decidedAt,
    totalFactCount: next.factLedger.length,
    approvedFactCount: next.factLedger.filter(fact => fact.reviewStatus === 'approved').length,
    unresolvedConflictCount: resolved.unresolved.length,
    unresolvedSensitiveConflictCount: resolved.unresolvedSensitive.length,
  };
  return next;
}

if (require.main === module) {
  const file = path.join(__dirname, '..', 'data', 'community-index.json');
  const index = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, `${JSON.stringify(applyCommunitySourceApprovalsV6(index), null, 2)}\n`);
}

module.exports = { applyCommunitySourceApprovalsV6 };

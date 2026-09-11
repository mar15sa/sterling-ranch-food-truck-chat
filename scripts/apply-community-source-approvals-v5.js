const fs = require('node:fs');
const path = require('node:path');
const { buildFactLedger, resolveFactLedger } = require('../lib/community-truth');
const { scopedApprovalsForVersion } = require('../lib/canonical-source-ledger');
const ledger = require('../data/canonical-source-ledger.json');
const { approvals, approvedActionProofs, buildApprovedV5Sources } = require('../data/community-source-approvals-v5');
const { actionIdentity } = require('../lib/community-approved-revalidation');
function applyCommunitySourceApprovalsV5(index, { sourceBuilder = buildApprovedV5Sources } = {}) {
  const additions = sourceBuilder();
  for (const source of additions) for (const item of [...source.facts, ...source.actions]) {
    const scoped = scopedApprovalsForVersion(ledger, source, approvals.communityId);
    const approval = scoped.find(a => (a.approvedClaims || []).includes(item.approvalClaim) && a.decisionId === item.reviewDecisionId);
    if (!approval) throw new Error(`${item.id} is outside its exact canonical decision.`);
    if (item.url) {
      const proof = approval.approvedActions || approvedActionProofs[item.reviewDecisionId] || [];
      const expected = proof.map(([label, url, actionType]) => ({ label, url, actionType }));
      if (!expected.some(candidate => actionIdentity([candidate]) === actionIdentity([item]))) throw new Error(`${item.id} does not match the reviewed action identity for ${item.reviewDecisionId}.`);
    }
    item.sourceVersion = source.contentHash;
  }
  const ids = new Set(additions.map(s => s.id));
  const next = { ...index, sources: [...(index.sources || []).filter(s => !ids.has(s.id)), ...additions] };
  next.sourceCount = next.sources.length;
  const facts = buildFactLedger({ ...next, sources: additions }, { trusted: true, observedAt: approvals.decidedAt });
  next.factLedger = [...(index.factLedger || []).filter(f => !ids.has(f.sourceId)), ...facts];
  const resolved = resolveFactLedger(next.factLedger, { factAuthority: next.factAuthority });
  next.truthStatus = { ...next.truthStatus, generatedAt: approvals.decidedAt, totalFactCount: next.factLedger.length, approvedFactCount: next.factLedger.filter(f => f.reviewStatus === 'approved').length, unresolvedConflictCount: resolved.unresolved.length, unresolvedSensitiveConflictCount: resolved.unresolvedSensitive.length };
  return next;
}
if (require.main === module) { const file = path.join(__dirname, '..', 'data', 'community-index.json'); fs.writeFileSync(file, `${JSON.stringify(applyCommunitySourceApprovalsV5(JSON.parse(fs.readFileSync(file, 'utf8'))), null, 2)}\n`); }
module.exports = { applyCommunitySourceApprovalsV5 };

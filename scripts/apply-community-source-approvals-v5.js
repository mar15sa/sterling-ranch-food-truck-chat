const fs = require('node:fs');
const path = require('node:path');
const { buildFactLedger, resolveFactLedger } = require('../lib/community-truth');
const { scopedApprovalsForVersion } = require('../lib/canonical-source-ledger');
const ledger = require('../data/canonical-source-ledger.json');
const { approvals, buildApprovedV5Sources } = require('../data/community-source-approvals-v5');
function applyCommunitySourceApprovalsV5(index) {
  const additions = buildApprovedV5Sources();
  for (const source of additions) for (const item of [...source.facts, ...source.actions]) {
    const claims = scopedApprovalsForVersion(ledger, source, approvals.communityId).flatMap(a => (a.approvedClaims || []).map(c => [c, a.decisionId]));
    if (!claims.some(([claim, decision]) => claim === item.approvalClaim && decision === item.reviewDecisionId)) throw new Error(`${item.id} is outside its exact canonical decision.`);
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

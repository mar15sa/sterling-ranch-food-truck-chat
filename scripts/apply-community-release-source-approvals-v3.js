const fs = require('node:fs');
const path = require('node:path');
const { buildFactLedger, resolveFactLedger } = require('../lib/community-truth');
const { scopedApprovalsForVersion } = require('../lib/canonical-source-ledger');
const canonicalLedger = require('../data/canonical-source-ledger.json');
const { APPROVAL_TIME, buildApprovedSources } = require('../data/community-release-source-approved-sources');
const root = path.join(__dirname, '..');
function applyCommunityReleaseSourceApprovals(index) {
  const additions = buildApprovedSources(index).map((source) => {
    const claims = new Map(scopedApprovalsForVersion(canonicalLedger, source, 'sterling-ranch').flatMap((approval) => (approval.approvedClaims || []).map((claim) => [claim, approval.decisionId])));
    for (const item of [...source.facts, ...source.actions]) {
      if (claims.get(item.approvalClaim) !== item.reviewDecisionId) throw new Error(`${item.id} is outside its exact approved source decision.`);
      item.sourceVersion = source.contentHash;
    }
    return source;
  });
  const ids = new Set(additions.map((source) => source.id));
  const next = { ...index, sources: [...(index.sources || []).filter((source) => !ids.has(source.id)), ...additions] };
  next.sourceCount = next.sources.length;
  const facts = buildFactLedger({ ...next, sources: additions }, { trusted: true, observedAt: APPROVAL_TIME });
  next.factLedger = [...(index.factLedger || []).filter((fact) => !ids.has(fact.sourceId)), ...facts];
  const resolved = resolveFactLedger(next.factLedger, { factAuthority: next.factAuthority });
  next.truthStatus = { ...next.truthStatus, generatedAt: APPROVAL_TIME, totalFactCount: next.factLedger.length, approvedFactCount: next.factLedger.filter((fact) => fact.reviewStatus === 'approved').length, unresolvedConflictCount: resolved.unresolved.length, unresolvedSensitiveConflictCount: resolved.unresolvedSensitive.length };
  return next;
}
if (require.main === module) { const target = path.join(root, 'data', 'community-index.json'); fs.writeFileSync(target, `${JSON.stringify(applyCommunityReleaseSourceApprovals(JSON.parse(fs.readFileSync(target, 'utf8'))), null, 2)}\n`); }
module.exports = { applyCommunityReleaseSourceApprovals };

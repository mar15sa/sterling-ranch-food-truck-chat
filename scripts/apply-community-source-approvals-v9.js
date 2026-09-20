#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { actionIdentity } = require('../lib/community-approved-revalidation');
const { scopedApprovalsForVersion } = require('../lib/canonical-source-ledger');
const { buildReviewedSources, sourceUrlIdentity } = require('../lib/community-reviewed-package');
const { buildFactLedger } = require('../lib/community-truth');
const { refreshTruthStatus } = require('./revalidate-approved-community');
const { buildLedger } = require('./build-canonical-source-ledger');
const approvals = require('../data/community-source-approvals-v9.json');

const SOURCE_IDS = {
  'trash-recurring-service-20260919': 'approved-trash-recurring-service',
  'recycling-tips-visual-link-20260919': 'approved-recycling-tips-visual-link',
  'architectural-community-standards-20260919': 'approved-complete-cab-review-20260914-dc4ed3f4a876',
};

function applyCommunitySourceApprovalsV9(index) {
  const ledger = buildLedger();
  const additions = buildReviewedSources(approvals);
  for (const source of additions) {
    const decisionId = source.facts[0]?.reviewDecisionId || source.actions[0]?.reviewDecisionId;
    source.id = SOURCE_IDS[decisionId] || source.id;
    const canonical = scopedApprovalsForVersion(ledger, source, approvals.communityId);
    for (const item of [...source.facts, ...source.actions]) {
      const decision = canonical.find((candidate) => candidate.decisionId === item.reviewDecisionId
        && (candidate.approvedClaims || []).includes(item.approvalClaim));
      if (!decision) throw new Error(`${item.id} is outside its exact approved source decision.`);
      if (item.url) {
        const matches = (decision.approvedActions || []).some((candidate) =>
          actionIdentity([{ ...candidate.display, url: candidate.evidence.url }]) === actionIdentity([item])
          && JSON.stringify(candidate.evidence) === JSON.stringify(item.evidence));
        if (!matches) throw new Error(`${item.id} does not match its reviewed action proof.`);
      }
    }
  }

  const replaceUrls = new Set(additions.map((source) => sourceUrlIdentity(source.sourceUrl)));
  const next = structuredClone(index);
  next.sources = next.sources.filter((source) => !replaceUrls.has(sourceUrlIdentity(source.sourceUrl)));
  next.sources.push(...additions);
  for (const page of next.pages || []) {
    const url = page.sourceUrl || page.url;
    if (url && replaceUrls.has(sourceUrlIdentity(url))) {
      page.indexedSourceIds = additions
        .filter((source) => sourceUrlIdentity(source.sourceUrl) === sourceUrlIdentity(url))
        .map((source) => source.id);
    }
  }
  next.sourceCount = next.sources.length;
  next.factLedger = buildFactLedger(next, { previousLedger: index.factLedger || [], observedAt: approvals.decidedAt });
  refreshTruthStatus(next, approvals.decidedAt);
  return { next, ledger };
}

if (require.main === module) {
  const root = path.join(__dirname, '..');
  const indexPath = path.join(root, 'data', 'community-index.json');
  const ledgerPath = path.join(root, 'data', 'canonical-source-ledger.json');
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const { next, ledger } = applyCommunitySourceApprovalsV9(index);
  fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  fs.writeFileSync(indexPath, `${JSON.stringify(next, null, 2)}\n`);
  console.log(JSON.stringify({ sources: next.sources.length, approvedFingerprintInput: approvals.decisionId }));
}

module.exports = { applyCommunitySourceApprovalsV9 };

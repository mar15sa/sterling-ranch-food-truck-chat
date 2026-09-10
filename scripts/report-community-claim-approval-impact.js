#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { factApprovalIsExplicit, factIsAnswerable } = require('../lib/community-truth');
const { isDynamicSource } = require('../lib/community-source-identity');
const { canonicalProjectionEntries } = require('../lib/community-source-answerability');

const indexFlag = process.argv.indexOf('--index');
const indexPath = path.resolve(indexFlag >= 0 && process.argv[indexFlag + 1]
  ? process.argv[indexFlag + 1]
  : path.join(__dirname, '..', 'data', 'community-index.json'));
const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const ledger = Array.isArray(index.factLedger) ? index.factLedger : [];
const approvedLabels = ledger.filter(entry => ['approved', 'kept-current'].includes(entry.reviewStatus));
const explicit = approvedLabels.filter(factApprovalIsExplicit);
const metadataWithoutDecision = approvedLabels.filter(entry => entry.reviewedAt && entry.reviewedBy && !entry.reviewDecisionId);
const currentVersions = new Set((index.sources || []).map(source => `${source.id}:${source.contentHash}`));
const staticVersions = new Set((index.sources || []).filter(source => !isDynamicSource(source))
  .map(source => `${source.id}:${source.contentHash}`));
const explicitVersions = new Set(explicit.map(entry => `${entry.sourceId}:${entry.sourceVersion}`));
const canonicalProjections = (index.sources || []).filter(source => !isDynamicSource(source))
  .flatMap(source => canonicalProjectionEntries(source, index));

console.log(JSON.stringify({
  indexPath,
  migrationMode: index.truthStatus?.migrationMode || '',
  totalFactCount: ledger.length,
  approvedLabelCount: approvedLabels.length,
  explicitVersionBoundApprovalCount: explicit.length,
  inheritedApprovalLabelCount: approvedLabels.length - explicit.length,
  reviewMetadataWithoutDecisionCount: metadataWithoutDecision.length,
  baselineLabelOnlyCount: approvedLabels.length - explicit.length - metadataWithoutDecision.length,
  answerableFactCountNow: ledger.filter(entry => factIsAnswerable(entry)).length,
  canonicalClaimActionProjectionCount: canonicalProjections.length,
  canonicalActionProjectionCount: canonicalProjections.filter(entry => entry.factType === 'link').length,
  staleOrChangedDecisionCount: explicit.filter(entry => !currentVersions.has(`${entry.sourceId}:${entry.sourceVersion}`)).length,
  staticSourceVersionCount: staticVersions.size,
  staticSourceVersionsWithApprovedClaims: [...staticVersions].filter(version => explicitVersions.has(version)).length,
  staticSourceVersionsWithheldPendingDecisions: [...staticVersions].filter(version => !explicitVersions.has(version)).length,
}, null, 2));

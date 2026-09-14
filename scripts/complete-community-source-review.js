#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { createReviewPackage, buildReviewedSources, sourceUrlIdentity } = require('../lib/community-reviewed-package');
const { buildFactLedger } = require('../lib/community-truth');
const { refreshTruthStatus } = require('./revalidate-approved-community');
const { applyReviewDispositions } = require('./apply-community-review-dispositions');

function writeJson(file, value) { fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }

function main() {
  const root = path.join(__dirname, '..');
  const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  const records = ['property', 'utilities', 'operations'].flatMap(group => {
    const value = read(`artifacts/source-review-2026-09-14/${group}.json`);
    return Array.isArray(value) ? value : value.records;
  });
  const audit = read('data/community-full-url-audit.json');
  const reviewed = new Map(records.map(record => [record.sourceUrl, record]));
  const missing = audit.records.filter(record => ['review-required', 'unavailable-recheck'].includes(record.disposition)
    && !reviewed.has(record.sourceUrl));
  if (missing.length) throw new Error(`Unreviewed sources: ${missing.map(record => record.sourceUrl).join(', ')}`);
  const decidedAt = new Date().toISOString();
  const packageData = createReviewPackage(records, {
    communityId: audit.communityId, decidedAt, decisionId: 'complete-cab-review-20260914',
  });
  writeJson(path.join(root, 'data/community-source-approvals-v8.json'), packageData);
  const { buildLedger } = require('./build-canonical-source-ledger');
  const canonicalLedger = buildLedger();
  writeJson(path.join(root, 'data/canonical-source-ledger.json'), canonicalLedger);
  const index = read('data/community-index.json');
  const additions = buildReviewedSources(packageData);
  const replaceUrls = new Set(records.flatMap(record => [record.sourceUrl, record.canonicalSourceUrl].filter(Boolean).map(sourceUrlIdentity)));
  // Keep observations in the review artifact. Remove their old extraction chunks
  // from runtime so only the new reviewed projection remains answer eligible.
  index.sources = index.sources.filter(source => !source.id.startsWith('approved-complete-cab-review-20260914-')
    && !replaceUrls.has(sourceUrlIdentity(source.sourceUrl)));
  index.sources.push(...additions);
  for (const page of index.pages || []) {
    const url = page.sourceUrl || page.url;
    if (url && replaceUrls.has(sourceUrlIdentity(url))) {
      page.indexedSourceIds = additions.filter(source => sourceUrlIdentity(source.sourceUrl) === sourceUrlIdentity(url)).map(source => source.id);
    }
  }
  index.sourceCount = index.sources.length;
  index.factLedger = buildFactLedger(index, { previousLedger: index.factLedger });
  refreshTruthStatus(index, decidedAt);
  writeJson(path.join(root, 'data/community-index.json'), index);
  const overrides = { schemaVersion: 1, communityId: audit.communityId, reviewedAt: decidedAt,
    records: [...records.map(({ fullText, claims, actions, ...record }) => ({ ...record,
      disposition: record.disposition === 'blocked' ? 'review-required' : record.disposition,
      approvedClaimCount: claims?.length || 0, approvedActionCount: actions?.length || 0,
      approvedClaims: (claims || []).map(claim => claim.text),
    })), ...read('artifacts/source-review-2026-09-14/role-corrections.json')] };
  writeJson(path.join(root, 'data/community-source-review-completion.json'), overrides);
  writeJson(path.join(root, 'data/community-full-url-audit.json'), applyReviewDispositions(audit, overrides));
  const documentScope = read('data/community-document-dispositions.json');
  const documentReview = new Map(records.filter(record => /\/DocumentCenter\/View\//i.test(record.sourceUrl))
    .map(record => [record.sourceUrl.match(/\/DocumentCenter\/View\/(\d+)/i)[1], record]));
  for (const item of documentScope.records) {
    const reviewedDocument = documentReview.get(item.documentId);
    if (!reviewedDocument || !['retained-review-required', 'retained-specialist-review', 'retained-reviewed'].includes(item.disposition)) continue;
    if (reviewedDocument.disposition === 'answer-evidence') {
      item.disposition = 'retained-reviewed';
      item.reason = reviewedDocument.reason;
      item.reviewedAt = reviewedDocument.checkedAt;
      item.withheldClaims = reviewedDocument.withheldClaims || [];
      documentScope.answerReadiness.activeEvidenceDocumentIds = [...new Set([...documentScope.answerReadiness.activeEvidenceDocumentIds, item.documentId])];
      documentScope.answerReadiness.heldForReviewDocumentIds = documentScope.answerReadiness.heldForReviewDocumentIds.filter(id => id !== item.documentId);
      documentScope.answerReadiness.heldDetails = documentScope.answerReadiness.heldDetails.filter(detail => detail.documentId !== item.documentId);
    }
  }
  writeJson(path.join(root, 'data/community-document-dispositions.json'), documentScope);
  console.log(JSON.stringify({ reviewed: records.length, approvedVersions: additions.length,
    facts: additions.reduce((n, source) => n + source.facts.length, 0),
    actions: additions.reduce((n, source) => n + source.actions.length, 0),
    blocked: records.filter(record => record.disposition === 'blocked').map(record => record.sourceUrl) }));
}

if (require.main === module) main();
module.exports = { main };

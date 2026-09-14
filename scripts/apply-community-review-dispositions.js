#!/usr/bin/env node
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

function applyReviewDispositions(audit, completion) {
  const updates = new Map(completion.records.map(record => [record.sourceUrl, record]));
  for (const record of audit.records) {
    const update = updates.get(record.sourceUrl);
    if (!update) continue;
    Object.assign(record, {
      title: update.title || record.title, disposition: update.disposition, reason: update.reason,
      reviewedAt: update.checkedAt, reviewedContentHash: update.contentHash || '',
      approvedClaimCount: update.approvedClaimCount, approvedActionCount: update.approvedActionCount,
      approvedClaims: update.approvedClaims || [], withheldClaims: update.withheldClaims || [],
      verification: update.verification,
    });
  }
  audit.contentReviewedAt = completion.reviewedAt;
  const all = audit.records;
  const inScope = all.filter(record => record.scopeStatus === 'in-scope');
  const primary = inScope.filter(record => !['duplicate', 'technical-exclusion'].includes(record.disposition));
  const count = (records, disposition) => records.filter(record => record.disposition === disposition).length;
  audit.totals.primaryInScope = primary.length;
  audit.totals.byDisposition = Object.fromEntries([...new Set(all.map(record => record.disposition))].sort().map(d => [d, count(all, d)]));
  for (const category of audit.categories) {
    const records = primary.filter(record => record.categoryIds.includes(category.id));
    Object.assign(audit.totals.categories[category.id], { primarySources: records.length,
      pages: records.filter(record => record.kind === 'page').length,
      documents: records.filter(record => record.kind === 'document').length,
      answerEvidence: count(records, 'answer-evidence'), safeLink: count(records, 'safe-link'), liveFeed: count(records, 'live-feed'),
      reviewRequired: count(records, 'review-required'), unavailableRecheck: count(records, 'unavailable-recheck'), excluded: count(records, 'excluded'),
    });
  }
  return audit;
}

if (require.main === module) {
  const flag = process.argv.indexOf('--baseline-ref');
  const baseline = flag >= 0
    ? JSON.parse(execFileSync('git', ['show', `${process.argv[flag + 1]}:data/community-full-url-audit.json`], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }))
    : JSON.parse(fs.readFileSync('data/community-full-url-audit.json', 'utf8'));
  const result = applyReviewDispositions(baseline, JSON.parse(fs.readFileSync('data/community-source-review-completion.json', 'utf8')));
  fs.writeFileSync('data/community-full-url-audit.json', `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result.totals));
}
module.exports = { applyReviewDispositions };

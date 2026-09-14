const test = require('node:test');
const assert = require('node:assert/strict');
const { applyReviewDispositions } = require('../scripts/apply-community-review-dispositions');
const { sourceUrlIdentity, validateReviewRecord, buildReviewedSources } = require('../lib/community-reviewed-package');
const audit = require('../data/community-full-url-audit.json');
const completion = require('../data/community-source-review-completion.json');
const packageData = require('../data/community-source-approvals-v8.json');
const groups = ['property', 'utilities', 'operations'].map(group => {
  const value = require(`../artifacts/source-review-2026-09-14/${group}.json`);
  return { group, records: value.records || value };
});
const reviews = groups.flatMap(group => group.records);
const corrections = require('../artifacts/source-review-2026-09-14/role-corrections.json');
const byUrl = new Map(audit.records.map(record => [record.sourceUrl, record]));

test('completed source review accounts once for all 104 assigned sources and retains an explicit disposition', () => {
  assert.deepEqual(groups.map(group => [group.group, group.records.length]), [['property', 34], ['utilities', 24], ['operations', 46]]);
  assert.equal(reviews.length, 104);
  assert.equal(new Set(reviews.map(record => record.sourceUrl)).size, 104);
  assert.equal(new Set(completion.records.map(record => record.sourceUrl)).size, completion.records.length);
  for (const record of reviews) {
    assert.doesNotThrow(() => validateReviewRecord(record), record.sourceUrl);
    assert.ok(['answer-evidence', 'safe-link', 'excluded', 'live-feed', 'duplicate'].includes(record.disposition), record.sourceUrl);
    const saved = byUrl.get(record.sourceUrl);
    assert.ok(saved, `The full inventory lost ${record.sourceUrl}`);
    assert.equal(saved.disposition, record.disposition, record.sourceUrl);
    assert.ok(completion.records.some(item => item.sourceUrl === record.sourceUrl), record.sourceUrl);
    assert.ok(record.reason.length > 40 && record.verification.currentness && record.verification.completeness, record.sourceUrl);
  }
  assert.equal(audit.records.filter(record => ['review-required', 'unavailable-recheck'].includes(record.disposition)).length, 0);
});

test('disposition reconciliation preserves all 1631 inventory URLs and unrelated classifications', () => {
  assert.equal(audit.records.length, 1631, 'A content-review rebuild must not shrink the full crawl inventory to reviewed/indexed sources');
  assert.equal(new Set(audit.records.map(record => record.sourceUrl)).size, 1631);
  assert.equal(audit.totals.audited, audit.records.length);
  assert.equal(audit.totals.inScope, audit.records.filter(record => record.scopeStatus === 'in-scope').length);
  assert.equal(audit.totals.outOfScope, audit.records.filter(record => record.scopeStatus !== 'in-scope').length);
  assert.equal(Object.values(audit.totals.byDisposition).reduce((sum, count) => sum + count, 0), 1631);
  assert.equal(audit.inventory.discovered, 1631);
  const before = structuredClone(audit);
  const updated = applyReviewDispositions(structuredClone(audit), completion);
  assert.deepEqual(updated.records.map(record => record.sourceUrl), before.records.map(record => record.sourceUrl));
  assert.deepEqual(updated.inventory, before.inventory, 'Content approval must not rewrite original crawl evidence or erase retrieval failures');
  const reviewedUrls = new Set(completion.records.map(record => record.sourceUrl));
  for (const row of before.records.filter(record => !reviewedUrls.has(record.sourceUrl))) {
    assert.deepEqual(updated.records.find(record => record.sourceUrl === row.sourceUrl), row, row.sourceUrl);
  }
  const primary = updated.records.filter(record => record.scopeStatus === 'in-scope' && !['duplicate', 'technical-exclusion'].includes(record.disposition));
  assert.equal(updated.totals.primaryInScope, primary.length);
  for (const category of updated.categories) {
    const rows = primary.filter(record => record.categoryIds.includes(category.id));
    const totals = updated.totals.categories[category.id];
    assert.equal(totals.primarySources, rows.length, category.id);
    for (const [key, disposition] of [['answerEvidence', 'answer-evidence'], ['safeLink', 'safe-link'], ['liveFeed', 'live-feed'], ['excluded', 'excluded']]) {
      assert.equal(totals[key], rows.filter(record => record.disposition === disposition).length, `${category.id}:${key}`);
    }
    assert.equal(totals.reviewRequired, 0);
    assert.equal(totals.unavailableRecheck, 0);
  }
});

test('application directory role is corrected to links without expanding prior approvals', () => {
  const url = 'https://sterlingranchcab.com/201/Design-Review-Documents';
  assert.equal(corrections.find(record => record.sourceUrl === url)?.disposition, 'safe-link');
  const saved = completion.records.find(record => record.sourceUrl === url);
  assert.ok(saved, 'The completion pass must include approved-source role corrections as well as 104 pending reviews');
  assert.equal(saved.disposition, 'safe-link');
  assert.equal(saved.approvedClaimCount, 0);
  assert.deepEqual(saved.approvedClaims, []);
  assert.equal(byUrl.get(url).disposition, 'safe-link');
  assert.equal(byUrl.get(url).approvedClaimCount, 0);
});

test('excluded observations cannot enter the new approval package and safe links contain no factual claims', () => {
  const allowed = reviews.filter(record => ['answer-evidence', 'safe-link'].includes(record.disposition));
  assert.equal(packageData.decisions.length, allowed.length);
  const expected = new Map(allowed.map(record => [sourceUrlIdentity(record.canonicalSourceUrl || record.sourceUrl), record]));
  for (const decision of packageData.decisions) {
    assert.equal(decision.versions.length, 1);
    const record = expected.get(sourceUrlIdentity(decision.versions[0].canonicalUrl));
    assert.ok(record, `Unexpected approval ${decision.versions[0].canonicalUrl}`);
    assert.equal(decision.versions[0].contentHash, record.contentHash);
    assert.deepEqual(decision.withheldClaims, record.withheldClaims || []);
    if (record.disposition === 'safe-link') assert.deepEqual(decision.facts, [], record.sourceUrl);
    if (record.documentFingerprint) assert.equal(decision.documentFingerprint, record.documentFingerprint);
    for (const claim of decision.facts) assert.ok(record.fullText.includes(claim.supportingQuote || claim.text), claim.id);
  }
  const sources = buildReviewedSources(packageData);
  for (const record of reviews.filter(record => record.disposition === 'excluded')) {
    const id = sourceUrlIdentity(record.sourceUrl);
    if (!expected.has(id)) assert.ok(!sources.some(source => sourceUrlIdentity(source.sourceUrl) === id), record.sourceUrl);
  }
});

test('three previously held documents have bounded reviewed claims and explicit excluded content', () => {
  const findDoc = id => reviews.find(record => new RegExp(`/DocumentCenter/View/${id}(?:/|$)`).test(record.sourceUrl));
  const landscape = findDoc(1964);
  const method = findDoc(770);
  const report = findDoc(2398);
  for (const record of [landscape, method, report]) {
    assert.ok(record);
    assert.equal(record.disposition, 'answer-evidence');
    assert.ok(record.claims.length > 0 && record.withheldClaims.length > 0);
    assert.match(record.documentFingerprint, /^[a-f0-9]{64}$/);
    const decision = packageData.decisions.find(item => sourceUrlIdentity(item.versions[0].canonicalUrl) === sourceUrlIdentity(record.sourceUrl));
    assert.ok(decision, `${record.sourceUrl} must be actually packaged, not merely audited`);
    const source = buildReviewedSources({ ...packageData, decisions: [decision] })[0];
    assert.equal(source.requireExactDocumentFingerprint, true, 'Image-only PDF changes must invalidate approval');
  }
  assert.match(landscape.verification.completeness, /four pages|four-page|All four/i);
  assert.match(landscape.withheldClaims.join(' '), /Mailing|fee|120-day/);
  assert.doesNotMatch(landscape.claims.map(claim => claim.text).join(' '), /\$150|\$100|120 days|8155|8220/);
  assert.match(method.withheldClaims.join(' '), /rate|allocation|30%|contact/i);
  assert.doesNotMatch(method.claims.map(claim => claim.text).join(' '), /\$8\.20|submit@sterlingranchdrc\.com/);
  assert.match(report.claims.map(claim => claim.text).join(' '), /2026/);
  assert.match(report.claims.map(claim => claim.text).join(' '), /2025 calendar year/);
  assert.match(report.withheldClaims.join(' '), /safe|violations|health/i);
  assert.match(report.verification.completeness, /41/);
});

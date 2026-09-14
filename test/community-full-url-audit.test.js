const test = require('node:test');
const assert = require('node:assert/strict');
const audit = require('../data/community-full-url-audit.json');
const priorPages = require('../data/community-page-dispositions.json');
const priorDocuments = require('../data/community-document-dispositions.json');
const completedReview = require('../data/community-source-review-completion.json');
const reviewedPackage = require('../data/community-source-approvals-v8.json');
const index = require('../data/community-index.json');
const { canonicalProjectionEntries } = require('../lib/community-source-answerability');

test('full CAB audit reconciles every discovered URL with no unclassified backlog', () => {
  assert.equal(audit.totals.audited, 1631);
  assert.equal(audit.totals.audited, audit.inventory.discovered);
  assert.equal(audit.inventory.eligible + audit.inventory.technicalExclusions, audit.inventory.discovered);
  assert.equal(audit.inventory.pending, 0);
  assert.equal(audit.totals.inScope + audit.totals.outOfScope, audit.totals.audited);
  assert.equal(new Set(audit.records.map(record => record.sourceUrl)).size, audit.records.length);
});

test('every URL has a valid, internally consistent scope decision', () => {
  const categoryIds = new Set(audit.categories.map(category => category.id));
  for (const record of audit.records) {
    assert.ok(record.sourceUrl.startsWith('https://sterlingranchcab.com/'));
    assert.ok(record.categoryIds.every(id => categoryIds.has(id)));
    assert.equal(record.scopeStatus === 'in-scope', record.categoryIds.length > 0);
    if (record.disposition === 'review-required') assert.ok(record.versionFingerprint);
  }
  assert.equal(audit.records.filter(record => record.disposition === 'live-feed').length, 1);
  assert.equal(audit.records.find(record => record.disposition === 'live-feed').sourceUrl, 'https://sterlingranchcab.com/calendar.aspx?CID=0&view=list');
});

test('earlier decisions survive unless an explicit completed review changes their role', () => {
  const byUrl = new Map(audit.records.map(record => [record.sourceUrl, record]));
  for (const prior of priorPages.records) {
    const current = byUrl.get(prior.sourceUrl);
    assert.ok(current, prior.sourceUrl);
    assert.ok(current.categoryIds.includes(prior.categoryId));
    const review = completedReview.records.find(record => record.sourceUrl === prior.sourceUrl);
    assert.equal(current.disposition, review?.disposition || prior.disposition, prior.sourceUrl);
    if (review && current.disposition !== prior.disposition) {
      assert.ok(review.reason, prior.sourceUrl);
      if (review.contentHash || review.versionFingerprint) {
        assert.ok(review.checkedAt || review.reviewedAt, prior.sourceUrl);
      } else {
        // A role-only correction may reduce prior evidence to its existing
        // links without claiming a newly reviewed content version.
        assert.equal(prior.disposition, 'answer-evidence', prior.sourceUrl);
        assert.equal(review.disposition, 'safe-link', prior.sourceUrl);
        assert.equal(review.approvedClaimCount, 0, prior.sourceUrl);
        assert.deepEqual(review.approvedClaims, [], prior.sourceUrl);
        assert.ok(review.verification?.completeness, prior.sourceUrl);
        const entries = index.sources.filter(source => source.sourceUrl === prior.sourceUrl)
          .flatMap(source => canonicalProjectionEntries(source, index));
        assert.ok(entries.length, prior.sourceUrl);
        assert.ok(entries.every(entry => entry.factType === 'link'), prior.sourceUrl);
      }
    }
  }
  for (const document of priorDocuments.documents) {
    const current = byUrl.get(document.sourceUrl);
    assert.ok(current, document.sourceUrl);
    assert.ok(current.categoryIds.length > 0);
    assert.ok(current.disposition === 'technical-exclusion' ? current.approvedRole : true);
  }
});

test('newly discovered content requires an exact completed claim approval before becoming answer evidence', () => {
  const approvedUrls = new Set(priorPages.records.filter(record => record.disposition === 'answer-evidence').map(record => record.sourceUrl));
  for (const record of audit.records.filter(record => record.disposition === 'answer-evidence' && record.kind === 'page')) {
    if (approvedUrls.has(record.sourceUrl)) continue;
    const review = completedReview.records.find(item => item.sourceUrl === record.sourceUrl);
    assert.equal(review?.disposition, 'answer-evidence', record.sourceUrl);
    assert.ok(review.approvedClaimCount > 0, record.sourceUrl);
    assert.ok(review.withheldClaims?.length, record.sourceUrl);
    const decision = reviewedPackage.decisions.find(item => item.versions.some(version =>
      version.canonicalUrl === (review.canonicalSourceUrl || record.sourceUrl)
      && version.contentHash === review.contentHash));
    assert.ok(decision?.facts.length, `Missing exact approved version for ${record.sourceUrl}`);
    assert.ok(decision.facts.every(fact => decision.approvedClaims.includes(fact.id)), record.sourceUrl);
    assert.ok(decision.facts.every(fact => review.approvedClaims.includes(fact.context || fact.text)), record.sourceUrl);
  }
  assert.deepEqual(audit.inventory.failures, [{
    url: 'https://sterlingranchcab.com/364/Sign-Up-for-E-News',
    error: 'The website returned 403.',
  }]);
  assert.equal(byUrl(audit.inventory.failures[0].url).scopeStatus, 'out-of-scope');

  function byUrl(url) { return audit.records.find(record => record.sourceUrl === url); }
});

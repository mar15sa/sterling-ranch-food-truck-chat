const test = require('node:test');
const assert = require('node:assert/strict');
const audit = require('../data/community-full-url-audit.json');
const priorPages = require('../data/community-page-dispositions.json');
const priorDocuments = require('../data/community-document-dispositions.json');

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

test('the earlier approved page and document decisions survive the expanded audit', () => {
  const byUrl = new Map(audit.records.map(record => [record.sourceUrl, record]));
  for (const prior of priorPages.records) {
    const current = byUrl.get(prior.sourceUrl);
    assert.ok(current, prior.sourceUrl);
    assert.ok(current.categoryIds.includes(prior.categoryId));
    assert.equal(current.disposition, prior.disposition);
  }
  for (const document of priorDocuments.documents) {
    const current = byUrl.get(document.sourceUrl);
    assert.ok(current, document.sourceUrl);
    assert.ok(current.categoryIds.length > 0);
    assert.ok(current.disposition === 'technical-exclusion' ? current.approvedRole : true);
  }
});

test('newly discovered content is never promoted to answer evidence without prior approval', () => {
  const approvedUrls = new Set(priorPages.records.filter(record => record.disposition === 'answer-evidence').map(record => record.sourceUrl));
  for (const record of audit.records.filter(record => record.disposition === 'answer-evidence' && record.kind === 'page')) {
    assert.ok(approvedUrls.has(record.sourceUrl), record.sourceUrl);
  }
  assert.deepEqual(audit.inventory.failures, [{
    url: 'https://sterlingranchcab.com/364/Sign-Up-for-E-News',
    error: 'The website returned 403.',
  }]);
  assert.equal(byUrl(audit.inventory.failures[0].url).scopeStatus, 'out-of-scope');

  function byUrl(url) { return audit.records.find(record => record.sourceUrl === url); }
});

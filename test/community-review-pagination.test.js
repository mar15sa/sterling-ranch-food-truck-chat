const test = require('node:test');
const assert = require('node:assert/strict');
const { paginateReviews } = require('../lib/community-review-pagination');
const fixture = Array.from({ length: 1969 }, (_, i) => ({
  id: `review-${String(i).padStart(4, '0')}`, status: 'pending', risk: i < 1185 ? 'high' : 'medium',
  conflict: i % 3 === 0, topic: i % 2 ? 'pool' : 'rules',
}));

test('production-sized inventory stays bounded with complete totals and every record reachable once', () => {
  const before = JSON.stringify(fixture);
  const seen = [];
  for (let page = 1; page <= 79; page++) {
    const result = paginateReviews([...fixture].reverse(), new URLSearchParams({ page }));
    assert.ok(result.items.length <= 25);
    assert.equal(result.pagination.total, 1969);
    assert.equal(result.summary.pending, 1969);
    assert.equal(result.summary.sensitive, 1185);
    seen.push(...result.items.map(item => item.id));
  }
  assert.deepEqual(seen, fixture.map(item => item.id));
  assert.equal(JSON.stringify(fixture), before);
});

test('all filters apply before pagination; malformed and obsolete pages remain usable', () => {
  for (const query of ['risk=high', 'risk=medium&conflict=false', 'topic=pool&status=pending&conflict=true', 'status=approved']) {
    const params = new URLSearchParams(query);
    const expected = fixture.filter(item => [...params].every(([key, value]) => String(item[key]) === value));
    const result = paginateReviews(fixture, params);
    assert.equal(result.pagination.total, expected.length);
    assert.deepEqual(result.items, expected.slice(0, 25));
  }
  for (const page of ['0', '-1', 'NaN', 'Infinity', '1.5', '9007199254740992']) {
    assert.equal(paginateReviews(fixture, new URLSearchParams({ page })).pagination.page, 1);
  }
  const last = paginateReviews(fixture, new URLSearchParams('page=999999&pageSize=999999'));
  assert.equal(last.pagination.page, 79);
  assert.equal(last.items.length, 19);
  assert.equal(paginateReviews([], new URLSearchParams('page=2')).pagination.page, 1);
});

test('actual authenticated handler pages resolved statuses without changing source records', async () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const { latestReviewDecision } = require('../lib/community-review-queue');
  const { createSessionToken, sessionCookie, isAuthorizedRequest } = require('../lib/community-question-admin');
  const server = fs.readFileSync(require.resolve('../server'), 'utf8');
  const records = fixture.map(item => ({ ...item, recordType: 'review-item', sourceVersion: 'v1' }));
  records.push({ id: 'decision', recordType: 'decision', reviewId: fixture[0].id, sourceVersion: 'v1', decision: 'approve-proposed', status: 'approved', createdAt: '2026-09-01T00:00:00Z' });
  let reads = 0;
  const before = JSON.stringify(records);
  const context = vm.createContext({
    console, latestReviewDecision, paginateReviews,
    questionAdminConfig: () => ({ sessionSecret: 'fixture-only' }), isAuthorizedRequest,
    sourceReviewStatus: () => ({ configured: true }), communitySourceStatus: () => ({ retirementPendingPageCount: 4 }),
    listReviewRecords: async () => { reads++; return records; },
    sendJson: (res, status, body) => Object.assign(res, { status, body }),
  });
  for (const name of ['requireQuestionAdmin', 'communityReviewRecords', 'handleCommunitySourceReview']) {
    const start = server.search(new RegExp(`(?:async )?function ${name}\\(`));
    vm.runInContext(server.slice(start, server.indexOf('\n}', start) + 2), context);
  }
  const unauthorized = {};
  await context.handleCommunitySourceReview({ method: 'GET', headers: {} }, unauthorized, new URL('https://example.test/?page=2'));
  assert.equal(unauthorized.status, 401);
  assert.equal(reads, 0);
  const owner = { method: 'GET', headers: { cookie: sessionCookie(createSessionToken('fixture-only')) } };
  const approved = {};
  await context.handleCommunitySourceReview(owner, approved, new URL('https://example.test/?status=approved'));
  assert.equal(approved.status, 200);
  assert.equal(approved.body.items.length, 1);
  assert.equal(approved.body.items[0].id, fixture[0].id);
  const pending = {};
  await context.handleCommunitySourceReview(owner, pending, new URL('https://example.test/?status=pending&page=79'));
  assert.equal(pending.body.pagination.total, 1968);
  assert.equal(pending.body.items.length, 18);
  assert.equal(pending.body.counts.retirementPendingPageCount, 4);
  const detail = {};
  await context.handleCommunitySourceReview(owner, detail, new URL('https://example.test/'), fixture[0].id);
  assert.equal(detail.body.item.status, 'approved');
  assert.equal(JSON.stringify(records), before);
});

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

function authenticatedHandler(options = {}) {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const { classifyReviewRecords } = require('../lib/community-review-classification');
  const { buildCommunitySourceReadiness } = require('../lib/community-source-readiness');
  const { createSessionToken, sessionCookie, isAuthorizedRequest, isSameOriginRequest } = require('../lib/community-question-admin');
  const server = fs.readFileSync(require.resolve('../server'), 'utf8');
  const checkedAt = new Date(Date.now() - 1000).toISOString();
  const records = options.records || fixture.map(item => ({ ...item, recordType: 'review-item', sourceVersion: 'v1',
    kind: 'source-change', communityId: 'example', sourceId: `source-${item.id}`,
    proposedSourceUrl: `https://example.test/source/${item.id}`, currentValue: 'Previous content',
    proposedValue: 'Candidate content', supportingText: 'Candidate content',
    lastObservedAt: checkedAt, candidateFingerprint: 'candidate-fixture', releaseFingerprint: 'released-fixture' }));
  const sourceItems = records.filter(record => record.recordType === 'review-item');
  const observation = {
    initialized: true, checkedAt, refreshing: false, error: '',
    candidateSources: sourceItems.map(item => ({ id: item.sourceId, sourceUrl: item.proposedSourceUrl,
      contentHash: item.sourceVersion, checkedAt, communityId: 'example' })),
    candidatePages: [], items: sourceItems.map(item => ({ ...item })),
    sync: { lastAttemptAt: checkedAt, lastSucceededAt: checkedAt, error: '' },
    ...options.observation,
  };
  const counters = { snapshots: 0, freshReads: 0, writes: 0, bodyReads: 0 };
  const decisions = [];
  const storage = { records, loaded: true, loading: false, stale: false,
    checkedAt, lastAttemptAt: checkedAt, error: null, ...options.storage };
  const context = vm.createContext({
    console, URLSearchParams, classifyReviewRecords, paginateReviews, buildCommunitySourceReadiness,
    reviewAudit: { communityId: 'example', records: sourceItems.map(item => ({ sourceUrl: item.proposedSourceUrl,
      scopeStatus: 'in-scope', categoryIds: ['services'], disposition: 'answer-evidence' })) },
    reviewBundledIndex: { communityId: 'example', sources: [], pages: [] }, reviewCanonicalLedger: { records: [] },
    getSourceReviewSnapshot: () => observation,
    questionAdminConfig: () => ({ sessionSecret: 'fixture-only' }), isAuthorizedRequest, isSameOriginRequest,
    sourceReviewStatus: () => ({ configured: true }), communitySourceStatus: () => ({ retirementPendingPageCount: 4 }),
    getReviewRecordsSnapshot: refresh => { counters.snapshots++; options.onSnapshot?.(refresh); return storage; },
    listReviewRecords: async () => { counters.freshReads++; return options.freshRecords || records; },
    readJsonBody: async req => { counters.bodyReads++; return req.body; },
    saveReviewDecision: async decision => { counters.writes++; decisions.push(decision); return decision; },
    sendJson: (res, status, body) => Object.assign(res, { status, body }),
  });
  for (const name of ['requireQuestionAdmin', 'communityReviewRecords', 'handleCommunitySourceReview']) {
    const start = server.search(new RegExp(`(?:async )?function ${name}\\(`));
    assert.ok(start >= 0, `actual server function ${name} must exist`);
    vm.runInContext(server.slice(start, server.indexOf('\n}', start) + 2), context);
  }
  const owner = { method: 'GET', headers: { cookie: sessionCookie(createSessionToken('fixture-only')),
    origin: 'https://example.test', host: 'example.test', 'x-forwarded-proto': 'https' } };
  async function request({ method = 'GET', query = '', id = '', authorized = true, body = {}, headers = {} } = {}) {
    const res = {};
    const req = { ...owner, method, body, headers: { ...(authorized ? owner.headers : {}), ...headers } };
    await context.handleCommunitySourceReview(req, res, new URL(`https://example.test/?${query}`), id);
    return res;
  }
  return { request, records, storage, observation, counters, decisions };
}

function exactDecision(item) {
  return { id: 'decision', recordType: 'decision', reviewId: item.id, sourceVersion: item.sourceVersion,
    sourceUrl: item.proposedSourceUrl, factId: item.factId || '', decision: 'approve-proposed', status: 'approved',
    decidedAt: new Date(Date.now() - 500).toISOString() };
}

test('actual authenticated handler pages classified history separately without changing saved records', async () => {
  const handler = authenticatedHandler();
  handler.records.push(exactDecision(handler.records[0]));
  const before = JSON.stringify(handler.records);
  const history = await handler.request({ query: 'queue=history' });
  assert.equal(history.status, 200);
  assert.equal(history.body.items.length, 1);
  assert.equal(history.body.items[0].id, fixture[0].id);
  assert.equal(history.body.items[0].queueBucket, 'history');
  assert.equal(history.body.items[0].canDecide, false);
  const pending = await handler.request({ query: 'status=pending&page=79' });
  assert.equal(pending.body.pagination.total, 1968);
  assert.equal(pending.body.items.length, 18);
  assert.equal(pending.body.counts.retirementPendingPageCount, 4);
  assert.equal(pending.body.readiness.totals.audited, 1631);
  const detail = await handler.request({ id: fixture[0].id });
  assert.equal(detail.body.item.latestDecision.decision, 'approve-proposed');
  assert.equal(detail.body.item.canDecide, false);
  assert.equal(JSON.stringify(handler.records), before);
  assert.equal(handler.counters.freshReads, 0, 'GET must only use the nonblocking snapshot');
  assert.equal(handler.counters.writes, 0);
});

test('actual handler rejects unauthenticated and cross-origin operations before storage access', async () => {
  const handler = authenticatedHandler();
  for (const method of ['GET', 'POST']) {
    const result = await handler.request({ method, authorized: false, id: fixture[0].id });
    assert.equal(result.status, 401);
  }
  const crossOrigin = await handler.request({ method: 'POST', id: fixture[0].id, headers: { origin: 'https://other.test' } });
  assert.equal(crossOrigin.status, 403);
  assert.deepEqual(handler.counters, { snapshots: 0, freshReads: 0, writes: 0, bodyReads: 0 });
});

test('actual cold GET returns readiness immediately with unknown storage rather than waiting for the inventory', async () => {
  let refreshRequested;
  const handler = authenticatedHandler({ storage: { records: [], loaded: false, loading: true, stale: true,
    checkedAt: '', lastAttemptAt: new Date().toISOString() }, onSnapshot: options => { refreshRequested = options.refresh; } });
  const result = await handler.request({ query: 'refresh=true' });
  assert.equal(result.status, 200);
  assert.equal(result.body.reviewAvailable, true);
  assert.equal(result.body.queue.storage.loaded, false, 'false is the explicit Unknown signal, not a complete empty inventory');
  assert.equal(result.body.queue.storage.loading, true);
  assert.equal(result.body.queue.storage.stale, true);
  assert.equal(result.body.queue.storage.checkedAt, '');
  assert.equal(result.body.readiness.totals.audited, 1631);
  assert.equal(refreshRequested, true);
  assert.equal(handler.counters.freshReads, 0);
  const detail = await handler.request({ id: fixture[0].id });
  assert.equal(detail.status, 503);
  assert.match(detail.body.error, /still loading/);
});

test('actual stale or refreshing snapshots are read-only and expose failed refresh metadata', async () => {
  for (const state of [{ stale: true, error: 'Storage offline' }, { stale: true, loading: true }, { loading: true }]) {
    const handler = authenticatedHandler({ storage: state });
    const result = await handler.request();
    assert.equal(result.status, 200);
    assert.equal(result.body.queue.storage.loaded, true);
    assert.equal(result.body.items.length, 25);
    assert.ok(result.body.items.every(item => item.canDecide === false));
    assert.equal(result.body.reviewError, state.error || '');
    assert.equal(handler.counters.freshReads, 0);
  }
});

test('actual POST bypasses cached eligibility and rejects a newly resolved history entry', async () => {
  const base = authenticatedHandler();
  const records = base.records.slice(0, 1);
  const handler = authenticatedHandler({ records, freshRecords: [...records, exactDecision(records[0])] });
  const displayed = await handler.request();
  assert.equal(displayed.body.items[0].canDecide, true);
  const result = await handler.request({ method: 'POST', id: records[0].id, body: { decision: 'approve-proposed', note: 'Fixture test' } });
  assert.equal(result.status, 409);
  assert.equal(handler.counters.freshReads, 1);
  assert.equal(handler.counters.writes, 0);
  assert.equal(handler.counters.bodyReads, 0);
});

test('actual POST rejects history, ambiguous payloads and absent or changed regenerated proposals', async () => {
  const base = authenticatedHandler();
  const item = base.records[0];
  const scenarios = [
    { records: [item, exactDecision(item)] },
    { records: [item, { ...item, notionPageId: 'disagreeing-copy', proposedValue: 'Different saved content' }] },
    { records: [item], observation: { items: [] } },
    { records: [item], observation: { items: [{ ...item, proposedValue: 'Different regenerated content' }] } },
  ];
  for (const scenario of scenarios) {
    const handler = authenticatedHandler(scenario);
    const result = await handler.request({ method: 'POST', id: item.id,
      body: { decision: 'approve-proposed', note: 'Fixture test' } });
    assert.equal(result.status, 409, JSON.stringify(scenario.observation || scenario.records));
    assert.equal(handler.counters.freshReads, 1);
    assert.equal(handler.counters.snapshots, 0);
    assert.equal(handler.counters.writes, 0);
  }
});

test('actual POST saves only the fresh exact proposal identity, never client supplied identity fields', async () => {
  const base = authenticatedHandler();
  const item = base.records[0];
  const handler = authenticatedHandler({ records: [item], storage: { records: [], loaded: false, stale: true } });
  const result = await handler.request({ method: 'POST', id: item.id, body: {
    decision: 'keep-current', note: 'Fixture only', reviewId: 'spoof-review', sourceId: 'spoof-source',
    sourceUrl: 'https://other.test/', sourceVersion: 'spoof-version', reviewer: 'spoof-reviewer', candidateFingerprint: 'spoof-fingerprint',
  } });
  assert.equal(result.status, 201);
  assert.equal(handler.counters.freshReads, 1);
  assert.equal(handler.counters.snapshots, 0);
  assert.equal(handler.counters.writes, 1);
  assert.equal(handler.decisions[0].reviewId, item.id);
  assert.equal(handler.decisions[0].sourceId, item.sourceId);
  assert.equal(handler.decisions[0].sourceUrl, item.proposedSourceUrl);
  assert.equal(handler.decisions[0].sourceVersion, item.sourceVersion);
  assert.equal(handler.decisions[0].candidateFingerprint, item.candidateFingerprint);
  assert.equal(handler.decisions[0].reviewer, 'owner');
});

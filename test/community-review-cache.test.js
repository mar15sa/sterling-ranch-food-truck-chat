const test = require('node:test');
const assert = require('node:assert/strict');
const { createReviewCache } = require('../lib/community-review-cache');
const {
  getReviewRecordsSnapshot, loadReviewRecordsCached, listReviewRecords,
  createReviewRecord, syncReviewItems, resetSourceReviewCachesForTest,
} = require('../lib/community-source-review');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('cold snapshot is immediate, partial loads stay unknown, and pagination reuses one complete inventory', async () => {
  const cache = createReviewCache();
  const pending = deferred();
  let calls = 0;
  const loader = () => { calls++; return pending.promise; };
  const cold = cache.snapshot(loader);
  assert.deepEqual(cold.records, []);
  assert.equal(cold.loaded, false);
  assert.equal(cold.loading, true);
  assert.equal(cold.stale, true);
  const wait = cache.load(loader);
  cache.snapshot(loader, { refresh: true });
  await Promise.resolve();
  assert.equal(calls, 1);
  pending.resolve([{ id: 'page-1' }, { id: 'page-2' }]);
  await wait;
  for (let page = 0; page < 20; page++) {
    const snapshot = cache.snapshot(loader);
    assert.equal(snapshot.loaded, true);
    assert.equal(snapshot.stale, false);
    assert.equal(snapshot.loading, false);
    assert.equal(snapshot.records.length, 2);
  }
  assert.equal(calls, 1);
});

test('expired inventory is visibly stale while refreshing and retains last success on failure', async () => {
  let clock = 1000;
  const cache = createReviewCache({ ttlMs: 100, backoffMs: 50, now: () => clock });
  await cache.load(async () => [{ id: 'old' }]);
  const checkedAt = cache.snapshot(() => assert.fail('fresh cache')).checkedAt;
  clock += 101;
  const pending = deferred();
  const stale = cache.snapshot(() => pending.promise);
  assert.equal(stale.loaded, true);
  assert.equal(stale.stale, true);
  assert.equal(stale.loading, true);
  assert.equal(stale.checkedAt, checkedAt);
  const wait = cache.load(() => assert.fail('must dedupe'));
  pending.reject(new Error('storage offline'));
  await assert.rejects(wait, /storage offline/);
  let calls = 0;
  const loader = async () => { calls++; return [{ id: 'new' }]; };
  const failed = cache.snapshot(loader, { refresh: true });
  assert.equal(failed.error, 'storage offline');
  assert.equal(failed.checkedAt, checkedAt);
  assert.equal(failed.stale, true);
  assert.equal(failed.loading, false);
  assert.deepEqual(failed.records, [{ id: 'old' }]);
  await assert.rejects(cache.load(loader, { refresh: true }), /storage offline/);
  assert.equal(calls, 0);
  clock += 51;
  await cache.load(loader);
  assert.equal(calls, 1);
  assert.equal(cache.snapshot(loader).error, null);
  assert.equal(cache.snapshot(loader).stale, false);
});

test('cold failure never becomes loaded or a successful empty inventory', async () => {
  const cache = createReviewCache();
  const loader = async () => { throw new Error('unavailable'); };
  cache.snapshot(loader);
  await assert.rejects(cache.load(loader), /unavailable/);
  const snapshot = cache.snapshot(loader);
  assert.equal(snapshot.loaded, false);
  assert.equal(snapshot.stale, true);
  assert.equal(snapshot.checkedAt, '');
  assert.equal(snapshot.error, 'unavailable');
  // Let the intentionally detached snapshot rejection handler run.
  await new Promise(resolve => setImmediate(resolve));
});

test('a genuinely empty successful inventory is loaded and a forced refresh bypasses freshness', async () => {
  const cache = createReviewCache();
  let calls = 0;
  const loader = async () => { calls++; return []; };
  await cache.load(loader);
  assert.equal(cache.snapshot(loader).loaded, true);
  assert.equal(cache.snapshot(loader).stale, false);
  assert.equal(calls, 1);
  await cache.load(loader, { refresh: true });
  assert.equal(calls, 2);
});

test('failure backoff starts when a long load fails, not when it started', async () => {
  let clock = 1000;
  const cache = createReviewCache({ backoffMs: 50, now: () => clock });
  const pending = deferred();
  const wait = cache.load(() => pending.promise);
  clock += 1000;
  pending.reject(new Error('late failure'));
  await assert.rejects(wait, /late failure/);
  await assert.rejects(cache.load(() => assert.fail('must back off'), { refresh: true }), /late failure/);
  clock += 51;
  await cache.load(async () => []);
});

test('invalidation clears old completion and discards any in-flight pre-write result', async () => {
  const cache = createReviewCache();
  await cache.load(async () => [{ id: 'completed-old' }]);
  const pending = deferred();
  let calls = 0;
  const loader = () => ++calls === 1 ? pending.promise : Promise.resolve([{ id: 'after-write' }]);
  const wait = cache.load(loader, { refresh: true });
  await Promise.resolve();
  cache.invalidate();
  const invalidated = cache.snapshot(loader);
  assert.deepEqual(invalidated.records, []);
  assert.equal(invalidated.loaded, false);
  pending.resolve([{ id: 'before-write' }]);
  assert.deepEqual(await wait, [{ id: 'after-write' }]);
  assert.equal(calls, 2);
});

function configure(t) {
  const settings = {
    COMMUNITY_SOURCE_REVIEW_NOTION_TOKEN: 'dummy-cache-test-token',
    COMMUNITY_SOURCE_REVIEW_NOTION_DATA_SOURCE_ID: 'dummy-cache-test-source',
    COMMUNITY_SOURCE_REVIEW_NOTION_DATABASE_ID: '',
    COMMUNITY_SOURCE_REVIEW_NOTION_TITLE_PROPERTY: 'Owner review',
  };
  for (const [name, value] of Object.entries(settings)) {
    const prior = process.env[name];
    process.env[name] = value;
    t.after(() => { if (prior === undefined) delete process.env[name]; else process.env[name] = prior; });
  }
  resetSourceReviewCachesForTest();
  t.after(resetSourceReviewCachesForTest);
}

function schema(title = 'Owner review') {
  const rich = () => ({ type: 'rich_text' });
  const select = names => ({ type: 'select', select: { options: names.map(name => ({ name })) } });
  return { properties: {
    [title]: { type: 'title' }, 'Review ID': rich(), 'Record type': select(['review-item', 'decision']),
    Status: select(['pending', 'approved', 'kept-current', 'superseded', 'excluded', 'escalated']),
    Topic: rich(), Risk: select(['low', 'medium', 'high']), Conflict: { type: 'checkbox' },
    'Source URL': { type: 'url' }, 'Source version': rich(), 'Fact ID': rich(), 'Candidate fingerprint': rich(),
    Decision: select(['approve-proposed', 'keep-current', 'mark-current-superseded', 'exclude-page', 'escalate']),
    Reviewer: rich(), Note: rich(), Payload: rich(), 'Created at': { type: 'date' },
  } };
}

const response = body => ({ ok: true, status: 200, json: async () => body });
const page = record => ({ id: `notion-${record.id}`, properties: { Payload: { type: 'rich_text', rich_text: [{ text: { content: JSON.stringify(record) } }] } } });

test('cached complete Notion pagination is reused but strict decision-validation reads remain fresh', async t => {
  configure(t);
  let queries = 0;
  const fetchImpl = async (url, options = {}) => {
    if (!url.endsWith('/query')) return response(schema());
    queries++;
    const cursor = JSON.parse(options.body).start_cursor;
    return response({ results: [page({ id: cursor ? 'second' : 'first' })], has_more: !cursor, next_cursor: cursor ? null : 'next' });
  };
  const cold = getReviewRecordsSnapshot({}, fetchImpl);
  assert.equal(cold.loaded, false);
  assert.equal(cold.loading, true);
  assert.equal((await loadReviewRecordsCached({}, fetchImpl)).length, 2);
  for (let i = 0; i < 10; i++) assert.equal(getReviewRecordsSnapshot({}, fetchImpl).records.length, 2);
  assert.equal(queries, 2);
  await listReviewRecords({}, fetchImpl);
  assert.equal(queries, 4, 'strict read must not reuse dashboard cache');
});

test('token, database, data source, title and fetch implementation isolate caches and schema resolution', async t => {
  configure(t);
  const queries = [];
  const fetchImpl = async (url, options = {}) => {
    if (url.includes('/databases/')) return response({ data_sources: [{ id: url.split('/').at(-1) + '-resolved' }] });
    if (!url.endsWith('/query')) return response(schema(process.env.COMMUNITY_SOURCE_REVIEW_NOTION_TITLE_PROPERTY));
    queries.push({ url, token: options.headers.authorization });
    return response({ results: [page({ id: `result-${queries.length}` })], has_more: false });
  };
  await loadReviewRecordsCached({}, fetchImpl);
  process.env.COMMUNITY_SOURCE_REVIEW_NOTION_TOKEN = 'dummy-second-token';
  await loadReviewRecordsCached({}, fetchImpl);
  process.env.COMMUNITY_SOURCE_REVIEW_NOTION_DATABASE_ID = 'other-database';
  await loadReviewRecordsCached({}, fetchImpl);
  process.env.COMMUNITY_SOURCE_REVIEW_NOTION_DATA_SOURCE_ID = '';
  await loadReviewRecordsCached({}, fetchImpl);
  process.env.COMMUNITY_SOURCE_REVIEW_NOTION_TITLE_PROPERTY = 'Different title';
  await loadReviewRecordsCached({}, fetchImpl);
  await loadReviewRecordsCached({}, (...args) => fetchImpl(...args));
  assert.equal(queries.length, 6);
  assert.notEqual(queries[0].token, queries[1].token);
  assert.match(queries[3].url, /other-database-resolved/);
  assert.equal(JSON.stringify(getReviewRecordsSnapshot({}, fetchImpl)).includes('dummy-second-token'), false);
});

test('bounded connection contexts evict idle inventories but preserve all active reads', async t => {
  configure(t);
  let queries = 0;
  const fetchImpl = async url => {
    if (!url.endsWith('/query')) return response(schema());
    queries++;
    return response({ results: [], has_more: false });
  };
  for (let i = 0; i < 17; i++) {
    process.env.COMMUNITY_SOURCE_REVIEW_NOTION_TOKEN = `dummy-${i}`;
    await loadReviewRecordsCached({}, fetchImpl);
  }
  process.env.COMMUNITY_SOURCE_REVIEW_NOTION_TOKEN = 'dummy-0';
  assert.equal(getReviewRecordsSnapshot({}, fetchImpl).loaded, false, 'oldest idle inventory must be evicted');
  await loadReviewRecordsCached({}, fetchImpl);
  assert.equal(queries, 18);

  resetSourceReviewCachesForTest();
  const pending = deferred();
  const slowFetch = async url => url.endsWith('/query') ? pending.promise : response(schema());
  const waits = [];
  for (let i = 0; i < 16; i++) {
    process.env.COMMUNITY_SOURCE_REVIEW_NOTION_TOKEN = `dummy-active-${i}`;
    waits.push(loadReviewRecordsCached({}, slowFetch));
  }
  process.env.COMMUNITY_SOURCE_REVIEW_NOTION_TOKEN = 'dummy-over-limit';
  const busy = getReviewRecordsSnapshot({}, slowFetch);
  assert.equal(busy.loaded, false);
  assert.match(busy.error, /cache is busy/);
  process.env.COMMUNITY_SOURCE_REVIEW_NOTION_TOKEN = 'dummy-active-0';
  assert.equal(getReviewRecordsSnapshot({}, slowFetch).loading, true);
  pending.resolve(response({ results: [], has_more: false }));
  await Promise.all(waits);
});

test('successful and ambiguous failed writes invalidate the cache and ambiguous creation is not retried', async t => {
  configure(t);
  let writes = 0;
  let queries = 0;
  const fetchImpl = async url => {
    if (url.endsWith('/pages')) { writes++; if (writes === 2) throw new Error('lost response'); return response({ id: 'created' }); }
    if (url.endsWith('/query')) { queries++; return response({ results: [page({ id: `read-${queries}` })], has_more: false }); }
    return response(schema());
  };
  await loadReviewRecordsCached({}, fetchImpl);
  await createReviewRecord({ id: 'new-1' }, fetchImpl);
  assert.equal(getReviewRecordsSnapshot({}, fetchImpl).loaded, false);
  await loadReviewRecordsCached({}, fetchImpl);
  await assert.rejects(createReviewRecord({ id: 'new-2' }, fetchImpl), /lost response/);
  assert.equal(writes, 2);
  assert.equal(getReviewRecordsSnapshot({}, fetchImpl).loaded, false);
  await loadReviewRecordsCached({}, fetchImpl);
  assert.equal(queries, 3);
});

test('concurrent syncs and repeated input IDs create each review once without any decisions', async t => {
  configure(t);
  const saved = [];
  const fetchImpl = async (url, options = {}) => {
    if (url.endsWith('/pages')) {
      const properties = JSON.parse(options.body).properties;
      saved.push(JSON.parse(properties.Payload.rich_text.map(part => part.text.content).join('')));
      return response({ id: 'created' });
    }
    if (url.endsWith('/query')) return response({ results: saved.map(page), has_more: false });
    return response(schema());
  };
  const item = { id: 'review-1', recordType: 'review-item', kind: 'source-change' };
  const results = await Promise.all([syncReviewItems([item, item], fetchImpl), syncReviewItems([item], fetchImpl)]);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].recordType, 'review-item');
  assert.deepEqual(results.map(result => result.created), [1, 0]);
});

test('partial failed sync settles its entire batch and rereads accepted records before retry', async t => {
  configure(t);
  const saved = [];
  const attempts = [];
  let failed = false;
  const pending = deferred();
  const fetchImpl = async (url, options = {}) => {
    if (url.endsWith('/pages')) {
      const record = JSON.parse(JSON.parse(options.body).properties.Payload.rich_text.map(part => part.text.content).join(''));
      attempts.push(record.id);
      if (record.id === 'two' && !failed) { failed = true; throw new Error('interrupted'); }
      if (record.id === 'three' && saved.length < 2) await pending.promise;
      saved.push(record);
      return response({ id: 'created' });
    }
    if (url.endsWith('/query')) return response({ results: saved.map(page), has_more: false });
    return response(schema());
  };
  const items = ['one', 'two', 'three'].map(id => ({ id, recordType: 'review-item' }));
  const first = syncReviewItems(items, fetchImpl);
  const rejected = assert.rejects(first, /interrupted/);
  await new Promise(resolve => setImmediate(resolve));
  const second = syncReviewItems(items, fetchImpl);
  assert.equal(attempts.length, 3);
  pending.resolve();
  await rejected;
  await second;
  assert.deepEqual(saved.map(record => record.id).sort(), ['one', 'three', 'two']);
  assert.equal(attempts.filter(id => id === 'one').length, 1);
  assert.equal(attempts.filter(id => id === 'three').length, 1);
});

test('incomplete or repeating pagination cannot be cached as complete', async t => {
  configure(t);
  for (const malformed of [{ results: [], has_more: true }, { has_more: false }, { results: [] }, { results: [], has_more: true, next_cursor: 'same' }]) {
    const fetchImpl = async url => response(url.endsWith('/query') ? malformed : schema());
    await assert.rejects(loadReviewRecordsCached({}, fetchImpl), /incomplete|repeated/);
    const snapshot = getReviewRecordsSnapshot({}, fetchImpl);
    assert.equal(snapshot.loaded, false);
    assert.equal(snapshot.stale, true);
  }
});

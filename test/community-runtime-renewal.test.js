const test = require('node:test');
const assert = require('node:assert/strict');
const ingest = require('../lib/community-ingest');
const review = require('../lib/community-source-review');
const HOUR = 3600000;
const START = Date.parse('2026-09-23T17:27:30Z');

function fixture() {
  const checkedAt = new Date(START).toISOString(), staleAfter = new Date(START + 24 * HOUR).toISOString();
  const sources = Array.from({ length: 20 }, (_, n) => ({
    id: `page-${n}`, sourceUrl: `https://example.org/page-${n}`, text: 'Approved source text',
    contentHash: `version-${n}`, actions: [], reviewStatus: 'approved',
    connectorType: 'civicplus-pages', sourceType: 'services', checkedAt, staleAfter,
  }));
  return { communityId: 'sterling-ranch', failureCount: 0, sources, factLedger: sources.map(source => ({
    id: `fact-${source.id}`, sourceId: source.id, sourceVersion: source.contentHash,
    reviewStatus: 'approved', reviewDecisionId: `decision-${source.id}`, reviewedBy: 'owner',
    reviewedAt: checkedAt, lastObservedAt: checkedAt, staleAfter,
  })) };
}
const observe = async (url, sources) => ({ observedHashes: sources.map(source => source.contentHash) });
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function manager(t) {
  const file = require.resolve('../lib/community-source-manager');
  const prior = require.cache[file]; delete require.cache[file];
  t.after(() => { if (prior) require.cache[file] = prior; else delete require.cache[file]; });
  return require(file);
}

test('runtime renewal runs before expiry and coalesces concurrent observations', async t => {
  const api = manager(t), index = fixture();
  await api.revalidateDueApprovedEvidence({ index, replaceCurrent: true, now: START, fetchObservedHashes: observe });
  const beforeExpiry = START + 24 * HOUR - 30_000;
  const gate = deferred(); let calls = 0;
  const options = { now: beforeExpiry, fetchObservedHashes: async (...args) => { calls++; await gate.promise; return observe(...args); } };
  const first = api.refreshApprovedEvidence(options), second = api.refreshApprovedEvidence(options);
  assert.equal(first, second);
  assert.equal(api.communitySourceStatus().exactRevalidating, true);
  gate.resolve(); await first;
  assert.equal(calls, 20);
  assert.equal(api.communitySourceStatus(undefined, START + 29 * HOUR).approvedEvidenceCurrent, true);
  assert.equal(api.communitySourceStatus().exactRevalidating, false);
});

for (const stage of ['discovery', 'review sync']) test(`approved renewal continues while ${stage} is occupied, and its later result cannot roll freshness back`, async t => {
  const occupied = deferred(), entered = deferred(); let crawls = 0;
  t.mock.method(ingest, 'crawlCommunity', async (profile, { previousIndex }) => {
    crawls++;
    const candidate = { ...structuredClone(previousIndex), generatedAt: new Date(START).toISOString() };
    if (stage === 'discovery') { entered.resolve(); await occupied.promise; }
    return candidate;
  });
  t.mock.method(review, 'buildReviewItems', () => []);
  t.mock.method(review, 'syncReviewItems', async () => {
    if (stage === 'review sync') { entered.resolve(); await occupied.promise; }
    return { configured: false };
  });
  const api = manager(t);
  await api.revalidateDueApprovedEvidence({ index: fixture(), replaceCurrent: true, now: START, fetchObservedHashes: observe });
  const first = api.refreshCommunitySources({ now: START, fetchObservedHashes: observe });
  await entered.promise;
  const observed = deferred(); let calls = 0;
  const second = api.refreshCommunitySources({ now: START + 24 * HOUR - 30_000,
    fetchObservedHashes: async (...args) => { if (++calls === 20) observed.resolve(); return observe(...args); },
  });
  await observed.promise;
  // The coalesced renewal is independently awaitable; discovery remains busy.
  await api.refreshApprovedEvidence();
  assert.equal(api.communitySourceStatus(undefined, START + 29 * HOUR).approvedEvidenceCurrent, true);
  assert.equal(crawls, 1);
  occupied.resolve(); await Promise.all([first, second]);
  assert.equal(api.communitySourceStatus(undefined, START + 29 * HOUR).approvedEvidenceCurrent, true);
  assert.equal(crawls, 1);
});

test('a late renewal cannot overwrite newer evidence, content, approval decisions or inventory', t => {
  const api = manager(t), baseline = fixture(), renewed = structuredClone(baseline), current = structuredClone(baseline);
  for (const source of renewed.sources) Object.assign(source, { checkedAt: new Date(START + 24 * HOUR).toISOString(), staleAfter: new Date(START + 48 * HOUR).toISOString() });
  current.inventory = { pendingCount: 7 };
  current.sources[1].contentHash = 'changed';
  current.factLedger[2].reviewStatus = 'rejected';
  current.sources[3].checkedAt = new Date(START + 30 * HOUR).toISOString();
  current.sources[3].staleAfter = new Date(START + 54 * HOUR).toISOString();
  const merged = api.mergeApprovedRenewal(current, baseline, renewed);
  assert.equal(merged.sources[0].staleAfter, renewed.sources[0].staleAfter);
  for (const n of [1, 2, 3]) assert.deepEqual(merged.sources[n], current.sources[n]);
  assert.equal(merged.factLedger[2].reviewStatus, 'rejected');
  assert.deepEqual(merged.inventory, current.inventory);
  assert.equal(baseline.sources[0].staleAfter, new Date(START + 24 * HOUR).toISOString());
});

test('proactive renewal never extends changed content or action proof', async t => {
  const api = manager(t);
  await api.revalidateDueApprovedEvidence({ index: fixture(), replaceCurrent: true, now: START, fetchObservedHashes: observe });
  await api.refreshApprovedEvidence({ now: START + 20 * HOUR, fetchObservedHashes: async (url, sources) => ({
    observedHashes: sources.map(source => source.id === 'page-1' ? 'changed-version' : source.contentHash),
    actionMismatch: url.endsWith('page-2'),
  }) });
  const status = api.communitySourceStatus(undefined, START + 25 * HOUR);
  assert.equal(status.expiredApprovedSourceCount, 2);
  assert.equal(status.expiredApprovedFactCount, 2);
  assert.equal(status.approvedEvidenceCurrent, false);
});

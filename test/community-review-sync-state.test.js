const test = require('node:test');
const assert = require('node:assert/strict');
const { createReviewSyncState } = require('../lib/community-review-sync-state');

test('cold and unconfigured synchronization never claim success', () => {
  const state = createReviewSyncState();
  assert.equal(state.snapshot().initialized, false);
  assert.equal(state.snapshot().sync.lastSuccessAt, null);
  state.beginSync(); state.finishSync({ configured: false });
  assert.equal(state.snapshot().sync.status, 'unconfigured');
  assert.equal(state.snapshot().sync.lastSuccessAt, null);
});

test('source observation and durable sync have separate success and failure states', () => {
  let time = Date.parse('2026-09-14T20:00:00Z');
  const state = createReviewSyncState({ now: () => time });
  const source = { id: 'fixture', contentHash: 'version', facts: [{ value: 'approved fixture' }] };
  const candidate = { generatedAt: new Date(time).toISOString(), sources: [source], pages: [] };
  const before = JSON.stringify(candidate);
  state.beginObservation(); state.observe(candidate, [{ id: 'pending' }]);
  state.beginSync(); state.finishSync({ configured: true, created: 1, existing: 4 }); state.endObservation();
  const success = state.snapshot().sync.lastSuccessAt;
  time += 60_000;
  state.beginSync(); state.failSync(new Error('Storage unavailable'));
  assert.equal(state.snapshot().sync.status, 'failed');
  assert.equal(state.snapshot().sync.lastSuccessAt, success);
  assert.equal(state.snapshot().sync.lastError, 'Storage unavailable');
  assert.equal(state.snapshot().error, '');
  assert.equal(state.snapshot().initialized, true);
  state.beginObservation(); state.failObservation(new Error('Official source unavailable')); state.endObservation();
  assert.equal(state.snapshot().error, 'Official source unavailable');
  assert.equal(state.snapshot().checkedAt, candidate.generatedAt);
  assert.equal(state.snapshot().refreshing, false);
  assert.equal(JSON.stringify(candidate), before);
});

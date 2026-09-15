const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyReviewRecords } = require('../lib/community-review-classification');

const URL = 'https://example.gov/100/Useful';
const NOW = '2026-09-14T12:00:00Z';
const OLD = '2026-09-13T10:00:00Z';
const CHECKED = '2026-09-14T11:00:00Z';
const item = (overrides = {}) => ({ id: 'review-a', recordType: 'review-item', kind: 'source-change',
  status: 'pending', communityId: 'example', sourceId: 'source-a', proposedSourceUrl: URL,
  sourceVersion: 'chunk-a', lastObservedAt: OLD, supportingText: 'A changed page.', ...overrides });
const source = (overrides = {}) => ({ id: 'source-a', sourceUrl: URL, communityId: 'example',
  contentHash: 'chunk-a', checkedAt: CHECKED, ...overrides });
const row = (overrides = {}) => ({ sourceUrl: URL, scopeStatus: 'in-scope', categoryIds: ['services'],
  disposition: 'answer-evidence', reviewedAt: CHECKED, versionFingerprint: 'page-a', ...overrides });
const options = (overrides = {}) => ({ now: NOW, audit: { communityId: 'example', records: [row()] },
  bundledIndex: { communityId: 'example', sources: [], pages: [] }, canonicalLedger: { records: [] },
  snapshot: { initialized: true, checkedAt: CHECKED, candidateSources: [source()], candidatePages: [], items: [item()] }, ...overrides });
const classify = (record = item(), overrides = {}) => classifyReviewRecords([record], options(overrides)).items[0];

test('a current observed in-scope version is actionable but remains unapproved', () => {
  const result = classify();
  assert.equal(result.queueBucket, 'current');
  assert.equal(result.canDecide, true);
  assert.equal(result.status, 'pending');
  assert.equal(result.reviewStatus, undefined);
});

test('current source alone cannot make an omitted saved proposal actionable', () => {
  for (const items of [[], undefined]) {
    const result = classify(item(), { snapshot: { ...options().snapshot, items } });
    assert.equal(result.queueBucket, 'comparison');
    assert.equal(result.canDecide, false);
    assert.match(result.queueReason, /absent/);
  }
});

test('every regenerated claim, evidence and identity field must match the saved proposal', () => {
  const changes = [{ kind: 'fact-conflict' }, { factId: 'new-fact' }, { claimKey: 'new-claim' },
    { proposedValue: 'New proposal' }, { supportingText: 'Different evidence' }, { currentValue: 'Different before state' },
    { facet: 'new-facet' }, { scopeKey: 'new-scope' }, { sourceId: 'other-source' },
    { proposedSourceUrl: 'https://example.gov/other' }, { sourceVersion: 'different-version' },
    { communityId: 'another-community' }, { hashScheme: 'other-scheme' }];
  for (const change of changes) {
    const result = classify(item(), { snapshot: { ...options().snapshot, items: [item(change)] } });
    assert.equal(result.queueBucket, 'comparison', JSON.stringify(change));
    assert.equal(result.canDecide, false);
  }
});

test('regenerated conflicting proposals disable decisions even when one copy matches', () => {
  const result = classify(item(), { snapshot: { ...options().snapshot,
    items: [item(), item({ supportingText: 'Conflicting extraction' })] } });
  assert.equal(result.queueBucket, 'comparison');
  assert.equal(result.canDecide, false);
});

test('regeneration may renew observation metadata without changing the exact proposal', () => {
  const refreshed = item({ createdAt: CHECKED, lastObservedAt: CHECKED, notionPageId: 'new-storage-id' });
  const result = classify(item(), { snapshot: { ...options().snapshot, items: [refreshed, { ...refreshed, createdAt: NOW }] } });
  assert.equal(result.queueBucket, 'current');
  assert.equal(result.canDecide, true);
});

test('discovery is actionable only for an exact regenerated current proposal', () => {
  const audit = { communityId: 'example', records: [] };
  assert.equal(classify(item(), { audit }).canDecide, true);
  const result = classify(item(), { audit, snapshot: { ...options().snapshot, items: [] } });
  assert.equal(result.queueBucket, 'discovery');
  assert.equal(result.canDecide, false);
});

test('cold, failed, stale, future and uninitialized snapshots keep uncertainty visible', () => {
  for (const snapshot of [{}, { initialized: false, checkedAt: CHECKED },
    { initialized: true, checkedAt: CHECKED, error: 'Failed' },
    { initialized: true, checkedAt: OLD }, { initialized: true, checkedAt: '2026-09-15' }]) {
    const result = classify(item(), { snapshot: { candidateSources: [source()], ...snapshot } });
    assert.equal(result.queueBucket, 'comparison');
    assert.equal(result.canDecide, false);
  }
});

test('incremental omission is not historical or a confirmed removal', () => {
  for (const kind of ['source-change', 'source-removal', 'source-retirement']) {
    const result = classify(item({ kind }), { snapshot: { ...options().snapshot, candidateSources: [] } });
    assert.equal(result.queueBucket, 'comparison');
    assert.equal(result.canDecide, false);
  }
});

test('strictly newer successful same-source observation makes an older version history', () => {
  assert.equal(classify(item({ sourceVersion: 'older-chunk' })).queueBucket, 'history');
  for (const changed of [{ checkedAt: OLD }, { checkedAt: '' }, { error: 'HTTP failed' },
    { httpStatus: 404 }, { lifecycle: 'retirement-pending' }, { id: 'different-source' },
    { sourceUrl: 'https://other.gov/100/Useful' }, { communityId: 'other' }]) {
    const result = classify(item({ sourceVersion: 'older-chunk' }), {
      snapshot: { ...options().snapshot, candidateSources: [source(changed)] } });
    assert.equal(result.queueBucket, 'comparison', JSON.stringify(changed));
  }
});

test('equal-time conflicting versions cannot choose a winner or retire the old item', () => {
  for (const sourceVersion of ['chunk-a', 'older-chunk']) {
    const result = classify(item({ sourceVersion }), { snapshot: { ...options().snapshot,
      candidateSources: [source(), source({ contentHash: 'chunk-b' })] } });
    assert.equal(result.queueBucket, 'comparison');
    assert.equal(result.canDecide, false);
  }
});

test('unknown source stays discovery; known out-of-scope and technical routes stay outside', () => {
  assert.equal(classify(item(), { audit: { communityId: 'example', records: [] } }).queueBucket, 'discovery');
  for (const disposition of ['out-of-scope', 'technical-exclusion']) {
    const result = classify(item(), { audit: { communityId: 'example', records: [row({ scopeStatus: 'out-of-scope', disposition })] } });
    assert.equal(result.queueBucket, 'outside');
    assert.equal(result.canDecide, false);
  }
});

test('changed excluded and link-only content is still a current review, not hidden history', () => {
  for (const disposition of ['excluded', 'safe-link']) {
    const result = classify(item(), { audit: { communityId: 'example', records: [row({ disposition })] },
      bundledIndex: { communityId: 'example', pages: [{ url: URL, contentFingerprint: 'page-old',
        chunkContentHashes: ['chunk-old'], indexedSourceIds: ['source-a'] }] } });
    assert.equal(result.queueBucket, 'current');
    assert.equal(result.canDecide, true);
  }
});

test('comparable page fingerprint and explicit chunk coverage can prove a completed exclusion', () => {
  for (const disposition of ['excluded', 'safe-link', 'live-feed']) {
    const result = classify(item(), { audit: { communityId: 'example', records: [row({ disposition })] },
      bundledIndex: { communityId: 'example', pages: [{ url: URL, contentFingerprint: 'page-a',
        chunkContentHashes: ['chunk-a'], indexedSourceIds: ['source-a'] }] } });
    assert.equal(result.queueBucket, 'history');
    assert.equal(result.canDecide, false);
    assert.match(result.queueReason, /does not approve other claims/);
  }
});

test('full-page reviewed content hashes are never directly compared with chunk versions', () => {
  const result = classify(item(), { audit: { communityId: 'example', records: [row({ disposition: 'excluded', reviewedContentHash: 'chunk-a' })] } });
  assert.equal(result.queueBucket, 'current');
  const mismatchedIdentity = classify(item({ sourceId: 'unrelated' }), {
    audit: { communityId: 'example', records: [row({ disposition: 'excluded' })] },
    bundledIndex: { communityId: 'example', pages: [{ url: URL, contentFingerprint: 'page-a', chunkContentHashes: ['chunk-a'] }] } });
  assert.equal(mismatchedIdentity.queueBucket, 'comparison');
  const laterReview = classify(item(), { audit: { communityId: 'example', records: [row({ disposition: 'excluded', reviewedContentHash: 'new-full-text-hash' })] },
    bundledIndex: { communityId: 'example', pages: [{ url: URL, contentFingerprint: 'page-a',
      chunkContentHashes: ['chunk-a'], indexedSourceIds: ['source-a'] }] } });
  assert.equal(laterReview.queueBucket, 'current', 'The older inventory fingerprint cannot silently prove a later text review.');
});

test('a fresh snapshot cannot freshen an old source observation', () => {
  const result = classify(item(), { snapshot: { ...options().snapshot, candidateSources: [source({ checkedAt: OLD })] } });
  assert.equal(result.queueBucket, 'comparison');
  assert.equal(result.canDecide, false);
});

test('incompatible hash schemes never prove a current or superseded version', () => {
  const result = classify(item({ hashScheme: 'text-only', sourceVersion: 'different-digest' }), {
    snapshot: { ...options().snapshot, candidateSources: [source({ hashScheme: 'text-plus-actions' })] } });
  assert.equal(result.queueBucket, 'comparison');
  assert.equal(result.canDecide, false);
});

test('approved exact fact scope is history while other facts and raw page remain reviewable', () => {
  const fact = item({ kind: 'fact-change', factId: 'fact-approved', claimKey: 'example:hours', proposedValue: 'Reviewed hours' });
  const opts = { bundledIndex: { communityId: 'example', pages: [{ url: URL, contentFingerprint: 'page-a',
    chunkContentHashes: ['chunk-a'], indexedSourceIds: ['source-a'] }], factLedger: [{ id: 'fact-approved',
    sourceId: 'source-a', sourceUrl: URL, sourceVersion: 'chunk-a', claimKey: 'example:hours',
    displayValue: 'Reviewed hours', reviewStatus: 'approved' }] } };
  assert.equal(classify(fact, opts).queueBucket, 'history');
  assert.equal(classify({ ...fact, factId: 'unreviewed' }, opts).queueBucket, 'comparison');
  assert.equal(classify(item(), opts).queueBucket, 'current');
});

test('canonical approval needs matching tenant, hash scheme, exact version and claim scope', () => {
  const record = item({ hashScheme: 'reviewed-v2', kind: 'fact-change', factId: 'approved-fact', lastObservedAt: CHECKED });
  const ledger = { records: [{ canonicalUrl: URL, contentHash: 'chunk-a', hashScheme: 'reviewed-v2', communityIds: ['example'],
    approvals: [{ status: 'approved', communityId: 'example', scopeKind: 'scoped-claims', approvedClaims: ['approved-fact'] }] }] };
  assert.equal(classify(record, { canonicalLedger: ledger }).queueBucket, 'history');
  for (const change of [{ hashScheme: 'other-scheme' }, { factId: 'not-approved' }, { sourceVersion: 'different' }]) {
    assert.notEqual(classify({ ...record, ...change }, { canonicalLedger: ledger }).queueBucket, 'history');
  }
  assert.notEqual(classify(item(), { canonicalLedger: ledger }).queueBucket, 'history');
  assert.equal(classify(record, { canonicalLedger: { records: [{ ...ledger.records[0], communityIds: ['other'] }] } }).queueBucket, 'comparison');
});

test('exact latest owner decisions resolve history; escalation reopens it', () => {
  const decision = { recordType: 'decision', reviewId: 'review-a', sourceVersion: 'chunk-a', sourceUrl: URL,
    communityId: 'example', decision: 'approve-proposed', decidedAt: OLD };
  const approved = classifyReviewRecords([item(), decision], options()).items[0];
  assert.equal(approved.queueBucket, 'history');
  assert.equal(approved.status, 'approved');
  assert.equal(approved.savedStatus, 'pending');
  const escalated = { ...decision, decision: 'escalate', decidedAt: CHECKED };
  const reopened = classifyReviewRecords([item(), decision, escalated], options()).items[0];
  assert.equal(reopened.queueBucket, 'current');
  assert.equal(reopened.status, 'escalated');
  assert.equal(reopened.savedStatus, 'pending');
  assert.equal(reopened.latestDecision.decision, 'escalate');
  assert.equal(reopened.canDecide, true);
  for (const change of [{ sourceVersion: 'other-version' }, { sourceUrl: 'https://other.gov' }, { communityId: 'other' }]) {
    assert.equal(classifyReviewRecords([item(), { ...decision, ...change }], options()).items[0].queueBucket, 'current');
  }
});

test('effective decision status is projected without changing saved status or merging disagreeing copies', () => {
  for (const [decision, status] of [['keep-current', 'kept-current'], ['mark-current-superseded', 'superseded'], ['exclude-page', 'excluded']]) {
    const records = [item(), { recordType: 'decision', reviewId: 'review-a', sourceVersion: 'chunk-a', sourceUrl: URL,
      decision, status: 'untrusted-inconsistent-status', decidedAt: CHECKED }];
    const result = classifyReviewRecords(records, options()).items[0];
    assert.equal(result.status, status);
    assert.equal(result.savedStatus, 'pending');
    assert.equal(result.queueBucket, 'history');
    assert.equal(records[0].status, 'pending');
  }
  const ambiguous = classifyReviewRecords([item(), item({ status: 'escalated' })], options());
  assert.equal(ambiguous.items.length, 2);
  assert.ok(ambiguous.items.every(entry => entry.queueBucket === 'comparison' && entry.canDecide === false));
});

test('missing dates and contradictory owner decisions do not hide pending work', () => {
  const decision = { recordType: 'decision', reviewId: 'review-a', sourceVersion: 'chunk-a', sourceUrl: URL,
    decision: 'approve-proposed', decidedAt: CHECKED };
  for (const decisions of [[{ ...decision, decidedAt: '' }], [decision, { ...decision, decision: 'keep-current' }]]) {
    const result = classifyReviewRecords([item(), ...decisions], options()).items[0];
    assert.equal(result.queueBucket, 'comparison');
    assert.equal(result.canDecide, false);
  }
});

test('identical display duplicates retain all storage IDs and counts; disagreements stay visible', () => {
  const same = [item({ notionPageId: 'one' }), item({ notionPageId: 'two' })];
  const result = classifyReviewRecords(same, options());
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].duplicateCount, 2);
  assert.deepEqual(result.items[0].savedRecordIds, ['one', 'two']);
  assert.equal(result.summary.savedItemCount, 2);
  assert.equal(result.summary.duplicateCount, 1);
  const ambiguous = classifyReviewRecords([...same, item({ proposedValue: 'Different payload', notionPageId: 'three' })], options());
  assert.equal(ambiguous.items.length, 2);
  assert.ok(ambiguous.items.every(row => row.queueBucket === 'comparison' && row.canDecide === false));
});

test('tenant and malformed identity entries remain visible but not actionable', () => {
  for (const record of [item({ communityId: 'other' }), item({ proposedSourceUrl: 'not a URL' })]) {
    const result = classify(record);
    assert.equal(result.queueBucket, 'discovery');
    assert.equal(result.canDecide, false);
  }
});

test('classifier never mutates records, audit, ledger, or source observations', () => {
  const records = [item(), item({ notionPageId: 'duplicate' })];
  const opts = options();
  const before = JSON.stringify({ records, opts });
  function freeze(value) { if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); } }
  freeze(records); freeze(opts);
  classifyReviewRecords(records, opts);
  assert.equal(JSON.stringify({ records, opts }), before);
});

test('summary explicitly separates current work, discovery and history without claiming unknown is zero', () => {
  const records = [item(), item({ id: 'unknown', proposedSourceUrl: 'https://example.gov/new' })];
  const result = classifyReviewRecords(records, options({ snapshot: {} }));
  assert.equal(result.summary.snapshotFresh, false);
  assert.equal(result.summary.comparison, 1);
  assert.equal(result.summary.discovery, 1);
  assert.equal(result.summary.pending, 2);
});

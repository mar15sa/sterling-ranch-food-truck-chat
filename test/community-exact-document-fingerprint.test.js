const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { observeCanonicalSource, renewExactApprovedEvidence, revalidateApprovedEvidence, sourceHash } = require('../lib/community-approved-revalidation');

const url = 'https://alpha.gov/DocumentCenter/View/100/Water-method';
const oldTime = '2026-09-01T00:00:00.000Z';
const now = Date.parse('2026-09-14T12:00:00.000Z');
const text = 'Approved calculation method. Image table is not extracted.';
const fingerprint = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const oldBytes = Buffer.from('%PDF-reviewed-image-table');
const newBytes = Buffer.from('%PDF-changed-image-table-same-text');
function source(overrides = {}) {
  return { id: 'reviewed-pdf', sourceUrl: url, connectorType: 'official-pdf', sourceType: 'forms',
    reviewStatus: 'approved', text, facts: [], actions: [], contentHash: sourceHash(text), hashScheme: 'page-text-v1',
    documentFingerprint: fingerprint(oldBytes), requireExactDocumentFingerprint: true,
    checkedAt: oldTime, staleAfter: oldTime, ...overrides };
}
function observer(bytes, extractionCounter) {
  return (sourceUrl, sources) => observeCanonicalSource(sourceUrl, sources, {
    fetchOfficialDocumentImpl: async (requested, { fetchImpl }) => { await fetchImpl(requested); return bytes; },
    fetchImpl: async () => ({ ok: true, status: 200, url, headers: new Headers() }),
    extractPdfBufferTextImpl: async () => { extractionCounter.count++; return text; },
  });
}

test('changed image-only PDF bytes cannot renew an opted-in exact approval', async () => {
  const original = { sources: [source()], factLedger: [] };
  const count = { count: 0 };
  const result = await revalidateApprovedEvidence(original, { now, fetchObservedHashes: observer(newBytes, count) });
  assert.equal(result.checks[0].outcome, 'review-required');
  assert.equal(result.checks[0].reason, 'document-binary-fingerprint-changed-or-unproved');
  assert.equal(result.checks[0].documentProof.verificationMode, 'required-binary-fingerprint-changed');
  assert.equal(count.count, 0, 'a text-only comparison cannot rescue a changed whole-document approval');
  assert.equal(result.temporaryIndex.sources[0].documentFingerprint, fingerprint(oldBytes));
  assert.equal(result.temporaryIndex.sources[0].staleAfter, oldTime);
  assert.deepEqual(original.sources[0], source());
});

test('identical opted-in PDF bytes renew and legacy text-only approvals retain their behavior', async () => {
  const count = { count: 0 };
  const exact = await revalidateApprovedEvidence({ sources: [source()], factLedger: [] }, { now, fetchObservedHashes: observer(oldBytes, count) });
  assert.equal(exact.checks[0].outcome, 'renewed');
  assert.equal(count.count, 0);
  assert.equal(exact.temporaryIndex.sources[0].documentFingerprint, fingerprint(oldBytes));
  const legacy = await revalidateApprovedEvidence({ sources: [source({ requireExactDocumentFingerprint: false })], factLedger: [] }, { now, fetchObservedHashes: observer(newBytes, count) });
  assert.equal(legacy.checks[0].outcome, 'renewed');
  assert.equal(count.count, 1);
  assert.equal(legacy.temporaryIndex.sources[0].documentFingerprint, fingerprint(newBytes));
});

test('missing required binary proof cannot report renewed or mutate the approved fingerprint', async () => {
  const missing = await revalidateApprovedEvidence({ sources: [source({ documentFingerprint: '' })], factLedger: [] }, { now, fetchObservedHashes: observer(oldBytes, { count: 0 }) });
  assert.equal(missing.checks[0].outcome, 'review-required');
  const missingObservation = await revalidateApprovedEvidence({ sources: [source()], factLedger: [] }, {
    now, fetchObservedHashes: async () => ({ observedHashes: [sourceHash(text)] }),
  });
  assert.equal(missingObservation.checks[0].outcome, 'review-required');
  const index = { sources: [source()], factLedger: [] };
  const renewal = renewExactApprovedEvidence(index, { sourceUrl: url, observedHashes: [sourceHash(text)],
    checkedAt: new Date(now).toISOString(), staleAfter: new Date(now + 86400000).toISOString(), documentFingerprint: fingerprint(newBytes) });
  assert.equal(renewal.renewedSources.length, 0);
  assert.deepEqual(renewal.requiresReview.map(s => s.id), ['reviewed-pdf']);
  assert.equal(index.sources[0].staleAfter, oldTime);
  assert.equal(index.sources[0].documentFingerprint, fingerprint(oldBytes));
});

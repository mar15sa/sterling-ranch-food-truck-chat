const test = require('node:test');
const assert = require('node:assert/strict');
const decisions = require('../data/community-document-dispositions.json');
const index = require('../data/community-index.json');
const { decisionForDocumentSource, isDocumentBodyWithheld } = require('../lib/community-document-dispositions');
const { searchCommunityIndex } = require('../lib/community-search');

function documentSource(documentId) {
  return index.sources.find(source => new RegExp(`/DocumentCenter/View/${documentId}(?:/|$)`, 'i').test(source.sourceUrl || ''));
}

test('the owner-approved four-category package classifies all 27 documents once', () => {
  assert.equal(decisions.records.length, 27);
  assert.equal(new Set(decisions.records.map(record => record.documentId)).size, 27);
  assert.equal(decisions.records.filter(record => record.disposition === 'action-only').length, 2);
  assert.equal(decisions.records.filter(record => record.disposition === 'excluded').length, 15);
  assert.equal(decisions.records.filter(record => record.disposition.startsWith('retained-')).length, 10);
});

test('excluded and action-only PDF bodies cannot enter resident retrieval', () => {
  for (const documentId of ['618', '621', '623', '625', '520', '1965', '168']) {
    const source = documentSource(documentId);
    assert.ok(source, `fixture source exists for document ${documentId}`);
    assert.ok(decisionForDocumentSource(source, index), `exact document version matches ${documentId}`);
    assert.equal(isDocumentBodyWithheld(source, index), true);
  }
  const result = searchCommunityIndex('rear patio lights five lumens', {
    index, communityId: 'sterling-ranch', now: new Date('2026-09-12T12:00:00Z'), limit: 50,
  });
  assert.equal([...result.sources, ...result.withheldSources].some(source => /\/DocumentCenter\/View\/623(?:\/|$)/i.test(source.sourceUrl || '')), false);
});

test('retained candidates stay pending and a changed document version is not silently classified', () => {
  const retained = documentSource('619');
  assert.equal(isDocumentBodyWithheld(retained, index), false);
  const changedIndex = structuredClone(index);
  const page = changedIndex.pages.find(candidate => /\/DocumentCenter\/View\/618(?:\/|$)/i.test(candidate.canonicalUrl || candidate.url || ''));
  page.contentFingerprint = 'f'.repeat(64);
  assert.equal(isDocumentBodyWithheld(documentSource('618'), changedIndex), false);
});

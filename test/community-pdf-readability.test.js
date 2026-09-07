const test = require('node:test');
const assert = require('node:assert/strict');
const { hasReadableDocumentText } = require('../lib/community-ingest');

test('damaged PDF character maps do not become readable evidence from a few incidental words', () => {
  const damaged = ('2\u0006#*\u0006-+$3\u0006(4)\u0006 ').repeat(50);
  assert.equal(hasReadableDocumentText(`${damaged} Financial report page 1`), false);
  assert.equal(hasReadableDocumentText(`${'\ufffd'.repeat(50)} Annual financial statement`), false);
});

test('normal document typography and isolated artifacts remain readable while counters alone do not', () => {
  assert.equal(hasReadableDocumentText('2026 fees\n• Water service: $20.00\tper month.\nCafé & recreation — information.'), true);
  assert.equal(hasReadableDocumentText('One isolated\u0006 artifact in an otherwise readable source document.'), true);
  assert.equal(hasReadableDocumentText('-- 1 of 7 -- -- 2 of 7 --'), false);
});

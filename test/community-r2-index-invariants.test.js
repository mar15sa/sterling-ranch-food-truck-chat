const test = require('node:test');
const assert = require('node:assert/strict');
const index = require('../data/community-index.json');
const { normalizeUrl, resolveFactLedger } = require('../lib/community-truth');

test('Release 2 ships the exact reviewed trusted-baseline evidence set', () => {
  const evidenceKeys = new Set(index.sources.map(source => `${normalizeUrl(source.sourceUrl)}\n${source.contentHash}`));
  const urls = new Set(index.sources.map(source => normalizeUrl(source.sourceUrl)));
  assert.equal(index.schemaVersion, 3);
  assert.equal(index.sources.length, 263);
  assert.equal(evidenceKeys.size, 263);
  assert.equal(urls.size, 78);
  assert.equal(index.factLedger.length, 624);
  assert.ok(index.factLedger.every(entry => entry.reviewStatus === 'approved' && entry.lifecycle === 'current'));
  assert.equal(index.truthStatus.migrationMode, 'trusted-baseline');
  const resolution = resolveFactLedger(index.factLedger, { factAuthority: index.factAuthority });
  assert.equal(resolution.unresolved.length, 20);
  assert.equal(resolution.unresolvedSensitive.length, 17);
  const versions = new Set(index.sources.map(source => `${source.id}:${source.contentHash}`));
  assert.ok(index.factLedger.every(entry => versions.has(`${entry.sourceId}:${entry.sourceVersion}`)));
});

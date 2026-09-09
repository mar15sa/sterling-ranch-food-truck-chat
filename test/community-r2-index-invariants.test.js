const test = require('node:test');
const assert = require('node:assert/strict');
const index = require('../data/community-index.json');
const { normalizeUrl, resolveFactLedger } = require('../lib/community-truth');

test('Release 2 ships the exact reviewed trusted-baseline evidence set', () => {
  const evidenceKeys = new Set(index.sources.map(source => `${normalizeUrl(source.sourceUrl)}\n${source.contentHash}`));
  const urls = new Set(index.sources.map(source => normalizeUrl(source.sourceUrl)));
  const strictWaterBillingImport = [
    ['sterling-ranch-water-billing-payment-options-334', 'https://sterlingranchcab.com/334/Water-Billing-Payment-Options', '711961b69a8acfe94cab33898c29da0df263c5b1d4f261fae2b433cf8f544f75'],
    ['sterling-ranch-view-and-pay-water-bill-332', 'https://sterlingranchcab.com/332/View-and-Pay-Your-Water-Bill', '3a97574de30055decd929fad24318777d581318d97113b871b0412f61435a9f6'],
    ['sterling-ranch-understanding-water-bill-333', 'https://sterlingranchcab.com/333/Understanding-Your-Water-Bill', 'ec41579679b1969d6efb9ad9e402f743b6176132fb1c29baf384367573f4fa71'],
    ['sterling-ranch-monthly-fee-billing-390', 'https://sterlingranchcab.com/390/Monthly-Fee-Billing-Payment-Options', '01d90cf8d4549d69b6f7a2ea177981f1f02dd55a084e3a92e812fbbab4ab7f9e'],
  ];
  assert.equal(index.schemaVersion, 3);
  assert.equal(index.sources.length, 263 + strictWaterBillingImport.length);
  assert.equal(evidenceKeys.size, index.sources.length);
  assert.equal(urls.size, 78 + strictWaterBillingImport.length);
  assert.equal(index.factLedger.length, 624 + 18);
  for (const [id, sourceUrl, contentHash] of strictWaterBillingImport) {
    const source = index.sources.find(candidate => candidate.id === id);
    assert.ok(source, `Missing strict exact-version import ${id}.`);
    assert.equal(normalizeUrl(source.sourceUrl), normalizeUrl(sourceUrl));
    assert.equal(source.contentHash, contentHash);
    assert.ok((source.facts || []).every(fact => fact.sourceVersion === contentHash));
    assert.ok((source.actions || []).every(action => action.sourceVersion === contentHash));
  }
  assert.ok(index.factLedger.every(entry => entry.reviewStatus === 'approved' && entry.lifecycle === 'current'));
  assert.equal(index.truthStatus.migrationMode, 'trusted-baseline');
  const resolution = resolveFactLedger(index.factLedger, { factAuthority: index.factAuthority });
  assert.equal(resolution.unresolved.length, 20 + 1);
  assert.equal(resolution.unresolvedSensitive.length, 17);
  const versions = new Set(index.sources.map(source => `${source.id}:${source.contentHash}`));
  assert.ok(index.factLedger.every(entry => versions.has(`${entry.sourceId}:${entry.sourceVersion}`)));
});

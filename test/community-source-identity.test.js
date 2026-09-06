const test = require('node:test');
const assert = require('node:assert/strict');
const { fingerprint } = require('../lib/community-release');
const { canonicalPageUrl } = require('../lib/community-ingest');
test('live calendar changes do not alter the approved static fingerprint', () => {
  const staticSource = { id:'rules', contentHash:'one' };
  const live = { id:'event', contentHash:'today', connectorType:'civicplus-calendar' };
  assert.equal(fingerprint({sources:[staticSource,live]}), fingerprint({sources:[staticSource,{...live,contentHash:'tomorrow'}]}));
  assert.notEqual(fingerprint({sources:[staticSource]}), fingerprint({sources:[{...staticSource,contentHash:'two'}]}));
});
test('FAQ categories stay distinct while tracking parameters are removed', () => {
  assert.notEqual(canonicalPageUrl('https://example.gov/m/faq?cat=16'),canonicalPageUrl('https://example.gov/m/faq?cat=21'));
  assert.equal(canonicalPageUrl('https://example.gov/m/faq?cat=16&utm_source=test#top'),'https://example.gov/m/faq?cat=16');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateActionLinks, checkLink } = require('../scripts/validate-community-candidate');

test('a HEAD-only 404 is checked with GET before reporting a broken action', async () => {
  const methods = [];
  const result = await checkLink('https://example.gov/facility', { fetchImpl: async (url, options) => {
    methods.push(options.method);
    return { ok: options.method === 'GET', status: options.method === 'GET' ? 200 : 404, url };
  } });
  assert.deepEqual(methods, ['HEAD', 'GET']);
  assert.equal(result.okay, true);
  assert.equal(result.headStatus, 404);
  assert.equal(result.checkedWith, 'GET');
});

test('a missing page remains broken after GET confirms the failure', async () => {
  const result = await checkLink('https://example.gov/missing', { fetchImpl: async url => ({ ok: false, status: 404, url }) });
  assert.equal(result.okay, false);
  assert.equal(result.status, 404);
  assert.equal(result.checkedWith, 'GET');
});

test('failed source gates still inspect proposed and retained action links without changing sources', async () => {
  const source = url => ({ sources: [{ actions: [{ url }] }] });
  const indexes = [source('https://example.gov/new'), source('https://example.gov/current'), source('https://example.gov/new')];
  const before = JSON.stringify(indexes);
  const result = { valid: false, errors: ['Pending sensitive source review.'] };
  const visited = [];
  const broken = await validateActionLinks(result, indexes, async url => {
    visited.push(url);
    return { url, okay: !url.endsWith('/new'), status: url.endsWith('/new') ? 404 : 200 };
  });
  assert.deepEqual(visited, ['https://example.gov/new', 'https://example.gov/current']);
  assert.equal(broken.length, 1);
  assert.equal(result.linkChecks.total, 2);
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, ['Pending sensitive source review.']);
  assert.equal(JSON.stringify(indexes), before);
});

test('invalid and insecure redirect destinations become recorded link failures', async () => {
  const result = {};
  const indexes = [{ sources: [{ actions: [{ url: 'https://example.gov/a' }, { url: 'https://example.gov/b' }] }] }];
  const broken = await validateActionLinks(result, indexes, async url => ({ url, okay: true, finalUrl: url.endsWith('/a') ? 'http://example.gov/a' : 'invalid destination' }));
  assert.equal(broken.length, 2);
  assert.equal(result.linkChecks.total, 2);
});

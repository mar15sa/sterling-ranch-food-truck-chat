const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('read-only monitor reads review data but blocks page, decision and schema writes before network access', async () => {
  const calls = [];
  const context = { URL, fetch: async (...args) => { calls.push(args); return { ok: true }; } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../scripts/source-review-readonly.cjs'), 'utf8'), context);
  await context.fetch('https://api.notion.com/v1/data_sources/review');
  await context.fetch('https://api.notion.com/v1/data_sources/review/query', { method: 'POST', body: '{}' });
  await context.fetch('https://api.github.com/repos/example/project/actions/runs');
  assert.equal(calls.length, 3);
  for (const [url, method] of [
    ['https://api.notion.com/v1/pages', 'POST'],
    ['https://api.notion.com/v1/pages/decision', 'PATCH'],
    ['https://api.notion.com/v1/data_sources/review', 'PATCH'],
    ['https://api.notion.com/v1/blocks/item', 'DELETE'],
  ]) assert.throws(() => context.fetch({ url, method }), /cannot change Notion/);
  assert.equal(calls.length, 3);
});

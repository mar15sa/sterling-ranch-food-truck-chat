const test = require('node:test');
const assert = require('node:assert/strict');
const { listOwnerMarkedQuestions } = require('../lib/rules-question-log');

function configured(t) {
  for (const [name, value] of Object.entries({ RULES_QUESTION_NOTION_TOKEN: 'test-token', RULES_QUESTION_NOTION_DATA_SOURCE_ID: 'test-source' })) {
    const prior = process.env[name];
    process.env[name] = value;
    t.after(() => { if (prior === undefined) delete process.env[name]; else process.env[name] = prior; });
  }
}
const page = (id, isTest = false) => ({ id, created_time: '2020-01-01T00:00:00Z', properties: {
  Question: { title: [{ plain_text: 'Private resident question' }] },
  'Needs work': { checkbox: true }, Testing: { checkbox: isTest },
} });

test('owner monitor reads every page without date limits, schema writes, tests or duplicate records', async t => {
  configured(t);
  const calls = [];
  const result = await listOwnerMarkedQuestions(async (url, options) => {
    assert.match(url, /\/data_sources\/test-source\/query$/);
    assert.equal(options.method, 'POST');
    const body = JSON.parse(options.body); calls.push(body);
    assert.deepEqual(body.filter.and, [
      { property: 'Needs work', checkbox: { equals: true } },
      { property: 'Testing', checkbox: { equals: false } },
    ]);
    return { ok: true, json: async () => calls.length === 1
      ? { results: [page('old-mark'), page('test', true)], has_more: true, next_cursor: 'second' }
      : { results: [page('old-mark'), page('new-mark')], has_more: false } };
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].start_cursor, 'second');
  assert.deepEqual(result.map(item => item.id), ['old-mark', 'new-mark']);
});

test('owner monitor rejects broken pagination rather than claiming full coverage', async t => {
  configured(t);
  for (const next_cursor of [null, 'repeated']) {
    await assert.rejects(listOwnerMarkedQuestions(async () => ({ ok: true, json: async () => ({
      results: [], has_more: true, next_cursor,
    }) })), /complete pagination/);
  }
  await assert.rejects(listOwnerMarkedQuestions(async () => ({ ok: true, json: async () => ({}) })), /incomplete response/);
});

test('owner monitor fails closed when credentials are absent', async t => {
  for (const name of ['RULES_QUESTION_NOTION_TOKEN', 'NOTION_API_KEY']) {
    const prior = process.env[name]; delete process.env[name];
    t.after(() => { if (prior !== undefined) process.env[name] = prior; });
  }
  await assert.rejects(listOwnerMarkedQuestions(() => assert.fail('No network call expected')), /not configured/);
});

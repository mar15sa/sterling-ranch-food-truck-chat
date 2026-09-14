const test = require('node:test');
const assert = require('node:assert/strict');
const { synthesizeCommunityAnswer } = require('../lib/community-llm');
const { rewriteAnswerWithLLM } = require('../lib/rules-llm');

const finalClause = 'Submit the fixture specification with the application before installation.';
const source = {
  id: 'alpha-lighting', title: 'Lighting application',
  text: 'Lighting specification details.\n'.repeat(240) + finalClause,
  excerpt: 'Lighting specification details.',
  evidenceContext: { coverage: 'all-available-matching-chunks' },
};

test('community composer receives the last requirement beyond the old per-source limit', async () => {
  let prompt;
  await synthesizeCommunityAnswer('Which lighting application details are required?', [source], {
    apiKey: 'fixture-only',
    fetchImpl: async (_url, request) => {
      prompt = JSON.parse(request.body).messages[0].content;
      return { ok: true, json: async () => ({ content: [] }) };
    },
  });
  assert.ok(source.text.length > 6000);
  assert.ok(prompt.includes(finalClause));
  assert.match(prompt, /all-available-matching-chunks/);
});

test('rules composer receives the last requirement and retains question-specific projections', async t => {
  const originalFetch = global.fetch;
  const originalKey = process.env.ANTHROPIC_API_KEY;
  const prompts = [];
  t.after(() => {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  });
  process.env.ANTHROPIC_API_KEY = 'fixture-only';
  global.fetch = async (_url, request) => {
    prompts.push(JSON.parse(request.body).messages[0].content);
    return { ok: true, json: async () => ({ content: [] }) };
  };
  await rewriteAnswerWithLLM('Which lighting application details are required?', 'Check the lighting application.', [source]);
  assert.equal(prompts.length, 1);
  assert.ok(prompts[0].includes(finalClause));
  assert.ok(prompts[0].includes('details.\nLighting'));
  await rewriteAnswerWithLLM('Which approved lighting detail applies?', 'Check the lighting specification.', [{
    ...source, text: 'UNAPPROVED adjacent content.',
    excerpt: 'Only the approved lighting specification applies.', questionSpecificExcerpt: true,
  }]);
  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /Only the approved lighting specification applies/);
  assert.doesNotMatch(prompts[1], /UNAPPROVED adjacent content/);
});

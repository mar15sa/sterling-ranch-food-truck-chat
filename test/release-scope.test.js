const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyChangedFiles } = require('../scripts/check-release-scope');
const { releaseCommands, runCommands } = require('../scripts/run-release-check');

test('documentation and bounded owner display changes do not depend on unrelated source renewal', () => {
  assert.equal(classifyChangedFiles(['docs/pending-notion/release.md', 'README.md']).scope, 'docs');
  assert.equal(classifyChangedFiles(['public/community-questions.js', 'test/community-question-page.test.js', 'docs/RELEASE-POLICY.md']).scope, 'owner-ui');
  assert.equal(classifyChangedFiles(['data/openings.json', 'docs/pending-notion/opening.md']).scope, 'openings');
  assert.equal(classifyChangedFiles(['data/food-truck-links.json', 'docs/pending-notion/trucks.md']).scope, 'food-trucks');
});

test('shared server, storage, security, source, workflow and mixed changes retain the full gate', () => {
  for (const file of ['server.js', 'lib/rules-question-log.js', 'lib/community-question-admin.js', 'data/community-index.json', '.github/workflows/ci.yml', 'scripts/check-release-scope.js', 'package.json', 'docs/payload.js', 'docs/../server.js', ' public/community-questions.js', 'public/community-questions.js\n']) {
    assert.equal(classifyChangedFiles(['public/community-questions.css', file]).scope, 'full', file);
  }
  assert.equal(classifyChangedFiles(['data/openings.json', 'public/community-questions.js']).scope, 'full');
  assert.equal(classifyChangedFiles(['data/food-truck-links.json', 'data/openings.json']).scope, 'full');
  assert.equal(classifyChangedFiles(['test/community-question-page.test.js']).scope, 'full');
  assert.equal(classifyChangedFiles([]).scope, 'full');
});

test('a runtime file moved into documentation is still a full release', () => {
  assert.equal(classifyChangedFiles(['lib/rules-assistant.js', 'docs/rules-assistant.md']).scope, 'full');
});

test('full releases execute the existing npm gate including its lifecycle checks exactly once', () => {
  assert.deepEqual(releaseCommands('full', '/npm/cli.js'), [{ label: 'Complete existing quality gate (precheck, check, postcheck)', args: ['/npm/cli.js', 'run', 'check'] }]);
  assert.throws(() => releaseCommands('invented', '/npm/cli.js'), /Unknown/);
  assert.throws(() => releaseCommands('full'), /npm run/);
});

test('release runner stops immediately when a step fails', async () => {
  const visited = [];
  const result = await runCommands([{ label: 'one' }, { label: 'two' }, { label: 'three' }], async command => {
    visited.push(command.label); return command.label === 'two' ? 7 : 0;
  });
  assert.equal(result, 7);
  assert.deepEqual(visited, ['one', 'two']);
});

test('CI uses the same full-diff scope for premerge and deployment, retaining required quality', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/ci.yml'), 'utf8');
  assert.match(workflow, /quality:[\s\S]*needs: fast/);
  assert.match(workflow, /check-release-scope\.js --mode pr[\s\S]*pull_request\.base\.sha[\s\S]*pull_request\.head\.sha/);
  assert.match(workflow, /if: steps\.release-scope\.outputs\.requires_evidence == 'true'\s+uses: \.\/\.github\/actions\/revalidate-approved-community-evidence/);
  assert.match(workflow, /npm run release:check -- --scope/);
  assert.match(workflow, /check-release-scope\.js --mode push[\s\S]*github\.event\.before[\s\S]*github\.sha/);
});

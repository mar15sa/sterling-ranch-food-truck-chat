const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

const OPENINGS = new Set(['data/openings.json', 'data/openings-sources.json']);
const OWNER_UI = new Set([
  'public/community-questions.html', 'public/community-questions.css', 'public/community-questions.js',
  'test/community-question-page.test.js',
]);

function isDocumentation(file) {
  return ['README.md', 'AGENTS.md', '.github/pull_request_template.md'].includes(file)
    || (/^docs\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\.md$/.test(file));
}

function classifyChangedFiles(files) {
  // Git paths are exact: never trim or normalize a suspicious name into an allowlist.
  const changedFiles = [...new Set(files.filter(file => typeof file === 'string' && file.length))].sort();
  const runtimeFiles = changedFiles.filter(file => !isDocumentation(file));
  let scope = 'full';
  if (changedFiles.length && runtimeFiles.length === 0) scope = 'docs';
  else if (runtimeFiles.length && runtimeFiles.every(file => OPENINGS.has(file))) scope = 'openings';
  else if (runtimeFiles.some(file => file.startsWith('public/')) && runtimeFiles.every(file => OWNER_UI.has(file))) scope = 'owner-ui';
  return { scope, changedFiles, requiresEvidence: scope === 'full' };
}

function changedFilesBetween(base, head, mode = 'pr') {
  if (!base || !head || !['pr', 'push'].includes(mode)) throw new Error('Provide --base, --head and --mode pr|push.');
  const commit = ref => execFileSync('git', ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`], { encoding: 'utf8' }).trim();
  const before = commit(base);
  const after = commit(head);
  // Renames count both their old and new paths; a moved runtime file cannot become docs-only.
  const range = mode === 'push' ? `${before}..${after}` : `${before}...${after}`;
  return execFileSync('git', ['diff', '--no-renames', '--name-only', '-z', range], { encoding: 'utf8' }).split('\0').filter(Boolean);
}

if (require.main === module) {
  try {
    const argument = name => { const index = process.argv.indexOf(name); return index < 0 ? '' : process.argv[index + 1]; };
    const result = classifyChangedFiles(changedFilesBetween(argument('--base'), argument('--head'), argument('--mode')));
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `scope=${result.scope}\nrequires_evidence=${result.requiresEvidence}\n`);
    console.log(JSON.stringify(result));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { classifyChangedFiles, changedFilesBetween, isDocumentation };

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateCommunityCandidate } = require('../lib/community-release');
function duplicateErrors(pages) {
  const trusted = { communityId: 'sterling-ranch', sources: [] };
  return validateCommunityCandidate(trusted, { ...trusted, pages, inventory: { complete: false } }, { communityId: 'sterling-ranch', allowedHosts: ['sterlingranchcab.com'] }).errors.filter(e => /Duplicate page content/.test(e));
}
function page(id, documentFingerprint) { return { url: 'https://sterlingranchcab.com/DocumentCenter/View/' + id, indexed: true, contentFingerprint: 'same-text', ...(documentFingerprint ? { documentFingerprint } : {}) }; }
test('different PDF bytes with equal text are not duplicate documents', () => {
  assert.deepEqual(duplicateErrors([page(2491, 'file-d'), page(2492, 'file-e')]), []);
});
test('equal PDF bytes are still duplicate documents', () => {
  assert.equal(duplicateErrors([page(2491, 'same-file'), page(2492, 'same-file')]).length, 1);
});
test('unverified PDFs remain separate and ordinary duplicate pages remain rejected', () => {
  assert.deepEqual(duplicateErrors([page(2491), page(2492)]), []);
  assert.equal(duplicateErrors([{ ...page(1), url: 'https://sterlingranchcab.com/one' }, { ...page(2), url: 'https://sterlingranchcab.com/two' }]).length, 1);
});

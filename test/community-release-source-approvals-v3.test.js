const assert = require('node:assert/strict');
const test = require('node:test');
const baseIndex = require('../data/community-index.json');
const { applyCommunityReleaseSourceApprovals } = require('../scripts/apply-community-release-source-approvals-v3');

test('four approved decisions create only exact-version claim projections', () => {
  const index = applyCommunityReleaseSourceApprovals(structuredClone(baseIndex));
  const approved = index.sources.filter((source) => source.id.startsWith('approved-'));
  assert.deepEqual(approved.map((source) => source.id).sort(), [
    'approved-drc-application-directory', 'approved-drc-contact-current', 'approved-pool-hours-current-page',
    'approved-rain-barrel-conditional-directory', 'approved-rain-barrel-conditional-submission', 'approved-utilityhawk-water-monitoring-2026',
  ]);
  assert.match(approved.find((source) => source.id === 'approved-pool-hours-current-page').text, /Labor Day/i);
  assert.doesNotMatch(approved.find((source) => source.id === 'approved-pool-hours-current-page').text, /guest passes|capacity|concessions/i);
  assert.doesNotMatch(approved.find((source) => source.id === 'approved-utilityhawk-water-monitoring-2026').text, /payment portal|electric|gas|Steward/i);
  assert.equal(approved.find((source) => source.id === 'approved-rain-barrel-conditional-directory').actions[0].url, 'https://sterlingranchcab.com/201/Design-Review-Documents');
});

test('a changed approved page version withdraws its projection', () => {
  const index = structuredClone(baseIndex);
  index.pages.find((page) => page.canonicalUrl === 'https://sterlingranchcab.com/187/Pool').contentHash = 'f'.repeat(64);
  assert.throws(() => applyCommunityReleaseSourceApprovals(index), /Approved source version is unavailable/);
});

test('approved monitoring projection stays separate from water payment claims', () => {
  const index = applyCommunityReleaseSourceApprovals(structuredClone(baseIndex));
  const monitoring = index.sources.find((source) => source.id === 'approved-utilityhawk-water-monitoring-2026');
  assert.ok(monitoring);
  assert.match(monitoring.text, /Registration/i);
  assert.doesNotMatch(monitoring.text, /Pay Online|2\.95%|billing contact/i);
});

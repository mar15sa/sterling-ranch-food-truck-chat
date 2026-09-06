const test = require("node:test");
const assert = require("node:assert/strict");
const { buildReviewItems, compileReviewedCandidate, reviewCoverage } = require("../lib/community-source-review");
const { buildFactLedger } = require('../lib/community-truth');

test('routine calendar changes create no static source review and preserve the release identity', () => {
  const { fingerprint } = require('../lib/community-source-review');
  const before = {sources:[{id:'calendar',contentHash:'yesterday',connectorType:'civicplus-calendar'}]};
  const after = {sources:[{id:'calendar',contentHash:'today',connectorType:'civicplus-calendar'}]};
  assert.deepEqual(buildReviewItems(before,after,{}),[]);
  assert.equal(fingerprint(before),fingerprint(after));
});

const profile = {
  factAuthority: {
    fee: ["civicplus-pages"], contact: ["civicplus-pages"], restriction: ["municode", "civicplus-pages"],
    "live-status": ["live-status"], "facility-hours": ["civicplus-pages"], "reservation-policy": ["civicplus-pages"],
    submission: ["civicplus-pages"], "event-date": ["civicplus-calendar"],
  },
};
function source(hash, value = "$10") {
  return { id: "fees", communityId: "alpha", title: "Facility fees", sourceUrl: "https://alpha.gov/fees", sourceType: "facilities", connectorType: "civicplus-pages", authorityScore: 1, text: `The fee is ${value}.`, excerpt: `The fee is ${value}.`, actions: [], facts: [{ id: "fee", factKey: "fee", type: "money", value, context: `The fee is ${value}.` }], contentHash: hash, checkedAt: "2026-09-01T00:00:00Z", staleAfter: "2099-01-01T00:00:00Z" };
}

test("source comparisons include changed clauses beyond the short excerpt", () => {
  const current = source("old");
  const proposed = { ...source("new"), text: "Application instructions. ".repeat(30) + "The modification fee is $150.", excerpt: "Application instructions." };
  const items = buildReviewItems({ sources: [current] }, { sources: [proposed] }, profile);
  const item = items.find(item => item.facet === "source");
  assert.match(item.proposedValue, /modification fee is \$150/);
  assert.match(item.supportingText, /modification fee is \$150/);
});

test("every material source change requires a hash-bound decision", () => {
  const trusted = { communityId: "alpha", sources: [source("old")], factLedger: [] };
  const candidate = { communityId: "alpha", generatedAt: "2026-09-01T00:00:00Z", sources: [source("new", "$12")] };
  const items = buildReviewItems(trusted, candidate, profile);
  assert.ok(items.some((item) => item.kind === "source-change"));
  assert.ok(reviewCoverage(items, []).pending.length > 0);
  const item = items.find((record) => record.kind === "source-change");
  const valid = { reviewId: item.id, sourceId: item.sourceId, sourceVersion: item.sourceVersion, sourceUrl: item.proposedSourceUrl, decision: "approve-proposed", note: "Confirmed", decidedAt: "2026-09-01T01:00:00Z" };
  assert.equal(reviewCoverage(items, [valid]).matched >= 1, true);
  assert.equal(reviewCoverage(items, [{ ...valid, sourceVersion: "changed-again" }]).matched, 0);
});

test("old decisions become stale only when that same source changes again", () => {
  const trusted = { communityId: "alpha", sources: [source("old")], factLedger: [] };
  const candidate = { communityId: "alpha", generatedAt: "2026-09-01T00:00:00Z", sources: [source("new", "$12")] };
  const items = buildReviewItems(trusted, candidate, profile);
  const result = compileReviewedCandidate(trusted, candidate, profile, [{ reviewId: "old-review", sourceId: "fees", sourceVersion: "older", sourceUrl: "https://alpha.gov/fees", decision: "approve-proposed" }]);
  assert.equal(result.staleDecisions.length, 1);
  const unrelated = compileReviewedCandidate(trusted, candidate, profile, [{ reviewId: "unrelated", sourceId: "other", sourceVersion: "older", sourceUrl: "https://alpha.gov/other", decision: "approve-proposed" }]);
  assert.equal(unrelated.staleDecisions.length, 0);
  assert.ok(items.length > 0);
});

test('batch assembly retains exact decisions but requires review for newly extracted facts on unchanged pages', () => {
  const original = { ...source('same'), reviewStatus: 'approved' };
  const trusted = { communityId: 'alpha', sources: [original] };
  trusted.factLedger = buildFactLedger(trusted, { trusted: true });
  const proposed = { ...original, facts: [...original.facts,
    { type: 'email', value: 'billing@example.gov', context: 'Billing: billing@example.gov' }] };
  const result = compileReviewedCandidate(trusted, { ...trusted, sources: [proposed] }, profile);
  assert.equal(result.candidate.factLedger.find(f => f.factType === 'money').reviewStatus, 'approved');
  const contact = result.candidate.factLedger.find(f => f.factType === 'email');
  assert.equal(contact.reviewStatus, 'candidate');
  assert.ok(result.coverage.pending.some(item => item.factId === contact.id));
  assert.equal(result.candidate.truthStatus.migrationMode, 'reviewed');
});

test('a source-only decision does not approve new sensitive facts omitted from the input ledger', () => {
  const trusted = { communityId: 'alpha', sources: [], factLedger: [] };
  const candidate = { communityId: 'alpha', sources: [source('new')], factLedger: [] };
  const preview = compileReviewedCandidate(trusted, candidate, profile);
  const item = preview.items.find(item => item.kind.startsWith('source-'));
  const result = compileReviewedCandidate(trusted, candidate, profile, [{
    reviewId: item.id, sourceId: item.sourceId, sourceVersion: item.sourceVersion,
    sourceUrl: item.proposedSourceUrl, decision: 'approve-proposed',
  }]);
  assert.equal(result.candidate.sources[0].reviewStatus, 'approved');
  assert.equal(result.candidate.factLedger[0].reviewStatus, 'candidate');
  assert.ok(result.coverage.pending.some(item => item.factId));
  const decisions = preview.items.map(item => ({
    reviewId: item.id, sourceId: item.sourceId, sourceVersion: item.sourceVersion,
    sourceUrl: item.proposedSourceUrl, factId: item.factId, decision: 'approve-proposed',
    reviewer: 'test-owner', decidedAt: '2026-09-06T00:00:00Z',
  }));
  const approved = compileReviewedCandidate(trusted, candidate, profile, decisions);
  assert.equal(approved.coverage.pending.length, 0);
  assert.equal(approved.candidate.factLedger[0].reviewStatus, 'approved');
  const changed = compileReviewedCandidate(trusted, { ...candidate, sources: [source('changed-again')] }, profile, decisions);
  assert.equal(changed.candidate.factLedger[0].reviewStatus, 'candidate');
  assert.ok(changed.coverage.pending.length > 0);
});

test('batch assembly leaves live calendar facts outside static approval requirements', () => {
  const live = { ...source('today'), connectorType: 'civicplus-calendar', sourceType: 'events' };
  const result = compileReviewedCandidate({ sources: [] }, { communityId: 'alpha', sources: [live] }, profile);
  assert.equal(result.candidate.sources.length, 1);
  assert.deepEqual(result.candidate.factLedger, []);
  assert.equal(result.coverage.pending.length, 0);
});

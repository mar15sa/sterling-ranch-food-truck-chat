const test = require('node:test');
const assert = require('node:assert/strict');
const { approvedActionIssues } = require('../scripts/reviewed-source-hosted-proof');
const decision = {
  decisionId: 'approved-route', approvedClaims: ['route'],
  versions: [{ canonicalUrl: 'https://alpha.gov/facility', contentHash: 'exact-version' }],
  approvedActions: [{ evidence: { label: 'Reserve', url: 'https://booking.alpha.gov/reserve', context: 'Reserve this facility' },
    display: { label: 'Open booking page', actionType: 'information' } }],
};
function response() {
  return { sources: [{ id: 'facility', sourceUrl: decision.versions[0].canonicalUrl, contentHash: 'exact-version' }],
    actions: [{ url: decision.approvedActions[0].evidence.url, actionType: 'information',
      evidence: { ...decision.approvedActions[0].evidence }, reviewStatus: 'approved',
      reviewDecisionId: decision.decisionId, approvalClaim: 'route', sourceVersion: 'exact-version' }],
    claims: [{ verified: true, evidenceSourceIds: ['facility'], approvalClaimIds: ['route'] }] };
}

test('hosted booking checks accept the exact approved destination even when its presentation type is information', () => {
  assert.deepEqual(approvedActionIssues(response(), decision), []);
});

test('a booking label cannot substitute for the exact approved URL, proof, version or decision', () => {
  for (const patch of [{ url: 'https://wrong.example/book' }, { evidence: {} }, { sourceVersion: 'changed' },
    { reviewStatus: 'candidate' }, { reviewDecisionId: 'another' }, { approvalClaim: 'unapproved' }]) {
    const body = response();
    Object.assign(body.actions[0], patch, { actionType: 'booking' });
    assert.ok(approvedActionIssues(body, decision).length);
  }
});

test('hosted action checks require the matching source and verified scoped claim', () => {
  for (const change of [body => { body.sources[0].contentHash = 'changed'; },
    body => { body.sources[0].sourceUrl = 'https://alpha.gov/another'; },
    body => { body.claims = []; }, body => { body.claims[0].verified = false; },
    body => { body.claims[0].evidenceSourceIds = ['unrelated']; },
    body => { body.claims[0].approvalClaimIds = ['unapproved']; }]) {
    const body = response(); change(body);
    assert.ok(approvedActionIssues(body, decision).length);
  }
  assert.ok(approvedActionIssues(response(), undefined).length);
});

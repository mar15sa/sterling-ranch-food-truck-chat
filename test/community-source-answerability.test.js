const test = require('node:test');
const assert = require('node:assert/strict');
const { searchCommunityIndex } = require('../lib/community-search');
const { canonicalProjectionEntries, sourceReviewGate } = require('../lib/community-source-answerability');
const { answerCommunityQuestion } = require('../lib/community-assistant');
const { applyReviewDecisions, buildFactLedger } = require('../lib/community-truth');
const canonicalLedger = require('../data/canonical-source-ledger.json');
const now = new Date('2026-09-06T22:00:00Z');
const source = { id: 'water', communityId: 'alpha', sourceUrl: 'https://alpha.gov/water-billing', title: 'Water billing prices',
  sourceType: 'services', connectorType: 'civicplus-pages', contentHash: 'v1', reviewStatus: 'approved',
  text: 'Water billing price is $20 per month. Contact new-office@example.com for billing.', authorityScore: 1,
  lifecycle: 'current', staleAfter: '2099-01-01', facts: [{ type: 'money', value: '$20 per month', normalizedValue: 20 }] };
const explicit = (entry, id) => ({ ...entry, reviewDecisionId: id, reviewedAt: '2026-09-06T20:00:00Z', reviewedBy: 'owner' });
const fee = explicit({ sourceId: 'water', sourceVersion: 'v1', factType: 'money', facet: 'fee', scopeKey: 'money', claimKey: 'water:fee',
  normalizedValue: 20, reviewStatus: 'approved', lifecycle: 'current', staleAfter: '2099-01-01', supportingText: 'Water billing price is $20 per month.' }, 'fee-decision');
const contact = { ...fee, factType: 'email', facet: 'contact', claimKey: 'water:contact', normalizedValue: 'new-office@example.com' };
const makeIndex = facts => ({ communityId: 'alpha', sources: [source], factLedger: facts, truthStatus: { migrationMode: 'reviewed' } });
test('retrieval keeps an approved claim but strips another pending facet from the source prose', () => {
  const approved = searchCommunityIndex('water billing price', { index: makeIndex([fee, contact]), now });
  assert.equal(approved.sources.length, 1);
  const pending = searchCommunityIndex('water billing price', { index: makeIndex([fee, { ...contact, reviewStatus: 'candidate' }]), now });
  assert.equal(pending.sources.length, 1);
  assert.match(pending.sources[0].text, /\$20/);
  assert.doesNotMatch(pending.sources[0].text, /new-office@example\.com/);
});
test('mixed fee approvals and stale source versions cannot leak through a matching approved fact', () => {
  for (const facts of [[fee, { ...fee, normalizedValue: 25, reviewStatus: 'candidate' }], [{ ...fee, sourceVersion: 'old' }]]) {
    assert.equal(searchCommunityIndex('water billing price', { index: makeIndex(facts), now }).sources.length, 0);
  }
});
test('static review rules leave live calendar identity separate', () => {
  assert.equal(sourceReviewGate(makeIndex([]), now.getTime())({ id: 'live-calendar', sourceType: 'events', connectorType: 'civicplus-calendar', lifecycle: 'current' }), true);
});

test('trusted-baseline labels without a claim decision are never owner approval', () => {
  const inherited = { ...fee, reviewDecisionId: '', reviewedAt: '', reviewedBy: '' };
  const index = { ...makeIndex([inherited]), truthStatus: { migrationMode: 'trusted-baseline' } };
  assert.equal(sourceReviewGate(index, now.getTime())(source), false);
  assert.equal(searchCommunityIndex('water billing price', { index, now }).sources.length, 0);
});

test('canonical scoped water-payment approval projects only its matched action through strict search and answer routes', async () => {
  const payment = {
    id: 'water-payment-current', communityId: 'sterling-ranch', sourceType: 'services', connectorType: 'civicplus-pages',
    sourceUrl: 'https://sterlingranchcab.com/332/View-and-Pay-Your-Water-Bill',
    title: 'View and Pay Your Water Bill', contentHash: '3a97574de30055decd929fad24318777d581318d97113b871b0412f61435a9f6',
    staleAfter: '2099-01-01T00:00:00Z', authorityScore: 1,
    text: 'Pay your water bill online. Call 303-555-0199 for billing help. Water rates are shown here.',
    facts: [{ type: 'phone', value: '303-555-0199', context: 'Call 303-555-0199 for billing help.', approvalClaim: 'contacts' }],
    actions: [
      { label: 'Pay your water bill', url: 'https://payments.example.test/water', approvalClaim: 'direct-water-payment-link', actionType: 'payment' },
      { label: 'Billing help', url: 'https://payments.example.test/help', approvalClaim: 'contacts', actionType: 'contact' },
    ],
  };
  const index = { communityId: 'sterling-ranch', sources: [payment], factLedger: [], canonicalSourceLedger: canonicalLedger, truthStatus: { migrationMode: 'trusted-baseline' } };
  assert.deepEqual(canonicalProjectionEntries(payment, index).map((entry) => ({ decision: entry.reviewDecisionId, version: entry.sourceVersion })), [{ decision: 'water-payment-direct-link', version: payment.contentHash }]);
  const searched = searchCommunityIndex('Where can I pay my water bill?', { index, now });
  assert.equal(searched.sources.length, 1);
  assert.equal(searched.sources[0].text, 'Pay your water bill');
  assert.deepEqual(searched.sources[0].facts, []);
  assert.deepEqual(searched.sources[0].actions.map((action) => action.url), ['https://payments.example.test/water']);
  const answer = await answerCommunityQuestion('Where can I pay my water bill?', {
    index, communityId: 'sterling-ranch', isTest: true, planCommunitySearch: false, synthesizeCommunityAnswer: false,
    answerRulesQuestion: () => ({ answer: 'No fallback.', sources: [], actions: [], confidence: { canAnswer: false } }),
  });
  assert.equal(answer.confidence.canAnswer, true);
  assert.ok(answer.actions.some((action) => action.url === 'https://payments.example.test/water'));
  assert.doesNotMatch(answer.answer, /303-555-0199|rates/i);
  const changed = searchCommunityIndex('Where can I pay my water bill?', { index: { ...index, sources: [{ ...payment, contentHash: 'f'.repeat(64) }] }, now });
  assert.equal(changed.sources.length, 0);
  assert.equal(changed.withheldSources[0].text, '');
});

test('generic exact-version action composition works for a second community and non-water service', async () => {
  const guideUrl = 'https://beta.example.gov/parking/permit-renewal';
  const actionUrl = 'https://beta.example.gov/forms/parking-permit-renewal';
  const guideHash = 'a'.repeat(64);
  const actionHash = 'b'.repeat(64);
  const guide = {
    id: 'beta-parking-permit-guide', communityId: 'beta', sourceType: 'forms', connectorType: 'civicplus-pages',
    sourceUrl: guideUrl, title: 'Parking Permit Renewal Guide', contentHash: guideHash, staleAfter: '2099-01-01T00:00:00Z', authorityScore: 1,
    text: 'Renew your parking permit with the online renewal form. Unapproved neighboring phone: 555-0100.',
    facts: [
      { type: 'information', value: 'online-renewal', context: 'Renew your parking permit with the online renewal form.', approvalClaim: 'permit-renewal-process' },
      { type: 'email', value: 'permits@beta.example.gov', context: 'For renewal help, email permits@beta.example.gov.', approvalClaim: 'permit-renewal-contact' },
    ],
    actions: [],
  };
  const action = {
    id: 'beta-parking-permit-action', communityId: 'beta', sourceType: 'forms', connectorType: 'civicplus-pages',
    sourceUrl: actionUrl, title: 'Parking Permit Renewal Form', contentHash: actionHash, staleAfter: '2099-01-01T00:00:00Z', authorityScore: 1,
    text: 'Use the official parking permit renewal form.', facts: [],
    actions: [{ label: 'Open parking permit renewal form', url: 'https://permits.beta.example.gov/renew', actionType: 'application', approvalClaim: 'permit-renewal-action' }],
  };
  const ledger = {
    records: [{
      key: `${guideUrl}#sha256:${guideHash}`, canonicalUrl: guideUrl, contentHash: guideHash,
      approvals: [{
        status: 'approved', communityId: 'beta', decisionId: 'beta-permit-renewal-guide', scopeKind: 'scoped-claims',
        approvedClaims: ['permit-renewal-process', 'permit-renewal-contact'], withheldClaims: ['neighboring-phone'],
      }],
    }, {
      key: `${actionUrl}#sha256:${actionHash}`, canonicalUrl: actionUrl, contentHash: actionHash,
      approvals: [{
        status: 'approved', communityId: 'beta', decisionId: 'beta-permit-renewal-action', scopeKind: 'scoped-claims',
        approvedClaims: ['permit-renewal-action'], withheldClaims: [],
      }],
    }],
  };
  const index = { communityId: 'beta', communityName: 'Beta', website: 'https://beta.example.gov', sources: [guide, action], factLedger: [], canonicalSourceLedger: ledger };
  const planCommunitySearch = async () => ({
    intent: 'forms', goal: 'application', goals: ['application'], subject: 'parking permit renewal',
    requestedDetails: ['action', 'contact'], filters: {}, searchQueries: ['parking permit renewal form'], scope: 'community', needsClarification: false,
  });
  let composedSources;
  const answer = await answerCommunityQuestion('How do I renew my parking permit, and who can help?', {
    index,
    communityId: 'beta', now, interpretationMode: 'structured',
    synthesizeCommunityAnswer: async (_question, sources) => {
      composedSources = sources;
      return {
        directAnswer: 'Open the parking permit renewal form to renew your permit.',
        keyDetails: ['For renewal help, email permits@beta.example.gov.'],
        nextStep: 'Use the parking permit renewal form.',
      };
    },
    planCommunitySearch,
  });
  assert.equal(answer.answerStatus, 'verified');
  assert.equal(answer.answerMode, 'community-approved-operational-grounded-ai');
  assert.equal(answer.authorityDecision, 'exact-version-approved-claims');
  assert.match(answer.answer, /Open (?:the )?parking permit renewal form/);
  assert.match(answer.answer, /permits@beta\.example\.gov/);
  assert.deepEqual(answer.actions.map((action) => action.url), ['https://permits.beta.example.gov/renew']);
  assert.doesNotMatch(answer.answer, /555-0100/);
  assert.deepEqual(new Set(answer.sources.map((source) => source.id)), new Set([guide.id, action.id]));
  const actionClaim = answer.claims.find((claim) => /Open the parking permit renewal form/.test(claim.text));
  const contactClaim = answer.claims.find((claim) => /permits@beta\.example\.gov/.test(claim.text));
  assert.ok(actionClaim.evidenceSourceIds.includes(action.id));
  assert.deepEqual(contactClaim.evidenceSourceIds, [guide.id]);
  const displayedSourceIds = new Set(answer.sources.map((source) => source.id));
  assert.ok(answer.claims.every((claim) => claim.evidenceSourceIds.every((sourceId) => displayedSourceIds.has(sourceId))));
  assert.equal(composedSources.some((source) => /555-0100/.test(source.text || '')), false);

  const missingContact = await answerCommunityQuestion('How do I renew my parking permit, and who can help?', {
    index: { ...index, sources: [action] }, communityId: 'beta', now, interpretationMode: 'structured', synthesizeCommunityAnswer: false,
    planCommunitySearch,
  });
  assert.notEqual(missingContact.answerStatus, 'verified');
  assert.notEqual(missingContact.answerMode, 'community-approved-operational');
});

test('trash schedule family requires claim approval and mixed pages expose only approved claims and actions', () => {
  const trash = {
    id: 'trash', communityId: 'alpha', sourceUrl: 'https://alpha.gov/trash', title: 'Trash collection schedule',
    sourceType: 'services', connectorType: 'civicplus-pages', contentHash: 'trash-v1', authorityScore: 1,
    lifecycle: 'current', staleAfter: '2099-01-01',
    text: 'Trash pickup is Tuesday. Recycling is secretly Wednesday. Contact hidden@example.com.',
    excerpt: 'Trash pickup is Tuesday. Recycling is secretly Wednesday.',
    facts: [
      { type: 'schedule', value: 'Tuesday', context: 'Trash pickup is Tuesday.' },
      { type: 'email', value: 'hidden@example.com', context: 'Contact hidden@example.com.' },
      { type: 'link', value: 'https://alpha.gov/trash/calendar', context: 'Open trash calendar: https://alpha.gov/trash/calendar' },
    ],
    actions: [{ label: 'Open trash calendar', url: 'https://alpha.gov/trash/calendar', actionType: 'information' }],
  };
  const base = { communityId: 'alpha', sources: [trash], truthStatus: { migrationMode: 'trusted-baseline' } };
  const pending = buildFactLedger(base, { trusted: true });
  assert.ok(pending.every(entry => entry.reviewStatus === 'candidate'));
  assert.equal(searchCommunityIndex('trash collection schedule', { index: { ...base, factLedger: pending }, now }).sources.length, 0);

  const schedule = pending.find(entry => entry.factType === 'schedule');
  const link = pending.find(entry => entry.factType === 'link');
  const decisions = [schedule, link].map((entry, index) => ({
    id: `trash-decision-${index}`, decision: 'approve-proposed', factId: entry.id,
    sourceVersion: entry.sourceVersion, sourceUrl: entry.sourceUrl,
    reviewer: 'owner', decidedAt: '2026-09-06T20:00:00Z',
  }));
  const approvedLedger = applyReviewDecisions(pending, decisions).ledger;
  const result = searchCommunityIndex('trash collection schedule', { index: { ...base, factLedger: approvedLedger }, now });
  assert.equal(result.sources.length, 1);
  assert.match(result.sources[0].text, /Trash pickup is Tuesday/);
  assert.doesNotMatch(result.sources[0].text, /Wednesday|hidden@example\.com/);
  assert.equal(result.sources[0].facts.length, 2);
  assert.equal(result.sources[0].actions.length, 1);

  const changed = { ...trash, contentHash: 'trash-v2' };
  const changedResult = searchCommunityIndex('trash collection schedule', {
    index: { ...base, sources: [changed], factLedger: approvedLedger }, now,
  });
  assert.equal(changedResult.sources.length, 0);
  assert.equal(changedResult.withheldSources[0].text, '');
});

test('trusted baseline still withholds every source participating in a sensitive conflict', () => {
  const competing = { ...source, id: 'water-copy', contentHash: 'v2' };
  const conflictingFee = { ...fee, sourceId: competing.id, sourceVersion: competing.contentHash, normalizedValue: 25 };
  const index = {
    ...makeIndex([fee, conflictingFee]),
    sources: [source, competing],
    truthStatus: { migrationMode: 'trusted-baseline' },
  };
  const canUse = sourceReviewGate(index, now.getTime());
  assert.equal(canUse(source), false);
  assert.equal(canUse(competing), false);
});

test('a pending controlling source produces an explicitly unverified answer without consulting fallback rules', async () => {
  const answer = await answerCommunityQuestion('What is the water billing price?', {
    index: makeIndex([{ ...fee, reviewStatus: 'candidate' }, contact]),
    communityId: 'alpha', isTest: true,
    planCommunitySearch: false, synthesizeCommunityAnswer: false,
    answerRulesQuestion: () => { throw new Error('Pending controlling evidence must not be bypassed.'); },
  });
  assert.equal(answer.answerMode, 'community-freshness-withheld');
  assert.equal(answer.confidence.canAnswer, false);
  assert.equal(answer.confidence.reason, 'source-review-required');
  assert.equal(answer.confidence.score, 0);
  assert.equal(answer.answerStatus, 'source-unavailable');
  assert.doesNotMatch(answer.answer, /\$20|new-office@example\.com/);
  assert.equal(answer.actions[0].url, source.sourceUrl);
});

test('AI-first test traffic still withholds a controlling trusted-baseline sensitive conflict', async () => {
  const competing = { ...source, id: 'water-copy', contentHash: 'v2', sourceUrl: 'https://alpha.gov/water-rates' };
  const conflictingFee = { ...fee, sourceId: competing.id, sourceVersion: competing.contentHash, sourceUrl: competing.sourceUrl, normalizedValue: 25 };
  let plannerCalls = 0;
  const answer = await answerCommunityQuestion('What is the water billing price?', {
    index: { ...makeIndex([fee, conflictingFee]), sources: [source, competing], truthStatus: { migrationMode: 'trusted-baseline' } },
    communityId: 'alpha', isTest: true, interpretationMode: 'structured',
    planCommunitySearch: async () => {
      plannerCalls += 1;
      return { intent: 'services', goal: 'cost', goals: ['cost'], subject: 'water billing', requestedDetails: ['price'], searchQueries: ['water billing price'], scope: 'community' };
    },
    synthesizeCommunityAnswer: false,
    answerRulesQuestion: () => { throw new Error('Withheld controlling evidence must not reach rules fallback.'); },
  });
  assert.equal(plannerCalls, 1);
  assert.equal(answer.routingDecision, 'ai-planned');
  assert.equal(answer.answerMode, 'community-freshness-withheld');
  assert.equal(answer.answerStatus, 'source-unavailable');
  assert.doesNotMatch(answer.answer, /\$20|\$25/);
});

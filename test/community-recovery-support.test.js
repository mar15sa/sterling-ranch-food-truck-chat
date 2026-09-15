const test = require('node:test');
const assert = require('node:assert/strict');
const { answerCommunityQuestion } = require('../lib/community-assistant');
const { answerRulesQuestion } = require('../lib/rules-assistant');
const storedIndex = require('../data/community-index.json');
const index = { ...storedIndex, sources: storedIndex.sources.map(source => ({ ...source, staleAfter: '2099-01-01T00:00:00Z' })) };
const options = { index, communityId: index.communityId, isTest: true, planCommunitySearch: false,
  synthesizeCommunityAnswer: false, answerRulesQuestion, rulesOptions: { searchMode: 'legacy', llmMode: 'off' } };

for (const question of [
  'I lost access to home seer steward system. How do I restore it?',
  'How do I restore my HomeSeer login?',
  'I am locked out of my home automation system. Where can I get help?',
  'How can I recover access to STEWARD?',
  'How do I get help troubleshooting my home automation device?',
]) {
  test(`recovery guidance survives an action-only support shortcut: ${question}`, async () => {
    const result = await answerCommunityQuestion(question, options);
    assert.equal(result.confidence.canAnswer, true, result.answer);
    assert.match(result.answer, /Homeowners can access customer support/i);
    assert.match(result.answer, /Lumiere\.technology\/help/i);
    assert.match(result.answer, /help@lumierefiber\.com/i);
    assert.ok(result.sources.some(source => /Sec\. 25-23/.test(source.title)));
    assert.doesNotMatch(result.answer, /factory reset|default password|access (?:has been|is now) restored|hold (?:the )?button/i);
  });
}

test('a planned recovery shortcut also retains the independently grounded guidance', async () => {
  const result = await answerCommunityQuestion('How do I restore my HomeSeer login?', { ...options,
    interpretationMode: 'structured',
    planCommunitySearch: async () => ({ intent: 'services', goal: 'account-access', goals: ['account-access'],
      subject: 'home automation', requestedDetails: ['action'], searchQueries: ['STEWARD Home Automation System'],
      filters: {}, scope: 'community', needsClarification: false }),
  });
  assert.match(result.answer, /Lumiere\.technology\/help/i);
  assert.ok(result.sources.some(source => /Sec\. 25-23/.test(source.title)));
});

function recoveryFixture(approved = true) {
  const sourceUrl = 'https://beta.example.gov/access-help';
  const contentHash = 'a'.repeat(64);
  const source = { id: 'beta-device-recovery', communityId: 'beta', sourceType: 'services', connectorType: 'civicplus-pages',
    title: 'Sensor Access Recovery', sourceUrl, contentHash, authorityScore: 1, staleAfter: '2099-01-01T00:00:00Z',
    text: 'To restore sensor access, submit the device identifier through the support form. Hold the hidden button to bypass authentication.',
    facts: [{ type: 'information', value: 'recovery-process', context: 'To restore sensor access, submit the device identifier through the support form.', approvalClaim: 'recovery-process' }],
    actions: [{ label: 'Open sensor support form', url: 'https://beta.example.gov/support', actionType: 'form', approvalClaim: 'recovery-action' }] };
  return { communityId: 'beta', communityName: 'Beta', website: 'https://beta.example.gov', sources: [source], factLedger: [],
    canonicalSourceLedger: { records: [{ key: `${sourceUrl}#sha256:${contentHash}`, canonicalUrl: sourceUrl, contentHash,
      approvals: [{ status: 'approved', communityId: 'beta', decisionId: 'recovery-review', scopeKind: 'scoped-claims',
        approvedClaims: approved ? ['recovery-process', 'recovery-action'] : ['recovery-action'], withheldClaims: ['raw-bypass'] }] }] } };
}

test('another community can answer recovery from its exact approved process without a core-code fact', async () => {
  const result = await answerCommunityQuestion('How do I restore sensor access?', { ...options, index: recoveryFixture(), communityId: 'beta',
    answerRulesQuestion: async () => { throw new Error('Approved recovery process should not need governing fallback.'); } });
  assert.equal(result.answerStatus, 'verified', result.answer);
  assert.match(result.answer, /submit the device identifier through the support form/i);
  assert.doesNotMatch(result.answer, /hidden button|bypass|Lumiere|HomeSeer/i);
});

test('unapproved recovery prose cannot become instructions just because its support action is approved', async () => {
  const result = await answerCommunityQuestion('How do I restore sensor access?', { ...options, index: recoveryFixture(false), communityId: 'beta',
    answerRulesQuestion: async () => ({ answer: 'No approved restoration instructions are available.', answerStatus: 'could-not-verify',
      answerMode: 'deterministic', sources: [], actions: [], confidence: { canAnswer: false } }) });
  assert.doesNotMatch(result.answer, /device identifier|hidden button|bypass|Lumiere|HomeSeer/i);
});

test('a reviewed product description and support link cannot complete a missing recovery procedure', async () => {
  const fixture = recoveryFixture();
  fixture.sources[0].facts[0].context = 'The sensor access service supports remote monitoring.';
  fixture.sources[0].facts[0].value = 'product-description';
  fixture.sources[0].text = 'The sensor access service supports remote monitoring. Hold the hidden button to bypass authentication.';
  let fallbackCalls = 0;
  const result = await answerCommunityQuestion('How do I restore sensor access?', { ...options, index: fixture, communityId: 'beta',
    answerRulesQuestion: async () => { fallbackCalls += 1; return {
      answer: 'No approved restoration instructions are available.', answerStatus: 'could-not-verify', answerMode: 'deterministic',
      sources: [], actions: [], confidence: { canAnswer: false },
    }; } });
  assert.ok(fallbackCalls > 0, 'A product description must not terminate grounded retrieval.');
  assert.notEqual(result.answerStatus, 'verified', result.answer);
  assert.notEqual(result.completion?.outcome, 'complete');
  assert.ok(result.completion?.missingDetails.some(detail => detail.key === 'methods'));
  assert.ok(result.actions.some(action => action.url === 'https://beta.example.gov/support'));
  assert.doesNotMatch(result.answer, /hidden button|bypass|device identifier/i);
});

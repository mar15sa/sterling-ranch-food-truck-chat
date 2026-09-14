const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAnswerContract } = require('../lib/community-contracts');
const packageData = require('../data/community-source-approvals-v8.json');

const source = { id: 'reviewed-source', authorityScore: 1, sourceType: 'services', connectorType: 'official-pdf' };
const contract = details => buildAnswerContract({ directAnswer: 'The reviewed source records the following details.',
  keyDetails: details, sources: [source], status: 'verified', requestedDetails: [], coveredDetails: [],
  claims: details.map(text => ({ text, evidenceSourceIds: [source.id] })),
});

test('long approved findings retain the complete dated resolution in visible text', () => {
  const report = packageData.decisions.find(decision => decision.versions[0].canonicalUrl.includes('/2398/'));
  const finding = report.facts.find(fact => fact.id.endsWith('cab-2025-coliform-response')).text;
  assert.ok(finding.length > 420);
  const result = contract([finding]);
  assert.equal(result.keyDetails[0], finding);
  assert.ok(result.answer.includes(finding));
  assert.match(result.answer, /result was .absent. of coliform and e-coli/);
  assert.equal(result.claims[0].text, result.keyDetails[0]);
  assert.equal(result.answerStatus, 'verified');
});

test('complete claim display preserves a late exception without community-specific wording', () => {
  const detail = `The permit application includes ${'a supporting specification, '.repeat(22)}and the final signed diagram. Permission is not granted unless the separate inspection is passed; emergency work remains exempt.`;
  const result = contract([detail]);
  assert.ok(detail.indexOf('Permission is not granted') > 420);
  assert.equal(result.keyDetails[0], detail);
  assert.match(result.answer, /not granted unless the separate inspection is passed; emergency work remains exempt\.$/m);
});

test('selected details remain count-bounded and whitespace-normalized without changing their words', () => {
  const details = ['First\n complete\tclaim.', 'Second complete claim.', 'Third complete claim.', 'Fourth unselected claim.'];
  const result = contract(details);
  assert.deepEqual(result.keyDetails, ['First complete claim.', 'Second complete claim.', 'Third complete claim.']);
  assert.doesNotMatch(result.answer, /Fourth unselected/);
});

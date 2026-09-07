const test = require('node:test');
const assert = require('node:assert/strict');
const { extractFacts } = require('../lib/community-ingest');
const { buildFactLedger, resolveFactLedger } = require('../lib/community-truth');

test('hours extraction retains repeated times by day, season, and endpoint', () => {
  const text = 'Hours M - F 5:00 AM - 9:00 PM Sat 7:00 AM - 9:00 PM Sun 9:00 AM - 5:00 PM Summer Hours Monday to Friday: 5:00 AM - 9:00 PM Saturday: 7:00 AM - 9:00 PM Sunday: 7:00 AM - 9:00 PM';
  const facts = extractFacts(text).filter(f => f.type === 'time');
  assert.equal(facts.length, 12);
  assert.equal(new Set(facts.map(f => f.scopeKey)).size, 12);
  assert.equal(facts.find(f => f.scopeKey === 'regular-sunday-opening').value, '9:00 AM');
  assert.equal(facts.find(f => f.scopeKey === 'summer-sunday-opening').value, '7:00 AM');
  const source = { id: 'hours', title: 'Clubhouse', sourceUrl: 'https://alpha.gov/hours', contentHash: 'v1', connectorType: 'civicplus-pages', facts };
  const build = sources => buildFactLedger({ communityId: 'alpha', sources }, { trusted: true });
  assert.equal(resolveFactLedger(build([source]), {}).unresolved.length, 0);
  const changed = { ...source, id: 'other', contentHash: 'v2', facts: extractFacts(text.replace('Sunday: 7:00 AM', 'Sunday: 8:00 AM')).filter(f => f.type === 'time') };
  const conflicts = resolveFactLedger(build([source, changed]), {}).unresolved;
  assert.equal(conflicts.length, 1);
  assert.match(conflicts[0].claimKey, /summer-sunday-opening$/);
});

test('unlabeled times do not acquire invented facility-hour roles', () => {
  const facts = extractFacts('Meet Monday at 5 pm and call again at 9 pm.');
  assert.ok(facts.filter(f => f.type === 'time').every(f => !f.scopeKey && !f.facet));
});

test('Ranch Social abbreviated day ranges retain all endpoints and match spelled-out days', () => {
  const times = text => extractFacts(text).filter(f => f.type === 'time');
  const abbreviated = times('Hours M-Th: 7am - 10pm F-Sat: 7am - 11pm Sun: 7am - 8pm');
  const spelled = times('Hours Monday-Thursday: 7am - 10pm Friday-Saturday: 7am - 11pm Sunday: 7am - 8pm');
  assert.equal(abbreviated.length, 6);
  assert.deepEqual(abbreviated.map(f => [f.scopeKey, f.value]), spelled.map(f => [f.scopeKey, f.value]));
  const source = { id: 'hours', title: 'Ranch Social', sourceUrl: 'https://alpha.gov/hours', contentHash: 'v1', connectorType: 'civicplus-pages', facts: abbreviated };
  const build = sources => buildFactLedger({ communityId: 'alpha', sources }, { trusted: true });
  assert.equal(resolveFactLedger(build([source]), {}).unresolved.length, 0);
  const changed = { ...source, id: 'changed', contentHash: 'v2', facts: times('Hours Monday-Thursday: 7am - 9pm Friday-Saturday: 7am - 11pm Sunday: 7am - 8pm') };
  const conflicts = resolveFactLedger(build([source, changed]), {}).unresolved;
  assert.equal(conflicts.length, 1);
  assert.match(conflicts[0].claimKey, /regular-monday-thursday-closing$/);
});

test('ambiguous single-letter days do not acquire invented hours scopes', () => {
  const times = extractFacts('Hours T: 7am - 10pm S: 7am - 8pm').filter(f => f.type === 'time');
  assert.ok(times.every(f => !f.scopeKey));
});

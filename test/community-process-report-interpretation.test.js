const test = require('node:test');
const assert = require('node:assert/strict');
const { deterministicRequestedDetails } = require('../lib/community-interpretation');
const { classifyCommunityIntent } = require('../lib/community-search');

test('scheduling a process does not demand a live calendar occurrence', () => {
  for (const question of ['How do I schedule a landscape inspection?', 'How can we schedule an appointment?',
    'Where should I schedule a site visit?', 'How to schedule a review?']) {
    assert.ok(!deterministicRequestedDetails(question).includes('date'), question);
  }
  for (const question of ['When is the next inspection?', 'What is the inspection schedule?',
    'How do I schedule an inspection, and what day is available?', 'How can I schedule a visit tomorrow?']) {
    assert.ok(deterministicRequestedDetails(question).includes('date'), question);
  }
});

test('dated report findings are information, not permission or a current-status guarantee', () => {
  for (const question of ['What did the 2026 water quality report find?', 'What did the parking report identify?',
    'What are the findings in the annual report?', 'Explain the report results']) {
    assert.equal(classifyCommunityIntent(question), 'services', question);
  }
  assert.equal(classifyCommunityIntent('What watering is allowed?'), 'rules');
  assert.ok(deterministicRequestedDetails('Is drinking water safe right now?').includes('status'));
});

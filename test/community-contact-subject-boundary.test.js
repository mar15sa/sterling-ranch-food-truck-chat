const test = require('node:test');
const assert = require('node:assert/strict');
const { bestContactContext } = require('../lib/community-assistant');

const directory = {
  title: 'Staff Directory',
  text: 'Resident Services and Internet Support departments.',
  facts: [
    { type: 'phone', value: '303-555-0101', context: 'Resident Services: 303-555-0101.' },
    { type: 'email', value: 'frontdesk@example.gov', context: 'Resident Services: frontdesk@example.gov.' },
  ],
};

for (const question of [
  'Who do I contact about internet service?',
  'What phone number should I call for internet support?',
  'What is the email for water billing?',
]) {
  test(`a general directory contact cannot answer ${question}`, () => {
    assert.equal(bestContactContext(question, [directory]), '');
  });
}

test('neighboring directory text cannot upgrade a general contact to a specialized service contact', () => {
  const specialized = { ...directory, facts: [...directory.facts,
    { type: 'phone', value: '303-555-0102', context: 'For internet support, call 303-555-0102.' },
  ] };
  const answer = bestContactContext('What phone number should I call for internet support?', [specialized]);
  assert.match(answer, /303-555-0102/);
  assert.doesNotMatch(answer, /303-555-0101|frontdesk/);
});

test('a dedicated service page can establish the subject of its reviewed contact', () => {
  const source = { title: 'Water billing', facts: [{ type: 'email', value: 'billing@example.gov',
    context: 'For account questions, email billing@example.gov.' }] };
  assert.match(bestContactContext('What is the water billing email?', [source]), /billing@example.gov/);
});

test('a general contact request can still use the general contact card', () => {
  assert.match(bestContactContext('Who do I contact?', [directory]), /303-555-0101/);
});

test('an approved specialized email does not borrow the neighboring general phone', () => {
  const source = { ...directory, facts: [...directory.facts,
    { type: 'email', value: 'network@example.gov', context: 'Internet support: network@example.gov.' },
  ] };
  const answer = bestContactContext('Who do I contact about internet service?', [source]);
  assert.match(answer, /network@example.gov/);
  assert.doesNotMatch(answer, /303-555-0101|frontdesk/);
});

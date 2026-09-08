const test = require('node:test');
const assert = require('node:assert/strict');
const { extractFacts } = require('../lib/community-ingest');
const phones = text => extractFacts(text).filter(f => f.type === 'phone').map(f => f.value);

test('budget columns and account codes are not phone facts', () => {
  const rows = [
    '4A - 187 179 187 - 218 6507 Transfer from Sterling Ranch District No.',
    '7470 Utilities - Water 651 - 436 436 436 - 7473 Other O&M 15,592',
    '7862 Dry Utilities 281,569 809 809 809 - 7864 Streets - Grading & Erosion',
    '7000 Accounting - - 350 350 350 - 7491 CDOT / Highway Fees',
    '7975 Overlot grading - - 134 134 728 - 8800 Back Charges',
    '7856 Storm sewer 349,775 - 808 808 808 - 7858 Sanitation',
    'Budget 303 288 2100',
  ];
  for (const row of rows) assert.deepEqual(phones(row), [], row);
});

test('official contact numbers retain punctuation split by PDF whitespace', () => {
  for (const value of ['720-254 -8148', '303-288- 2100', '720-661- 9694', '1-800-426- 4791', '720-733- 6000', '(303) 288-2100', '+1 (303) 288-2100', '303.288.2100', '303-288-\n2100']) {
    assert.deepEqual(phones(`Office: ${value}.`), [value.replace(/\s+/g, ' ')]);
  }
});

test('unpunctuated numbers require an adjacent contact label', () => {
  assert.deepEqual(phones('Phone: 303 288 2100'), ['303 288 2100']);
  assert.deepEqual(phones('Call 303 288-2100'), ['303 288-2100']);
  assert.deepEqual(phones('Kiser at 303 618 0824 payton.'), ['303 618 0824']);
  assert.deepEqual(phones('303 232 9088 FAX'), ['303 232 9088']);
  assert.deepEqual(phones('801291 303 233 3705 PHONE1303 232 9088 FAX'), ['303 233 3705']);
  assert.deepEqual(phones('Board President: 303 779-5710.'), ['303 779-5710']);
  assert.deepEqual(phones('Call Customer Service (303-288-2100) to schedule.'), ['303-288-2100']);
  assert.deepEqual(phones('Budget phone system costs: 303 288 2100'), []);
  assert.deepEqual(phones('Account X303-288-2100'), []);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { chooseRun } = require('../scripts/check-community-routing-release');
test('missing evidence never automatically expands routine paid checks', () => {
  assert.equal(chooseRun('smoke', null, {}).profile, 'smoke');
  assert.equal(chooseRun('full', null, {}).profile, 'full');
  assert.throws(() => chooseRun('automatic', null, {}));
});

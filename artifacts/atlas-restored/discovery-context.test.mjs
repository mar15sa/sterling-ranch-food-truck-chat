import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('./discovery-ui.js', import.meta.url), 'utf8');

test('discovery exposes restorable history state and the complete contextual destination strip', () => {
  assert.match(source, /const state = \(\) => \(\{ village, lens, unfolded, layer \}\)/);
  assert.match(source, /restore\(next=\{\}\)/);
  assert.match(source, /rootsInView\(\)/);
  assert.match(source, /directory only/);
  assert.match(source, /dataset\.unfoldLayer/);
});

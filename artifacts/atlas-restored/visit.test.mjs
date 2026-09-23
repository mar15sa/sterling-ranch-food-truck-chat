import assert from 'node:assert/strict';
import test from 'node:test';
import { safeUrl, visitCard } from './visit-ui.js';

test('visit card escapes place content and only renders web actions', () => {
  const html = visitCard({ name: '<b>Unsafe</b>', address: '<script>', highlights: ['<img src=x>'], actions: [{ label: '<Click>', url: 'javascript:alert(1)' }, { label: 'Official <page>', url: 'https://example.test/?q=<x>' }] });
  assert.match(html, /Visit information for &lt;b&gt;Unsafe&lt;\/b&gt;/);
  assert.match(html, /&lt;script&gt;|&lt;img src=x&gt;|Official &lt;page&gt;/);
  assert.match(html, /https:\/\/example\.test\/\?q=%3Cx%3E/);
  assert.doesNotMatch(html, /javascript:/);
});

test('child card labels inherited address as its parent location and provides an open control', () => {
  const html = visitCard({ id: 'coffee', name: 'Coffee', highlights: ['Coffee'] }, { parent: { id: 'social', address: '8155 Piney River Avenue' } });
  assert.match(html, /Parent location/);
  assert.match(html, /data-open="social"/);
  assert.match(html, /8155 Piney River Avenue/);
});

test('missing facts are quiet while material unknowns remain visible', () => {
  assert.equal(visitCard({ id: 'empty', name: 'Empty' }), '');
  const html = visitCard({ id: 'park', name: 'Park', unknowns: ['Confirm restroom access.'], future: true });
  assert.match(html, /Planned/);
  assert.match(html, /Still to confirm/);
  assert.match(html, /Confirm restroom access\./);
});

test('safeUrl rejects non-web protocols', () => {
  assert.equal(safeUrl('mailto:test@example.test'), '');
  assert.equal(safeUrl('data:text/html,nope'), '');
  assert.equal(safeUrl('https://example.test'), 'https://example.test/');
});

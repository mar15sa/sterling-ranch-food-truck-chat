import assert from 'node:assert/strict';
import test from 'node:test';
import { accessBadges, safeUrl, visitCard } from './visit-ui.js';

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

test('unknown access stays unconfirmed and future status uses its own badge', () => {
  const html = visitCard({ id: 'park', name: 'Park', unknowns: ['Restroom access is still unconfirmed.'], future: true });
  assert.match(html, /Future/);
  assert.match(html, /visit-status-future/);
  assert.match(html, /visit-future-badge/);
  assert.match(html, /Access unconfirmed/);
  assert.match(html, /Restroom access is still unconfirmed\./);
});

test('compact apartment badge has no prose or anchor, while the detailed card keeps evidence', () => {
  const html = accessBadges({ visit: { access: { kind: 'apartment', text: 'For apartment residents and their guests.', sourceUrl: 'https://example.test/access' } } });
  assert.match(html, /Apartment amenity/);
  assert.doesNotMatch(html, /For apartment residents and their guests\.|<a\b|Access source/);
  assert.doesNotMatch(html, /Public access/);
  const detailed = visitCard({ visit: { access: { kind: 'apartment', text: 'For apartment residents and their guests.', sourceUrl: 'https://example.test/access' } } });
  assert.match(detailed, /For apartment residents and their guests\.|Access source|<a\b/);
});

test('reservation badge requires supported required or available metadata', () => {
  assert.doesNotMatch(accessBadges({ visit: { reservation: { text: 'Reservations are not verified.' } } }), /Reservation required|Reservations available/);
  assert.match(accessBadges({ visit: { reservation: { supported: true, status: 'required' } } }), /Reservation required/);
  assert.match(accessBadges({ visit: { reservation: { supported: true, available: true } } }), /Reservations available/);
});

test('unverified arrival directions never call the property address an entrance', () => {
  const html = visitCard({ address: '8155 Piney River Avenue', visit: { arrival: { text: 'Use the south drive.', verifiedEntrance: false, directionsUrl: 'https://maps.example.test/south' } } });
  assert.match(html, /Property address/);
  assert.match(html, /entrance location has not been confirmed/i);
  assert.match(html, /Open directions to property \(entrance unconfirmed\)/);
  assert.doesNotMatch(html, /verified entrance/i);
});

test('checked and retained information are visible near hours without calling them a source date', () => {
  const html = visitCard({ visit: { checkedAt: '2026-09-20', sourceUrls: ['https://example.test/official'] } });
  assert.match(html, /Checked: 2026-09-20/);
  assert.match(html, /Visit source/);
  assert.doesNotMatch(html, /Source date/);
  assert.match(visitCard({ visit: { lastVerified: '2026-06-01' } }), /Saved information: 2026-06-01/);
});

test('legacy access and facts remain visible without inferring public access', () => {
  const html = visitCard({ access: 'Ask the leasing office before visiting.', facts: ['A shaded bench is nearby.'] });
  assert.match(html, /Access details/);
  assert.match(html, /Ask the leasing office before visiting\./);
  assert.match(html, /A shaded bench is nearby\./);
  assert.doesNotMatch(html, /Public access/);
});

test('safeUrl rejects non-web protocols', () => {
  assert.equal(safeUrl('mailto:test@example.test'), '');
  assert.equal(safeUrl('data:text/html,nope'), '');
  assert.equal(safeUrl('https://example.test'), 'https://example.test/');
});

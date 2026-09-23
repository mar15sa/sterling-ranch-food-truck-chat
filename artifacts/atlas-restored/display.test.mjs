import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_DISPLAY_PREFERENCES,
  DISPLAY_STORAGE_KEY,
  loadDisplayPreferences,
  normaliseDisplayPreferences,
  saveDisplayPreferences,
} from './display.js';

test('normaliseDisplayPreferences accepts only explicit true values', () => {
  assert.deepEqual(normaliseDisplayPreferences({ largeText: true, reduceMotion: 1 }), {
    largeText: true,
    reduceMotion: false,
  });
  assert.deepEqual(normaliseDisplayPreferences(null), DEFAULT_DISPLAY_PREFERENCES);
});

test('display preferences round-trip through storage', () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  saveDisplayPreferences(storage, { largeText: true, reduceMotion: true });
  assert.equal(values.has(DISPLAY_STORAGE_KEY), true);
  assert.deepEqual(loadDisplayPreferences(storage), { largeText: true, reduceMotion: true });
});

test('denied or malformed storage falls back without throwing', () => {
  const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.deepEqual(loadDisplayPreferences(denied), DEFAULT_DISPLAY_PREFERENCES);
  assert.deepEqual(saveDisplayPreferences(denied, { largeText: true }), { largeText: true, reduceMotion: false });
});

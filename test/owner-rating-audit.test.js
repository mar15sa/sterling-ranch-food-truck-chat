const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeOwnerRatings, readOnlyNotionFetch } = require('../scripts/quality-eval/audit-owner-ratings');

const row = (id, extras = {}) => ({ id, needsWork: true, isTest: false, askedAt: '2026-09-01T12:00:00Z', ...extras });

test('negative-subset disagreement retains unknown ratings and cannot claim overall accuracy', () => {
  const report = summarizeOwnerRatings([
    row('a', { qualityRating: 'Excellent', residentEffort: 'Resolved', question: 'PRIVATE', answer: 'PRIVATE' }),
    row('b', { qualityRating: 'Weak', residentEffort: 'High resident effort' }),
    row('c', { qualityRating: 'Not rated', askedAt: 'invalid' })
  ], 'fixed');
  assert.deepEqual(report.positiveRatedOwnerMarked, { count: 1, denominator: 3, proportion: 1 / 3 });
  assert.equal(report.savedAutomaticRatings.unassessed, 1);
  assert.equal(report.savedResidentEffort.unassessed, 1);
  assert.equal(report.submissionsWithoutValidDate, 1);
  for (const key of ['overallAccuracy', 'positiveHumanExamples', 'falseRejectionRate', 'currentRuntimeFailureRate']) assert.equal(report[key], null);
  assert.equal(JSON.stringify(report).includes('PRIVATE'), false);
  assert.equal(Object.hasOwn(report, 'records'), false);
});

test('empty marks mean no denominator, not perfect agreement', () => {
  const report = summarizeOwnerRatings([]);
  assert.equal(report.positiveRatedOwnerMarked.proportion, null);
  assert.equal(report.resolvedOwnerMarked.proportion, null);
  assert.equal(report.askedAtRange, null);
});

test('unexpected test, unmarked, duplicate or unknown-origin rows invalidate the report', () => {
  for (const input of [[row('a', { isTest: true })], [row('a', { isTest: undefined })], [row('a', { needsWork: false })], [row('a'), row('a')], [null]]) {
    assert.throws(() => summarizeOwnerRatings(input));
  }
});

test('Notion wrapper permits only expected reads and disables redirects', async () => {
  const calls = [];
  const fetch = readOnlyNotionFetch(async (...args) => { calls.push(args); return { ok: true }; });
  await fetch('https://api.notion.com/v1/databases/example');
  await fetch('https://api.notion.com/v1/data_sources/example/query', { method: 'POST', body: '{}' });
  assert.equal(calls.length, 2);
  assert.equal(calls[1][1].redirect, 'error');
  for (const [url, method] of [
    ['https://api.notion.com/v1/pages/example', 'PATCH'],
    ['https://api.notion.com/v1/data_sources/example', 'PATCH'],
    ['https://api.notion.com/v1/pages', 'POST'],
    ['https://example.com/v1/data_sources/example/query', 'POST'],
    ['https://api.notion.com/v1/databases/example', 'DELETE'],
    ['https://user:secret@api.notion.com/v1/databases/example', 'GET']
  ]) await assert.rejects(fetch(url, { method }));
  assert.equal(calls.length, 2);
});

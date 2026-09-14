"use strict";

const { listOwnerMarkedQuestions } = require('../../lib/rules-question-log');

function readOnlyNotionFetch(fetchImpl) {
  return async (url, options = {}) => {
    const parsed = new URL(url);
    const method = String(options.method || 'GET').toUpperCase();
    const allowed = (method === 'GET' && /^\/v1\/databases\/[^/]+$/.test(parsed.pathname))
      || (method === 'POST' && /^\/v1\/data_sources\/[^/]+\/query$/.test(parsed.pathname));
    if (parsed.origin !== 'https://api.notion.com' || parsed.username || parsed.password || !allowed) {
      throw new Error('Owner rating audit permits database reads and data-source queries only.');
    }
    return fetchImpl(url, { ...options, redirect: 'error' });
  };
}

function summarizeOwnerRatings(records, checkedAt = new Date().toISOString()) {
  if (!Array.isArray(records)) throw new Error('Complete owner-marked records are required.');
  const seen = new Set();
  const ratings = { Excellent: 0, Good: 0, Mixed: 0, Weak: 0, Poor: 0, unassessed: 0 };
  const effort = { Resolved: 0, 'Some work remains': 0, 'High resident effort': 0, unassessed: 0 };
  const dates = [];
  let missingDate = 0;
  for (const row of records) {
    if (!row || !row.id || seen.has(row.id) || row.needsWork !== true || row.isTest !== false) {
      throw new Error('Require distinct, explicitly non-test, owner-marked records.');
    }
    seen.add(row.id);
    const rating = Object.hasOwn(ratings, row.qualityRating) ? row.qualityRating : 'unassessed';
    ratings[rating]++;
    const effortRating = Object.hasOwn(effort, row.residentEffort) ? row.residentEffort : 'unassessed';
    effort[effortRating]++;
    const timestamp = typeof row.askedAt === 'string' ? Date.parse(row.askedAt) : NaN;
    if (Number.isFinite(timestamp)) dates.push(timestamp);
    else missingDate++;
  }
  dates.sort((a, b) => a - b);
  const count = records.length;
  const positiveCount = ratings.Good + ratings.Excellent;
  return {
    checkedAt,
    scope: 'All currently owner-marked, non-test submissions; historical saved ratings',
    ownerMarkedSubmissions: count,
    askedAtRange: dates.length ? { earliest: new Date(dates[0]).toISOString(), latest: new Date(dates.at(-1)).toISOString() } : null,
    submissionsWithoutValidDate: missingDate,
    savedAutomaticRatings: ratings,
    savedResidentEffort: effort,
    positiveRatedOwnerMarked: { count: positiveCount, denominator: count, proportion: count ? positiveCount / count : null },
    resolvedOwnerMarked: { count: effort.Resolved, denominator: count, proportion: count ? effort.Resolved / count : null },
    overallAccuracy: null,
    positiveHumanExamples: null,
    falseRejectionRate: null,
    currentRuntimeFailureRate: null,
    modelApiCalls: 0,
    limitations: [
      'Owner-marked submissions are a selected negative subset, not representative traffic.',
      'Unchecked Needs work does not establish a positive human judgment.',
      'Repeated submissions are not distinct residents; abandonment is not measured.',
      'Saved ratings are historical; this is not a replay against current code.',
      'The log does not supply a complete historical evidence packet or dimension-level human scores.',
      'No resident question text, answer text or record identifiers are included in this report.'
    ]
  };
}

async function auditOwnerRatings(fetchImpl = globalThis.fetch) {
  const records = await listOwnerMarkedQuestions(readOnlyNotionFetch(fetchImpl));
  return summarizeOwnerRatings(records);
}

if (require.main === module) {
  auditOwnerRatings().then(report => process.stdout.write(JSON.stringify(report, null, 2) + '\n'))
    .catch(() => {
      process.stderr.write('Owner rating audit failed; no complete report was produced. Check read access and log configuration.\n');
      process.exitCode = 1;
    });
}

module.exports = { readOnlyNotionFetch, summarizeOwnerRatings, auditOwnerRatings };

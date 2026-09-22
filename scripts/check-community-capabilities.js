#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { healthIssues } = require('./check-deployment-health');
const { VERSION, operatingContract, answerCapabilityIssues } = require('../lib/community-critical-capabilities');

async function checkCapabilities({ baseUrl, expectedRevision, communityId = 'sterling-ranch', probes = true }, { fetchImpl = fetch, now = Date.now } = {}) {
  const contract = operatingContract(communityId);
  if (!contract) throw new Error('operating-contract-missing');
  const profile = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/communities', `${communityId}.json`), 'utf8'));
  const deadline = now() + 120000;
  const request = (route, options = {}) => fetchImpl(`${baseUrl.replace(/\/$/, '')}${route}`, {
    ...options, signal: AbortSignal.timeout(Math.max(1, Math.min(30000, deadline - now()))), redirect: 'error',
    headers: { 'user-agent': 'Community-Capability-Monitor/1.0', ...options.headers },
  });
  const report = { version: VERSION, checkedAt: new Date(now()).toISOString(), baseUrl,
    expectedRevision, issues: [], probes: [], result: 'failed' };
  let health;
  try {
    const response = await request('/api/health');
    health = await response.json();
    if (!response.ok) report.issues.push('health-http-error');
  } catch { report.issues.push('health-unavailable'); return report; }
  report.deploymentRevision = health.deploymentRevision;
  if (!expectedRevision || health.deploymentRevision !== expectedRevision) report.issues.push('deployment-revision-mismatch');
  report.issues.push(...healthIssues(health).map(issue => `health:${issue}`));
  if (!contract.approvedAnswerFlows.includes(health.communityAnswerFlow)) report.issues.push('unapproved-answer-flow');
  if (contract.writerRequired && health.residentWriter?.enabled !== true) report.issues.push('resident-writer-disabled');
  if (health.residentWriter?.stage !== contract.writerStage) report.issues.push('resident-writer-stage-changed');
  if (health.criticalCapabilities?.version !== VERSION) report.issues.push('critical-capability-report-missing');
  report.observations = health.criticalCapabilities?.observations || null;
  try {
    const privateResponse = await request('/api/community-questions');
    if (![401, 403].includes(privateResponse.status)) report.issues.push('owner-log-privacy-boundary-failed');
  } catch { report.issues.push('owner-log-privacy-check-unavailable'); }
  // Do not spend model calls against the wrong version or unavailable evidence.
  const evidenceUnsafe = !health.deploymentReady || report.issues.some(issue =>
    /revision-mismatch|health-http|evidence is stale|source failures|expired approved|writer-disabled|unapproved-answer-flow/.test(issue));
  if (probes && !evidenceUnsafe) for (const probe of contract.probes) {
    if (now() >= deadline) { report.issues.push('probe-time-budget-exhausted'); break; }
    const row = { id: probe.id, kind: probe.kind, isTest: true, issues: [] };
    try {
      const response = await request('/api/community/ask', { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: probe.question, isTest: true }) });
      if (!response.ok) row.issues.push(`answer-http-${response.status}`);
      else {
        const answer = await response.json();
        row.issues.push(...answerCapabilityIssues(answer, { writerRequired: contract.writerRequired, safety: probe.kind === 'safety', profile }));
        if (answer.testTraffic?.isTest !== true || answer.testTraffic?.boundary !== 'explicit-test-request') row.issues.push('probe-test-label-missing');
        if (!answer.answerId) row.issues.push('answer-trace-missing');
        row.outcome = answer._requestContract?.assessment?.outcome;
        row.writer = answer.residentWriting ? {
          attempted: answer.residentWriting.attempted, accepted: answer.residentWriting.accepted,
          providerCalled: answer.residentWriting.providerCalled, cacheHit: answer.residentWriting.cacheHit,
          reason: answer.residentWriting.fallbackReason || answer.residentWriting.skipReason,
          providerObservedAt: answer.residentWriting.providerObservedAt,
        } : null;
        if (probe.kind === 'writer') {
          if (row.outcome !== 'complete' || row.writer?.attempted !== true) row.issues.push('writer-probe-not-eligible-or-not-attempted');
          const observed = Date.parse(row.writer?.providerObservedAt);
          if (!Number.isFinite(observed) || now() - observed > 16 * 60000 || observed > now() + 60000) row.issues.push('fresh-provider-observation-missing');
        }
        if (probe.kind === 'live') {
          if (!(answer._requestContract?.candidate?.connectorReuse?.[probe.connector]?.actualCalls > 0)) row.issues.push('live-connector-path-not-observed');
          if (row.outcome !== 'complete') row.issues.push('live-answer-not-verified');
        }
      }
    } catch { row.issues.push('answer-request-failed-or-timed-out'); }
    report.probes.push(row);
    report.issues.push(...row.issues.map(issue => `${probe.id}:${issue}`));
  }
  if (probes && report.probes.length !== contract.probes.length) report.issues.push('required-probes-incomplete');
  const eligible = report.probes.filter(probe => probe.kind !== 'safety' && probe.outcome === 'complete');
  if (eligible.length >= 2 && !eligible.some(probe => probe.writer?.accepted === true)) report.issues.push('writer-probes-no-accepted-output');
  report.issues = [...new Set(report.issues)];
  report.result = report.issues.length ? 'failed' : 'passed';
  return report;
}
async function main() {
  const value = (key, fallback = '') => process.argv.find(arg => arg.startsWith(`--${key}=`))?.slice(key.length + 3) || fallback;
  const baseUrl = value('base-url', process.env.DEPLOYMENT_BASE_URL);
  const expectedRevision = value('expected-revision', process.env.EXPECTED_DEPLOYMENT_REVISION);
  if (!baseUrl || !expectedRevision) throw new Error('An explicit deployed URL and expected revision are required.');
  const report = await checkCapabilities({ baseUrl, expectedRevision, communityId: value('community', 'sterling-ranch'), probes: !process.argv.includes('--health-only') });
  const output = value('report', 'artifacts/critical-capabilities.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ result: report.result, revision: report.deploymentRevision, probeCount: report.probes.length, issues: report.issues }));
  if (report.result !== 'passed') process.exitCode = 1;
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { checkCapabilities };

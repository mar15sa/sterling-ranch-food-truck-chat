const fs = require('node:fs');
const path = require('node:path');
const { healthIssues } = require('./check-deployment-health');
const { CASES: cases, answerIssues } = require('./reviewed-source-release-cases');

const args = process.argv.slice(2);
const value = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) || '';
const baseUrl = value('base-url').replace(/\/$/, '');
const expectedRevision = value('expected-revision');
const environment = value('environment');
if (!/^https:\/\//.test(baseUrl) || !/^[a-f0-9]{40}$/.test(expectedRevision) || !['staging', 'production'].includes(environment)) {
  throw new Error('Supply --base-url=https://..., --expected-revision=<full SHA>, and --environment=staging|production.');
}


async function getJson(route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, { ...options, signal: AbortSignal.timeout(90000) });
  const body = await response.json();
  if (!response.ok) throw new Error(`HTTP ${response.status} at ${route}`);
  return body;
}
async function health() {
  const result = await getJson('/api/health');
  if (result.deploymentRevision !== expectedRevision) throw new Error(`Expected ${expectedRevision}; got ${result.deploymentRevision}`);
  const issues = healthIssues(result);
  if (issues.length) throw new Error(issues.join('; '));
  return { checkedAt: new Date().toISOString(), revision: result.deploymentRevision, status: result.status,
    deploymentReady: result.deploymentReady, communitySources: result.communitySources };
}

async function main() {
  const report = { environment, baseUrl, expectedRevision, startedAt: new Date().toISOString(), isTest: true, rows: [], failures: [] };
  try {
    report.before = await health();
    for (const item of cases) {
      const started = Date.now();
      try {
        const body = await getJson('/api/community/ask', { method: 'POST',
          headers: { 'content-type': 'application/json', 'user-agent': 'CAB-Reviewed-Source-Release-Test/1.0' },
          body: JSON.stringify({ question: item.question, isTest: true }) });
        const text = [body.answer, body.directAnswer].filter(Boolean).join('\n');
        const errors = answerIssues(body, item);
        const sources = (body.sources || []).map(source => ({ id: source.id, title: source.title, url: source.sourceUrl || source.url }));
        report.rows.push({ id: item.id, question: item.question, isTest: true, durationMs: Date.now() - started,
          answerStatus: body.answerStatus, answerMode: body.answerMode, answer: text, completion: body.completion,
          routingPlan: body.routingPlan, confidence: body.confidence, sources,
          actions: body.actions, claims: body.claims, errors });
        report.failures.push(...errors.map(error => `${item.id}: ${error}`));
        console.log(`${errors.length ? 'FAIL' : 'PASS'} ${item.id}: ${body.answerStatus}`);
      } catch (error) { report.failures.push(`${item.id}: ${error.message}`); console.log(`FAIL ${item.id}: ${error.message}`); }
    }
    report.after = await health();
  } catch (error) { report.failures.push(error.message); }
  report.completedAt = new Date().toISOString();
  const destination = path.resolve(__dirname, `../artifacts/source-review-2026-09-14/${environment}-hosted-check.json`);
  fs.writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ report: destination, checked: report.rows.length, failures: report.failures }));
  if (report.failures.length || report.rows.length !== cases.length) process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

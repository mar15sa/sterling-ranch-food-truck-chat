const fs = require('node:fs');
const path = require('node:path');
const { healthIssues } = require('./check-deployment-health');

const args = process.argv.slice(2);
const value = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) || '';
const baseUrl = value('base-url').replace(/\/$/, '');
const expectedRevision = value('expected-revision');
const environment = value('environment');
if (!/^https:\/\//.test(baseUrl) || !/^[a-f0-9]{40}$/.test(expectedRevision) || !['staging', 'production'].includes(environment)) {
  throw new Error('Supply --base-url=https://..., --expected-revision=<full SHA>, and --environment=staging|production.');
}
const cases = [
  { id: 'water-billing-contact', question: 'Who can help with my water bill?', positive: true, must: /833[\s)-]*772[\s-]*2240|amcobi/i },
  { id: 'landscape-inspection-process', question: 'How do I schedule a landscape inspection?', positive: true, must: /residentialinspections@sterlingranchcab\.com/i },
  { id: 'outdoor-water-method', question: 'What plant size should I use to calculate outdoor water usage?', positive: true, must: /full growth|matur/i, forbidden: /submit@sterlingranchdrc|\$\s*\d/ },
  { id: 'water-account-access', question: 'How do I see my water usage online?', positive: true, must: /utilityhawk|account|dashboard|portal/i, forbidden: /full growth|plant size|square foot/i },
  { id: 'dated-water-report', question: 'What did the 2026 water quality report find?', positive: true, must: /2025|2026/, also: /coliform|backflow|violation/i, forbidden: /water is safe (?:today|right now)|no violations/i },
  { id: 'current-water-safety-boundary', question: 'Does the 2026 water report prove my drinking water is safe right now?', forbidden: /(?:water is|it is|it's) safe (?:today|right now|to drink)/i },
  { id: 'internet-contact-boundary', question: 'What is the internet billing phone number?', forbidden: /833[\s)-]*772[\s-]*2240|amcobi/i },
  { id: 'internet-support-boundary', question: 'Who do I contact about internet service?', forbidden: /833[\s)-]*772[\s-]*2240|amcobi/i },
  { id: 'adopted-rule-and-process', question: 'Can I build a shed and where do I apply?', positive: true, must: /approv|review|application/i },
  { id: 'facility-booking', question: 'How do I reserve the Great Hall?', positive: true, must: /reserv|book|rental|request/i },
];

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
        const errors = [];
        if (item.positive && body.confidence?.canAnswer !== true) errors.push(`Expected supported answer; received ${body.answerStatus}`);
        if (item.must && !item.must.test(text)) errors.push('Required source-supported detail absent');
        if (item.also && !item.also.test(text)) errors.push('Required finding absent');
        if (item.forbidden && item.forbidden.test(text)) errors.push('Unrelated, outdated, or overbroad detail present');
        if ((body.claims || []).some(claim => !claim.verified)) errors.push('Unverified claim returned');
        const sources = (body.sources || []).map(source => ({ id: source.id, title: source.title, url: source.sourceUrl || source.url }));
        if (sources.some(source => /\/DocumentCenter\/View\/(1456|2419)\//.test(source.url || ''))) errors.push('Excluded historical source cited');
        report.rows.push({ id: item.id, question: item.question, isTest: true, durationMs: Date.now() - started,
          answerStatus: body.answerStatus, answerMode: body.answerMode, answer: text, completion: body.completion, sources,
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

const fs = require('node:fs');
const path = require('node:path');
const { scoreCommunityAnswer } = require('../lib/community-answer-quality');
const base = process.argv[2];
const revision = process.argv[3];
const output = process.argv[4];
if (!['https://sterlingranchsociety.com', 'https://sterling-ranch-food-truck-chat-staging.up.railway.app'].includes(base)
  || !/^[a-f0-9]{40}$/.test(revision || '') || !output) throw new Error('Exact environment, revision and report path required');
const cases = [
  ...['Where can I find trash and recycling information?', 'Where is the garbage info page?',
    'Open recycling information', 'trash/recycling info?', 'Where can I find recyling info?']
    .map(question => ({ question, navigation: true, trash: true })),
  ...['Where can I find utility information?', 'Where can I find information about reservations?',
    'Where can we find internet information?', 'Where can I find landscaping information?',
    'Where is the recreation center website?'].map(question => ({ question, navigation: true })),
  { question: 'What are the pickleball court hours?', complete: true },
  { question: 'How do I reserve a pickleball court?', complete: true },
  { question: 'What day is trash collected?', complete: true },
  { question: 'Where can I find the recycling rules?', notNavigation: true },
  { question: 'Where can I find trash information and what does it cost?', notNavigation: true },
  { question: 'What payment methods can I use?', methods: true },
  { question: 'Is a pickleball court available right now?', unavailable: true },
  { question: 'Can I build a shed and where do I apply?', notNavigation: true },
];
const report = { base, revision, startedAt: new Date().toISOString(), isTest: true, observations: [], failures: [] };
async function health() {
  const h = await (await fetch(base + '/api/health', { signal: AbortSignal.timeout(30000) })).json();
  if (h.deploymentRevision !== revision || !h.deploymentReady) throw new Error('Wrong or unready live revision');
  return { revision: h.deploymentRevision, ready: h.deploymentReady, fingerprint: h.communitySources?.activeFingerprint };
}
async function main() {
  report.before = await health();
  // Repeat the exact reported case to exercise live planner variability.
  for (const item of [...cases, cases[0], cases[0]]) {
    const r = await fetch(base + '/api/community/ask', { method: 'POST',
      headers: { 'content-type': 'application/json', origin: base },
      body: JSON.stringify({ question: item.question, isTest: true }), signal: AbortSignal.timeout(60000) });
    const body = await r.json();
    const problems = [];
    if (!r.ok) problems.push('Request failed');
    if (item.trash && body.answerMode !== 'community-approved-information-resource') problems.push('Expected approved trash resource');
    if ((item.navigation || item.complete) && body.completion?.outcome !== 'complete') problems.push('Expected complete answer');
    if (item.navigation && body.answerMode !== 'community-approved-information-resource') problems.push('Expected an approved topic resource');
    if (item.navigation && /Drinking Water Quality Report|Chase Drain/.test(body.answer || '')) problems.push('Unrelated information source');
    const expectedTopic = /internet/i.test(item.question) ? /Internet-Service/
      : /landscaping/i.test(item.question) ? /Common-Area-Maintenance|Landscap/
      : /reservations/i.test(item.question) ? /Pickleball|Rental|Reserv/
      : /utility/i.test(item.question) ? /Water-Billing|Water-Bill|Monthly-Fee/
      : /recreation center/i.test(item.question) ? /Sterling-Center|Recreation|Overlook/ : null;
    if (item.navigation && expectedTopic && !(body.sources || []).some(source => expectedTopic.test(source.sourceUrl))) problems.push('Requested topic destination missing');
    if (item.navigation && body.routingPlan?.requestedDetails?.some(detail => detail !== 'action')) problems.push('Invented navigation facet');
    if (item.notNavigation && body.answerMode === 'community-approved-information-resource') problems.push('Factual request reduced to navigation');
    if (item.methods && (!body.completion?.requestedDetails?.includes('methods')
      || !body.completion?.resolvedDetails?.includes('methods'))) problems.push('Explicit methods dropped or unresolved');
    if (item.unavailable && body.answerStatus === 'verified') problems.push('Unavailable live fact verified');
    const quality = scoreCommunityAnswer(item.question, body);
    if (body.completion?.outcome && body.completion.outcome !== 'complete' && quality.residentEffort.rating === 'Resolved') problems.push('Incomplete answer labeled resolved');
    const row = { question: item.question, answer: body.answer, mode: body.answerMode, status: body.answerStatus,
      completion: body.completion, plan: body.routingPlan, quality, problems,
      sources: (body.sources || []).map(source => ({ id: source.id, url: source.sourceUrl, reviewed: source.canonicalScopedProjection })) };
    report.observations.push(row);
    report.failures.push(...problems.map(problem => item.question + ': ' + problem));
    console.log(JSON.stringify({ question: item.question, mode: row.mode, outcome: row.completion?.outcome, problems }));
  }
  report.after = await health();
  if (report.before.fingerprint !== report.after.fingerprint) report.failures.push('Approved source fingerprint changed');
}
main().catch(error => report.failures.push(error.message)).finally(() => {
  report.completedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ report: output, total: report.observations.length, failures: report.failures }));
  process.exitCode = report.failures.length ? 1 : 0;
});

const crypto = require('node:crypto');
const MARKER = '<!-- community-critical-capability-incident:v1 -->';
function safeIssues(report) {
  return [...new Set((report?.issues?.length ? report.issues : ['monitor-did-not-complete'])
    .map(value => String(value).replace(/[^a-zA-Z0-9:._ -]/g, '').slice(0, 140)))].sort().slice(0, 30);
}
async function publishIncident({ github, context, report, notificationTest = false }) {
  const repo = { owner: context.repo.owner, repo: context.repo.repo };
  const revision = report?.expectedRevision || context.sha;
  if (revision) {
    const branch = await github.rest.repos.getBranch({ ...repo, branch: 'main' });
    if (branch.data.commit.sha !== revision) return { action: 'superseded-run-ignored' };
  }
  const marker = notificationTest ? MARKER.replace(':v1', ':notification-test-v1') : MARKER;
  const title = notificationTest ? 'Community Assistant safeguard notification test' : 'Community Assistant critical capability needs attention';
  const issues = await github.paginate(github.rest.issues.listForRepo, { ...repo, state: 'open', per_page: 100 });
  const existing = issues.find(issue => !issue.pull_request && issue.user?.login === 'github-actions[bot]' && issue.body?.includes(marker));
  const runUrl = `${context.serverUrl}/${repo.owner}/${repo.repo}/actions/runs/${context.runId}`;
  if (report?.result === 'passed') {
    if (!existing) return { action: 'unchanged' };
    await github.rest.issues.createComment({ ...repo, issue_number: existing.number,
      body: `${notificationTest ? 'Notification test completed' : 'Recovered: the complete capability check passed'}. [Verified run](${runUrl}).` });
    await github.rest.issues.update({ ...repo, issue_number: existing.number, state: 'closed' });
    return { action: 'recovered', number: existing.number };
  }
  const reasons = safeIssues(report);
  const fingerprint = crypto.createHash('sha256').update(reasons.join('\n')).digest('hex');
  const stamp = `<!-- failure:${fingerprint} -->`;
  if (existing?.body?.includes(stamp)) return { action: 'unchanged', number: existing.number };
  const body = [marker, stamp, notificationTest ? 'This is an intentional notification-delivery test. Production was not disabled.'
    : 'A required Community Assistant capability is degraded, missing, or has not been checked successfully.', '',
    ...reasons.map(reason => `- ${reason}`), '', `[Check details](${runUrl})`, '',
    'The report contains synthetic check results and aggregate reason codes, not resident questions. Investigate the cause; do not weaken evidence, safety, privacy, or the expected-capability contract to clear this alert.'].join('\n');
  if (existing) {
    await github.rest.issues.update({ ...repo, issue_number: existing.number, body });
    await github.rest.issues.createComment({ ...repo, issue_number: existing.number, body: `The failure changed. [Current check](${runUrl}).` });
    return { action: 'updated', number: existing.number };
  }
  const created = await github.rest.issues.create({ ...repo, title, body });
  return { action: 'opened', number: created.data.number };
}
module.exports = { publishIncident, safeIssues };

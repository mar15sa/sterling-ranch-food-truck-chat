#!/usr/bin/env node
const { execFileSync } = require('node:child_process');
const WORKFLOW = 'community-critical-capabilities.yml';
// One daily run, plus two hours for GitHub scheduling and completion delays.
const MAX_RUN_AGE_MS = 26 * 3600000;
function monitorFreshnessIssues({ workflow, runs, artifacts, now = Date.now() }) {
  const issues = [];
  if (workflow?.state !== 'active') issues.push('capability-monitor-disabled-or-missing');
  const ordered = [...(runs || [])].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const latest = ordered[0];
  if (!latest) return [...issues, 'capability-monitor-has-never-run'];
  const age = now - Date.parse(latest.created_at);
  if (!Number.isFinite(age) || age > MAX_RUN_AGE_MS || age < -60000) issues.push('capability-monitor-overdue');
  if (latest.status !== 'completed' && age > 20 * 60000) issues.push('capability-monitor-stuck');
  const completed = ordered.find(run => run.status === 'completed');
  if (completed && now - Date.parse(completed.created_at) > MAX_RUN_AGE_MS) issues.push('completed-capability-monitor-overdue');
  if (!completed || completed.conclusion !== 'success') issues.push('latest-completed-capability-check-not-passing');
  if (completed?.conclusion === 'success' && !(artifacts || []).some(artifact => artifact.name === 'production-critical-capabilities' && artifact.expired !== true)) {
    issues.push('capability-monitor-evidence-missing');
  }
  return [...new Set(issues)];
}
function main() {
  const repo = process.argv.find(arg => arg.startsWith('--repo='))?.slice(7) || process.env.GITHUB_REPOSITORY;
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo || '')) throw new Error('Provide an explicit repository.');
  const get = endpoint => JSON.parse(execFileSync('gh', ['api', endpoint], { encoding: 'utf8', timeout: 30000 }));
  const workflow = get(`repos/${repo}/actions/workflows/${WORKFLOW}`);
  const runs = get(`repos/${repo}/actions/workflows/${WORKFLOW}/runs?per_page=10`).workflow_runs;
  const completed = runs.find(run => run.status === 'completed');
  const artifacts = completed ? get(`repos/${repo}/actions/runs/${completed.id}/artifacts`).artifacts : [];
  const issues = monitorFreshnessIssues({ workflow, runs, artifacts });
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), result: issues.length ? 'failed' : 'passed',
    workflow: WORKFLOW, issues, latestRunUrl: runs[0]?.html_url || null,
    lastCompletedRunUrl: completed?.html_url || null, lastCompletedAt: completed?.updated_at || null }));
  if (issues.length) process.exitCode = 1;
}
if (require.main === module) { try { main(); } catch { console.error('Capability watchdog could not verify GitHub state; status is unknown.'); process.exitCode = 1; } }
module.exports = { monitorFreshnessIssues };

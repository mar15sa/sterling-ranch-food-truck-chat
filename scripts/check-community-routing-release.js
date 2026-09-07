#!/usr/bin/env node
// A small live check remains separate from evidence of repeated routing quality.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { currentIdentity, validateEvidence } = require('./check-community-evidence-reuse');
const { fingerprint } = require('../lib/community-release');
const { releaseFailures } = require('./eval-community-routing-live');
const ROOT = path.join(__dirname, '..');
const REPORT = path.join(ROOT, 'data/community-routing-live-report.json');
const CACHE = path.join(ROOT, '.cache/community-routing/full.json');

function chooseRun(profile, evidence, identity) {
  if (!['smoke', 'full'].includes(profile)) throw new Error('Use smoke or full profile.');
  const reuse = evidence ? validateEvidence(evidence, identity) : { decision: 'needs-full', reason: 'No saved full benchmark.' };
  return { profile: profile === 'full' && reuse.decision !== 'reusable' ? 'full' : 'smoke', reuse };
}

async function main() {
  const profile = process.argv.find(a => a.startsWith('--profile='))?.split('=')[1] || 'smoke';
  const baseUrl = process.env.COMMUNITY_ROUTING_BASE_URL || 'https://sterling-ranch-food-truck-chat-staging.up.railway.app';
  const healthResponse = await fetch(`${baseUrl.replace(/\/$/, '')}/api/health`, { signal: AbortSignal.timeout(15000) });
  if (!healthResponse.ok) throw new Error('Cannot verify target health; no paid tests started.');
  const health = await healthResponse.json();
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/community-index.json'), 'utf8'));
  if (health.deploymentRevision !== revision || !health.deploymentReady || health.rules?.isStale || health.communitySources?.stale || health.communitySources?.failureCount || health.communitySources?.activeFingerprint !== (index.releaseFingerprint || fingerprint(index))) {
    throw new Error('Deployment/source identity or freshness differs from the checkout; no paid tests started.');
  }
  const identity = currentIdentity({ configurationFingerprint: health.configurationFingerprint });
  let evidence;
  try { evidence = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { evidence = null; }
  const selection = chooseRun(profile, evidence, identity);
  console.log(`Full evidence: ${selection.reuse.decision}. ${selection.reuse.reason}`);
  console.log(`Running ${selection.profile}; no automatic escalation from smoke to full.`);
  // Require a successful new child process before reading or certifying evidence.
  const child = spawnSync(process.execPath, [path.join(__dirname, 'eval-community-routing-live.js'), `--profile=${selection.profile}`, `--base-url=${baseUrl}`, '--enforce', '--write'], { cwd: ROOT, stdio: 'inherit' });
  if (child.error || child.status !== 0) throw new Error('Live routing check failed; no reusable evidence saved.');
  const report = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
  if (report.deploymentRevision !== revision || releaseFailures(report.summary).length) throw new Error('Routing result does not verify this deployment.');
  report.identity = identity;
  report.result = 'passed';
  report.candidateValid = true;
  report.reusedFullEvidence = selection.reuse.decision === 'reusable' ? { generatedAt: evidence.generatedAt, deploymentRevision: evidence.deploymentRevision } : null;
  fs.writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
  if (selection.profile === 'full') {
    fs.mkdirSync(path.dirname(CACHE), { recursive: true });
    fs.writeFileSync(CACHE, `${JSON.stringify(report, null, 2)}\n`);
  }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { chooseRun };

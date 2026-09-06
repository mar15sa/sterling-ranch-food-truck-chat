const fs = require('node:fs');
function resumeEvidence(prior, identity, now = Date.now()) {
  if (!prior) return null;
  if (prior.result !== 'in-progress') throw new Error('Only an unfinished successful checkpoint can resume.');
  for (const key of ['baseUrl', 'expectedFingerprint', 'expectedRevision', 'durationHours', 'checkCount', 'intervalMs']) {
    if (prior[key] !== identity[key]) throw new Error(`Trial identity changed: ${key}`);
  }
  if (!Number.isInteger(prior.completedChecks) || prior.completedChecks < 1 || prior.completedChecks >= identity.checkCount) throw new Error('Invalid trial checkpoint count.');
  const last = Date.parse(prior.updatedAt);
  if (!Number.isFinite(last) || now < last || now - last > identity.intervalMs + 300000) throw new Error('Trial checkpoint has a monitoring gap; do not credit it as continuous.');
  return prior;
}
function writeEvidence(file, report) {
  fs.mkdirSync(require('node:path').dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(report, null, 2)}\n`);
  fs.renameSync(temp, file);
}
module.exports = { resumeEvidence, writeEvidence };

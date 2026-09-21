const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const baseline = '3f5c5673551c6ef2901bccf3cf36b9265c834b32';
const revision = process.argv[2];
const staging = process.env.ATLAS_OPENED_STAGING_URL || 'https://sterling-ranch-food-truck-chat-staging.up.railway.app';
const production = process.env.ATLAS_OPENED_PRODUCTION_URL || 'https://sterlingranchsociety.com';
const openedDirectory = path.join(root, 'public', 'atlas', 'opened');
const resultPath = path.join(__dirname, 'release-check.json');

function isText(file) {
  return /\.(?:css|csv|html?|js|json|map|md|mjs|svg|txt|webmanifest|xml)$/i.test(file);
}

function normalize(file, buffer) {
  return isText(file) ? Buffer.from(buffer.toString('utf8').replace(/\r\n/g, '\n'), 'utf8') : buffer;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function openedFiles() {
  const required = ['index.html', 'style.css', 'app.js'];
  for (const file of required) assert.ok(fs.existsSync(path.join(openedDirectory, file)), `Missing public/atlas/opened/${file}`);
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push(path.relative(path.join(root, 'public'), absolute).replaceAll(path.sep, '/'));
    }
  };
  visit(openedDirectory);
  return files.sort();
}

function baselineHas(file) {
  try {
    execFileSync('git', ['cat-file', '-e', `${baseline}:${file}`], { cwd: root, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function responseBytes(origin, route) {
  const response = await fetch(`${origin}${route}`);
  return { response, bytes: Buffer.from(await response.arrayBuffer()) };
}

async function verifyOpenedFiles(report) {
  const files = openedFiles();
  report.openedFiles = [];
  for (const file of files) {
    assert.equal(baselineHas(`public/${file}`), false, `${file} existed in the baseline`);
    const route = `/${file}`;
    const local = fs.readFileSync(path.join(root, 'public', file));
    const { response, bytes } = await responseBytes(staging, route);
    assert.equal(response.status, 200, `Staging ${route}`);
    assert.match(response.headers.get('x-robots-tag') || '', /noindex/i, `Staging ${route} is missing noindex`);
    assert.deepEqual(normalize(file, bytes), normalize(file, local), `Staging bytes differ for ${route}`);
    const live = await fetch(`${production}${route}`);
    assert.equal(live.status, 404, `Production ${route}`);
    report.openedFiles.push({ route, file: `public/${file}`, stagingStatus: response.status, stagingNoindex: true, productionStatus: live.status, sha256: sha256(normalize(file, local)) });
  }
}

async function verifyExistingRoutes(report) {
  report.existingRoutes = [];
  for (const route of ['/atlas', '/atlas/concepts.html']) {
    const stagingResponse = await fetch(`${staging}${route}`);
    assert.equal(stagingResponse.status, 200, `Staging ${route}`);
    assert.match(stagingResponse.headers.get('x-robots-tag') || '', /noindex/i, `Staging ${route} is missing noindex`);
    const productionResponse = await fetch(`${production}${route}`);
    assert.equal(productionResponse.status, 404, `Production ${route}`);
    report.existingRoutes.push({ route, stagingStatus: stagingResponse.status, stagingNoindex: true, productionStatus: productionResponse.status });
  }
}

function verifyBaselineFiles(report) {
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', baseline, 'public/atlas'], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean).sort();
  report.preexistingAtlasFiles = [];
  for (const file of files) {
    const baselineBytes = execFileSync('git', ['show', `${baseline}:${file}`], { cwd: root, maxBuffer: 20 * 1024 * 1024 });
    const currentBytes = fs.readFileSync(path.join(root, file));
    assert.deepEqual(normalize(file, currentBytes), normalize(file, baselineBytes), `Preexisting file changed: ${file}`);
    report.preexistingAtlasFiles.push({ file, sha256: sha256(normalize(file, currentBytes)) });
  }
}

(async () => {
  const report = { checkedAt: new Date().toISOString(), revision, baseline, staging, production, residentQuestionsSubmitted: 0 };
  try {
    assert.match(revision || '', /^[a-f0-9]{40}$/, 'Pass the exact 40-character release revision');
    const health = await fetch(`${staging}/api/health`);
    assert.equal(health.status, 200, 'Staging health endpoint');
    const healthBody = await health.json();
    assert.equal(healthBody.deploymentRevision, revision, 'Staging revision differs');
    assert.equal(healthBody.deploymentReady, true, 'Staging deployment is not ready');
    report.health = { status: health.status, deploymentRevision: healthBody.deploymentRevision, deploymentReady: healthBody.deploymentReady };
    await verifyOpenedFiles(report);
    await verifyExistingRoutes(report);
    verifyBaselineFiles(report);
    report.passed = true;
  } catch (error) {
    report.passed = false;
    report.error = error.stack || error.message;
    throw error;
  } finally {
    fs.writeFileSync(resultPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(JSON.stringify({ passed: report.passed, revision: report.revision, openedFiles: report.openedFiles.length, preexistingAtlasFiles: report.preexistingAtlasFiles.length }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

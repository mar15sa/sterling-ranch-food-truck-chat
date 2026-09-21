const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const openedDirectory = path.join(root, 'public', 'atlas', 'opened');
const stagingHost = 'sterling-ranch-food-truck-chat-staging.up.railway.app';
const resultPath = path.join(__dirname, 'http-check.json');

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

function startServer(environment, port) {
  return spawn(process.execPath, ['-e', "require('./lib/community-live-monitor').createLiveMonitor=()=>({start(){},status(){return {}}});require('./server');"], {
    cwd: root,
    windowsHide: true,
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      PORT: String(port),
      HOST: '127.0.0.1',
      NODE_ENV: 'test',
      RAILWAY_ENVIRONMENT_NAME: environment,
      RULES_AUTO_REFRESH: 'false',
      OPENINGS_AUTO_MONITOR: 'false',
    },
  });
}

async function waitForServer(child) {
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(Error(`Server startup timeout: ${output}`)), 20000);
    const poll = setInterval(() => {
      if (output.includes('Food truck chat is running')) finish();
    }, 100);
    const onError = (error) => finish(error);
    const finish = (error) => {
      clearTimeout(timeout);
      clearInterval(poll);
      child.off('error', onError);
      error ? reject(error) : resolve();
    };
    child.once('error', onError);
  });
}

async function checkServer(environment, port, routes) {
  const child = startServer(environment, port);
  try {
    await waitForServer(child);
    const checks = [];
    const hosts = environment === 'production' ? ['sterlingranchsociety.com', stagingHost] : [stagingHost];
    for (const route of routes) {
      for (const host of hosts) {
        const response = await fetch(`http://127.0.0.1:${port}/${route}`, { headers: { host } });
        const expectedStatus = environment === 'staging' ? 200 : 404;
        assert.equal(response.status, expectedStatus, `${environment} ${host} /${route}`);
        if (environment === 'staging') assert.match(response.headers.get('x-robots-tag') || '', /noindex/i, `Missing noindex for /${route}`);
        checks.push({ route: `/${route}`, host, status: response.status, noindex: /noindex/i.test(response.headers.get('x-robots-tag') || '') });
      }
    }
    return checks;
  } finally {
    child.kill();
  }
}

(async () => {
  const report = { checkedAt: new Date().toISOString(), residentQuestionsSubmitted: 0 };
  try {
    const routes = openedFiles();
    report.routes = routes.map((route) => `/${route}`);
    report.staging = await checkServer('staging', 4291, routes);
    report.production = await checkServer('production', 4292, routes);
    report.passed = true;
  } catch (error) {
    report.passed = false;
    report.error = error.stack || error.message;
    throw error;
  } finally {
    fs.writeFileSync(resultPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(JSON.stringify(report));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

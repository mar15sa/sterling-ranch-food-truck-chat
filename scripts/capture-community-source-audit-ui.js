const fs = require('node:fs');
const path = require('node:path');

const debuggingBase = process.env.CHROME_DEBUGGING_URL || 'http://127.0.0.1:9229';
const pageUrl = process.env.SOURCE_AUDIT_URL || 'http://127.0.0.1:3139/community-assistant/sources';
const password = process.env.RULES_QUESTION_ADMIN_PASSWORD || '';
if (!password) throw new Error('RULES_QUESTION_ADMIN_PASSWORD is required for local visual QA.');

async function createTarget() {
  const response = await fetch(`${debuggingBase}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' });
  if (!response.ok) throw new Error(`Chrome target creation failed: ${response.status}`);
  return response.json();
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });
  return {
    command(method, params = {}) {
      const messageId = ++id;
      ws.send(JSON.stringify({ id: messageId, method, params }));
      return new Promise((resolve, reject) => pending.set(messageId, { resolve, reject }));
    },
    close() { ws.close(); },
  };
}

async function waitForReady(cdp) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const result = await cdp.command('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
    if (result.result?.value === 'complete') return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Page did not finish loading.');
}

async function evaluate(cdp, expression) {
  const result = await cdp.command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Browser evaluation failed.');
  return result.result?.value;
}

(async () => {
  const target = await createTarget();
  const cdp = await connect(target.webSocketDebuggerUrl);
  await cdp.command('Page.enable');
  await cdp.command('Runtime.enable');
  await cdp.command('Network.enable');
  await cdp.command('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.command('Page.navigate', { url: pageUrl });
  await waitForReady(cdp);
  const initialPage = await evaluate(cdp, `({href:location.href,title:document.title,renderType:typeof render,scripts:[...document.scripts].map(script=>script.src),body:document.body.innerText.slice(0,120)})`);
  if (initialPage.renderType !== 'function') throw new Error(`Owner page script did not load: ${JSON.stringify(initialPage)}`);
  const login = await evaluate(cdp, `(async()=>{const r=await fetch('/api/community-questions/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:${JSON.stringify(password)}})});return {ok:r.ok,status:r.status}})()`);
  if (!login?.ok) throw new Error(`Local owner login failed: ${login?.status}`);
  await cdp.command('Page.navigate', { url: pageUrl });
  await waitForReady(cdp);
  const readiness = await evaluate(cdp, `(async()=>{const r=await fetch('/api/community-source-health');const d=await r.json();if(!r.ok)return {ok:false,status:r.status};render({readiness:d.readiness,items:[],summary:{pending:0,sensitive:0,conflicts:0},counts:{}});showDashboard();return {ok:true}})()`);
  if (!readiness?.ok) throw new Error(`Local readiness request failed: ${readiness?.status}`);
  for (let attempt = 0; attempt < 80; attempt++) {
    const loaded = await evaluate(cdp, `document.querySelector('#scopeSummary')?.textContent.includes('discovered CAB URLs assessed')`);
    if (loaded) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  await evaluate(cdp, `document.querySelector('.category-card').open=true`);
  const outDir = path.join(__dirname, '..', 'artifacts', 'community-page-audit-ui');
  fs.mkdirSync(outDir, { recursive: true });
  const results = [];
  for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
    await cdp.command('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.name === 'mobile' });
    await evaluate(cdp, `scrollTo(0,0)`);
    const layout = await evaluate(cdp, `({innerWidth,scrollWidth:document.documentElement.scrollWidth,headline:document.querySelector('#readinessTitle')?.textContent,summary:document.querySelector('#scopeSummary')?.textContent,categoryCount:document.querySelectorAll('.category-card').length,primaryRows:document.querySelectorAll('.category-documents li,.category-pages li').length,reviewCount:document.querySelector('#pageWorkCount')?.textContent})`);
    const shot = await cdp.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const file = path.join(outDir, `${viewport.name}.png`);
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
    await evaluate(cdp, `document.querySelector('.category-pages-section')?.scrollIntoView({block:'start'})`);
    const pageShot = await cdp.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const pageFile = path.join(outDir, `${viewport.name}-pages.png`);
    fs.writeFileSync(pageFile, Buffer.from(pageShot.data, 'base64'));
    results.push({ viewport, layout, file, pageFile });
  }
  fs.writeFileSync(path.join(outDir, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
  cdp.close();
  console.log(JSON.stringify(results, null, 2));
})().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});

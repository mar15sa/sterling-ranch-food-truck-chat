const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('C:/Users/mar15/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '../..');
const base = 'https://sterling-ranch-food-truck-chat-staging.up.railway.app';
const live = process.env.FOOTER_LIVE === '1';
const prefix = live ? 'staging' : 'candidate';
const files = { '/': 'index.html', '/food-truck': 'food-truck.html', '/community-assistant': 'rules-assistant.html', '/calendar': 'calendar.html', '/openings': 'openings.html', '/pool': 'pool.html' };

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const results = [];
  let mockedQuestions = 0;
  try {
    for (const [width, height] of [[1440, 900], [1024, 768], [800, 700], [1440, 540], [390, 844], [320, 740]]) {
      for (const url of Object.keys(files)) {
        if (process.env.FOOTER_FOCUS && !(width === 1440 && height === 540 && url === '/community-assistant')) continue;
        const assistant = url === '/community-assistant';
        const food = url === '/food-truck';
        const chat = assistant || food;
        const obstruction = width > 760 ? 48 : 0;
        const page = await browser.newPage({ viewport: { width, height }, isMobile: width < 761, hasTouch: width < 761 });
        if (!live) await page.route(base + '/**', route => {
          const u = new URL(route.request().url());
          const local = path.join(root, 'public', files[u.pathname] || u.pathname.slice(1));
          return !u.pathname.startsWith('/api/') && fs.existsSync(local) && fs.statSync(local).isFile() ? route.fulfill({ path: local }) : route.fallback();
        });
        await page.route('**/api/{community,rules}/ask', route => {
          assert.equal(route.request().postDataJSON().isTest, true);
          mockedQuestions++;
          return route.fulfill({ json: { answer: Array(22).fill('Browser-only layout fixture to check a long conversation and access to the footer and message box.').join('\n\n'), confidence: { canAnswer: false }, sources: [{ title: 'Browser-only source fixture', sourceUrl: 'https://sterlingranchcab.com/', excerpt: 'Layout fixture.' }] } });
        });
        await page.goto(base + url + (assistant ? '?test=1' : ''));
        await page.locator('.society-enhanced').waitFor();
        if (assistant) {
          await page.locator('#testModeBanner').waitFor({ state: 'visible' });
          await page.locator('#rulesQuestion').fill('Browser-only footer layout test');
          await page.locator('#rulesSend').click();
          await page.locator('.rules-sources').waitFor();
        }
        if (food) await page.locator('.food-result').waitFor({ timeout: 40000 });
        if (url === '/openings') await page.locator('.opening-card').first().waitFor({ timeout: 35000 });
        if (url === '/pool') await page.waitForFunction(() => document.body.dataset.poolState !== 'loading');
        if (url === '/' || url === '/calendar') await page.locator('#briefing-events[aria-busy="false"]').waitFor({ timeout: 35000 });
        if (url === '/') {
          await page.locator('#briefing-weather[aria-busy="false"]').waitFor({ timeout: 35000 });
          await page.waitForFunction(() => !document.querySelector('#briefing-openings').textContent.includes('Loading'));
        }
        await page.evaluate(() => document.fonts.ready);
        if (!chat) await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, document.documentElement.scrollHeight); });
        await page.waitForTimeout(350);
        const footer = page.locator('.site-footer');
        assert(await footer.isVisible(), 'Footer hidden');
        const geometry = await footer.evaluate((element, obstruction) => {
          const rect = element.getBoundingClientRect();
          const contentBottom = Math.max(...[...element.querySelectorAll('b,span,a,p')].map(e => e.getBoundingClientRect().bottom));
          return { top: rect.top, bottom: rect.bottom, contentBottom, limit: innerHeight - obstruction, overflow: document.documentElement.scrollWidth > innerWidth, pageY: scrollY };
        }, obstruction);
        assert(!geometry.overflow, 'Horizontal overflow');
        assert(geometry.top >= 0, 'Footer top outside viewport');
        assert(geometry.contentBottom <= geometry.limit, 'Footer behind desktop obstruction: ' + JSON.stringify({ url, width, height, geometry }));
        for (const name of ['Report a bug', 'Request a feature']) assert.equal(await page.getByRole('link', { name, exact: true }).count(), 1);
        let transcriptHeight;
        if (chat) {
          const messages = page.locator(assistant ? '#rulesScroll' : '#messages');
          const dock = page.locator(assistant ? '#rulesDock' : '.food-chat-dock');
          const input = page.locator(assistant ? '#rulesQuestion' : '#questionInput');
          const dockRect = await dock.boundingBox();
          const inputRect = await input.boundingBox();
          transcriptHeight = (await messages.boundingBox()).height;
          assert(inputRect.y >= 0 && inputRect.y + inputRect.height <= geometry.top, 'Composer behind footer');
          assert(transcriptHeight >= 80, 'Transcript too short: ' + transcriptHeight);
          assert.equal(geometry.pageY, 0, 'Chat page scrolled');
          if (assistant) {
            await page.locator('#startersToggle').click();
            assert.equal((await messages.boundingBox()).height, transcriptHeight, 'Examples moved dock');
            await page.locator('#startersToggle').click();
          }
          await messages.evaluate(e => { e.style.scrollBehavior = 'auto'; e.scrollTop = 0; });
          await page.waitForTimeout(350);
          const box = await messages.boundingBox();
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.wheel(0, 300);
          await page.waitForTimeout(350);
          assert(await messages.evaluate(e => e.scrollTop > 0), 'Conversation will not scroll');
          assert.equal(await page.evaluate(() => scrollY), 0, 'Conversation moved page');
          assert(Math.abs((await dock.boundingBox()).y - dockRect.y) < 1, 'Conversation moved composer');
        }
        if (obstruction) await page.evaluate(px => {
          const overlay = document.createElement('div');
          overlay.style.cssText = `position:fixed;bottom:0;left:0;right:0;height:${px}px;background:#292b26;color:white;z-index:2147483647;font:12px Arial;padding:12px;box-sizing:border-box`;
          overlay.textContent = '48px desktop taskbar simulation';
          document.body.append(overlay);
        }, obstruction);
        if (chat || width === 1440) await page.screenshot({ path: path.join(__dirname, `${prefix}-${files[url]}-${width}x${height}.png`) });
        results.push({ url, width, height, obstruction, transcriptHeight, geometry, passed: true });
        console.log('Passed ' + url + ' ' + width + 'x' + height);
        await page.close();
      }
    }
    fs.writeFileSync(path.join(__dirname, prefix + (process.env.FOOTER_FOCUS ? '-focus' : '') + '-results.json'), JSON.stringify({ results, mockedQuestions, liveQuestions: 0 }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

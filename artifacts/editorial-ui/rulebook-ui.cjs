const assert = require("node:assert/strict");
const fs = require("node:fs");
const {
  chromium,
} = require("C:/Users/mar15/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const { rulebookDestination } = require("../../lib/community-rulebook");
const { getCommunityProfile } = require("../../lib/community-source-manager");
const configuredRulebook = rulebookDestination(getCommunityProfile());
(async () => {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const results = [];
  let questions = 0;
  const base = process.env.UI_TEST_URL || "http://127.0.0.1:3187";
  for (const mode of ["desktop", "mobile", "no-javascript"]) {
    const context = await browser.newContext({
      viewport:
        mode === "desktop"
          ? { width: 1440, height: 1100 }
          : { width: 390, height: 844 },
      javaScriptEnabled: mode !== "no-javascript",
    });
    context.on("request", (r) => {
      if (/\/api\/(community|rules)\/ask/.test(r.url())) questions++;
    });
    await context.route(configuredRulebook, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<title>Rulebook destination test</title><h1>Configured official destination reached</h1>",
      }),
    );
    const page = await context.newPage();
    await page.goto(base + "/");
    const links = await page.locator(".briefing-tags a").allTextContents();
    assert.deepEqual(
      links.map((x) => x.trim()),
      ["Home & yard", "Trash & recycling", "The rulebook ↗"],
    );
    const link = page.getByRole("link", {
      name: "The rulebook ↗",
      exact: true,
    });
    assert.equal(await link.getAttribute("href"), "/rulebook");
    assert.equal(await link.getAttribute("target"), "_blank");
    assert((await link.getAttribute("rel")).includes("noreferrer"));
    assert(await link.isVisible());
    assert(
      (await link.evaluate((e) => e.getBoundingClientRect().height)) >= 44,
    );
    const response = await context.request.get(base + "/rulebook", {
      maxRedirects: 0,
    });
    assert.equal(response.status(), 302);
    assert.equal(response.headers().location, configuredRulebook);
    await link.focus();
    const opened = context.waitForEvent("page");
    await link.press("Enter");
    const popup = await opened;
    await popup.waitForLoadState();
    assert.equal(popup.url(), configuredRulebook);
    await popup.close();
    if (mode !== "no-javascript") {
      await page
        .waitForFunction(
          () =>
            !document
              .querySelector("#briefing-truck")
              .textContent.includes("Checking"),
          { timeout: 30000 },
        )
        .catch(() => {});
      await page.screenshot({
        path: "artifacts/editorial-ui/home-" + mode + ".png",
        fullPage: true,
      });
      await page.addScriptTag({
        path: "artifacts/editorial-ui/tools/node_modules/axe-core/axe.min.js",
      });
      const violations = await page.evaluate(async () => {
        const r = await axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        });
        return r.violations.map((v) => v.id);
      });
      assert.deepEqual(violations, []);
    }
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    results.push({
      mode,
      shortcuts: links.map((x) => x.trim()),
      redirectMatchesConfiguredSource: true,
      keyboardOpensRulebook: true,
      feedbackLinks: await page
        .locator(".society-footer .society-feedback-link")
        .count(),
    });
    await context.close();
  }
  assert.equal(questions, 0);
  fs.writeFileSync(
    "artifacts/editorial-ui/rulebook-ui-results.json",
    JSON.stringify({ results, assistantRequests: questions }, null, 2),
  );
  console.log(JSON.stringify(results));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

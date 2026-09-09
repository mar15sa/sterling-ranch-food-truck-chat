const assert = require("node:assert/strict");
const fs = require("node:fs");
const {
  chromium,
} = require("C:/Users/mar15/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const { calendarConfiguration } = require("../../lib/community-calendar-view");
const profile = require("../../data/communities/sterling-ranch.json");
const base = "http://127.0.0.1:3188";
(async () => {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const results = [];
  let questions = 0;
  const fixtureEvents = Array.from({ length: 7 }, (_, i) => ({
    id: String(i),
    title: `Fixture community gathering ${i + 1}`,
    date: `2026-09-${String(12 + i).padStart(2, "0")}`,
    time: "18:00",
    location: "Fixture community space",
    url: `https://sterlingranchcab.com/Calendar.aspx?EID=${i}`,
  }));
  for (const width of [1440, 390])
    for (const path of ["/", "/calendar"])
      for (const state of ["ready", "loading", "empty", "error"]) {
        const context = await browser.newContext({
          viewport: { width, height: width === 1440 ? 1100 : 844 },
        });
        context.on("request", (r) => {
          if (/\/api\/(community|rules)\/ask/.test(r.url())) questions++;
        });
        let release;
        await context.route("**/api/community/events", async (route) => {
          if (state === "loading")
            await new Promise((resolve) => (release = resolve));
          if (state === "error")
            return route.fulfill({ status: 503, body: "Unavailable" });
          return route.fulfill({
            contentType: "application/json",
            body: JSON.stringify({
              events: state === "empty" ? [] : fixtureEvents,
              status: state === "empty" ? "empty" : "ready",
            }),
          });
        });
        const page = await context.newPage();
        await page.goto(base + path);
        const list = page.locator("#briefing-events");
        if (state === "loading") {
          await list.getByText(/Loading/).waitFor();
          assert.equal(await list.getAttribute("aria-busy"), "true");
        } else {
          await page.waitForFunction(
            () =>
              document
                .querySelector("#briefing-events")
                .getAttribute("aria-busy") === "false",
          );
        }
        if (state === "ready") {
          assert.equal(
            await list.locator(".briefing-row").count(),
            path === "/" ? 3 : 7,
          );
          assert((await list.innerText()).includes("6:00 PM"));
        }
        if (state === "empty" || state === "error")
          assert.equal(
            await list.locator('a[href="/community-calendar"]').count(),
            1,
          );
        if (path === "/calendar")
          assert.equal(await page.locator('a[href="/food-truck"]').count(), 2);
        if (width === 390) {
          const menu = page.locator(".society-menu");
          await menu.click();
          assert.equal(await menu.getAttribute("aria-expanded"), "true");
          await page.keyboard.press("Escape");
          assert.equal(await menu.getAttribute("aria-expanded"), "false");
        }
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        );
        await page.addScriptTag({
          path: "../society-editorial-ui-implementation-20260909/artifacts/editorial-ui/tools/node_modules/axe-core/axe.min.js",
        });
        const violations = await page.evaluate(async () =>
          (
            await axe.run(document, {
              runOnly: {
                type: "tag",
                values: ["wcag2a", "wcag2aa", "wcag21aa"],
              },
            })
          ).violations.map((v) => v.id),
        );
        assert.deepEqual(violations, []);
        const screenshot = `${path === "/" ? "home" : "calendar"}-${width}-${state}.png`;
        await page.screenshot({
          path: "artifacts/editorial-events/" + screenshot,
          fullPage: true,
        });
        results.push({
          width,
          path,
          state,
          screenshot,
          axeViolations: violations,
        });
        if (release) release();
        await context.close();
      }
  const context = await browser.newContext({ javaScriptEnabled: false });
  const response = await context.request.get(base + "/community-calendar", {
    maxRedirects: 0,
  });
  assert.equal(response.status(), 302);
  assert.equal(
    response.headers().location,
    calendarConfiguration(profile).action.url,
  );
  await context.close();
  for (const width of [1440, 390])
    for (const path of ["/", "/calendar"]) {
      const page = await browser.newPage({
        viewport: { width, height: width === 1440 ? 1100 : 844 },
      });
      await page.goto(base + path);
      await page.waitForFunction(
        () =>
          document
            .querySelector("#briefing-events")
            .getAttribute("aria-busy") === "false",
      );
      const screenshot = `${path === "/" ? "home" : "calendar"}-${width}-live.png`;
      await page.screenshot({
        path: "artifacts/editorial-events/" + screenshot,
        fullPage: true,
      });
      results.push({
        width,
        path,
        state: "live",
        screenshot,
        text: await page.locator("#briefing-events").innerText(),
      });
      await page.close();
    }
  assert.equal(questions, 0);
  fs.writeFileSync(
    "artifacts/editorial-events/browser-results.json",
    JSON.stringify({ results, assistantRequests: questions }, null, 2),
  );
  await browser.close();
  console.log(
    "PASS: 16 fixture states, 4 live renders, official redirect, menu, no overflow, accessibility, no Assistant questions.",
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

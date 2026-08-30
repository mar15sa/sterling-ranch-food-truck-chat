const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createFoodTruckService } = require("../lib/food-truck-service");

test("one food-truck service owns schedule, menu, and answer caching for every caller", async () => {
  let scheduleCalls = 0;
  let menuCalls = 0;
  const service = createFoodTruckService({
    formatIso: () => "2026-08-29",
    formatFriendly: () => "Saturday, August 29, 2026",
    getScheduleForMonth: async () => {
      scheduleCalls += 1;
      return {
        sourceUrl: "https://sterlingranchcab.com/Calendar.aspx",
        schedule: { "2026-08-29": "Krazy Thai" },
        localEvents: {},
      };
    },
    getEventTruckListings: async () => [],
    getMenuForTruck: async (name) => {
      menuCalls += 1;
      return { links: [{ title: `${name} menu`, url: "https://example.com/menu" }], items: [{ name: "Pad Thai", price: "$14.00" }] };
    },
    isNonTruckCalendarTitle: () => false,
    normalizeTruckName: (name) => name,
    splitListedTruckNames: (name) => [name],
  });
  const date = new Date(Date.UTC(2026, 7, 29));
  const standalone = await service.getAnswerForDate("Who is here?", date);
  const community = await service.getAnswerForDate("What is on their menu?", date);

  assert.equal(scheduleCalls, 1);
  assert.equal(menuCalls, 1);
  assert.equal(standalone.truck, "Krazy Thai");
  assert.equal(community.truck, standalone.truck);
  assert.deepEqual(community.menu, standalone.menu);
  assert.equal(community.question, "What is on their menu?");
});

test("both public APIs are wired to the same extracted food-truck service", () => {
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.match(server, /createFoodTruckService\(\{/);
  assert.match(server, /sendJson\(res, 200, await getAnswerForDate\(question, targetDate\)\)/);
  assert.match(server, /getFoodTruckAnswer:\s*async[^=]*=>\s*getAnswerForDate/);
  assert.doesNotMatch(server, /async function getAnswerForDate/);
});

test("the Community Assistant has a dedicated resident-friendly food-truck card", () => {
  const script = fs.readFileSync(path.join(__dirname, "..", "public", "rules-assistant.js"), "utf8");
  const styles = fs.readFileSync(path.join(__dirname, "..", "public", "rules-assistant.css"), "utf8");
  assert.match(script, /function renderFoodTruckAnswer/);
  assert.match(script, /Menu preview/);
  assert.match(script, /Helpful links/);
  assert.match(script, /View official wording/);
  assert.match(script, /resetConversation\(\{ showPrompt: false \}\)/);
  assert.match(styles, /\.rules-food-truck-menu/);
  assert.match(styles, /\.rules-official-wording/);
  assert.match(styles, /\.rules-next-action-secondary/);
});

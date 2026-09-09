const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createFoodTruckService } = require("../lib/food-truck-service");
const { createMonthlyScheduleCache } = require("../lib/food-truck-calendar-cache");

test("a month cache keeps the requested calendar day in its source link after another day warms it", async () => {
  const cache = createMonthlyScheduleCache({
    calendarBase: "https://sterlingranchcab.com/Calendar.aspx",
    eventId: 6150,
  });
  let loads = 0;
  const loadSeptember = async () => {
    loads += 1;
    return {
      schedule: {
        "2026-09-09": "Berliner Haus",
        "2026-09-10": "Colorado Chile Co",
      },
      localEvents: {},
    };
  };

  const warmedForSeptember10 = await cache.getSchedule(2026, 9, 10, loadSeptember);
  const requestedForSeptember9 = await cache.getSchedule(2026, 9, 9, loadSeptember);

  assert.equal(loads, 1);
  assert.match(warmedForSeptember10.sourceUrl, /[?&]day=10(?:&|$)/);
  assert.equal(requestedForSeptember9.schedule["2026-09-09"], "Berliner Haus");
  assert.match(requestedForSeptember9.sourceUrl, /[?&]day=9(?:&|$)/);
});

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

test("calendar aliases use the known public truck name for answers and menu lookup", async () => {
  let requestedMenuName = "";
  const service = createFoodTruckService({
    formatIso: () => "2026-08-29",
    formatFriendly: () => "Saturday, August 29, 2026",
    getScheduleForMonth: async () => ({
      sourceUrl: "https://sterlingranchcab.com/Calendar.aspx",
      schedule: { "2026-08-29": "Cousins Main Lobster" },
      localEvents: {},
    }),
    getEventTruckListings: async () => [],
    getMenuForTruck: async (name) => {
      requestedMenuName = name;
      return { links: [], items: [] };
    },
    isNonTruckCalendarTitle: () => false,
    normalizeTruckName: (name) => name,
    splitListedTruckNames: (name) => [name],
    displayTruckName: (name) => name === "Cousins Main Lobster" ? "Cousins Maine Lobster" : name,
  });

  const answer = await service.getAnswerForDate("Who is here?", new Date(Date.UTC(2026, 7, 29)));

  assert.equal(requestedMenuName, "Cousins Maine Lobster");
  assert.equal(answer.truck, "Cousins Maine Lobster");
  assert.equal(answer.trucks[0].name, "Cousins Maine Lobster");
  assert.match(answer.text, /Cousins Maine Lobster/);
});

test("a menu/profile enrichment failure keeps the official scheduled truck answer available", async () => {
  const service = createFoodTruckService({
    formatIso: () => "2026-08-29",
    formatFriendly: () => "Saturday, August 29, 2026",
    getScheduleForMonth: async () => ({
      sourceUrl: "https://sterlingranchcab.com/Calendar.aspx",
      schedule: { "2026-08-29": "Example Eats" },
      localEvents: {},
    }),
    getEventTruckListings: async () => [],
    getMenuForTruck: async () => { throw new Error("vendor profile unavailable"); },
    isNonTruckCalendarTitle: () => false,
    normalizeTruckName: (name) => name,
    splitListedTruckNames: (name) => [name],
  });

  const answer = await service.getAnswerForDate("Who is here?", new Date(Date.UTC(2026, 7, 29)));

  assert.equal(answer.truck, "Example Eats");
  assert.equal(answer.sourceUrl, "https://sterlingranchcab.com/Calendar.aspx");
  assert.deepEqual(answer.menu, { links: [], items: [] });
  assert.deepEqual(answer.menuEnrichment, {
    status: "degraded",
    failures: [{ truck: "Example Eats", component: "menu-profile" }],
  });
});

test("one failed menu/profile enrichment does not remove other trucks on the official schedule", async () => {
  const service = createFoodTruckService({
    formatIso: () => "2026-08-29",
    formatFriendly: () => "Saturday, August 29, 2026",
    getScheduleForMonth: async () => ({
      sourceUrl: "https://sterlingranchcab.com/Calendar.aspx",
      schedule: { "2026-08-29": "Example Eats & Sample Tacos" },
      localEvents: {},
    }),
    getEventTruckListings: async () => [],
    getMenuForTruck: async (name) => {
      if (name === "Example Eats") throw new Error("vendor profile unavailable");
      return { links: [{ title: "Sample Tacos menu", url: "https://example.test/menu" }], items: [{ name: "Taco", price: "$12" }] };
    },
    isNonTruckCalendarTitle: () => false,
    normalizeTruckName: (name) => name,
    splitListedTruckNames: () => ["Example Eats", "Sample Tacos"],
  });

  const answer = await service.getAnswerForDate("Who is here?", new Date(Date.UTC(2026, 7, 29)));

  assert.equal(answer.truck, "Example Eats and Sample Tacos");
  assert.deepEqual(answer.trucks.map((listing) => listing.name), ["Example Eats", "Sample Tacos"]);
  assert.deepEqual(answer.trucks[1].menu.items, [{ name: "Taco", price: "$12" }]);
  assert.deepEqual(answer.menuEnrichment.failures, [{ truck: "Example Eats", component: "menu-profile" }]);
});

test("the standalone API keeps its service while the Community Assistant uses the source-governed connector", () => {
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.match(server, /createFoodTruckService\(\{/);
  assert.match(server, /sendJson\(res, 200, await getAnswerForDate\(question, targetDate\)\)/);
  assert.match(server, /getFoodTruckAnswer:\s*async[\s\S]{0,700}getCommunityFoodTruckSchedule/);
  assert.doesNotMatch(server, /getFoodTruckAnswer:\s*async[\s\S]{0,700}getAnswerForDate/);
  assert.match(server, /dateFromInterpretation/);
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

const test = require("node:test");
const assert = require("node:assert/strict");
const sterling = require("../data/communities/sterling-ranch.json");
const { foodTruckAnswer } = require("../lib/community-food-trucks");
const { getCommunityFoodTruckSchedule } = require("../lib/community-food-truck-live");

function secondCommunityProfile() {
  const connector = structuredClone(sterling.connectors.find((item) => item.type === "food-truck-schedule"));
  const profile = { communityId: "riverton", name: "Riverton Community", shortName: "Riverton", website: "https://riverton.example/", allowedHosts: ["riverton.example", "menus.riverton.example"], connectors: [connector] };
  connector.id = "market-trucks";
  connector.baseUrl = "https://riverton.example/calendar";
  connector.adapter.sourceHosts = ["riverton.example", "menus.riverton.example"];
  connector.adapter.endpoints = [{ id: "schedule", url: "https://riverton.example/calendar", purpose: "official-food-truck-schedule" }];
  connector.adapter.labels = { calendarTitle: "Riverton market calendar", calendarAction: "View Riverton market schedule", fullAnswerAction: "Open Riverton truck details" };
  connector.adapter.foodTruck = { fullAnswerPath: "/market-trucks", calendarDatePolicy: { kind: "rolling", pastDays: 14, futureDays: 370 }, vendorSources: [{ id: "riverton-bites", aliases: ["Riverton Bites"], menuUrls: ["https://menus.riverton.example/bites"] }] };
  return profile;
}

test("a second community changes food-truck schedule, labels, actions, and evidence only through its profile", () => {
  const profile = secondCommunityProfile();
  const answer = foodTruckAnswer({
    date: "2026-09-10", friendlyDate: "Thursday, September 10", truck: "Riverton Bites", sourceUrl: "https://riverton.example/calendar",
    menu: { links: [{ title: "Riverton Bites menu", url: "https://menus.riverton.example/bites" }], items: [{ name: "Soup", price: "$8", url: "https://menus.riverton.example/bites" }] },
  }, { profile, routingPlan: { requestedDetails: ["date", "price"], dateRange: { start: "2026-09-10", end: "2026-09-10" } } });
  assert.equal(answer.evidenceEnvelope.communityId, "riverton");
  assert.equal(answer.evidenceEnvelope.adapterId, "riverton:market-trucks");
  assert.deepEqual(answer.sources.map((source) => source.sourceUrl), ["https://riverton.example/calendar", "https://menus.riverton.example/bites"]);
  assert.deepEqual(answer.actions.map((action) => action.label), ["Open Riverton truck details", "View Riverton Bites menu", "View Riverton market schedule"]);
});

test("the Community Assistant live path ignores historic local overrides and static menu registries", async () => {
  const result = await getCommunityFoodTruckSchedule({ dateRange: { start: "2026-06-06", end: "2026-06-06" } }, {
    profile: sterling,
    now: new Date("2026-06-06T18:00:00Z"), fetchImpl: async () => new Response("6/6 - Live Calendar Kitchen"),
  });
  assert.deepEqual(result.trucks.map((truck) => truck.name), ["Live Calendar Kitchen"]);
  assert.equal(Object.hasOwn(result, "menu"), false);
  assert.equal(result.menuEnrichment.status, "degraded");
});

test("the live calendar applies its profile-owned rolling horizon across a year boundary and fails closed outside it", async () => {
  const now = new Date("2026-12-31T18:00:00Z");
  const nextYear = await getCommunityFoodTruckSchedule({ dateRange: { start: "2027-01-01", end: "2027-01-01" } }, { profile: sterling, now, fetchImpl: async () => new Response("1/1/2027 - New Year Kitchen") });
  assert.deepEqual(nextYear.trucks.map((truck) => truck.name), ["New Year Kitchen"]);
  await assert.rejects(() => getCommunityFoodTruckSchedule({ dateRange: { start: "2028-02-06", end: "2028-02-06" } }, { profile: sterling, now, fetchImpl: async () => new Response("2/6/2028 - stale") }), /does not cover that date/i);
  await assert.rejects(() => getCommunityFoodTruckSchedule({ dateRange: { start: "2026-02-30", end: "2026-02-30" } }, { profile: sterling, now, fetchImpl: async () => new Response("2/30 - impossible") }), /valid requested/i);
  await assert.rejects(() => getCommunityFoodTruckSchedule({ dateRange: { start: "2026-12-31", end: "2026-12-31" } }, { profile: sterling, now, fetchImpl: async () => new Response("Calendar temporarily unavailable") }), /parsed reliably/i);
  const unlisted = await getCommunityFoodTruckSchedule({ dateRange: { start: "2026-12-30", end: "2026-12-30" } }, { profile: sterling, now, fetchImpl: async () => new Response("12/29/2026 - Live Calendar Kitchen") });
  assert.deepEqual(unlisted.trucks, []);
});

test("the live calendar accepts CivicPlus-style date separators and rejects a response explicitly stamped for another year", async () => {
  const now = new Date("2026-12-31T18:00:00Z");
  const result = await getCommunityFoodTruckSchedule({ dateRange: { start: "2027-01-01", end: "2027-01-01" } }, { profile: sterling, now, fetchImpl: async () => new Response("<tr><td>1/1/2027</td><td>New Year Kitchen</td></tr>") });
  assert.deepEqual(result.trucks.map((truck) => truck.name), ["New Year Kitchen"]);
  await assert.rejects(() => getCommunityFoodTruckSchedule({ dateRange: { start: "2027-01-01", end: "2027-01-01" } }, { profile: sterling, now, fetchImpl: async () => new Response("1/1/2026 - Last Year's Kitchen") }), /parsed reliably/i);
});

test("a malformed food-truck date policy is rejected before it can broaden a community's calendar coverage", async () => {
  const profile = structuredClone(sterling);
  profile.connectors.find((connector) => connector.id === "food-truck-schedule").adapter.foodTruck.calendarDatePolicy = { kind: "rolling", pastDays: -1, futureDays: 370 };
  await assert.rejects(() => getCommunityFoodTruckSchedule({ dateRange: { start: "2026-09-10", end: "2026-09-10" } }, { profile, fetchImpl: async () => new Response("9/10 - Example Eats") }), /bounded rolling date policy/i);
});

test("same-host schedule pages cannot be relabeled as configured calendar evidence", () => {
  assert.throws(() => foodTruckAnswer({ date: "2026-09-10", truck: "Example Eats", sourceUrl: "https://sterlingranchcab.com/Calendar.aspx?EID=9999" }, { profile: sterling, routingPlan: { requestedDetails: ["date"] } }), /configured official calendar/i);
});

test("an explicit vendor identity accepts only its exact configured menu source", () => {
  const profile = secondCommunityProfile();
  const approved = foodTruckAnswer({ date: "2026-09-10", truck: "Riverton Bites", sourceUrl: "https://riverton.example/calendar", menu: { links: [{ title: "Menu", url: "https://menus.riverton.example/bites" }], items: [{ name: "Soup", price: "$8", url: "https://menus.riverton.example/bites" }] } }, { profile, routingPlan: { requestedDetails: ["date", "price"] } });
  const unrelated = foodTruckAnswer({ date: "2026-09-10", truck: "Riverton Bites", sourceUrl: "https://riverton.example/calendar", menu: { links: [{ title: "Unrelated", url: "https://menus.riverton.example/other-account" }], items: [{ name: "Fake soup", price: "$1", url: "https://menus.riverton.example/other-account" }] } }, { profile, routingPlan: { requestedDetails: ["date", "price"] } });
  assert.equal(approved.evidenceEnvelope.coverage.covered.includes("price"), true);
  assert.equal(unrelated.evidenceEnvelope.coverage.covered.includes("price"), false);
  assert.doesNotMatch(JSON.stringify(unrelated), /Fake soup|other-account/);
});

test("an unapproved menu host cannot create menu or price claims", () => {
  const answer = foodTruckAnswer({
    date: "2026-09-10", truck: "Example Eats", sourceUrl: "https://sterlingranchcab.com/Calendar.aspx?EID=6150",
    menu: { links: [{ title: "Fake menu", url: "https://hostile.example/menu" }], items: [{ name: "Invented taco", price: "$1", url: "https://hostile.example/menu" }] },
  }, { profile: sterling, routingPlan: { requestedDetails: ["date", "price"], dateRange: { start: "2026-09-10", end: "2026-09-10" } } });
  assert.equal(answer.answerStatus, "verified-incomplete");
  assert.match(answer.directAnswer, /Example Eats/);
  assert.equal(answer.keyDetails.length, 0);
  assert.deepEqual(answer.evidenceEnvelope.coverage.covered, ["date"]);
  assert.doesNotMatch(JSON.stringify(answer), /hostile\.example|Invented taco|\$1/);
});

test("a degraded vendor menu keeps the calendar schedule claim while omitting only menu coverage", () => {
  const answer = foodTruckAnswer({
    date: "2026-09-10", truck: "Example Eats", sourceUrl: "https://sterlingranchcab.com/Calendar.aspx?EID=6150",
    menu: { links: [], items: [] }, menuEnrichment: { status: "degraded", failures: [{ truck: "Example Eats", component: "menu-profile" }] },
  }, { profile: sterling, routingPlan: { requestedDetails: ["date", "price"], dateRange: { start: "2026-09-10", end: "2026-09-10" } } });
  assert.equal(answer.answerStatus, "verified-incomplete");
  assert.equal(answer.evidenceEnvelope.degradation.state, "degraded");
  assert.deepEqual(answer.evidenceEnvelope.coverage, { requested: ["date", "price"], covered: ["date"], missing: ["price"] });
  assert.equal(answer.claims[0].verified, true);
  assert.equal(answer.claims[0].evidenceSourceIds[0], "sterling-ranch:food-truck-schedule:schedule");
});

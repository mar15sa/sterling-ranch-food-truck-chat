const test = require("node:test");
const assert = require("node:assert/strict");
const sterling = require("../data/communities/sterling-ranch.json");
const { foodTruckAnswer } = require("../lib/community-food-trucks");

function secondCommunityProfile() {
  const connector = structuredClone(sterling.connectors.find((item) => item.type === "food-truck-schedule"));
  const profile = { communityId: "riverton", name: "Riverton Community", shortName: "Riverton", website: "https://riverton.example/", allowedHosts: ["riverton.example", "menus.riverton.example"], connectors: [connector] };
  connector.id = "market-trucks";
  connector.baseUrl = "https://riverton.example/calendar";
  connector.adapter.sourceHosts = ["riverton.example", "menus.riverton.example"];
  connector.adapter.endpoints = [{ id: "schedule", url: "https://riverton.example/calendar", purpose: "official-food-truck-schedule" }];
  connector.adapter.labels = { calendarTitle: "Riverton market calendar", calendarAction: "View Riverton market schedule", fullAnswerAction: "Open Riverton truck details" };
  connector.adapter.foodTruck = { fullAnswerPath: "/market-trucks", menuSourceHosts: ["menus.riverton.example"] };
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

test("an unapproved menu host cannot create menu or price claims", () => {
  const answer = foodTruckAnswer({
    date: "2026-09-10", truck: "Example Eats", sourceUrl: "https://sterlingranchcab.com/Calendar.aspx",
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
    date: "2026-09-10", truck: "Example Eats", sourceUrl: "https://sterlingranchcab.com/Calendar.aspx",
    menu: { links: [], items: [] }, menuEnrichment: { status: "degraded", failures: [{ truck: "Example Eats", component: "menu-profile" }] },
  }, { profile: sterling, routingPlan: { requestedDetails: ["date", "price"], dateRange: { start: "2026-09-10", end: "2026-09-10" } } });
  assert.equal(answer.answerStatus, "verified-incomplete");
  assert.equal(answer.evidenceEnvelope.degradation.state, "degraded");
  assert.deepEqual(answer.evidenceEnvelope.coverage, { requested: ["date", "price"], covered: ["date"], missing: ["price"] });
  assert.equal(answer.claims[0].verified, true);
  assert.equal(answer.claims[0].evidenceSourceIds[0], "sterling-ranch:food-truck-schedule:schedule");
});

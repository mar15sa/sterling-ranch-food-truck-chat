const test = require("node:test");
const assert = require("node:assert/strict");
const sterling = require("../data/communities/sterling-ranch.json");
const { getCommunityPoolStatus } = require("../lib/community-pool-status");
const { answerCommunityQuestion } = require("../lib/community-assistant");

function response(body, ok = true, status = 200) { return new Response(body, { status: ok ? status : 503 }); }
function poolLink(label, href = "/187/Pool") { return `<a class="widgetGraphicLinksLink" href="${href}"><img alt="${label}"></a>`; }
function plan(overrides = {}) {
  return { intent: "status", goal: "status", subject: "current pool status", requestedDetails: ["status"], filters: {}, searchQueries: ["pool status"], ...overrides };
}

test("configured exact operational status emits a healthy community-scoped evidence envelope", async () => {
  const result = await getCommunityPoolStatus({ profile: sterling, fetchImpl: async () => response(poolLink("Open")), now: () => "2026-09-09T12:00:00.000Z" });
  assert.equal(result.headline, "Open");
  assert.equal(result.evidenceEnvelope.communityId, "sterling-ranch");
  assert.equal(result.evidenceEnvelope.connectorFamily, "live-status");
  assert.deepEqual(result.evidenceEnvelope.coverage, { requested: ["status"], covered: ["status"], missing: [] });
  assert.equal(result.evidenceEnvelope.claims[0].text, "Open");
});

test("color alone, malformed pages, failed fetches, and unknown labels fail closed", async () => {
  for (const source of [poolLink("Green Light"), "<main>Open</main>"]) {
    await assert.rejects(() => getCommunityPoolStatus({ profile: sterling, fetchImpl: async () => response(source) }), /exact operational status/i);
  }
  await assert.rejects(() => getCommunityPoolStatus({ profile: sterling, fetchImpl: async () => response("nope", false) }), /returned 503/i);
});

test("wrong tenant and unsupported source host fail before an Assistant claim can be made", async () => {
  const connector = structuredClone(sterling.connectors.find((item) => item.type === "live-status"));
  const profile = { communityId: "riverton", website: "https://riverton.example/", allowedHosts: ["riverton.example"], connectors: [connector] };
  connector.baseUrl = "https://riverton.example/pool";
  connector.adapter.sourceHosts = ["riverton.example"];
  connector.adapter.endpoints = [{ id: "primary", url: "https://riverton.example/pool", purpose: "pool-status" }];
  const result = await getCommunityPoolStatus({ profile, fetchImpl: async () => response(poolLink("Open", "/pool")) });
  assert.equal(result.evidenceEnvelope.communityId, "riverton");
  assert.equal(result.actionUrl, "https://riverton.example/pool");
  await assert.rejects(() => getCommunityPoolStatus({ profile, fetchImpl: async () => response(poolLink("Open", "https://sterlingranchcab.com/187/Pool")) }), /outside its declared hosts/i);
  const bad = structuredClone(profile);
  bad.connectors.find((item) => item.type === "live-status").adapter.endpoints[0].url = "https://hostile.example/pool";
  await assert.rejects(() => getCommunityPoolStatus({ profile: bad, fetchImpl: async () => response(poolLink("Open")) }), /allowed official HTTPS host/i);
});

test("live status cannot answer hours, guests, rentals, waitlists, or events", async () => {
  const live = await getCommunityPoolStatus({ profile: sterling, fetchImpl: async () => response(poolLink("Open")) });
  for (const routingPlan of [
    plan({ goal: "schedule", subject: "pool hours", requestedDetails: ["hours"] }),
    plan({ goal: "information", subject: "pool guest passes", requestedDetails: ["permission"] }),
    plan({ goal: "booking", subject: "pool rental", requestedDetails: ["action"] }),
    plan({ goal: "information", subject: "pool waitlist", requestedDetails: ["action"] }),
    plan({ intent: "events", goal: "registration", subject: "pool event registration", requestedDetails: ["action"] }),
  ]) {
    let calls = 0;
    const answer = await answerCommunityQuestion(routingPlan.subject, {
      interpretationMode: "structured", planCommunitySearch: async () => routingPlan,
      getPoolStatus: async () => { calls += 1; return live; }, synthesizeCommunityAnswer: false,
    });
    assert.equal(calls, 0, routingPlan.subject);
    assert.notEqual(answer.answerMode, "community-live-status", routingPlan.subject);
  }
});

test("stale or degraded status evidence cannot produce a current-status answer", async () => {
  const live = await getCommunityPoolStatus({ profile: sterling, fetchImpl: async () => response(poolLink("Open")) });
  live.evidenceEnvelope.degradation.state = "degraded";
  const answer = await answerCommunityQuestion("Is the pool open right now?", {
    interpretationMode: "structured", planCommunitySearch: async () => plan(),
    getPoolStatus: async () => live, synthesizeCommunityAnswer: false,
  });
  assert.notEqual(answer.answerMode, "community-live-status");
});

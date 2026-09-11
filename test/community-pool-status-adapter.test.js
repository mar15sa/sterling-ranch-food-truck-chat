const test = require("node:test");
const assert = require("node:assert/strict");
const sterling = require("../data/communities/sterling-ranch.json");
const { getCommunityPoolStatus, withinConfiguredPoolSeason } = require("../lib/community-pool-status");
const { answerCommunityQuestion } = require("../lib/community-assistant");

function response(body, ok = true, status = 200) { return new Response(body, { status: ok ? status : 503 }); }
function poolLink(label, href = "/187/Pool") { return `<a class="widgetGraphicLinksLink" href="${href}"><img alt="${label}"></a>`; }
function plan(overrides = {}) {
  return { intent: "status", goal: "status", subject: "current pool status", requestedDetails: ["status"], filters: {}, searchQueries: ["pool status"], ...overrides };
}

test("configured exact operational status emits a healthy community-scoped evidence envelope", async () => {
  const result = await getCommunityPoolStatus({ profile: sterling, fetchImpl: async () => response(poolLink("Green Light")), now: () => "2026-09-09T12:00:00.000Z" });
  assert.equal(result.headline, "Open");
  assert.equal(result.date, "2026-09-09");
  assert.equal(result.evidenceEnvelope.communityId, "sterling-ranch");
  assert.equal(result.evidenceEnvelope.connectorFamily, "live-status");
  assert.deepEqual(result.evidenceEnvelope.coverage, { requested: ["status"], covered: ["status"], missing: [] });
  assert.deepEqual(result.evidenceEnvelope.request.dateRange, { start: "2026-09-09", end: "2026-09-09", label: "current" });
  assert.equal(result.evidenceEnvelope.claims[0].text, "Open");
});

test("live status observation dates use each community's configured timezone", async () => {
  const result = await getCommunityPoolStatus({
    profile: sterling,
    fetchImpl: async () => response(poolLink("Red Light")),
    now: () => "2026-09-12T05:30:00.000Z",
  });
  assert.equal(result.date, "2026-09-11");
  assert.equal(result.evidenceEnvelope.request.dateRange.start, "2026-09-11");
});

test("every exact CAB live label maps to its configured resident meaning", async () => {
  const cases = [
    ["Green Light", "open", "Open", /open for all homeowners and guests/i],
    ["Yellow Light", "temporarily-closed", "Temporarily closed", /weather or maintenance/i],
    ["Red Light", "closed", "Closed", /closed with no access/i],
    ["Purple Light", "event-only", "Open for a registered event only", /registered for the current event/i],
    ["Blue Light", "at-capacity", "Open, at capacity", /join the official waitlist/i],
  ];
  for (const [label, state, headline, meaning] of cases) {
    const result = await getCommunityPoolStatus({ profile: sterling, fetchImpl: async () => response(poolLink(label)), now: () => "2026-07-15T12:00:00.000Z" });
    assert.equal(result.state, state, label);
    assert.equal(result.headline, headline, label);
    assert.match(result.summary, meaning, label);
    assert.equal(result.evidenceEnvelope.claims[0].text, headline, label);
  }
});

test("a red current marker reports only the live closure and does not borrow the configured season as evidence", async () => {
  const offSeason = await getCommunityPoolStatus({ profile: sterling, fetchImpl: async () => response(poolLink("Red Light")), now: () => "2026-09-10T12:00:00.000Z" });
  assert.match(offSeason.summary, /closed with no access/i);
  assert.doesNotMatch(offSeason.summary, /closed for the season|Memorial Day|Labor Day|2027|May \d/i);
  const inSeason = await getCommunityPoolStatus({ profile: sterling, fetchImpl: async () => response(poolLink("Red Light")), now: () => "2026-07-15T12:00:00.000Z" });
  assert.match(inSeason.summary, /closed with no access/i);
  assert.doesNotMatch(inSeason.summary, /closed for the season/i);
});

test("Memorial Day weekend through Labor Day season boundaries are explicit and inclusive", () => {
  const season = sterling.connectors.find((item) => item.id === "pool-status").adapter.poolStatus.season;
  assert.equal(withinConfiguredPoolSeason("2026-05-22T12:00:00.000Z", season), false);
  assert.equal(withinConfiguredPoolSeason("2026-05-23T12:00:00.000Z", season), true);
  assert.equal(withinConfiguredPoolSeason("2026-09-07T12:00:00.000Z", season), true);
  assert.equal(withinConfiguredPoolSeason("2026-09-08T12:00:00.000Z", season), false);
});

test("color alone, malformed pages, failed fetches, and unknown labels fail closed", async () => {
  for (const source of [poolLink("Unknown Light"), "<main>The status legend says Red Light means closed.</main>", '<a href="/187/Pool"><img alt="Red Light"></a>']) {
    await assert.rejects(() => getCommunityPoolStatus({ profile: sterling, fetchImpl: async () => response(source) }), /exact operational status/i);
  }
  await assert.rejects(() => getCommunityPoolStatus({ profile: sterling, fetchImpl: async () => response("nope", false) }), /returned 503/i);
});

test("wrong tenant and unsupported source host fail before an Assistant claim can be made", async () => {
  const connector = structuredClone(sterling.connectors.find((item) => item.type === "live-status"));
  const profile = { communityId: "riverton", website: "https://riverton.example/", timezone: "America/Denver", allowedHosts: ["riverton.example"], connectors: [connector] };
  connector.baseUrl = "https://riverton.example/pool";
  connector.adapter.sourceHosts = ["riverton.example"];
  connector.adapter.endpoints = [{ id: "primary", url: "https://riverton.example/pool", purpose: "pool-status" }];
  const result = await getCommunityPoolStatus({ profile, fetchImpl: async () => response(poolLink("Green Light", "/pool")) });
  assert.equal(result.evidenceEnvelope.communityId, "riverton");
  assert.equal(result.actionUrl, "https://riverton.example/pool");
  await assert.rejects(() => getCommunityPoolStatus({ profile, fetchImpl: async () => response(poolLink("Green Light", "https://sterlingranchcab.com/187/Pool")) }), /outside its declared hosts/i);
  const bad = structuredClone(profile);
  bad.connectors.find((item) => item.type === "live-status").adapter.endpoints[0].url = "https://hostile.example/pool";
  await assert.rejects(() => getCommunityPoolStatus({ profile: bad, fetchImpl: async () => response(poolLink("Open")) }), /allowed official HTTPS host/i);
});

test("live status cannot answer hours, guests, rentals, waitlists, or events", async () => {
  const live = await getCommunityPoolStatus({ profile: sterling, fetchImpl: async () => response(poolLink("Green Light")) });
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
  const live = await getCommunityPoolStatus({ profile: sterling, fetchImpl: async () => response(poolLink("Green Light")) });
  live.evidenceEnvelope.degradation.state = "degraded";
  const answer = await answerCommunityQuestion("Is the pool open right now?", {
    interpretationMode: "structured", planCommunitySearch: async () => plan(),
    getPoolStatus: async () => live, synthesizeCommunityAnswer: false,
  });
  assert.notEqual(answer.answerMode, "community-live-status");
});

test("Assistant requires same-community, current status evidence and a claim bound to that evidence", async () => {
  const live = await getCommunityPoolStatus({ profile: sterling, fetchImpl: async () => response(poolLink("Green Light")) });
  async function ask(status) {
    return answerCommunityQuestion("Is the pool open right now?", {
      interpretationMode: "structured", communityId: "sterling-ranch", communityProfile: sterling,
      planCommunitySearch: async () => plan(), getPoolStatus: async () => status, synthesizeCommunityAnswer: false,
    });
  }
  const healthy = await ask(live);
  assert.equal(healthy.answerMode, "community-live-status");
  assert.equal(healthy.answerStatus, "verified");
  assert.equal(healthy.claims.length, 1);
  assert.ok(healthy.claims.every((claim) => claim.verified === true));
  const noEnvelope = { ...live, evidenceEnvelope: undefined };
  assert.notEqual((await ask(noEnvelope)).answerMode, "community-live-status");
  const wrongCommunity = structuredClone(live);
  wrongCommunity.evidenceEnvelope.communityId = "riverton";
  wrongCommunity.evidenceEnvelope.evidence[0].communityId = "riverton";
  assert.notEqual((await ask(wrongCommunity)).answerMode, "community-live-status");
  const expired = structuredClone(live);
  expired.evidenceEnvelope.evidence[0].staleAfter = "2020-01-01T00:00:00.000Z";
  assert.notEqual((await ask(expired)).answerMode, "community-live-status");
  const mismatchedClaim = structuredClone(live);
  mismatchedClaim.evidenceEnvelope.claims[0].controllingEvidenceId = "sterling-ranch:pool-status:other";
  assert.notEqual((await ask(mismatchedClaim)).answerMode, "community-live-status");
});

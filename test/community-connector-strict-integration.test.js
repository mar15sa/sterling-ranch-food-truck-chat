const test = require("node:test");
const assert = require("node:assert/strict");
const sterlingRanch = require("../data/communities/sterling-ranch.json");
const castleRock = require("../data/communities/castle-rock.json");
const { createConnectorAdapters } = require("../lib/community-connector-adapter");
const { clearCommunityEventsCache, getCommunityEvents } = require("../lib/community-events");
const { answerCommunityQuestion } = require("../lib/community-assistant");

const EVENT_HTML = '<a id="eventTitle_42" href="/Calendar.aspx?EID=42"><span>Movie Night</span></a><span itemprop="startDate">2026-09-10T19:00:00</span><span itemprop="location"><span itemprop="name">Town Hall</span></span>';
const BROKEN_HTML = "<main>Calendar is temporarily unavailable</main>";
const response = (html, status = 200) => new Response(html, { status });
const calendarAdapter = (profile) => createConnectorAdapters(profile).find((adapter) => adapter.family === "civicplus-calendar");

test("a second-community CivicPlus calendar retains tenant, source, range, and profile labels", async () => {
  clearCommunityEventsCache();
  const now = new Date("2026-09-09T06:30:00.000Z");
  let requestedUrl = "";
  const result = await getCommunityEvents({
    dateRange: { start: "2026-09-10", end: "2026-09-10", label: "tomorrow" },
    filters: { location: "Town Hall" },
  }, {
    profile: castleRock,
    adapter: calendarAdapter(castleRock),
    now,
    fetchImpl: async (url) => { requestedUrl = url.href; return response(EVENT_HTML); },
  });

  assert.match(requestedUrl, /^https:\/\/www\.crgov\.com\/Calendar\.aspx\?/);
  assert.equal(result.calendarLabel, "Official Castle Rock Calendar");
  assert.equal(result.evidenceEnvelope.communityId, "castle-rock");
  assert.equal(result.evidenceEnvelope.adapterId, "castle-rock:official-calendar");
  assert.equal(result.evidenceEnvelope.evidence[0].evidenceId, "castle-rock:official-calendar:calendar");
  assert.deepEqual(result.evidenceEnvelope.request.dateRange, { start: "2026-09-10", end: "2026-09-10", label: "tomorrow" });
  assert.deepEqual(result.evidenceEnvelope.request.filters, { location: "Town Hall" });
});

test("calendar cache keys isolate both requested date ranges and communities", async () => {
  clearCommunityEventsCache();
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url.href);
    const isOctober = url.searchParams.get("month") === "10";
    const title = url.hostname === "www.crgov.com" ? "Castle Rock Forum" : isOctober ? "Autumn Festival" : "Movie Night";
    const date = isOctober ? "2026-10-11" : "2026-09-10";
    return response(EVENT_HTML.replace("Movie Night", title).replace("2026-09-10", date));
  };
  const now = new Date("2026-09-09T12:00:00.000Z");
  const september = { dateRange: { start: "2026-09-10", end: "2026-09-10", label: "September" } };
  const october = { dateRange: { start: "2026-10-11", end: "2026-10-11", label: "October" } };

  const sterlingSeptember = await getCommunityEvents(september, { profile: sterlingRanch, adapter: calendarAdapter(sterlingRanch), now, fetchImpl });
  const sterlingOctober = await getCommunityEvents(october, { profile: sterlingRanch, adapter: calendarAdapter(sterlingRanch), now, fetchImpl });
  const castleSeptember = await getCommunityEvents(september, { profile: castleRock, adapter: calendarAdapter(castleRock), now, fetchImpl });

  assert.equal(calls.length, 3);
  assert.equal(sterlingSeptember.events[0].title, "Movie Night");
  assert.equal(sterlingOctober.events[0].title, "Autumn Festival");
  assert.equal(castleSeptember.events[0].title, "Castle Rock Forum");
  assert.notEqual(sterlingSeptember.evidenceEnvelope.adapterId, castleSeptember.evidenceEnvelope.adapterId);
});

test("malformed refreshes degrade only inside the retained freshness window and expired evidence is withheld", async () => {
  clearCommunityEventsCache();
  const adapter = calendarAdapter(sterlingRanch);
  const request = { dateRange: { start: "2026-09-10", end: "2026-09-10", label: "tomorrow" } };
  const checkedAt = new Date("2026-09-09T12:00:00.000Z");
  await getCommunityEvents(request, { profile: sterlingRanch, adapter, now: checkedAt, fetchImpl: async () => response(EVENT_HTML) });

  const degraded = await getCommunityEvents(request, {
    profile: sterlingRanch,
    adapter,
    now: new Date("2026-09-09T13:01:00.000Z"),
    fetchImpl: async () => response(BROKEN_HTML),
  });
  assert.equal(degraded.checkedAt, checkedAt.toISOString());
  assert.equal(degraded.diagnostics.sourceOutcome, "partial");
  assert.equal(degraded.evidenceEnvelope.degradation.state, "degraded");
  assert.deepEqual(degraded.evidenceEnvelope.coverage.covered, []);

  await assert.rejects(() => getCommunityEvents(request, {
    profile: sterlingRanch,
    adapter,
    now: new Date("2026-09-09T15:01:00.000Z"),
    fetchImpl: async () => response(BROKEN_HTML),
  }), /parsed reliably/);
});

test("dynamic event evidence cannot verify an unapproved static booking claim in a mixed question", async () => {
  clearCommunityEventsCache();
  const adapter = calendarAdapter(sterlingRanch);
  let calendarCalls = 0;
  const answer = await answerCommunityQuestion("What events are tomorrow, and how do I book the clubhouse?", {
    interpretationMode: "structured",
    now: new Date("2026-09-09T12:00:00.000Z"),
    planCommunitySearch: async () => ({
      intent: "events",
      goal: "schedule",
      goals: ["schedule"],
      subject: "community events and clubhouse booking",
      scope: "community",
      requestedDetails: ["date", "action"],
      dateRange: { start: "2026-09-10", end: "2026-09-10", label: "tomorrow" },
      filters: {},
      searchQueries: ["community events tomorrow", "clubhouse booking"],
    }),
    getCommunityEvents: async (request) => {
      calendarCalls += 1;
      return getCommunityEvents(request, { profile: sterlingRanch, adapter, now: new Date("2026-09-09T12:00:00.000Z"), fetchImpl: async () => response(EVENT_HTML) });
    },
    answerRulesQuestion: async () => ({ confidence: { canAnswer: false }, sources: [] }),
    index: { communityId: "sterling-ranch", communityName: "Sterling Ranch", website: sterlingRanch.website, sources: [] },
    communityId: "sterling-ranch",
    synthesizeCommunityAnswer: false,
  });

  assert.equal(calendarCalls, 1);
  assert.notEqual(answer.answerMode, "community-live-events");
  assert.notEqual(answer.answerStatus, "verified");
  assert.equal((answer.sources || []).some((source) => String(source.id || "").startsWith("sterling-ranch:official-calendar")), false);
  assert.notEqual(answer.authorityDecision, "exact-version-approved-claims");
});

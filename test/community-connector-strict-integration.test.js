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
const eventHtmlForUrl = (url, title = "Fixture meeting") => {
  const day = new URL(url).searchParams.get("day").padStart(2, "0");
  return `<a id="eventTitle_${day}" href="/Calendar.aspx?EID=${day}"><span>${title}</span></a><span itemprop="startDate">2026-09-${day}T19:00:00</span><span itemprop="location"><span itemprop="name">Town Hall</span></span>`;
};

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

test("a mixed fresh and retained range stays degraded and keeps each day's evidence time", async () => {
  clearCommunityEventsCache();
  const adapter = calendarAdapter(sterlingRanch);
  const request = { dateRange: { start: "2026-09-14", end: "2026-09-15", label: "two days" } };
  const seededAt = new Date("2026-09-14T10:00:00.000Z");
  await getCommunityEvents(request, {
    profile: sterlingRanch,
    adapter,
    now: seededAt,
    fetchImpl: async (url) => response(eventHtmlForUrl(url)),
  });

  const refreshedAt = new Date("2026-09-14T11:01:00.000Z");
  const result = await getCommunityEvents(request, {
    profile: sterlingRanch,
    adapter,
    now: refreshedAt,
    fetchImpl: async (url) => new URL(url).searchParams.get("day") === "14"
      ? response(eventHtmlForUrl(url))
      : response("Unavailable", 503),
  });

  assert.equal(result.events.length, 2);
  assert.equal(result.checkedAt, seededAt.toISOString());
  assert.equal(result.evidenceEnvelope.freshness.checkedAt, seededAt.toISOString());
  assert.equal(result.evidenceEnvelope.freshness.staleAfter, "2026-09-14T13:00:00.000Z");
  assert.equal(result.diagnostics.sourceOutcome, "partial");
  assert.equal(result.evidenceEnvelope.degradation.state, "degraded");
  assert.deepEqual(result.evidenceEnvelope.coverage.covered, []);
  assert.deepEqual(result.diagnostics.dailyResults.map((day) => [day.date, day.sourceOutcome, day.checkedAt]), [
    ["2026-09-14", "ok", refreshedAt.toISOString()],
    ["2026-09-15", "partial", seededAt.toISOString()],
  ]);
  assert.deepEqual(result.evidenceEnvelope.evidence.slice(1).map((item) => [item.date, item.checkedAt]), [
    ["2026-09-14", refreshedAt.toISOString()],
    ["2026-09-15", seededAt.toISOString()],
  ]);
});

test("an all-retained range remains partial with no covered date facets", async () => {
  clearCommunityEventsCache();
  const adapter = calendarAdapter(sterlingRanch);
  const request = { dateRange: { start: "2026-09-14", end: "2026-09-15", label: "two days" } };
  const seededAt = new Date("2026-09-14T10:00:00.000Z");
  await getCommunityEvents(request, {
    profile: sterlingRanch,
    adapter,
    now: seededAt,
    fetchImpl: async (url) => response(eventHtmlForUrl(url)),
  });

  const result = await getCommunityEvents(request, {
    profile: sterlingRanch,
    adapter,
    now: new Date("2026-09-14T11:01:00.000Z"),
    fetchImpl: async () => response("Unavailable", 503),
  });

  assert.equal(result.events.length, 2);
  assert.equal(result.checkedAt, seededAt.toISOString());
  assert.equal(result.diagnostics.sourceOutcome, "partial");
  assert.equal(result.evidenceEnvelope.degradation.state, "degraded");
  assert.deepEqual(result.evidenceEnvelope.coverage.covered, []);
  assert.deepEqual(result.diagnostics.dailyResults.map((day) => day.degradation.state), ["degraded", "degraded"]);
});

test("a range fetch fails closed when no retained day exists or retained evidence expired", async () => {
  const adapter = calendarAdapter(sterlingRanch);
  const request = { dateRange: { start: "2026-09-14", end: "2026-09-15", label: "two days" } };
  clearCommunityEventsCache();
  await assert.rejects(() => getCommunityEvents(request, {
    profile: sterlingRanch,
    adapter,
    now: new Date("2026-09-14T10:00:00.000Z"),
    fetchImpl: async () => response("Unavailable", 503),
  }), /HTTP 503/);

  clearCommunityEventsCache();
  await getCommunityEvents(request, {
    profile: sterlingRanch,
    adapter,
    now: new Date("2026-09-14T10:00:00.000Z"),
    fetchImpl: async (url) => response(eventHtmlForUrl(url)),
  });
  await assert.rejects(() => getCommunityEvents(request, {
    profile: sterlingRanch,
    adapter,
    now: new Date("2026-09-14T13:01:00.000Z"),
    fetchImpl: async () => response("Unavailable", 503),
  }), /HTTP 503/);
});

test("healthy event and authoritative empty ranges retain full coverage", async () => {
  const adapter = calendarAdapter(sterlingRanch);
  const request = { dateRange: { start: "2026-09-14", end: "2026-09-15", label: "two days" } };
  clearCommunityEventsCache();
  const healthy = await getCommunityEvents(request, {
    profile: sterlingRanch,
    adapter,
    now: new Date("2026-09-14T10:00:00.000Z"),
    fetchImpl: async (url) => response(eventHtmlForUrl(url)),
  });
  assert.equal(healthy.diagnostics.sourceOutcome, "ok");
  assert.equal(healthy.evidenceEnvelope.degradation.state, "healthy");
  assert.deepEqual(healthy.evidenceEnvelope.coverage.covered, ["event-date", "date"]);

  clearCommunityEventsCache();
  const empty = await getCommunityEvents(request, {
    profile: sterlingRanch,
    adapter,
    now: new Date("2026-09-14T10:00:00.000Z"),
    fetchImpl: async () => response("<main>There are no events.</main>"),
  });
  assert.deepEqual(empty.events, []);
  assert.equal(empty.diagnostics.sourceOutcome, "ok");
  assert.equal(empty.evidenceEnvelope.degradation.state, "healthy");
  assert.deepEqual(empty.evidenceEnvelope.coverage.covered, ["event-date", "date"]);
});

test("multi-day aggregation still filters, sorts, deduplicates, and caps events at eight", async () => {
  clearCommunityEventsCache();
  const calls = [];
  const result = await getCommunityEvents({
    dateRange: { start: "2026-09-14", end: "2026-09-15", label: "two days" },
    filters: { category: "Yoga" },
  }, {
    profile: sterlingRanch,
    adapter: calendarAdapter(sterlingRanch),
    now: new Date("2026-09-14T10:00:00.000Z"),
    fetchImpl: async (url) => {
      const day = new URL(url).searchParams.get("day").padStart(2, "0");
      calls.push(day);
      const items = Array.from({ length: 5 }, (_, index) => {
        const id = `${day}${index}`;
        const minute = String(index).padStart(2, "0");
        return `<a id="eventTitle_${id}" href="/Calendar.aspx?EID=${id}"><span>Yoga ${id}</span></a><span itemprop="startDate">2026-09-${day}T19:${minute}:00</span><span itemprop="location"><span itemprop="name">Town Hall</span></span>`;
      });
      return response(`${items.join("")}<a id="eventTitle_${day}0" href="/Calendar.aspx?EID=${day}0"><span>Yoga ${day}0</span></a>`);
    },
  });

  assert.deepEqual(calls.sort(), ["14", "15"]);
  assert.equal(result.events.length, 8);
  assert.equal(new Set(result.events.map((event) => `${event.startDate}:${event.id}:${event.title}`)).size, 8);
  assert.deepEqual(result.events.map((event) => event.startDate), [...result.events.map((event) => event.startDate)].sort());
  assert.deepEqual(result.diagnostics.appliedFilters, [{ field: "category", value: "Yoga" }]);
});

test("calendar ranges keep the 31-day safety bound", async () => {
  clearCommunityEventsCache();
  let calls = 0;
  await assert.rejects(() => getCommunityEvents({
    dateRange: { start: "2026-09-01", end: "2026-10-02", label: "too long" },
  }, {
    profile: sterlingRanch,
    adapter: calendarAdapter(sterlingRanch),
    now: new Date("2026-09-01T10:00:00.000Z"),
    fetchImpl: async () => { calls += 1; return response("<main>There are no events.</main>"); },
  }), /limited to 31 days/);
  assert.equal(calls, 0);
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

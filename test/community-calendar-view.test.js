const test = require("node:test");
const assert = require("node:assert/strict");
const {
  upcomingCommunityEvents,
  calendarConfiguration,
} = require("../lib/community-calendar-view");
const { clearCommunityEventsCache } = require("../lib/community-events");
const sterling = require("../data/communities/sterling-ranch.json");
const castle = require("../data/communities/castle-rock.json");
const now = new Date("2026-09-29T18:00:00Z");
function html(id, title, day) {
  return `<a id="eventTitle_${id}" href="/Calendar.aspx?EID=${id}"><span>${title}</span></a><span itemprop="startDate">${day}T18:00:00</span>`;
}
function response(body) {
  return { ok: true, text: async () => body };
}
test("calendar projection uses both profiles and crosses calendar months", async () => {
  for (const profile of [sterling, castle]) {
    clearCommunityEventsCache();
    const urls = [];
    const result = await upcomingCommunityEvents(profile, {
      now,
      fetchImpl: async (url) => {
        urls.push(url.href);
        return response(
          url.searchParams.get("month") === "9"
            ? html(1, "Fixture gathering", "2026-09-30")
            : html(2, "Fixture workshop", "2026-10-02"),
        );
      },
    });
    assert.equal(result.status, "ready");
    assert.equal(result.events.length, 2);
    assert.equal(urls.length, 7);
    assert(
      urls.every(
        (url) =>
          new URL(url).hostname ===
          new URL(calendarConfiguration(profile).action.url).hostname,
      ),
    );
    assert.equal(result.evidence.length, 7);
    assert(
      result.events.every(
        (event) =>
          new URL(event.url).hostname === new URL(profile.website).hostname,
      ),
    );
  }
  assert.notEqual(
    calendarConfiguration(castle).action.url,
    calendarConfiguration(sterling).action.url,
  );
});
test("calendar removes duplicate identities and caps the broader list at seven", async () => {
  clearCommunityEventsCache();
  const entries = Array.from({ length: 8 }, (_, index) =>
    html(
      index + 10,
      `Fixture ${index}`,
      `2026-10-${String(index + 1).padStart(2, "0")}`,
    ),
  ).join("");
  const result = await upcomingCommunityEvents(castle, {
    now: new Date("2026-10-01T18:00:00Z"),
    fetchImpl: async () =>
      response(entries + html(99, "Fixture 0", "2026-10-01")),
  });
  assert.equal(result.events.length, 7);
  assert.equal(new Set(result.events.map((event) => event.title)).size, 7);
});
test("empty and unavailable calendar responses retain the configured fallback", async () => {
  for (const failing of [false, true]) {
    clearCommunityEventsCache();
    const result = await upcomingCommunityEvents(castle, {
      now,
      fetchImpl: async () => {
        if (failing) throw new Error("offline");
        return response("No upcoming events");
      },
    });
    assert.equal(result.status, failing ? "unavailable" : "empty");
    assert.deepEqual(result.events, []);
    assert.equal(result.action.url, calendarConfiguration(castle).action.url);
  }
});
test("partial days preserve only healthy evidence with a partial status", async () => {
  clearCommunityEventsCache();
  const result = await upcomingCommunityEvents(castle, {
    now,
    fetchImpl: async (url) => {
      if (url.searchParams.get("month") === "10") throw new Error("offline");
      return response(html(1, "Fixture gathering", "2026-09-30"));
    },
  });
  assert.equal(result.status, "partial");
  assert.equal(result.events.length, 1);
});
test("a calendar day that fails once is retried before the week is marked partial", async () => {
  clearCommunityEventsCache();
  let failedOnce = false;
  const result = await upcomingCommunityEvents(castle, {
    now,
    fetchImpl: async (url) => {
      if (url.searchParams.get("day") === "30" && !failedOnce) {
        failedOnce = true;
        throw new Error("brief upstream timeout");
      }
      return response(html(1, "Fixture gathering", "2026-09-30"));
    },
  });
  assert.equal(result.status, "ready");
  assert.equal(result.evidence.length, 7);
});
test("Sterling Ranch calendar accepts its official CivicRec registration links", async () => {
  clearCommunityEventsCache();
  const result = await upcomingCommunityEvents(sterling, {
    now: new Date("2026-09-13T18:00:00Z"),
    fetchImpl: async () => response(
      '<a id="eventTitle_5509" href="https://secure.rec1.com/CO/sterling-ranch-community-authority-board-co/catalog"><span>Puppy Plunge</span></a><span itemprop="startDate">2026-09-13T12:00:00</span>',
    ),
  });
  assert.equal(result.status, "ready");
  assert.equal(result.events[0].title, "Puppy Plunge");
  assert.equal(new URL(result.events[0].url).hostname, "secure.rec1.com");
});
test("missing connector uses the profile website; unapproved hosts are rejected", async () => {
  const result = await upcomingCommunityEvents(
    { ...castle, connectors: [] },
    { now },
  );
  assert.equal(result.status, "unavailable");
  assert.equal(result.action.url, castle.website);
  const unsafe = structuredClone(castle);
  unsafe.connectors.find(
    (c) => c.type === "civicplus-calendar",
  ).adapter.endpoints[0].url = "https://unapproved.example/";
  assert.throws(
    () => calendarConfiguration(unsafe),
    /allowed official HTTPS host/,
  );
});

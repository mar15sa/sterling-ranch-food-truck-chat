const assert = require("node:assert/strict");
const test = require("node:test");
const { answerCommunityQuestion } = require("../lib/community-assistant");
const { getWasteSchedule } = require("../lib/community-waste-schedule");

function secondCommunityProfile() {
  return {
    communityId: "ridgeview",
    website: "https://ridgeview.example/",
    timezone: "America/Denver",
    allowedHosts: ["ridgeview.example", "calendar.ridgeview.example", "api.schedule.example"],
    connectors: [{
      id: "collection-service",
      type: "live-waste-schedule",
      baseUrl: "https://calendar.ridgeview.example/pickup",
      refreshMinutes: 15,
      adapter: {
        capabilities: ["services"], facets: ["date", "action"], controllingSourceRoles: ["operational"], actionTypes: ["information"],
        sourceHosts: ["calendar.ridgeview.example", "api.schedule.example"],
        endpoints: [
          { id: "pickup-calendar", url: "https://calendar.ridgeview.example/pickup", purpose: "live-pickup-calendar" },
          { id: "address-suggest", url: "https://api.schedule.example/areas", purpose: "reference-location-lookup" },
          { id: "calendar", url: "https://api.schedule.example/places", purpose: "live-service-events" },
        ],
        freshness: { refreshMinutes: 15, staleAfterMinutes: 30 }, degradation: { policy: "withhold" }, labels: {}, vocabulary: { waste: ["collection"] },
        wasteSchedule: {
          recollect: { areaId: "RV-42", serviceId: 42 },
          serviceAreas: [
            { label: "North District", officialReferenceLocation: { privacy: "published-service-area-reference", query: "400 Cedar Road", candidateTextPattern: "400\\s+Cedar" } },
            { label: "South District" },
          ],
          actionLinks: [{ id: "calendar", type: "information", label: "Check your Ridgeview collection address", url: "https://calendar.ridgeview.example/pickup" }],
        },
      },
    }],
  };
}

test("live waste adapter is entirely driven by a second community profile", async () => {
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(String(url));
    if (String(url).includes("address-suggest")) return { ok: true, json: async () => [{ place_id: "A1234567-1234-1234-1234-123456789012", address: "400 Cedar Road" }] };
    return { ok: true, json: async () => ({ events: [{ day: "2026-09-15", flags: [{ name: "Recycling" }] }] }) };
  };
  const schedule = await getWasteSchedule({ profile: secondCommunityProfile(), fetchImpl, now: new Date("2026-09-14T18:00:00Z"), question: "When is recycling pickup in North District?" });
  assert.equal(schedule.serviceAreas[0].label, "North District");
  assert.equal(schedule.serviceAreas[0].date, "2026-09-15");
  assert.equal(schedule.serviceAreas[1].date, undefined);
  assert.deepEqual(schedule.evidence.claims.map((claim) => claim.text), ["2026-09-15"]);
  assert.equal(schedule.evidence.actions[0].label, "Check your Ridgeview collection address");
  assert.match(requested[0], /RV-42\/services\/42\/address-suggest/);
  assert.match(requested[0], /400\+Cedar\+Road/);
  assert.doesNotMatch(JSON.stringify(schedule), /sterling|providence|wasteconnections/i);
});

test("live waste adapter fails closed when its configured reference location cannot be proven", async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => [{ place_id: "A1234567-1234-1234-1234-123456789012", address: "Different address" }] });
  await assert.rejects(() => getWasteSchedule({ profile: secondCommunityProfile(), fetchImpl, question: "When is recycling pickup in North District?" }), /could not prove/i);
});

test("unproven named areas do not query a reference address or receive an inferred date", async () => {
  let calls = 0;
  const schedule = await getWasteSchedule({
    profile: secondCommunityProfile(),
    fetchImpl: async () => { calls += 1; throw new Error("must not fetch"); },
    question: "When is recycling pickup in South District?",
  });
  assert.equal(calls, 0);
  assert.equal(schedule.date, "");
  assert.deepEqual(schedule.serviceAreas, [{ label: "North District" }, { label: "South District" }]);
  assert.deepEqual(schedule.evidence.claims, []);
  assert.equal(schedule.evidence.degradation.state, "unavailable");
});

test("waste answers retain a proven date while using only configured actions and no fixed cart instruction", async () => {
  const profile = secondCommunityProfile();
  const checkedAt = new Date().toISOString();
  const answer = await answerCommunityQuestion("When is recycling pickup?", {
    communityProfile: profile,
    getWasteSchedule: async () => ({
      service: "recycling", date: "2026-09-15", timing: "starting tomorrow", anchorDate: "2026-09-15", serviceAreas: [{ label: "North District", date: "2026-09-17" }], holidayNote: "Unclaimed holiday text", checkedAt,
      evidence: {
        degradation: { state: "healthy" }, coverage: { requested: ["date"], covered: ["date"] },
        claims: [{ facet: "date", text: "2026-09-15", controllingEvidenceId: "ridgeview:collection-service:live-calendar", controllingSourceRole: "operational" }],
        evidence: [{ evidenceId: "ridgeview:collection-service:live-calendar", sourceUrl: "https://calendar.ridgeview.example/pickup", checkedAt, staleAfter: new Date(Date.now() + 60_000).toISOString(), controllingSourceRole: "operational" }],
        actions: [{ type: "information", label: "Check your Ridgeview collection address", url: "https://calendar.ridgeview.example/pickup" }],
      },
    }),
    planCommunitySearch: false,
    synthesizeCommunityAnswer: false,
  });
  assert.equal(answer.answerStatus, "verified");
  assert.match(answer.answer, /September 15/);
  assert.doesNotMatch(answer.answer, /September 17|Unclaimed holiday/i);
  assert.doesNotMatch(answer.answer, /7\s*a\.m\.|place your bins|cart/i);
  assert.equal(answer.actions[0].label, "Check your Ridgeview collection address");
});

test("a named service area fails closed when only the reference date is claimed", async () => {
  const profile = secondCommunityProfile();
  const checkedAt = new Date().toISOString();
  const answer = await answerCommunityQuestion("When is recycling pickup in North District?", {
    communityProfile: profile,
    getWasteSchedule: async () => ({
      service: "recycling", date: "2026-09-15", timing: "starting tomorrow", anchorDate: "2026-09-15", serviceAreas: [{ label: "North District", date: "2026-09-17" }],
      evidence: {
        degradation: { state: "healthy" }, coverage: { requested: ["date"], covered: ["date"] },
        claims: [{ facet: "date", text: "2026-09-15", controllingEvidenceId: "ridgeview:collection-service:live-calendar", controllingSourceRole: "operational" }],
        evidence: [{ evidenceId: "ridgeview:collection-service:live-calendar", sourceUrl: "https://calendar.ridgeview.example/pickup", checkedAt, staleAfter: new Date(Date.now() + 60_000).toISOString(), controllingSourceRole: "operational" }],
        actions: [{ type: "information", label: "Check your Ridgeview collection address", url: "https://calendar.ridgeview.example/pickup" }],
      },
    }),
    planCommunitySearch: false,
    synthesizeCommunityAnswer: false,
  });
  assert.equal(answer.answerStatus, "source-unavailable");
  assert.match(answer.answer, /could not verify.*North District/i);
  assert.doesNotMatch(answer.answer, /September 15|September 17/);
  assert.equal(answer.actions[0].label, "Check your Ridgeview collection address");
});

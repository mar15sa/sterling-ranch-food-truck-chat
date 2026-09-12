const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { eventsAnswer, genericEvidenceBoundary, poolStatusAnswer } = require("../lib/community-assistant");
const { composePlainEnglishFallback } = require("../lib/rules-llm");

const root = path.join(__dirname, "..");

test("generic missing-evidence copy is plain and does not change the evidence boundary", () => {
  const answer = genericEvidenceBoundary(
    "Can I build something unusual?",
    { answerMode: "source-evidence-boundary", confidence: { canAnswer: false, reason: "no-single-source-support" }, sources: [], actions: [], claims: [] },
    {},
    {},
  );
  assert.equal(answer.directAnswer, "I couldn’t find a current official answer for that.");
  assert.equal(answer.confidence.canAnswer, false);
  assert.deepEqual(answer.sources, []);
  assert.deepEqual(answer.actions, []);
  assert.doesNotMatch(answer.answer, /connected official|approved, up-to-date|requested detail/i);
});

test("live events keep connector facts while using natural dates and times", () => {
  const answer = eventsAnswer({
    events: [{ id: "one", title: "Neighbor Night", date: "2026-09-11", time: "09:00", location: "Great Hall", url: "https://ridgeview.example/events/one" }],
    range: { start: "2026-09-11", end: "2026-09-11", label: "today" },
    sourceUrl: "https://ridgeview.example/calendar",
    checkedAt: "2026-09-11T12:00:00Z",
    diagnostics: { parserHealthy: true, sourceOutcome: "ok", appliedFilters: [] },
  }, ["date", "examples"]);
  assert.equal(answer.directAnswer, "The official calendar has 1 event today.");
  assert.equal(answer.keyDetails[0], "Neighbor Night is today at 9 a.m. in Great Hall.");
  assert.doesNotMatch(`${answer.directAnswer} ${answer.keyDetails.join(" ")}`, /2026-09-11|9:00 AM|\bI found \d/i);
});

test("live pool presentation hides the internal color label but keeps live authority", () => {
  const answer = poolStatusAnswer({
    headline: "Closed",
    summary: "The official CAB status is Red Light: the pool is closed with no access for homeowners or guests.",
    sourceUrl: "https://ridgeview.example/pool",
    checkedAt: "2026-09-11T12:00:00Z",
    stale: false,
    evidenceEnvelope: {
      communityId: "ridgeview",
      connectorFamily: "live-status",
      degradation: { state: "healthy" },
      coverage: { covered: ["status"] },
      evidence: [{ evidenceId: "ridgeview:pool", communityId: "ridgeview", staleAfter: "2026-09-11T12:10:00Z", controllingSourceRole: "operational" }],
      claims: [{ facet: "status", text: "Closed", controllingEvidenceId: "ridgeview:pool" }],
    },
  }, ["status"], { communityId: "ridgeview", now: "2026-09-11T12:05:00Z" });
  assert.equal(answer.directAnswer, "The pool is closed with no access for homeowners or guests.");
  assert.equal(answer.answerStatus, "verified");
  assert.doesNotMatch(answer.answer, /Red Light|official CAB status/i);
});

test("rules fallback translates policy verbs while preserving every supplied fact", () => {
  const answer = composePlainEnglishFallback(
    "Install and energize seasonal decorative lighting during the following approved seasonal lighting periods: From June 18 to July 7 and from October 1 through January 31.\n\nAll holiday lighting must be turned off by 10:00 p.m."
  );
  assert.match(answer, /^You can put up and turn on seasonal decorative lights/i);
  for (const value of ["June 18", "July 7", "October 1", "January 31", "10:00 p.m."]) assert.match(answer, new RegExp(value.replace(".", "\\."), "i"));
  assert.doesNotMatch(answer, /install and energize/i);
});

test("rules fallback removes section-writing from source-provided finish details", () => {
  const answer = composePlainEnglishFallback(
    "The approved stain color on the gate is Sherwin Williams #3002 \"Belvedere Tan,\" which matches Style 3 Fencing described in subsection (c) of this section.\n\n" +
    "The color selected for concrete fencing is Solomon #338 \"Earthen.\" (2) If a fence section is less than eight feet wide, the installer will need to cut to the appropriate length in the field."
  );
  assert.match(answer, /For the gate, the approved stain color is Sherwin Williams #3002 "Belvedere Tan"\. It matches Style 3 Fencing\./);
  assert.match(answer, /Concrete fencing uses Solomon #338 "Earthen"\./);
  assert.match(answer, /less than eight feet wide/i);
  assert.doesNotMatch(answer, /subsection|appropriate length in the field/i);
});

test("the interface uses quiet trust cues and neighbor-friendly action labels", () => {
  const script = fs.readFileSync(path.join(root, "public", "rules-assistant.js"), "utf8");
  for (const label of ["From current official sources", "Not confirmed", "Official links", "What you can do"]) assert.match(script, new RegExp(label));
  assert.doesNotMatch(script, /Could not verify — next step included|Helpful links|Verified answer/);
});

test("both grounded writers carry the shared neighbor voice without supplying routing facts", () => {
  const communityWriter = fs.readFileSync(path.join(root, "lib", "community-llm.js"), "utf8");
  const rulesWriter = fs.readFileSync(path.join(root, "lib", "rules-llm.js"), "utf8");
  const assistant = fs.readFileSync(path.join(root, "lib", "community-assistant.js"), "utf8");
  assert.match(communityWriter, /helpful neighbor who already read the official information/i);
  assert.match(rulesWriter, /helpful neighbor who already read the rulebook/i);
  assert.match(communityWriter, /Do not use outside knowledge/i);
  assert.match(rulesWriter, /cited rule sections are the source of truth/i);
  assert.doesNotMatch(assistant, /directAnswer:\s*[`"'][^\n]*(?:connected official|approved, up-to-date|I found \$\{?details\.length)/i);
});

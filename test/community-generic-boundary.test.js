const assert = require("node:assert/strict");
const test = require("node:test");

const { eventFailureActions, genericEvidenceBoundary } = require("../lib/community-assistant");

const profile = {
  communityId: "ridgeview",
  name: "Ridgeview",
  website: "https://ridgeview.example/",
  connectors: [{
    type: "civicplus-calendar",
    baseUrl: "https://ridgeview.example/calendar",
    adapter: { endpoints: [{ id: "primary", url: "https://ridgeview.example/calendar" }], labels: { openAction: "Open Ridgeview calendar" } },
  }],
};

test("unsupported static topics use one generic boundary with no resident facts or fixed URLs", () => {
  for (const question of [
    "Can I remove a tree?", "What are the quiet hours?", "Can I paint my mailbox?",
    "What is the Instagram account?", "Can I build a helipad?", "What is the HOA phone number?",
  ]) {
    const answer = genericEvidenceBoundary(question, {}, { communityName: "Ridgeview", website: profile.website }, profile);
    assert.equal(answer.answerMode, "source-evidence-boundary");
    assert.match(answer.answer, /couldn['’]t find a current official answer/i);
    assert.doesNotMatch(answer.answer, /connected official|approved, up-to-date|requested detail/i);
    assert.doesNotMatch(answer.answer, /tree|quiet|mailbox|instagram|helipad|hoa|sterling/i);
    assert.deepEqual(answer.actions.map((action) => action.url), [profile.website]);
  }
});

test("a current selected source can be used for the boundary, while stale and unrelated sources cannot supply facts", () => {
  const current = { title: "Ridgeview contact page", sourceUrl: "https://ridgeview.example/contact", lifecycle: "current", isOfficialResource: true, canonicalScopedProjection: true };
  const stale = { title: "Old directory", sourceUrl: "https://old.example/contact", lifecycle: "stale" };
  const answer = genericEvidenceBoundary("What is the HOA phone number?", {}, { website: profile.website }, profile, [stale, current]);
  assert.equal(answer.sources[0].sourceUrl, current.sourceUrl);
  assert.doesNotMatch(answer.answer, /Old directory|phone number/i);
});

test("an arbitrary external HTTPS candidate cannot replace the active official resource", () => {
  const external = { title: "Search result", sourceUrl: "https://outside.example/contact", lifecycle: "current", isOfficialResource: true, canonicalScopedProjection: true };
  const answer = genericEvidenceBoundary("What is the HOA phone number?", {}, { website: profile.website }, profile, [external]);
  assert.equal(answer.sources[0].sourceUrl, profile.website);
  assert.equal(answer.actions[0].url, profile.website);
});

test("full-page review status alone cannot make a source an answerable boundary projection", () => {
  const pageOnly = { title: "Reviewed page", sourceUrl: "https://ridgeview.example/contact", lifecycle: "current", isOfficialResource: true, reviewStatus: "approved" };
  const answer = genericEvidenceBoundary("What is the HOA phone number?", {}, { website: profile.website }, profile, [pageOnly]);
  assert.equal(answer.sources[0].sourceUrl, profile.website);
  assert.equal(answer.actions[0].url, profile.website);
});

test("an explicit no-source evidence boundary cannot be decorated by the community fallback", () => {
  const rulesBoundary = {
    answer: "I could not verify this from approved evidence.",
    answerMode: "source-evidence-boundary",
    confidence: { canAnswer: false, reason: "no-single-source-support" },
    sources: [],
    actions: [],
    claims: [],
  };
  const answer = genericEvidenceBoundary(
    "What service is this?",
    rulesBoundary,
    { communityName: "Ridgeview", website: profile.website },
    profile,
  );
  assert.equal(answer.answerMode, "source-evidence-boundary");
  assert.deepEqual(answer.sources, []);
  assert.deepEqual(answer.actions, []);
  assert.equal(answer.confidence.reason, "no-single-source-support");
});

test("a second community does not hand off a withheld answer to a merely related page", () => {
  const unrelated = {
    title: "Ridgeview landscape screens",
    sourceUrl: "https://ridgeview.example/landscape-screens",
    lifecycle: "current",
    isOfficialResource: true,
    canonicalScopedProjection: true,
    text: "Landscape screen standards and DRC submission details.",
  };
  for (const question of ["What are the quiet hours?", "Can I build a helipad in my yard?"]) {
    const answer = genericEvidenceBoundary(question, {}, { website: profile.website }, profile, [unrelated]);
    assert.equal(answer.sources[0].sourceUrl, profile.website, question);
    assert.equal(answer.actions[0].url, profile.website, question);
    assert.doesNotMatch(answer.sources[0].title, /landscape/i, question);
  }
});

test("event connector failures use the active community calendar configuration", () => {
  const actions = eventFailureActions({ communityProfile: profile });
  assert.deepEqual(actions, [{ label: "Open Ridgeview calendar", url: "https://ridgeview.example/calendar", actionType: "calendar" }]);
  assert.doesNotMatch(actions[0].url, /sterling/i);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const { answerCommunityQuestion } = require("../lib/community-assistant");
const { runNeedFirstShadow } = require("../lib/community-need-router");
const { buildResidentRequestContract } = require("../lib/community-request-contract");

function supportedAnswer({ id, title, claim, action }) {
  return {
    answerStatus: "verified",
    answer: claim,
    directAnswer: claim,
    keyDetails: [],
    sources: [{ id, title, text: claim }],
    claims: [{ text: claim, evidenceSourceIds: [id], verified: true }],
    actions: action ? [{ ...action }] : [],
    conflicts: [],
  };
}

test("need-first shadow routing answers and proves each part independently", async () => {
  const contract = buildResidentRequestContract("Which food truck is here today, and what is on its menu?", {
    goals: ["schedule", "information"], subject: "food truck and menu",
  });
  const seen = [];
  const result = await runNeedFirstShadow(contract, async (need) => {
    seen.push(need.id);
    return need.id === "need-1"
      ? supportedAnswer({ id: "schedule", title: "Official food-truck calendar", claim: "On Monday, the food truck is Ecos de Mexico." })
      : supportedAnswer({ id: "menu", title: "Ecos de Mexico menu", claim: "The menu lists tacos and quesadillas." });
  });
  assert.deepEqual(seen, ["need-1", "need-2"]);
  assert.equal(result.completion.outcome, "complete");
  assert.equal(result.answerStatus, "verified");
  assert.deepEqual(result.completion.needs.map((need) => need.status), ["supported", "supported"]);
  assert.deepEqual(result.sources.map((source) => source.retrievedForNeedIds), [["need-1"], ["need-2"]]);
  assert.match(result.answer, /Ecos de Mexico/);
  assert.match(result.answer, /tacos and quesadillas/);
});

test("a supported part survives while wrong-subject evidence and its action are rejected", async () => {
  const contract = buildResidentRequestContract("Which food truck is here today, and what is on its menu?", {
    goals: ["schedule", "information"], subject: "food truck and menu",
  });
  const result = await runNeedFirstShadow(contract, async (need) => need.id === "need-1"
    ? supportedAnswer({ id: "schedule", title: "Official food-truck calendar", claim: "On Monday, the food truck is Ecos de Mexico." })
    : supportedAnswer({
      id: "billing", title: "Water Billing & Payment Options", claim: "Pay the water bill online.",
      action: { label: "Open water billing", url: "https://example.com/water" },
    }));
  assert.equal(result.completion.outcome, "verified-partial");
  assert.deepEqual(result.completion.needs.map((need) => need.status), ["supported", "missing-evidence"]);
  assert.match(result.answer, /Ecos de Mexico/);
  assert.match(result.answer, /couldn’t verify this part yet.*menu/i);
  assert.doesNotMatch(result.answer, /water bill/i);
  assert.deepEqual(result.actions, []);
  assert.deepEqual(result.sources.map((source) => source.id), ["schedule"]);
});

test("a relevant official action can help with an unresolved need without pretending to answer it", async () => {
  const contract = buildResidentRequestContract("Which food truck is here today, and what is on its menu?", {
    goals: ["schedule", "information"], subject: "food truck and menu",
  });
  const result = await runNeedFirstShadow(contract, async (need) => need.id === "need-1"
    ? supportedAnswer({ id: "schedule", title: "Official food-truck calendar", claim: "On Monday, the food truck is Ecos de Mexico." })
    : {
      answerStatus: "could-not-verify", directAnswer: "I could not verify the current menu.", keyDetails: [],
      sources: [{ id: "menu-page", title: "Official food truck menu", text: "" }], claims: [], conflicts: [],
      actions: [{ label: "Open the official food truck menu", url: "https://example.com/menu", sourceId: "menu-page" }],
    });
  assert.equal(result.completion.outcome, "verified-partial");
  assert.deepEqual(result.actions.map((action) => action.label), ["Open the official food truck menu"]);
  assert.match(result.answer, /Next step: Open the official food truck menu/);
  assert.equal(result.completion.needs[1].status, "missing-evidence");
});

test("a per-need failure cannot erase a separately supported answer", async () => {
  const contract = buildResidentRequestContract("Is the pool open right now, and what are the regular hours?", {
    goals: ["status", "hours"], subject: "pool",
  });
  const result = await runNeedFirstShadow(contract, async (need) => {
    if (need.id === "need-2") throw new Error("hours connector unavailable");
    return supportedAnswer({ id: "pool-live", title: "Live pool status", claim: "The pool is open right now." });
  });
  assert.equal(result.completion.outcome, "verified-partial");
  assert.equal(result.completion.needs[0].status, "supported");
  assert.equal(result.completion.needs[1].status, "missing-evidence");
  assert.match(result.answer, /pool is open/i);
  assert.match(result.answer, /regular hours/i);
});

test("recycling schedule and bin-placement rules keep separate evidence", async () => {
  const contract = buildResidentRequestContract("What's the next recycling pickup for Ascent Village, and where can I keep my bins?", {
    goals: ["schedule", "information"], subject: "recycling pickup and bin storage",
  });
  const result = await runNeedFirstShadow(contract, async (need) => need.id === "need-1"
    ? supportedAnswer({ id: "live-recycling", title: "Live Ascent Village recycling schedule", claim: "The next Ascent Village recycling pickup is Tuesday, September 15, 2026." })
    : supportedAnswer({ id: "bin-rule", title: "Trash and recycling container rule", claim: "Bins must be kept in a screened storage location." }));
  assert.equal(result.completion.outcome, "complete");
  assert.deepEqual(result.sources.map((source) => source.retrievedForNeedIds), [["need-1"], ["need-2"]]);
  assert.match(result.answer, /Tuesday, September 15/);
  assert.match(result.answer, /screened storage location/);
});

test("a lighting follow-up uses the resident-authored subject and governing rule", async () => {
  const contract = buildResidentRequestContract(
    "Regarding “What is the process to get permanent lights approved for seasonal use”: Can those stay up all year?",
    { subject: "permanent exterior lights" },
    {
      originalQuestion: "Can those stay up all year?",
      resolvedQuestion: "Regarding “What is the process to get permanent lights approved for seasonal use”: Can those stay up all year?",
      usedPriorContext: true,
    }
  );
  const result = await runNeedFirstShadow(contract, async () => supportedAnswer({
    id: "lighting-rule", title: "Updated exterior lighting policy",
    claim: "Permanent seasonal lights may remain installed, but illumination is allowed only during the approved seasonal period.",
  }));
  assert.equal(contract.needs[0].evidenceKind, "governing-rule");
  assert.equal(result.completion.outcome, "complete");
  assert.match(result.answer, /approved seasonal period/i);
});

test("an evidence claim that was not actually rendered cannot earn support", async () => {
  const contract = buildResidentRequestContract("What does the permit cost?", { goal: "cost", subject: "permit" });
  const result = await runNeedFirstShadow(contract, async () => ({
    answerStatus: "verified",
    answer: "Check the application for current details.",
    directAnswer: "Check the application for current details.",
    keyDetails: [],
    sources: [{ id: "fee", title: "Permit fee", text: "The permit costs $25." }],
    claims: [{ text: "The permit costs $25.", evidenceSourceIds: ["fee"], verified: true }],
    actions: [], conflicts: [],
  }));
  assert.equal(result.completion.outcome, "missing-evidence");
  assert.equal(result.completion.needs[0].status, "missing-evidence");
  assert.doesNotMatch(result.answer, /\$25/);
});

test("an ambiguous request asks for context without running retrieval", async () => {
  const contract = buildResidentRequestContract("How much does it cost?", { goal: "cost" });
  let calls = 0;
  const result = await runNeedFirstShadow(contract, async () => { calls += 1; return {}; });
  assert.equal(calls, 0);
  assert.equal(result.completion.outcome, "ambiguous");
  assert.match(result.answer, /one more detail/i);
});

test("the router enforces a bounded number of needs", async () => {
  const contract = buildResidentRequestContract("What is one, and what is two, and what is three, and what is four, and what is five?", {
    goals: ["information", "information", "information", "information", "information"],
  });
  await assert.rejects(() => runNeedFirstShadow(contract, async () => ({})), /need limit exceeded/i);
});

test("assistant integration is test-only and leaves the current answer untouched", async () => {
  const question = "Which food truck is here today, and what is on its menu?";
  const baseOptions = {
    planCommunitySearch: false,
    index: { communityId: "alpha", sources: [] },
    communityId: "alpha",
    communityProfile: { communityId: "alpha", name: "Alpha", website: "https://alpha.gov/", connectors: [] },
    answerRulesQuestion: async () => ({
      answer: "I could not verify that yet.", directAnswer: "I could not verify that yet.",
      answerStatus: "could-not-verify", answerVerdict: "unverified", answerMode: "source-evidence-boundary",
      confidence: { canAnswer: false, confidence: "low", reason: "no-exact-official-evidence" },
      sources: [], actions: [], claims: [],
    }),
  };
  const answerResidentNeed = async (need) => need.id === "need-1"
    ? supportedAnswer({ id: "schedule", title: "Official food-truck calendar", claim: "On Monday, the food truck is Ecos de Mexico." })
    : supportedAnswer({ id: "menu", title: "Ecos de Mexico menu", claim: "The menu lists tacos." });
  await assert.rejects(() => answerCommunityQuestion(question, {
    ...baseOptions, requestContractMode: "shadow-route", answerResidentNeed,
  }), /test-only/i);
  const baseline = await answerCommunityQuestion(question, baseOptions);
  const result = await answerCommunityQuestion(question, {
    ...baseOptions, isTest: true, requestContractMode: "shadow-route", answerResidentNeed,
  });
  assert.equal(result.answer, baseline.answer);
  assert.equal(result.answerStatus, baseline.answerStatus);
  assert.equal(result._requestContract.shadowRoute.completion.outcome, "complete");
  assert.match(result._requestContract.shadowRoute.answer, /menu lists tacos/i);
});

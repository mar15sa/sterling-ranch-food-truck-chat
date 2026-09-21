const test = require("node:test");
const assert = require("node:assert/strict");
const { plainLanguageSourceText, residentVoiceIssues } = require("../lib/resident-answer-voice");
const { canonicalWritingText, displayedVoiceIssues, withoutUnnecessaryHandoff, writingMeaningIssues } = require("../lib/resident-writing-contract");
const { residentWriterConfiguration } = require("../lib/community-answer-flow");
const { rewriteNeedFirstCandidate } = require("../lib/community-need-llm");
const { buildResidentRequestContract, assessResidentNeeds } = require("../lib/community-request-contract");
const { synthesizeCommunityAnswer } = require("../lib/community-llm");

const raw = [
  "Permitted 30 days prior to a holiday and must be removed within 30 days after the holiday.",
  "Holiday and seasonally appropriate.",
  "Turned off between the hours of 10:00 p.m. and 8:00 a.m. for any noise or sound effects, such as music, generators, inflation systems, or similar items.",
  "At the sole discretion of the CAB, removal dates of holiday displays may be extended due to extreme weather conditions or other factors.",
].join("\n\n");

test("the reported rulebook answer fails voice checks in every displayed field", () => {
  assert.ok(residentVoiceIssues(raw).includes("sentence-fragment"));
  assert.ok(residentVoiceIssues(raw).includes("formal-rulebook-language"));
  for (const field of ["answer", "directAnswer", "nextStep", "keyDetails"]) {
    assert.ok(displayedVoiceIssues({ [field]: field === "keyDetails" ? [raw] : raw }).length);
  }
  assert.deepEqual(residentVoiceIssues("You can put up decorations 30 days before the holiday. Turn off any sound effects at 10 p.m."), []);
});

test("provider-off cleanup uses source values and grammar across changed rules", () => {
  for (const days of [14, 30, 45]) {
    const input = raw.replaceAll("30 days", `${days} days`).replace("CAB", "review board");
    const cleaned = plainLanguageSourceText(input);
    assert.match(cleaned, new RegExp(`${days} days before a holiday`));
    assert.match(cleaned, new RegExp(`within ${days} days after`));
    assert.match(cleaned, /Turn off any noise or sound effects/);
    assert.match(cleaned, /review board decides whether/);
    assert.deepEqual(residentVoiceIssues(cleaned), []);
    assert.doesNotMatch(cleaned, /\.\./);
  }
});

test("unnecessary handoffs disappear only from complete informational answers", () => {
  const handoff = "Open the official source for the complete wording.";
  const answer = { answer: `The display window is 30 days.\n\n${handoff}`, nextStep: handoff, claims: [], completion: { outcome: "complete" } };
  const informational = { needs: [{ task: "information", requestedDetails: ["information"] }] };
  const cleaned = withoutUnnecessaryHandoff(answer, informational, { outcome: "complete" });
  assert.equal(cleaned.nextStep, "");
  assert.equal(cleaned.answer, "The display window is 30 days.");
  assert.equal(withoutUnnecessaryHandoff(answer, informational, { outcome: "verified-partial" }), answer);
  assert.equal(withoutUnnecessaryHandoff(answer, { needs: [{ task: "action" }] }, { outcome: "complete" }), answer);
  assert.ok(displayedVoiceIssues(answer).includes("unnecessary-source-handoff"));
});

test("the deployed audited flow honors writer configuration without enabling other experimental flows", () => {
  const env = { ANTHROPIC_API_KEY: "fixture-key", RULES_LLM_MODE: "selective" };
  assert.equal(residentWriterConfiguration("audited-legacy-candidate", env).enabled, true);
  assert.equal(residentWriterConfiguration("need-first-ai-candidate", env).enabled, true);
  assert.equal(residentWriterConfiguration("need-first-candidate", env).enabled, false);
  assert.equal(residentWriterConfiguration("legacy", env).enabled, false);
  assert.equal(residentWriterConfiguration("audited-legacy-candidate", { ...env, RULES_LLM_MODE: "off" }).enabled, false);
  assert.equal(residentWriterConfiguration("audited-legacy-candidate", { RULES_LLM_MODE: "all" }).enabled, false);
});

test("equivalent clock formatting passes while changed values and relative windows fail", () => {
  const original = "You can put up displays 14 days before an event. Remove them within 21 days after it. Turn off sound effects between 10:00 p.m. and 8:00 a.m.";
  const sources = [{ id: "rule", text: original }];
  const equivalent = original.replace("10:00 p.m.", "10 p.m.").replace("8:00 a.m.", "8 a.m.");
  assert.equal(canonicalWritingText("10 p.m."), canonicalWritingText("10:00 PM"));
  assert.deepEqual(writingMeaningIssues(equivalent, original, sources, "When can I display decorations?"), []);
  for (const changed of [
    equivalent.replace("14 days before", "14 days after"),
    equivalent.replace("21 days after", "14 days after"),
    equivalent.replace("10 p.m.", "9 p.m."),
    equivalent.replace("Turn off", "Turn on"),
    equivalent.replace("between 10 p.m. and 8 a.m.", "between 8 a.m. and 10 p.m."),
    equivalent.replace("within 21 days", "at least 21 days"),
  ]) assert.ok(writingMeaningIssues(changed, original, sources, "When can I display decorations?").length, changed);
});

test("exception and prohibition protections survive a friendly rewrite", () => {
  for (const [original, changed] of [
    ["Displays are prohibited except during a permitted event.", "Displays are allowed during a permitted event."],
    ["You can use the room only if approval is granted.", "You can use the room. Approval is optional."],
    ["Vinyl fences are not allowed.", "Vinyl fences are allowed."],
    ["The review board decides whether deadlines can be extended.", "The review board will extend deadlines."],
  ]) assert.ok(writingMeaningIssues(changed, original, [{ id: "rule", text: original }], "What are the rules?").length, changed);
});

function writerFixture() {
  const question = "What are the holiday display rules?";
  const contract = buildResidentRequestContract(question);
  const directAnswer = "Holiday displays are allowed 30 days before a holiday and must be removed within 30 days after the holiday.";
  const keyDetails = ["Turn off any noise or sound effects between 10:00 p.m. and 8:00 a.m."];
  const answer = [directAnswer, ...keyDetails].join("\n\n");
  const base = { answerMode: "source-derived-structured", answerStatus: "verified", directAnswer, keyDetails, nextStep: "", answer,
    sources: [{ id: "rule", title: "Display rules", text: `${answer}\nUnselected fact: deposits cost $99.` }],
    claims: [directAnswer, ...keyDetails].map(text => ({ text, verified: true, evidenceSourceIds: ["rule"] })), actions: [], conflicts: [] };
  return { question, contract, candidate: { ...base, completion: { outcome: "complete", needs: assessResidentNeeds(contract, base).needs } } };
}

test("final writer accepts natural prose with equivalent times and sees only proved claims", async () => {
  const fixture = writerFixture();
  const result = await rewriteNeedFirstCandidate(fixture, { synthesize: async (question, sources, options) => {
    assert.doesNotMatch(sources[0].text, /\$99|Unselected/);
    assert.equal(options.writingContract.completion, "complete");
    return { directAnswer: "You can put up holiday displays 30 days before a holiday. Take them down within 30 days after the holiday.",
      keyDetails: ["Turn off any noise or sound effects between 10 p.m. and 8 a.m."], nextStep: "" };
  } });
  assert.ok(result);
  assert.match(result.answer, /^You can put up/);
  assert.match(result.answer, /10 p\.m\./);
  assert.equal(result.answer, [result.directAnswer, ...result.keyDetails].join("\n\n"));
  assert.deepEqual(result.sources, fixture.candidate.sources);
  assert.ok(result.claims.every(claim => claim.verified && claim.evidenceSourceIds.includes("rule")));
});

test("writer rejects copied fragments, extra facts and lost coverage", async () => {
  for (const draft of [
    { directAnswer: "Permitted 30 days prior to a holiday.", keyDetails: [], nextStep: "" },
    { directAnswer: "Holiday displays are allowed 30 days before a holiday and deposits cost $99.", keyDetails: [], nextStep: "" },
    { directAnswer: "Holiday displays are allowed 30 days before a holiday and must be removed within 30 days after the holiday.", keyDetails: [], nextStep: "" },
  ]) assert.equal(await rewriteNeedFirstCandidate(writerFixture(), { synthesize: async () => draft }), null);
});

test("incomplete and missing evidence never invokes the writer", async () => {
  for (const outcome of ["verified-partial", "missing-evidence", "conflict", "ambiguous"]) {
    const fixture = writerFixture();
    fixture.candidate.completion.outcome = outcome;
    let called = false;
    assert.equal(await rewriteNeedFirstCandidate(fixture, { synthesize: async () => { called = true; } }), null);
    assert.equal(called, false);
  }
});

test("writer cache follows evidence and writing contract, and provider failures return no draft", async () => {
  let calls = 0;
  const fetchImpl = async (_, request) => {
    calls++;
    assert.match(JSON.parse(request.body).messages[0].content, /final writing pass/);
    return { ok: true, json: async () => ({ content: [{ type: "text", text: JSON.stringify({ directAnswer: "The room opens at 9 a.m.", keyDetails: [], nextStep: "" }) }] }) };
  };
  const sources = [{ id: "hours", title: "Room hours", text: "The room opens at 9:00 AM." }];
  const options = { apiKey: "fixture-key", model: "cache-fixture", fetchImpl, writingContract: { version: "v1" } };
  assert.ok(await synthesizeCommunityAnswer("When does the room open?", sources, options));
  assert.ok(await synthesizeCommunityAnswer("When does the room open?", sources, options));
  assert.equal(calls, 1);
  await synthesizeCommunityAnswer("When does the room open?", sources, { ...options, writingContract: { version: "v2" } });
  await synthesizeCommunityAnswer("When does the room open?", [{ ...sources[0], text: "The room opens at 8:00 AM." }], options);
  assert.equal(calls, 3);
  assert.equal(await synthesizeCommunityAnswer("provider unavailable", sources, { ...options, fetchImpl: async () => { throw new Error("offline"); } }), null);
  assert.equal(await synthesizeCommunityAnswer("provider throttled", sources, { ...options, fetchImpl: async () => ({ ok: false, status: 429 }) }), null);
});

test("the real audited path writes the preserved baseline once and keeps a readable fallback on failure", async () => {
  const { answerCommunityQuestion } = require("../lib/community-assistant");
  const { answerRulesQuestion } = require("../lib/rules-assistant");
  const options = { isTest: true, now: new Date("2026-09-18T18:00:00Z"),
    requestContractMode: "need-audited-candidate", needRouterBackend: "current-local", needFirstResidentRelease: true,
    planCommunitySearch: false, synthesizeCommunityAnswer: false, answerRulesQuestion,
    rulesOptions: { llmMode: "off", searchMode: "legacy" },
    index: require("../data/community-index.json"), communityId: "sterling-ranch",
    communityProfile: require("../data/communities/sterling-ranch.json") };
  for (const failure of [false, true]) {
    let calls = 0;
    const result = await answerCommunityQuestion("When can I decorate for Halloween?", { ...options,
      rewriteNeedFirstAnswer: async payload => {
        calls++;
        assert.equal(payload.candidate.completion.outcome, "complete");
        assert.equal(payload.candidate.completion.needs[0].status, "supported");
        assert.match(payload.candidate.answer, /CAB decides whether/);
        assert.equal(payload.candidate.nextStep, "");
        if (failure) throw new Error("provider unavailable");
        return rewriteNeedFirstCandidate(payload, { synthesize: async () => ({
          directAnswer: "You can put up holiday displays 30 days before a holiday. Take them down within 30 days after the holiday.",
          keyDetails: ["Keep displays appropriate for the holiday and season.",
            "Turn off any noise or sound effects, including music, generators, inflation systems, or similar items, between 10 p.m. and 8 a.m.",
            "The CAB can extend removal dates for holiday displays because of extreme weather conditions or other factors."], nextStep: "" }),
          onDiagnostic: payload.onDiagnostic,
        });
      },
    });
    assert.equal(calls, 1);
    assert.equal(result._requestContract.candidate.baselinePreserved, true);
    assert.equal(result._requestContract.assessment.outcome, "complete");
    assert.equal(result.residentWriting.accepted, !failure, JSON.stringify(result._requestContract.candidate.writerDiagnostics));
    assert.equal(result.nextStep, "");
    assert.deepEqual(result.residentWriting.voiceIssues, []);
    assert.match(result.answer, /30 days before/);
    assert.match(result.answer, /30 days after/);
    assert.match(result.answer, /10(?::00)? p\.m\..*8(?::00)? a\.m\./s);
  }
});

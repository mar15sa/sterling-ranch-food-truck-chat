const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizePlannedContract,
  planResidentNeedContract,
  rewriteNeedFirstCandidate,
} = require("../lib/community-need-llm");
const { assessResidentNeeds, buildResidentRequestContract } = require("../lib/community-request-contract");

function providerResponse(input, usage = { input_tokens: 120, output_tokens: 80 }) {
  return {
    ok: true,
    json: async () => ({
      usage,
      content: [{ type: "tool_use", name: "plan_resident_needs", input }],
    }),
  };
}

function plannedNeed(overrides = {}) {
  return {
    quotedText: "Is the splash pad still running, and when does it close each day?",
    request: "Is the splash pad operating now?",
    routeRequest: "splash pad current operating status",
    goal: "status",
    requestedDetails: ["status"],
    subject: "splash pad",
    dateRange: null,
    filters: { audience: "", category: "", facility: "splash pad", location: "" },
    ...overrides,
  };
}

test("AI need planning can split unfamiliar wording without dropping the deterministic request", async () => {
  const question = "Is the splash pad still running, and when does it close each day?";
  const diagnostics = [];
  const contract = await planResidentNeedContract(question, {
    apiKey: "test-key",
    cache: false,
    now: new Date("2026-09-16T18:00:00Z"),
    onDiagnostic: (value) => diagnostics.push(value),
    fetchImpl: async () => providerResponse({ needs: [
      plannedNeed(),
      plannedNeed({
        request: "What are the splash pad's daily closing hours?",
        routeRequest: "splash pad regular daily hours closing time",
        goal: "information",
        requestedDetails: ["hours"],
      }),
    ] }),
  });
  assert.equal(contract.version, "resident-needs-ai-v1");
  assert.equal(contract.needCount, 2);
  assert.deepEqual(contract.needs.map((need) => need.task), ["status", "hours"]);
  assert.equal(contract.planning.method, "ai");
  assert.equal(diagnostics.at(-1).accepted, true);
});

test("AI need planning is rejected when it drops a clearly separate requested part", async () => {
  const question = "What's the next recycling pickup, and where can I keep my bins?";
  const fallback = buildResidentRequestContract(question);
  const parsed = { needs: [{
    quotedText: "What's the next recycling pickup",
    request: "What is the next recycling pickup date?",
    routeRequest: "next recycling pickup date",
    goal: "schedule",
    requestedDetails: ["date"],
    subject: "recycling pickup",
    dateRange: null,
    filters: { audience: "", category: "", facility: "", location: "" },
  }] };
  assert.equal(normalizePlannedContract(question, {}, parsed, fallback, "test-model"), null);
});

test("an AI writer is accepted only when it preserves the evidence coverage", async () => {
  const question = "Which food truck is here on September 17?";
  const contract = buildResidentRequestContract(question);
  const source = { id: "schedule", title: "Official food-truck schedule", text: "" };
  const claim = "Woodhill BBQ is scheduled for September 17, 2026.";
  const baseAnswer = {
    answerMode: "need-first-candidate",
    answerStatus: "verified",
    answer: claim,
    directAnswer: claim,
    keyDetails: [],
    nextStep: "",
    sources: [source],
    claims: [{ text: claim, evidenceSourceIds: ["schedule"], verified: true }],
    actions: [],
    conflicts: [],
  };
  const assessment = assessResidentNeeds(contract, baseAnswer);
  const candidate = {
    ...baseAnswer,
    completion: { outcome: "complete", needs: assessment.needs },
  };
  const rewritten = await rewriteNeedFirstCandidate({ question, contract, candidate }, {
    model: "writer-test",
    synthesize: async () => ({
      directAnswer: "Woodhill BBQ is scheduled for September 17, 2026.",
      keyDetails: [],
      nextStep: "",
    }),
  });
  assert.equal(rewritten.answerMode, "need-first-ai-candidate");
  assert.equal(rewritten.completion.outcome, "complete");
  assert.equal(rewritten.aiComposition.model, "writer-test");
});

test("an AI writer cannot introduce an unsupported protected value", async () => {
  const question = "Which food truck is here on September 17?";
  const contract = buildResidentRequestContract(question);
  const claim = "Woodhill BBQ is scheduled for September 17, 2026.";
  const baseAnswer = {
    answerMode: "need-first-candidate", answerStatus: "verified", answer: claim, directAnswer: claim,
    keyDetails: [], nextStep: "", sources: [{ id: "schedule", title: "Schedule", text: claim }],
    claims: [{ text: claim, evidenceSourceIds: ["schedule"], verified: true }], actions: [], conflicts: [],
  };
  const assessment = assessResidentNeeds(contract, baseAnswer);
  const candidate = { ...baseAnswer, completion: { outcome: "complete", needs: assessment.needs } };
  const rewritten = await rewriteNeedFirstCandidate({ question, contract, candidate }, {
    synthesize: async () => ({
      directAnswer: "Woodhill BBQ is scheduled for September 17, 2026, and meals cost $99.",
      keyDetails: [], nextStep: "",
    }),
  });
  assert.equal(rewritten, null);
});

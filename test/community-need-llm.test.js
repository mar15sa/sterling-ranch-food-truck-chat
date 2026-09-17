const test = require("node:test");
const assert = require("node:assert/strict");
const {
  capabilityCatalog,
  normalizePlannedContract,
  planResidentNeedContract,
  plannerRequestBody,
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

test("organization capability vocabulary turns unfamiliar language into a connector-safe route", () => {
  const question = "Who's parked here tomorrow, and what could we order?";
  const fallback = buildResidentRequestContract(question);
  const catalog = capabilityCatalog({ connectors: [{
    id: "food-truck-schedule",
    type: "food-truck-schedule",
    adapter: {
      facets: ["date", "menu", "price"],
      vocabulary: { "food-truck": ["food truck", "mobile food"] },
    },
  }] });
  const parsed = { needs: [{
    quotedText: question,
    request: "Which vendor is serving tomorrow?",
    routeRequest: "vendor serving tomorrow",
    goal: "schedule",
    requestedDetails: ["date"],
    subject: "dinner vendor",
    capabilityId: "food-truck-schedule",
    dateRange: { kind: "tomorrow", start: "2026-09-17", end: "2026-09-17", label: "tomorrow" },
    filters: { audience: "", category: "", facility: "", location: "" },
  }, {
    quotedText: question,
    request: "What can residents order from that vendor?",
    routeRequest: "items residents can order",
    goal: "information",
    requestedDetails: ["menu"],
    subject: "dinner vendor menu",
    capabilityId: "food-truck-schedule",
    dateRange: { kind: "tomorrow", start: "2026-09-17", end: "2026-09-17", label: "tomorrow" },
    filters: { audience: "", category: "", facility: "", location: "" },
  }] };
  const contract = normalizePlannedContract(question, {}, parsed, fallback, "test-model", catalog);
  assert.match(contract.needs[0].routeRequest, /^food truck:/i);
  assert.match(contract.needs[1].routeRequest, /^menu: food truck:/i);
  assert.equal(contract.needs[1].capabilityId, "food-truck-schedule");
});

test("Sonnet planner request uses the provider-compatible temperature shape", () => {
  const common = {
    maxTokens: 1000,
    system: "system",
    tool: { name: "plan_resident_needs" },
    currentMessage: "question",
    resolvedQuestion: "question",
    now: new Date("2026-09-16T18:00:00Z"),
  };
  assert.equal(plannerRequestBody({ ...common, model: "claude-haiku-4-5" }).temperature, 0);
  assert.equal("temperature" in plannerRequestBody({ ...common, model: "claude-sonnet-5" }), false);
});

test("planner-only extra requirements cannot make a report request look incomplete", () => {
  const question = "Open the CAB's 2025 water-quality findings report.";
  const fallback = buildResidentRequestContract(question);
  const parsed = { needs: [{
    quotedText: question,
    request: "Locate the CAB's 2025 water-quality findings report.",
    routeRequest: "CAB 2025 water-quality findings report",
    goal: "information",
    requestedDetails: ["information", "specification"],
    subject: "CAB 2025 water-quality findings report",
    capabilityId: "static-information",
    dateRange: null,
    filters: { audience: "", category: "", facility: "", location: "" },
  }] };
  const contract = normalizePlannedContract(question, {}, parsed, fallback, "test-model");
  assert.deepEqual(contract.needs[0].requestedDetails, ["information"]);
});

test("a governing specification uses the organization's declared rules capability", () => {
  const question = "Where are recycling carts supposed to live after pickup?";
  const fallback = buildResidentRequestContract(question);
  const catalog = capabilityCatalog({ connectors: [{
    id: "official-rules",
    type: "municode",
    adapter: {
      capabilities: ["rules"], facets: ["permission", "specification"],
      controllingSourceRoles: ["governing"], vocabulary: { rule: ["regulation", "standard"] },
    },
  }] });
  const parsed = { needs: [{
    quotedText: question,
    request: "Find where recycling carts must be stored after pickup.",
    routeRequest: "cart storage placement after collection",
    goal: "information",
    requestedDetails: ["specification", "information"],
    subject: "recycling cart storage rule",
    capabilityId: "static-information",
    dateRange: null,
    filters: { audience: "", category: "", facility: "", location: "" },
  }] };
  const contract = normalizePlannedContract(question, {}, parsed, fallback, "test-model", catalog);
  assert.equal(contract.needs[0].capabilityId, "official-rules");
  assert.match(contract.needs[0].routeRequest, /^rule:/i);
  assert.match(contract.needs[0].routeRequest, /recycling cart storage/i);
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

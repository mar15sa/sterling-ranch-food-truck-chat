const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildRetrievalQueries,
  buildRoutingQuery,
  getRulesSearchMode,
  mergeHybridSearchResults,
  normalizeSearchPlan,
  sourceEvidenceSupportsScope,
} = require("../lib/rules-search");

test("AI search mode is opt-in and preserves the legacy baseline", () => {
  assert.equal(getRulesSearchMode({}), "legacy");
  assert.equal(getRulesSearchMode({ RULES_SEARCH_MODE: "ai-hybrid" }), "ai-hybrid");
  assert.equal(getRulesSearchMode({ RULES_SEARCH_MODE: "unknown" }), "legacy");
});

test("search plans correct wording without losing named places", () => {
  const plan = normalizeSearchPlan("How do I rend the Overlook?", {
    inScope: "yes",
    intent: "facility-reservation",
    normalizedQuestion: "How do I rent the Overlook?",
    searchQueries: ["Overlook facility rental", "Overlook reservation application"],
    entities: ["Overlook"],
  });
  assert.equal(plan.intent, "facility_reservation");
  assert.equal(plan.normalizedQuestion, "How do I rent the Overlook?");
  assert.deepEqual(plan.entities, ["Overlook"]);
  assert.equal(buildRetrievalQueries("How do I rend the Overlook?", plan).length, 1);
  assert.match(buildRetrievalQueries("How do I rend the Overlook?", plan)[0], /Overlook facility rental/i);
  assert.match(buildRoutingQuery("How do I rend the Overlook?", plan), /facility amenity rental/i);
});

test("hybrid retrieval combines evidence from the resident wording and AI queries", () => {
  const sourceA = { nodeId: "a", title: "Overlook rentals", score: 120, matchStats: { matchedOriginalTerms: ["overlook"] } };
  const sourceB = { nodeId: "b", title: "Reservation process", score: 90, matchStats: { matchedOriginalTerms: ["reservation"] } };
  const search = (_index, query) =>
    /overlook/i.test(query) ? [sourceA, sourceB] : [{ ...sourceB, score: 140 }, sourceA];
  const results = mergeHybridSearchResults({}, ["Overlook", "facility reservation"], search, 5);
  assert.equal(results.length, 2);
  assert.ok(results.some((source) => source.nodeId === "a"));
  assert.ok(results.some((source) => source.nodeId === "b"));
  assert.ok(results.every((source) => source.matchedSearchQueries.length === 2));
});

test("retrieval evidence, not the model alone, decides whether an unknown question is in scope", () => {
  assert.equal(sourceEvidenceSupportsScope([], { inScope: "yes" }), false);
  assert.equal(
    sourceEvidenceSupportsScope(
      [{ score: 120, matchStats: { matchedOriginalTerms: ["overlook"] } }],
      { inScope: "yes" }
    ),
    true
  );
  assert.equal(
    sourceEvidenceSupportsScope(
      [{ score: 200, matchStats: { matchedOriginalTerms: ["bike"] } }],
      { inScope: "no" }
    ),
    false
  );
});

const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizedRoute, operationsSnapshot, recordRequest } = require("../lib/operations");

test("operational metrics avoid unbounded path labels", () => {
  assert.equal(normalizedRoute("/api/rules/ask"), "/api/rules/ask");
  assert.equal(normalizedRoute("/random-user-controlled-path"), "/static");
});

test("operational metrics report latency and server errors", () => {
  recordRequest("/api/rules/ask", 200, 125);
  recordRequest("/api/rules/ask", 500, 375);
  const snapshot = operationsSnapshot();
  assert.equal(snapshot.routes["/api/rules/ask"].requests, 2);
  assert.equal(snapshot.routes["/api/rules/ask"].serverErrors, 1);
  assert.equal(snapshot.routes["/api/rules/ask"].averageDurationMs, 250);
});

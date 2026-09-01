const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { communitySourceStatus } = require("../lib/community-source-manager");

test("community answers preserve the complete rulebook source status", () => {
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.match(
    server,
    /answer\.sourceStatus\s*=\s*\{\s*\.\.\.status,\s*\.\.\.answer\.sourceStatus,\s*refreshing:/,
    "Community answers must include the complete status loaded before answering."
  );
});

test("community source status reports page coverage separately from searchable chunks", () => {
  const status = communitySourceStatus({
    communityId: "alpha",
    generatedAt: "2026-09-01T00:00:00.000Z",
    failureCount: 0,
    sources: [],
    inventory: { indexedPageCount: 88, discoveredCount: 120, eligibleCount: 100, pendingCount: 12, excludedCount: 20, complete: false },
  });
  assert.equal(status.sourceCount, 0);
  assert.equal(status.pageCount, 88);
  assert.equal(status.eligiblePageCount, 100);
  assert.equal(status.pendingPageCount, 12);
  assert.equal(status.inventoryAvailable, true);
  assert.equal(status.inventoryComplete, false);
});

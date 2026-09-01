const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("community answers preserve the complete rulebook source status", () => {
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.match(
    server,
    /answer\.sourceStatus\s*=\s*\{\s*\.\.\.status,\s*\.\.\.answer\.sourceStatus,\s*refreshing:/,
    "Community answers must include the complete status loaded before answering."
  );
});

const assert = require("node:assert/strict");
const test = require("node:test");
const { classifyChangedFiles } = require("../scripts/check-openings-release-scope");

test("accepts a catalog-only openings release", () => {
  assert.deepEqual(classifyChangedFiles(["data/openings.json"]), {
    changedFiles: ["data/openings.json"],
    blockedFiles: [],
    openingsOnly: true,
  });
});

test("accepts the catalog and its monitored source configuration together", () => {
  assert.equal(
    classifyChangedFiles(["data/openings-sources.json", "data/openings.json"]).openingsOnly,
    true,
  );
});

test("rejects an openings release containing unrelated application work", () => {
  const result = classifyChangedFiles(["data/openings.json", "lib/community-assistant.js"]);
  assert.equal(result.openingsOnly, false);
  assert.deepEqual(result.blockedFiles, ["lib/community-assistant.js"]);
});

test("rejects an empty release", () => {
  assert.equal(classifyChangedFiles([]).openingsOnly, false);
});

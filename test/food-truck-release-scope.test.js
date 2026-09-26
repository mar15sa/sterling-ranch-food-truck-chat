const test = require("node:test");
const assert = require("node:assert/strict");
const { catalog, catalogIssues, KNOWN_TRUCK_LINKS } = require("../lib/food-truck-links");
const { classifyChangedFiles } = require("../scripts/check-release-scope");

test("food-truck data has a bounded protected release scope", () => {
  assert.equal(classifyChangedFiles(["data/food-truck-links.json"]).scope, "food-trucks");
  assert.equal(classifyChangedFiles(["data/food-truck-links.json", "docs/release.md"]).scope, "food-trucks");
});

test("mixed food-truck and application changes retain the full gate", () => {
  assert.equal(classifyChangedFiles(["data/food-truck-links.json", "server.js"]).scope, "full");
  assert.equal(classifyChangedFiles(["data/food-truck-links.json", ".github/workflows/ci.yml"]).scope, "full");
});

test("food-truck catalog and aliases are valid", () => {
  assert.deepEqual(catalogIssues(catalog), []);
  for (const [alias, target] of Object.entries(catalog.aliases)) {
    assert.strictEqual(KNOWN_TRUCK_LINKS[alias], KNOWN_TRUCK_LINKS[target], alias);
  }
});

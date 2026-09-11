const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

function source(filename) {
  return fs.readFileSync(path.join(__dirname, "..", "scripts", filename), "utf8");
}

test("live rules monitor labels every rules and Community Assistant question as a test", () => {
  const script = source("check-live-rules.js");
  const markers = script.match(/JSON\.stringify\(\{ question, isTest: true \}\)/g) || [];
  assert.equal(markers.length, 2);
  assert.match(script, /\/api\/community\/ask/);
});

test("community soak labels its questions and follow-up as tests", () => {
  const script = source("check-community-soak.js");
  const markers = script.match(/isTest: true/g) || [];
  assert.equal(markers.length, 3);
});

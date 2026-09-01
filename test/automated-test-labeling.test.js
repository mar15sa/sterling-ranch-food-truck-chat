const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

function source(filename) {
  return fs.readFileSync(path.join(__dirname, "..", "scripts", filename), "utf8");
}

test("live rules monitor labels every assistant question as a test", () => {
  const script = source("check-live-rules.js");
  assert.match(script, /JSON\.stringify\(\{ question, isTest: true \}\)/);
});

test("community soak labels its questions and follow-up as tests", () => {
  const script = source("check-community-soak.js");
  const markers = script.match(/isTest: true/g) || [];
  assert.equal(markers.length, 3);
});

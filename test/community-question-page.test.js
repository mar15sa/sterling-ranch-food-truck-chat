const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("owner page stays private and does not load analytics", () => {
  const html = fs.readFileSync(
    path.join(__dirname, "..", "public", "community-questions.html"),
    "utf8"
  );
  assert.match(html, /Owner question log/);
  assert.match(html, /Weak or poor answers/);
  assert.match(html, /Answer quality/);
  assert.match(html, /noindex, nofollow, noarchive/);
  assert.doesNotMatch(html, /environment\.js|googletagmanager|google-analytics/);
});

test("Community Assistant test bookmark is visible and marks API requests", () => {
  const html = fs.readFileSync(
    path.join(__dirname, "..", "public", "rules-assistant.html"),
    "utf8"
  );
  const script = fs.readFileSync(
    path.join(__dirname, "..", "public", "rules-assistant.js"),
    "utf8"
  );
  assert.match(html, /id="testModeBanner"/);
  assert.match(script, /get\("test"\) === "1"/);
  assert.match(script, /isTest: isTestMode/);
});

test("an expanded owner question stays open across automatic refreshes", () => {
  const script = fs.readFileSync(
    path.join(__dirname, "..", "public", "community-questions.js"),
    "utf8"
  );
  assert.match(script, /const expandedQuestionIds = new Set\(\)/);
  assert.match(script, /details\.open = expandedQuestionIds\.has\(item\.id\)/);
  assert.match(script, /details\.addEventListener\("toggle"/);
  assert.match(script, /expandedQuestionIds\.add\(item\.id\)/);
  assert.match(script, /expandedQuestionIds\.delete\(item\.id\)/);
});

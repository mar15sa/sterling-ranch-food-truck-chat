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
  assert.match(html, /Private operations/);
  assert.match(html, /Source health/);
  assert.match(html, /CAB page coverage/);
  assert.match(html, /Pending review/);
  assert.match(html, /noindex, nofollow, noarchive/);
  assert.doesNotMatch(html, /environment\.js|googletagmanager|google-analytics/);
});

test("resident source details stay simple while owner diagnostics receive full health data", () => {
  const root = path.join(__dirname, "..");
  const residentHtml = fs.readFileSync(path.join(root, "public", "rules-assistant.html"), "utf8");
  const residentScript = fs.readFileSync(path.join(root, "public", "rules-assistant.js"), "utf8");
  const ownerScript = fs.readFileSync(path.join(root, "public", "community-questions.js"), "utf8");
  const server = fs.readFileSync(path.join(root, "server.js"), "utf8");

  assert.match(residentHtml, /What this means/);
  assert.doesNotMatch(residentHtml, /CAB page coverage|Latest online update|Codified through/);
  assert.doesNotMatch(residentScript, /eligible CAB pages remain|excluded with a reason|inventory still building/);
  assert.match(ownerScript, /renderSourceHealth/);
  assert.match(ownerScript, /\/api\/community-source-health/);
  assert.match(ownerScript, /pendingSourceCount|pendingPageCount/);
  assert.match(server, /handleCommunitySourceHealth[\s\S]*rules:[\s\S]*community: communitySourceStatus\(\)/);
  assert.match(server, /\/api\/community-source-health/);
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

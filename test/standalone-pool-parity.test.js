const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const sterling = require("../data/communities/sterling-ranch.json");
const { getCommunityPoolStatus } = require("../lib/community-pool-status");

const root = path.join(__dirname, "..");
const response = (body) => new Response(body, { status: 200 });

test("the standalone status source rejects color-only markup through the shared adapter", async () => {
  await assert.rejects(
    () => getCommunityPoolStatus({ profile: sterling, fetchImpl: async () => response('<a class="widgetGraphicLinksLink" href="/187/Pool"><img alt="Green Light"></a>') }),
    /exact operational status/i,
  );
});

test("pool API uses the shared strict adapter and has no retained color parser", () => {
  const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
  assert.match(server, /const data = \{ \.\.\.await getConfiguredCommunityPoolStatus\(\)/);
  assert.doesNotMatch(server, /parsePoolStatus|legacyColorDisplay|POOL_STATUS_DETAILS/);
});

test("standalone page presents neutral official text and retains no fixed access claims", () => {
  const html = fs.readFileSync(path.join(root, "public", "pool.html"), "utf8");
  const script = fs.readFileSync(path.join(root, "public", "pool.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "public", "pool.css"), "utf8");
  assert.match(html, /exact current status from the official CAB page/i);
  assert.doesNotMatch(`${html}\n${script}\n${css}`, /Green Light|Yellow Light|Red Light|Purple Light|Blue Light|waitlist|registered event|staff ready|homeowners and guests/i);
  assert.match(css, /pool-status-dot\[data-state="current"\]/);
  assert.doesNotMatch(css, /data-state="open"|data-state="closed"|data-state="event-only"|data-state="at-capacity"/);
});

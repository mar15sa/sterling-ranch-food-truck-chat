const test = require("node:test");
const assert = require("node:assert/strict");
const { rulebookDestination } = require("../lib/community-rulebook");
const sterling = require("../data/communities/sterling-ranch.json");
const castle = require("../data/communities/castle-rock.json");

test("rulebook destination uses each community's configured rules connector", () => {
  for (const profile of [sterling, castle]) {
    assert.equal(rulebookDestination(profile), profile.connectors.find(c => c.type === "municode").baseUrl);
  }
  assert.notEqual(rulebookDestination(castle), rulebookDestination(sterling));
});

function fixture(url = "https://rules.example.gov/adopted") {
  return { website: "https://community.example.gov/", allowedHosts: ["rules.example.gov"], connectors: [{
    type: "adopted-document", baseUrl: "https://rules.example.gov/",
    adapter: { capabilities: ["rules"], sourceHosts: ["rules.example.gov"], endpoints: [
      { id: "primary", purpose: "governing-rules", url },
    ] },
  }] };
}

test("rules capability prefers the configured primary governing endpoint", () => {
  assert.equal(rulebookDestination(fixture()), "https://rules.example.gov/adopted");
});
test("missing rules connector falls back to this community's website", () => {
  assert.equal(rulebookDestination({ ...castle, connectors: [] }), castle.website);
});
test("unsafe endpoints fail to the active website", () => {
  for (const url of ["https://evil.example/", "http://rules.example.gov/adopted", "javascript:alert(1)", "https://user:password@rules.example.gov/", "not a URL"]) {
    const profile = fixture(url);
    assert.equal(rulebookDestination(profile), profile.website);
  }
  const profile = fixture();
  profile.connectors[0].adapter.sourceHosts = ["community.example.gov"];
  assert.equal(rulebookDestination(profile), profile.website);
});
test("legacy connector baseUrl is also constrained by the profile allowlist", () => {
  const profile = { ...castle, connectors: [{ type: "municode", baseUrl: "https://evil.example/" }] };
  assert.equal(rulebookDestination(profile), castle.website);
});

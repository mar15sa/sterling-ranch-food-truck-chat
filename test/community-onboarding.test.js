const test = require("node:test");
const assert = require("node:assert/strict");
const {
  detectPlatform,
  extractOfficialLinks,
  isPrivateAddress,
  normalizeCommunityUrl,
  previewCommunitySetup,
} = require("../lib/community-onboarding");

const CIVICPLUS_HOME = `
  <html><head><title>Sample Community | Official Website</title><meta name="generator" content="CivicPlus"></head>
  <body>
    <a href="/Calendar.aspx">Community Calendar</a>
    <a href="/257/Amenity-Rentals">Amenity Rentals</a>
    <a href="/FormCenter">Resident Forms</a>
    <a href="/AlertCenter.aspx">Emergency Alerts</a>
    <a href="https://library.municode.com/co/sample/codes/code">Community Code</a>
  </body></html>`;

function mockResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
    arrayBuffer: async () => Buffer.from(body),
  };
}

test("community URLs are normalized and private targets are rejected", () => {
  assert.equal(normalizeCommunityUrl("sample.gov/about").href, "https://sample.gov/");
  assert.throws(() => normalizeCommunityUrl("http://sample.gov"), /https/i);
  assert.throws(() => normalizeCommunityUrl("https://localhost"), /public/i);
  assert.equal(isPrivateAddress("127.0.0.1"), true);
  assert.equal(isPrivateAddress("192.168.1.4"), true);
  assert.equal(isPrivateAddress("8.8.8.8"), false);
});

test("CivicPlus and resident source categories are discovered from one official homepage", () => {
  assert.equal(detectPlatform(CIVICPLUS_HOME).id, "civicplus-web-central");
  const links = extractOfficialLinks(CIVICPLUS_HOME, new URL("https://sample.gov/"));
  assert.ok(links.some((link) => link.type === "events"));
  assert.ok(links.some((link) => link.type === "facilities"));
  assert.ok(links.some((link) => link.type === "forms"));
  assert.ok(links.some((link) => link.type === "alerts"));
  assert.ok(links.some((link) => link.type === "rules"));
});

test("one website input produces a safe, review-only onboarding preview", async () => {
  const preview = await previewCommunitySetup("https://sample.gov/", {
    lookup: async () => [{ address: "203.0.113.10", family: 4 }],
    fetchImpl: async () => mockResponse(CIVICPLUS_HOME),
  });
  assert.equal(preview.communityName, "Sample Community");
  assert.equal(preview.platform.label, "CivicPlus Web Central");
  assert.equal(preview.publicationStatus, "preview-only");
  assert.match(preview.residentPromise, /direct, specific information in plain English/i);
  assert.ok(preview.capabilities.filter((item) => item.status === "found").length >= 5);
  assert.ok(preview.setupSteps.some((step) => /freshness|broken-link|conflict/i.test(step)));
});

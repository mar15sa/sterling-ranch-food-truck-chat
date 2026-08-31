const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const pages = ["index.html", "food-truck.html", "rules-assistant.html", "pool.html", "openings.html", "community-demo.html"];

test("every resident page uses the shared staging and analytics guard", () => {
  for (const page of pages) {
    const html = fs.readFileSync(path.join(__dirname, "..", "public", page), "utf8");
    assert.match(html, /src=["']\/environment\.js["']/, `${page} is missing environment.js`);
  }
});

test("Community Assistant sharing metadata uses the current 1200 by 630 preview", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "rules-assistant.html"), "utf8");
  const imageName = "community-social-preview-v2.png";
  assert.match(html, new RegExp(`property=["']og:image["'][^>]+${imageName}`));
  assert.match(html, new RegExp(`name=["']twitter:image["'][^>]+${imageName}`));
  assert.match(html, /og:image:alt[^>]+Community Assistant[^>]+rules, services, forms, facilities, events/i);
  assert.doesNotMatch(html, /rules-social-preview\.png/);

  const png = fs.readFileSync(path.join(__dirname, "..", "public", imageName));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
});

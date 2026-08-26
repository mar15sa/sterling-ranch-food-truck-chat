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

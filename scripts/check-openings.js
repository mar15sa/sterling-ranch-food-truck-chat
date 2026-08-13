const fs = require("node:fs");
const path = require("node:path");
const { getOpeningsCatalog, getOpeningsSourceStatus } = require("../lib/openings");

const root = path.join(__dirname, "..");
const raw = JSON.parse(fs.readFileSync(path.join(root, "data", "openings.json"), "utf8"));
const catalog = getOpeningsCatalog();
const sources = getOpeningsSourceStatus();
const errors = [];
const ids = new Set();

for (const item of raw.items || []) {
  if (!item.id || ids.has(item.id)) errors.push(`Duplicate or missing id: ${item.id || "(missing)"}`);
  ids.add(item.id);
  for (const field of ["name", "category", "community", "status", "summary", "verifiedAt"]) {
    if (!item[field]) errors.push(`${item.id || "Unknown item"} is missing ${field}.`);
  }
  if (!Array.isArray(item.sources) || !item.sources.length) errors.push(`${item.id} has no evidence source.`);
  for (const source of item.sources || []) {
    try {
      const url = new URL(source.url);
      if (!/^https?:$/.test(url.protocol)) throw new Error();
    } catch {
      errors.push(`${item.id} has an invalid source URL.`);
    }
  }
}

if (catalog.total !== raw.items.length || catalog.items.length !== raw.items.length) {
  errors.push("The unfiltered API did not return the full catalog; listings must never be capped.");
}
if (sources.total < 10) errors.push("The radar has fewer than 10 configured source channels.");

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Openings catalog check passed for all ${catalog.total} listings and ${sources.total} source channels.`);

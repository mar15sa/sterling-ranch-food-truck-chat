#!/usr/bin/env node
const fs = require("node:fs/promises");
const path = require("node:path");
const { extractFacts } = require("../lib/community-ingest");

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function main() {
  const root = path.join(__dirname, "..");
  const inputPath = path.resolve(option("--input", path.join(root, "data", "community-index.json")));
  const outputPath = path.resolve(option("--output", inputPath));
  const index = JSON.parse(await fs.readFile(inputPath, "utf8"));
  for (const source of index.sources || []) {
    const metadata = { sourceId: source.id, sourceUrl: source.sourceUrl, checkedAt: source.checkedAt, contentHash: source.contentHash };
    source.facts = [
      ...extractFacts(source.text).map((fact) => ({ ...fact, ...metadata })),
      ...(source.actions || []).map((action) => ({
        id: `${source.id}-${action.id}-link`,
        factKey: `link-${action.id}`,
        type: "link",
        value: action.url,
        normalizedValue: action.url,
        currency: "",
        unit: "",
        effectiveDate: "",
        context: `${action.label}: ${action.url}`,
        ...metadata,
      })),
    ];
  }
  await fs.writeFile(outputPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  console.log(`Enriched ${index.sources?.length || 0} community sources with structured changing facts.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { extractStructuredFacts } = require("../lib/rules-facts");

const ROOT = path.join(__dirname, "..");
const DEFAULT_INDEX_PATH = path.join(ROOT, "data", "rules-index.json");
const DEFAULT_SUPPLEMENTS_PATH = path.join(ROOT, "data", "rules-supplement-sections.json");
const DEFAULT_OUTPUT_PATH = path.join(ROOT, "data", "rules-fact-catalog.json");

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function fileHash(filePath) {
  if (!fs.existsSync(filePath)) return "";
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function buildRulesFactCatalog({ indexPath = DEFAULT_INDEX_PATH, supplementsPath = DEFAULT_SUPPLEMENTS_PATH } = {}) {
  const index = readJson(indexPath, { documents: [] });
  const supplements = readJson(supplementsPath, []);
  const documents = [...(index.documents || []), ...(Array.isArray(supplements) ? supplements : supplements.documents || [])];
  const factsByKey = new Map();

  for (const document of documents) {
    for (const fact of extractStructuredFacts(document.text || "", document)) {
      const existing = factsByKey.get(fact.factKey);
      if (!existing || (fact.effectiveDate || "") > (existing.effectiveDate || "")) factsByKey.set(fact.factKey, fact);
    }
  }

  return {
    schemaVersion: 1,
    sourceFiles: {
      rulesIndex: { path: path.relative(ROOT, indexPath).replace(/\\/g, "/"), sha256: fileHash(indexPath) },
      supplements: { path: path.relative(ROOT, supplementsPath).replace(/\\/g, "/"), sha256: fileHash(supplementsPath) },
    },
    factCount: factsByKey.size,
    facts: [...factsByKey.values()].sort((a, b) => a.factKey.localeCompare(b.factKey)),
  };
}

function assertCatalogCurrent(existing, current) {
  if (!existing) throw new Error("Rules fact catalog is missing. Run npm run rules:facts:build.");
  if (existing.schemaVersion !== current.schemaVersion) throw new Error("Rules fact catalog schema is out of date.");
  if (existing.sourceFiles?.rulesIndex?.sha256 !== current.sourceFiles.rulesIndex.sha256) throw new Error("Rules fact catalog does not match rules-index.json.");
  if (existing.sourceFiles?.supplements?.sha256 !== current.sourceFiles.supplements.sha256) throw new Error("Rules fact catalog does not match rules-supplement-sections.json.");
  if (JSON.stringify(existing.facts) !== JSON.stringify(current.facts)) throw new Error("Rules fact catalog contents are out of date.");
}

function writeRulesFactCatalog(options = {}) {
  const outputPath = options.outputPath || DEFAULT_OUTPUT_PATH;
  const catalog = buildRulesFactCatalog(options);
  fs.writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`);
  return { catalog, outputPath };
}

function main() {
  const checkOnly = process.argv.includes("--check");
  const catalog = buildRulesFactCatalog();
  if (checkOnly) {
    assertCatalogCurrent(readJson(DEFAULT_OUTPUT_PATH, null), catalog);
    console.log(`Rules fact catalog is current (${catalog.factCount} structured facts).`);
    return;
  }
  const result = writeRulesFactCatalog();
  console.log(`Wrote ${result.outputPath} with ${result.catalog.factCount} structured facts.`);
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exit(1); }
}

module.exports = { DEFAULT_OUTPUT_PATH, assertCatalogCurrent, buildRulesFactCatalog, writeRulesFactCatalog };

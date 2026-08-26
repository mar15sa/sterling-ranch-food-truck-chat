#!/usr/bin/env node

const path = require("node:path");
const {
  DEFAULT_INDEX_PATH,
  createRulesIndex,
} = require("../lib/rules-assistant");
const { writeRulesFactCatalog } = require("./build-rules-fact-catalog");

function parseArgs(argv) {
  const args = {
    indexPath: DEFAULT_INDEX_PATH,
    sourceFile: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--index") {
      args.indexPath = path.resolve(argv[index + 1] || "");
      index += 1;
    } else if (arg === "--source-file") {
      args.sourceFile = path.resolve(argv[index + 1] || "");
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/ingest-rules.js [options]

Options:
  --index <path>        Where to write the local searchable index.
                        Default: ${DEFAULT_INDEX_PATH}
  --source-file <path>  Fallback mode for a manually exported .txt or .html file.
  --help               Show this help message.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  console.log("Refreshing Sterling Ranch CAB rules source...");
  const index = await createRulesIndex({
    indexPath: args.indexPath,
    sourceFile: args.sourceFile,
  });
  const { catalog } = writeRulesFactCatalog({ indexPath: args.indexPath });

  console.log(`Wrote ${args.indexPath}`);
  console.log(`Latest job ID: ${index.source.latestJobId}`);
  console.log(`Online update date: ${index.source.onlineUpdateDate || "Unknown"}`);
  console.log(`Sections indexed: ${index.source.sectionCount}`);
  console.log(`Search chunks indexed: ${index.source.chunkCount}`);
  console.log(`Structured changing facts indexed: ${catalog.factCount}`);
}

main().catch((error) => {
  console.error(`Rules ingestion failed: ${error.message}`);
  process.exit(1);
});

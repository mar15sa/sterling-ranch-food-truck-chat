#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { validateCommunityProfile } = require("../lib/community-contracts");
const { buildFactLedger, factLedgerStatus, resolveFactLedger } = require("../lib/community-truth");

const root = path.join(__dirname, "..");
const inputArg = process.argv.indexOf("--input");
const outputArg = process.argv.indexOf("--output");
const input = inputArg >= 0 ? path.resolve(process.argv[inputArg + 1]) : path.join(root, "data", "community-index.json");
const output = outputArg >= 0 ? path.resolve(process.argv[outputArg + 1]) : input;
const check = process.argv.includes("--check");
const index = JSON.parse(fs.readFileSync(input, "utf8"));
const profile = validateCommunityProfile(JSON.parse(fs.readFileSync(path.join(root, "data", "communities", `${index.communityId}.json`), "utf8")));
const factLedger = buildFactLedger(index, { trusted: true, previousLedger: index.factLedger || [] });
const resolution = resolveFactLedger(factLedger, profile);
const built = {
  ...index,
  schemaVersion: 3,
  factAuthority: profile.factAuthority,
  factLedger,
  truthStatus: {
    generatedAt: index.generatedAt,
    migrationMode: "trusted-baseline",
    unresolvedConflictCount: resolution.unresolved.length,
    unresolvedSensitiveConflictCount: resolution.unresolvedSensitive.length,
    pendingSensitiveReviewCount: 0,
    ...factLedgerStatus({ factLedger }),
  },
};
const serialized = `${JSON.stringify(built, null, 2)}\n`;
if (check) {
  if (fs.readFileSync(input, "utf8") !== serialized) throw new Error("The bundled community truth ledger is out of date.");
} else {
  fs.writeFileSync(output, serialized);
  console.log(`Built ${factLedger.length} approved fact-ledger entries without changing the ${index.sources.length}-source trusted bundle.`);
}

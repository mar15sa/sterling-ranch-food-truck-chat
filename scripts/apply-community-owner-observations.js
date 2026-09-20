#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { applyOwnerObservations } = require("../lib/community-owner-observations");

const root = path.join(__dirname, "..");
const indexPath = path.join(root, "data", "community-index.json");
const observationsPath = path.join(root, "data", "community-owner-observations.json");

function main() {
  const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  const observations = JSON.parse(fs.readFileSync(observationsPath, "utf8"));
  const updated = applyOwnerObservations(index, observations);
  fs.writeFileSync(indexPath, `${JSON.stringify(updated, null, 2)}\n`);
  console.log(JSON.stringify({ observations: observations.observations.length, sources: updated.sourceCount }));
}

if (require.main === module) main();
module.exports = { main };

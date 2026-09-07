#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { validateCommunityProfile } = require('../lib/community-contracts');
const { buildFactLedger, factLedgerStatus, resolveFactLedger, SENSITIVE_FACETS } = require('../lib/community-truth');
const { isDynamicSource } = require('../lib/community-source-identity');
function buildLedgerIndex(index, profile) {
  const factLedger = buildFactLedger({ ...index, sources: index.sources.filter(source => !isDynamicSource(source)) }, {
    previousLedger: index.factLedger || [], requirePriorReview: true,
  });
  const resolution = resolveFactLedger(factLedger, profile);
  const built = { ...index, schemaVersion: 3, factAuthority: profile.factAuthority, factLedger,
    truthStatus: { generatedAt: index.generatedAt, migrationMode: 'reviewed',
      unresolvedConflictCount: resolution.unresolved.length,
      unresolvedSensitiveConflictCount: resolution.unresolvedSensitive.length,
      pendingSensitiveReviewCount: factLedger.filter(entry => entry.reviewStatus === 'candidate' && SENSITIVE_FACETS.has(entry.facet)).length,
    } };
  Object.assign(built.truthStatus, factLedgerStatus(built));
  return built;
}
function main(argv = process.argv.slice(2)) {
  const root = path.join(__dirname, '..');
  const inputArg = argv.indexOf('--input');
  const outputArg = argv.indexOf('--output');
  if ((inputArg >= 0 && !argv[inputArg + 1]) || (outputArg >= 0 && !argv[outputArg + 1])) throw new Error('Input and output options need a file path.');
  const input = inputArg >= 0 ? path.resolve(argv[inputArg + 1]) : path.join(root, 'data', 'community-index.json');
  const output = outputArg >= 0 ? path.resolve(argv[outputArg + 1]) : input;
  const index = JSON.parse(fs.readFileSync(input, 'utf8'));
  const profile = validateCommunityProfile(JSON.parse(fs.readFileSync(path.join(root, 'data', 'communities', `${index.communityId}.json`), 'utf8')));
  const built = buildLedgerIndex(index, profile);
  const serialized = `${JSON.stringify(built, null, 2)}\n`;
  if (argv.includes('--check')) {
    if (fs.readFileSync(input, 'utf8') !== serialized) throw new Error('The bundled community truth ledger is out of date.');
  } else {
    fs.writeFileSync(output, serialized);
    console.log(`Built ${built.factLedger.length} static entries: ${built.truthStatus.approvedFactCount} prior approvals retained, ${built.truthStatus.candidateFactCount} pending. No new approvals granted.`);
  }
}
if (require.main === module) main();
module.exports = { buildLedgerIndex };

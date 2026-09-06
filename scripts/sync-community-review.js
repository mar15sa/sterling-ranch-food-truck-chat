#!/usr/bin/env node
const fs = require('node:fs/promises');
const { buildReviewItems, syncReviewItems, sourceReviewStatus } = require('../lib/community-source-review');

async function main() {
  const candidateArg = process.argv.indexOf('--candidate');
  if (candidateArg < 0 || !process.argv[candidateArg + 1]) throw new Error('--candidate is required');
  const trusted = JSON.parse(await fs.readFile('data/community-index.json', 'utf8'));
  const candidate = JSON.parse(await fs.readFile(process.argv[candidateArg + 1], 'utf8'));
  const profile = JSON.parse(await fs.readFile(`data/communities/${trusted.communityId}.json`, 'utf8'));
  const items = buildReviewItems(trusted, candidate, profile);
  const summary = { checkedAt: new Date().toISOString(), inventory: candidate.inventory, total: items.length,
    sensitive: items.filter(item => item.sensitive).length, conflicts: items.filter(item => item.conflict).length,
    configured: sourceReviewStatus().configured };
  await fs.writeFile('data/community-review-summary.json', `${JSON.stringify(summary, null, 2)}\n`);
  if (!summary.configured) throw new Error('Source review storage is not connected; inventory evidence was preserved.');
  const result = await syncReviewItems(items);
  console.log(JSON.stringify({ ...summary, sync: result }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

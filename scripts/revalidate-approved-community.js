#!/usr/bin/env node
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { pageText, stripEmbeddedInstructions, extractPdfText, chunkText, isDocumentUrl } = require('../lib/community-ingest');
const { isFreshnessTrackedSource } = require('../lib/community-source-manager');
async function main() {
  const file = 'data/community-index.json';
  const index = JSON.parse(await fs.readFile(file, 'utf8'));
  const overdue = index.sources.filter(s => isFreshnessTrackedSource(s) && Date.parse(s.staleAfter) < Date.now());
  const checks = [];
  for (const url of [...new Set(overdue.map(s => s.sourceUrl))]) {
    try {
      let content;
      if (isDocumentUrl(url)) content = await extractPdfText(url);
      else {
        const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        content = stripEmbeddedInstructions(pageText(await response.text()));
      }
      const hashes = new Set(chunkText(content).map(text => crypto.createHash('sha256').update(text).digest('hex')));
      const checkedAt = new Date().toISOString();
      const matched = overdue.filter(s => s.sourceUrl === url && hashes.has(s.contentHash));
      for (const source of matched) {
        source.checkedAt = checkedAt;
        source.staleAfter = new Date(Date.now() + 86400000).toISOString();
      }
      checks.push({ url, checkedAt, renewed: matched.map(s => ({ id: s.id, contentHash: s.contentHash })),
        requiresReview: overdue.filter(s => s.sourceUrl === url && !hashes.has(s.contentHash)).map(s => ({id:s.id,contentHash:s.contentHash})) });
    } catch (error) { checks.push({ url, error: error.message }); }
  }
  const report = { checkedAt: new Date().toISOString(), mode: 'exact-content-hash-only', checks };
  await fs.writeFile('data/community-approved-revalidation.json', `${JSON.stringify(report,null,2)}\n`);
  if (process.argv.includes('--write')) await fs.writeFile(file, `${JSON.stringify(index,null,2)}\n`);
  console.log(JSON.stringify({ checkedUrls:checks.length, renewed:checks.flatMap(c=>c.renewed||[]).length, review:checks.flatMap(c=>c.requiresReview||[]).length, failures:checks.filter(c=>c.error).length }));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});

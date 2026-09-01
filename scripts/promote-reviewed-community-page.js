#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const { fingerprint } = require("../lib/community-release");
const { validateSourceRecord } = require("../lib/community-contracts");

function option(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function main() {
  const root = path.join(__dirname, "..");
  const trustedPath = path.resolve(option("--trusted", path.join(root, "data", "community-index.json")));
  const candidatePath = path.resolve(option("--candidate", path.join(root, "data", "community-index.candidate.json")));
  const sourceUrl = option("--url");
  const reviewedBy = option("--reviewed-by");
  if (!sourceUrl || !reviewedBy || !process.argv.includes("--approve-reviewed")) {
    throw new Error("A page URL, reviewer, and --approve-reviewed confirmation are required.");
  }

  const [trusted, candidate] = await Promise.all([
    fs.readFile(trustedPath, "utf8").then(JSON.parse),
    fs.readFile(candidatePath, "utf8").then(JSON.parse),
  ]);
  const selected = candidate.sources.filter((source) => source.sourceUrl === sourceUrl);
  if (!selected.length) throw new Error(`The candidate does not contain ${sourceUrl}.`);
  selected.forEach(validateSourceRecord);
  if (selected.some((source) => source.communityId !== trusted.communityId)) throw new Error("The reviewed page belongs to a different community.");

  const reviewedAt = new Date().toISOString();
  const sources = [
    ...trusted.sources.filter((source) => source.sourceUrl !== sourceUrl),
    ...selected.map((source) => ({ ...source, reviewedAt, reviewedBy })),
  ];
  const next = {
    ...trusted,
    generatedAt: reviewedAt,
    sourceCount: sources.length,
    sources,
    manualReviews: [
      ...(trusted.manualReviews || []).filter((review) => review.url !== sourceUrl),
      { url: sourceUrl, reviewedAt, reviewedBy, candidateFingerprint: fingerprint(candidate) },
    ],
  };
  await fs.writeFile(trustedPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  console.log(`Promoted ${selected.length} reviewed source records for ${sourceUrl}.`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });

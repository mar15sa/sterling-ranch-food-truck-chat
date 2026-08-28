#!/usr/bin/env node
const fs = require("node:fs/promises");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { validateCommunityProfile } = require("../lib/community-contracts");
const { validateCommunityCandidate } = require("../lib/community-release");

function option(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function readJson(file) { return JSON.parse(await fs.readFile(path.resolve(file), "utf8")); }

function readTrustedRef(ref, file) {
  const relative = path.relative(path.join(__dirname, ".."), path.resolve(file)).replace(/\\/g, "/");
  return JSON.parse(execFileSync("git", ["show", `${ref}:${relative}`], { cwd: path.join(__dirname, ".."), encoding: "utf8" }));
}

async function checkLink(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    let response = await fetch(url, { method: "HEAD", redirect: "follow", signal: controller.signal, headers: { "user-agent": "Sterling Ranch source release validator" } });
    if ([403, 405].includes(response.status)) response = await fetch(url, { method: "GET", redirect: "follow", signal: controller.signal, headers: { "user-agent": "Sterling Ranch source release validator" } });
    return { url, okay: response.ok, status: response.status, finalUrl: response.url };
  } catch (error) {
    return { url, okay: false, status: 0, error: error?.message || String(error) };
  } finally { clearTimeout(timer); }
}

async function main() {
  const root = path.join(__dirname, "..");
  const trustedPath = option("--trusted", path.join(root, "data", "community-index.json"));
  const candidatePath = option("--candidate", path.join(root, "data", "community-index.candidate.json"));
  const profilePath = option("--profile", path.join(root, "data", "communities", "sterling-ranch.json"));
  const reportPath = option("--report", path.join(root, "data", "community-source-report.json"));
  const trustedRef = option("--trusted-ref", "");
  const [trusted, candidate, profileInput] = await Promise.all([
    trustedRef ? Promise.resolve(readTrustedRef(trustedRef, trustedPath)) : readJson(trustedPath),
    readJson(candidatePath),
    readJson(profilePath),
  ]);
  const profile = validateCommunityProfile(profileInput);
  const result = validateCommunityCandidate(trusted, candidate, profile);
  if (process.argv.includes("--check-links") && result.valid) {
    const links = [...new Set(candidate.sources.flatMap((source) => source.actions || []).map((action) => action.url))];
    const batches = [];
    for (let index = 0; index < links.length; index += 8) batches.push(links.slice(index, index + 8));
    const checks = [];
    for (const batch of batches) checks.push(...await Promise.all(batch.map(checkLink)));
    const broken = checks.filter((item) => !item.okay || new URL(item.finalUrl || item.url).protocol !== "https:");
    result.linkChecks = { total: checks.length, broken };
    if (broken.length && process.argv.includes("--prune-broken-links")) {
      const brokenUrls = new Set(broken.map((item) => item.url));
      for (const source of candidate.sources) {
        source.actions = (source.actions || []).filter((action) => !brokenUrls.has(action.url));
        source.facts = (source.facts || []).filter((fact) => fact.type !== "link" || !brokenUrls.has(fact.value));
      }
      await fs.writeFile(path.resolve(candidatePath), `${JSON.stringify(candidate, null, 2)}\n`, "utf8");
      result.warnings.push(`${broken.length} non-working optional links were removed; protected action questions still run through the full answer gate.`);
      result.linkChecks.pruned = broken.length;
    } else if (broken.length) {
      result.valid = false;
      result.errors.push(`${broken.length} official action links failed live validation.`);
    }
  }
  const checkedAt = new Date().toISOString();
  const report = { checkedAt, trustedFile: path.basename(trustedPath), candidateFile: path.basename(candidatePath), ...result };
  await fs.writeFile(path.resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (!result.valid) throw new Error(result.errors.join(" "));
  if (process.argv.includes("--promote")) {
    candidate.promotedAt = checkedAt;
    candidate.releaseFingerprint = result.diff.candidateFingerprint;
    await fs.writeFile(path.resolve(candidatePath), `${JSON.stringify(candidate, null, 2)}\n`, "utf8");
    await fs.copyFile(path.resolve(candidatePath), path.resolve(trustedPath));
  }
  console.log(`Community candidate passed: ${JSON.stringify({ changed: result.diff.changedSourceIds.length, added: result.diff.addedSourceIds.length, removed: result.diff.removedSourceIds.length, factChanges: result.diff.factChanges.length })}`);
}

main().catch((error) => { console.error(`Community candidate failed: ${error.message}`); process.exitCode = 1; });

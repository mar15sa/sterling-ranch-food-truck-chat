#!/usr/bin/env node
const fs = require("node:fs/promises");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { validateCommunityProfile } = require("../lib/community-contracts");
const { validateCommunityCandidate } = require("../lib/community-release");
const { compileReviewedCandidate } = require("../lib/community-source-review");

function option(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function readJson(file) { return JSON.parse(await fs.readFile(path.resolve(file), "utf8")); }
async function readJsonOptional(file, fallback) {
  try { return await readJson(file); } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

function readTrustedRef(ref, file) {
  const relative = path.relative(path.join(__dirname, ".."), path.resolve(file)).replace(/\\/g, "/");
  return JSON.parse(execFileSync("git", ["show", `${ref}:${relative}`], { cwd: path.join(__dirname, ".."), encoding: "utf8" }));
}

async function checkLink(url, { fetchImpl = fetch } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    let response = await fetchImpl(url, { method: "HEAD", redirect: "follow", signal: controller.signal, headers: { "user-agent": "Sterling Ranch source release validator" } });
    const headStatus = response.status;
    let checkedWith = 'HEAD';
    // Some official routes return 404 to HEAD but serve the page normally to GET.
    if (!response.ok) {
      await response.body?.cancel();
      response = await fetchImpl(url, { method: "GET", redirect: "follow", signal: controller.signal, headers: { "user-agent": "Sterling Ranch source release validator" } });
      checkedWith = 'GET';
    }
    const result = { url, okay: response.ok, status: response.status, finalUrl: response.url, headStatus, checkedWith };
    await response.body?.cancel();
    return result;
  } catch (error) {
    return { url, okay: false, status: 0, error: error?.message || String(error) };
  } finally { clearTimeout(timer); }
}

async function validateActionLinks(result, indexes, checker = checkLink) {
  // Check both proposed and retained actions even when a separate source gate fails.
  const links = [...new Set(indexes.flatMap(index => (index.sources || [])
    .flatMap(source => source.actions || []).map(action => action.url)).filter(Boolean))];
  const checks = [];
  for (let index = 0; index < links.length; index += 8) {
    checks.push(...await Promise.all(links.slice(index, index + 8).map(url => checker(url))));
  }
  const broken = checks.filter(item => {
    if (!item.okay) return true;
    try { return new URL(item.finalUrl || item.url).protocol !== 'https:'; }
    catch { return true; }
  });
  result.linkChecks = { total: checks.length, broken };
  return broken;
}

async function main() {
  const root = path.join(__dirname, "..");
  const trustedPath = option("--trusted", path.join(root, "data", "community-index.json"));
  const candidatePath = option("--candidate", path.join(root, "data", "community-index.candidate.json"));
  const profilePath = option("--profile", path.join(root, "data", "communities", "sterling-ranch.json"));
  const reportPath = option("--report", path.join(root, "data", "community-source-report.json"));
  const decisionsPath = option("--decisions", path.join(root, "data", "community-review-decisions.json"));
  const trustedRef = option("--trusted-ref", "");
  const [trusted, rawCandidate, profileInput, reviewDecisions] = await Promise.all([
    trustedRef ? Promise.resolve(readTrustedRef(trustedRef, trustedPath)) : readJson(trustedPath),
    readJson(candidatePath),
    readJson(profilePath),
    readJsonOptional(decisionsPath, []),
  ]);
  const profile = validateCommunityProfile(profileInput);
  const compilation = compileReviewedCandidate(trusted, rawCandidate, profile, reviewDecisions);
  let candidate = compilation.candidate;
  let result = validateCommunityCandidate(trusted, candidate, profile, {
    reviewDecisions,
    requireCompleteInventory: process.argv.includes("--promote"),
    requireApprovedFacts: process.argv.includes("--promote"),
  });
  if (process.argv.includes("--check-links")) {
    const broken = await validateActionLinks(result, [rawCandidate, candidate]);
    if (broken.length && result.valid && process.argv.includes("--prune-broken-links")) {
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
  const { preparedCandidate, ...reportResult } = result;
  const report = {
    checkedAt,
    trustedFile: path.basename(trustedPath),
    candidateFile: path.basename(candidatePath),
    decisionsFile: path.basename(decisionsPath),
    ...reportResult,
    reviewQueue: {
      itemCount: compilation.items.length,
      requiredDecisionCount: compilation.coverage.required,
      matchedDecisionCount: compilation.coverage.matched,
      pendingDecisionCount: compilation.coverage.pending.length,
      escalatedDecisionCount: compilation.coverage.escalated.length,
      staleDecisionCount: compilation.staleDecisions.length,
    },
    acceptedDecisions: candidate.reviewSnapshot || [],
  };
  await fs.writeFile(path.resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (!result.valid) throw new Error(result.errors.join(" "));
  if (process.argv.includes("--promote")) {
    if (compilation.coverage.pending.length) throw new Error(`${compilation.coverage.pending.length} high-risk source review decisions are still pending.`);
    if (compilation.coverage.escalated.length) throw new Error(`${compilation.coverage.escalated.length} source changes are escalated and cannot be promoted.`);
    if (compilation.staleDecisions.length) throw new Error(`${compilation.staleDecisions.length} source review decisions are stale.`);
    candidate = result.preparedCandidate;
    candidate.promotedAt = checkedAt;
    candidate.releaseFingerprint = result.diff.candidateFingerprint;
    await fs.writeFile(path.resolve(candidatePath), `${JSON.stringify(candidate, null, 2)}\n`, "utf8");
    await fs.copyFile(path.resolve(candidatePath), path.resolve(trustedPath));
  }
  console.log(`Community candidate passed: ${JSON.stringify({ changed: result.diff.changedSourceIds.length, added: result.diff.addedSourceIds.length, removed: result.diff.removedSourceIds.length, factChanges: result.diff.factChanges.length, review: result.review })}`);
}

if (require.main === module) main().catch((error) => { console.error(`Community candidate failed: ${error.message}`); process.exitCode = 1; });
module.exports = { validateActionLinks, checkLink };

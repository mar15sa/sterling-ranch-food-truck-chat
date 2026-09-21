const { execFileSync } = require("node:child_process");
const fs = require("node:fs");

const OPENINGS_RELEASE_FILES = new Set([
  "data/openings.json",
  "data/openings-sources.json",
]);

function normalizePath(value) {
  return String(value || "").trim().replaceAll("\\", "/");
}

function classifyChangedFiles(files) {
  const changedFiles = [...new Set(files.map(normalizePath).filter(Boolean))].sort();
  const blockedFiles = changedFiles.filter((file) => !OPENINGS_RELEASE_FILES.has(file));
  return {
    changedFiles,
    blockedFiles,
    openingsOnly: changedFiles.length > 0 && blockedFiles.length === 0,
  };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

function changedFilesBetween(base, head) {
  if (!base || !head) throw new Error("Both --base and --head are required.");
  const output = execFileSync(
    "git",
    ["diff", "--name-only", "--diff-filter=ACDMRTUXB", `${base}...${head}`],
    { encoding: "utf8" },
  );
  return output.split(/\r?\n/);
}

function writeGithubOutput(result) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  fs.appendFileSync(outputPath, `openings_only=${result.openingsOnly}\n`, "utf8");
  fs.appendFileSync(outputPath, `changed_count=${result.changedFiles.length}\n`, "utf8");
  fs.appendFileSync(outputPath, `blocked_count=${result.blockedFiles.length}\n`, "utf8");
}

if (require.main === module) {
  try {
    const result = classifyChangedFiles(changedFilesBetween(argument("--base"), argument("--head")));
    writeGithubOutput(result);
    console.log(JSON.stringify(result));
    if (process.argv.includes("--require-openings-only") && !result.openingsOnly) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { OPENINGS_RELEASE_FILES, classifyChangedFiles };

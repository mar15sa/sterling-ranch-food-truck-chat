const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const bridgeUse = "uses: ./.github/actions/revalidate-approved-community-evidence";

test("the reusable bridge creates only disposable evidence and public-safe verification records", () => {
  const action = fs.readFileSync(path.join(root, ".github", "actions", "revalidate-approved-community-evidence", "action.yml"), "utf8");
  assert.match(action, /check-approved-community-revalidation\.js/);
  assert.match(action, /--temporary-output "\$RUNNER_TEMP\/community-index\.revalidated\.json"/);
  assert.match(action, /--attestation artifacts\/community-approved-revalidation-attestation\.json/);
  assert.match(action, /--review-output artifacts\/community-approved-revalidation-review\.json/);
  assert.match(action, /--baseline "\$baseline"/);
  assert.match(action, /github\.event\.pull_request\.base\.sha/);
  assert.match(action, /COMMUNITY_EVIDENCE_INDEX=\$RUNNER_TEMP\/community-index\.revalidated\.json/);
  assert.doesNotMatch(action, /data\/community-index\.json\s*>/);
});

test("every workflow quality caller establishes temporary evidence before checking it", () => {
  const callers = ["ci.yml", "rules-answer-quality-monitor.yml", "rules-supplement-proposals.yml", "community-source-release.yml"];
  for (const filename of callers) {
    const workflow = fs.readFileSync(path.join(root, ".github", "workflows", filename), "utf8");
    const bridge = workflow.indexOf(bridgeUse);
    const check = workflow.indexOf("npm run check");
    assert.ok(bridge >= 0 && check > bridge, `${filename} must use temporary evidence before npm run check`);
    assert.match(workflow, /fetch-depth: 0/, `${filename} must retain a baseline for unavailable-evidence checks`);
  }
  const ci = fs.readFileSync(path.join(root, ".github", "workflows", "ci.yml"), "utf8");
  assert.match(ci, /fetch-depth: 0/);
  assert.equal(ci.includes("approved-evidence-revalidation:"), false, "no parallel stale-index quality job remains");
  assert.match(ci, /if: always\(\)/);
  assert.match(ci, /retention-days: 30/);
  for (const script of ["scripts/check-community-sources.js", "scripts/eval-community-assistant.js", "scripts/check-community-retrieval.js"]) {
    assert.match(fs.readFileSync(path.join(root, script), "utf8"), /COMMUNITY_EVIDENCE_INDEX/);
  }
});

test("scheduled source operations retain a baseline for safe temporary quarantine and still publish the review record", () => {
  const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "community-source-operations-report.yml"), "utf8");
  assert.match(workflow, /fetch-depth: 0/);
  assert.match(workflow, /git show HEAD\^:data\/community-index\.json/);
  assert.match(workflow, /--baseline "\$baseline"/);
  assert.match(workflow, /continue-on-error: true/);
});

test("no workflow can call the local source gate before the reusable bridge", () => {
  const workflowDir = path.join(root, ".github", "workflows");
  for (const filename of fs.readdirSync(workflowDir).filter(name => name.endsWith(".yml"))) {
    const workflow = fs.readFileSync(path.join(workflowDir, filename), "utf8");
    const bridge = workflow.indexOf(bridgeUse);
    for (const marker of ["npm run check", "node scripts/check-community-sources", "npm run community:check"]) {
      const position = workflow.indexOf(marker);
      if (position >= 0) assert.ok(bridge >= 0 && bridge < position,
        `${filename} must establish temporary evidence before ${marker}`);
    }
  }
});

test("source release validates its prepared candidate before revalidating that promoted candidate", () => {
  const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "community-source-release.yml"), "utf8");
  const candidate = workflow.indexOf("npm run community:candidate");
  const bridge = workflow.indexOf(bridgeUse);
  const check = workflow.indexOf("npm run check");
  assert.ok(candidate >= 0 && bridge > candidate && check > bridge,
    "candidate validation must complete before its temporary revalidation and quality check");
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("the required quality job revalidates before its comprehensive check uses temporary evidence", () => {
  const workflow = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "ci.yml"), "utf8");
  const quality = workflow.slice(workflow.indexOf("  quality:"));
  const bridge = quality.indexOf("check-approved-community-revalidation.js");
  const environment = quality.indexOf("COMMUNITY_EVIDENCE_INDEX=$RUNNER_TEMP/community-index.revalidated.json");
  const check = quality.indexOf("npm run check");
  assert.ok(bridge >= 0 && environment > bridge && check > environment, "quality must establish temporary evidence before npm run check");
  assert.equal(workflow.includes("approved-evidence-revalidation:"), false, "no parallel stale-index quality job remains");
  assert.match(quality, /if: always\(\)/);
  assert.match(quality, /retention-days: 30/);
  for (const script of ["scripts/check-community-sources.js", "scripts/eval-community-assistant.js", "scripts/check-community-retrieval.js"]) {
    assert.match(fs.readFileSync(path.join(__dirname, "..", script), "utf8"), /COMMUNITY_EVIDENCE_INDEX/);
  }
});

test("the scheduled quality monitor uses the same disposable evidence bridge before npm run check", () => {
  const workflow = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "rules-answer-quality-monitor.yml"), "utf8");
  const bridge = workflow.indexOf("check-approved-community-revalidation.js");
  const temporaryOutput = workflow.indexOf('--temporary-output "$RUNNER_TEMP/community-index.revalidated.json"');
  const attestation = workflow.indexOf("--attestation artifacts/community-approved-revalidation-attestation.json");
  const review = workflow.indexOf("--review-output artifacts/community-approved-revalidation-review.json");
  const environment = workflow.indexOf("COMMUNITY_EVIDENCE_INDEX=$RUNNER_TEMP/community-index.revalidated.json");
  const check = workflow.indexOf("npm run check");
  assert.ok(bridge >= 0 && temporaryOutput > bridge && attestation > temporaryOutput && review > attestation,
    "monitor must create the protected revalidation outputs");
  assert.ok(check > environment && environment > review,
    "monitor must export its temporary evidence before npm run check");
});

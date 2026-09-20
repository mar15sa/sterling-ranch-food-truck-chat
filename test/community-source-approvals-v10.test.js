const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildReviewedSources } = require("../lib/community-reviewed-package");
const { canonicalProjectionEntries } = require("../lib/community-source-answerability");

const root = path.join(__dirname, "..");
const approvals = require("../data/community-source-approvals-v10.json");
const ledger = require("../data/canonical-source-ledger.json");

test("September 17 owner approval includes Parkvale and preserves the helpful trash details", () => {
  const source = buildReviewedSources(approvals).find((item) => item.id === "approved-trash-recurring-service");
  assert.match(source.text, /Thursday in Prospect and Parkvale/i);
  assert.match(source.text, /7 a\.m\./i);
  assert.match(source.text, /screened location/i);
  assert.match(source.text, /Thanksgiving/i);
  assert.ok(source.actions.some((action) => /concern form/i.test(action.label)));
  assert.ok(source.actions.some((action) => /WasteConnect/i.test(action.label)));
  assert.equal(canonicalProjectionEntries(source, { communityId: approvals.communityId, canonicalSourceLedger: ledger }).length, 5);
});

test("recycling visual remains approved on the current Trash page version", () => {
  const source = buildReviewedSources(approvals).find((item) => item.id === "approved-recycling-tips-visual-link");
  assert.equal(source.actions[0].url, "https://sterlingranchcab.com/DocumentCenter/View/168/Waste-Connection-Recycling-Tips-PDF");
  assert.equal(canonicalProjectionEntries(source, { communityId: approvals.communityId, canonicalSourceLedger: ledger }).length, 1);
});

test("Architectural projection retains the helpful role and removes the former generic email", () => {
  const source = buildReviewedSources(approvals).find((item) => item.id === "approved-complete-cab-review-20260914-dc4ed3f4a876");
  assert.match(source.text, /here to help residents navigate the requirements/i);
  assert.doesNotMatch(JSON.stringify(source), /info@sterlingranchcab\.com/i);
  const index = JSON.parse(fs.readFileSync(path.join(root, "data", "community-index.json"), "utf8"));
  const designReview = index.sources.find((item) => item.id === "approved-drc-contact-current");
  assert.match(JSON.stringify(designReview), /ResidentSubmit@SterlingRanchCAB\.com/i);
});

test("runtime index keeps only scoped projections for the two reapproved pages", () => {
  const index = JSON.parse(fs.readFileSync(path.join(root, "data", "community-index.json"), "utf8"));
  const trash = index.sources.filter((source) => source.sourceUrl === "https://sterlingranchcab.com/247/Trash-Recycling");
  assert.deepEqual(trash.map((source) => source.id).sort(), [
    "approved-recycling-tips-visual-link",
    "approved-trash-recurring-service",
  ]);
  const architectural = index.sources.filter((source) => source.sourceUrl === "https://sterlingranchcab.com/198/Architectural-Community-Standards");
  assert.deepEqual(architectural.map((source) => source.id), ["approved-complete-cab-review-20260914-dc4ed3f4a876"]);
});

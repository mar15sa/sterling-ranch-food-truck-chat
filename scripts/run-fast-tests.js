const path = require("node:path");

// This is an early warning layer, not the release gate. The complete test and
// evaluation suite still runs in the required `quality` job before merge.
const fastTestFiles = [
  "automated-test-labeling.test.js",
  "community-ci-revalidation-workflow.test.js",
  "community-source-status.test.js",
  "deployment-health-check.test.js",
  "http-security.test.js",
  "rules-verdict.test.js",
  "source-change-detection.test.js",
];

for (const file of fastTestFiles) require(path.join(__dirname, "..", "test", file));

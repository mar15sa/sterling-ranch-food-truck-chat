const fs = require("node:fs");
const path = require("node:path");

// Loading the files in one process avoids Node's per-file subprocess mode,
// keeps the suite compatible with Node 20, and still uses the built-in runner.
const testDirectory = path.join(__dirname, "..", "test");
for (const file of fs.readdirSync(testDirectory).filter((name) => name.endsWith(".test.js")).sort()) {
  require(path.join(testDirectory, file));
}

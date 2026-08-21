const assert = require("node:assert/strict");
const cases = require("./rules-unseen-eval-cases.json");
const { answerRulesQuestion } = require("../lib/rules-assistant");

async function main() {
  const rows = [];
  for (const item of cases) {
    const result = await answerRulesQuestion(item.question, {
      searchMode: "legacy",
      llmMode: "off",
    });
    if (item.verdict) assert.equal(result.answerVerdict, item.verdict, item.question);
    if (item.answerMode) assert.equal(result.answerMode, item.answerMode, item.question);
    for (const phrase of item.mustInclude || []) {
      assert.match(result.answer, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), item.question);
    }
    for (const phrase of item.mustExclude || []) {
      assert.doesNotMatch(result.answer, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), item.question);
    }
    rows.push({ family: item.family, verdict: result.answerVerdict, mode: result.answerMode, passed: true });
  }
  console.table(rows);
  console.log(`Unseen rules evaluation passed ${rows.length}/${cases.length} cases.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

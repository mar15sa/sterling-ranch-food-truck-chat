const test = require("node:test");
const assert = require("node:assert/strict");
const { emitGitHubWarning, formatReport, summarizeSpend } = require("../scripts/report-eval-spend");

test("spend warning sums small calls across the entire evaluation", () => {
  const report = summarizeSpend({ runs: Array.from({ length: 3 }, () => ({ usage: { model: 'claude-haiku-4-5', inputTokens: 100000, outputTokens: 0 } })) });
  assert.equal(report.warning, true);
  assert.ok(Math.abs(report.estimatedUsd - 0.3) < 0.000001);
});

test("spend helper accepts evaluator runs and estimates only known Haiku 4.5 aliases", () => {
  const report = summarizeSpend({ runs: [
    { response: { model: "claude-haiku-4-5", usage: { inputTokens: 200000, outputTokens: 10000 } } },
    { response: { model: "claude-haiku-4-5-20251001", usage: { input_tokens: 1000, output_tokens: 1000 } } },
  ] });
  assert.equal(report.estimatedUsd, 0.256);
  assert.equal(report.warning, true);
  assert.equal(report.warningBasis, "estimated-usd-per-run");
  assert.match(formatReport(report), /estimate only; not actual billing/);
});

test("unknown models use token or request warnings instead of invented prices", () => {
  const report = summarizeSpend({ responses: [{ usage: { inputTokens: 12, outputTokens: 8, requestCount: 5, model: "future-model" } }] }, {
    tokenWarning: 1000, requestWarning: 5,
  });
  assert.equal(report.estimated, false);
  assert.equal(report.warning, true);
  assert.equal(report.warningBasis, "usage-fallback");
  const messages = [];
  assert.equal(emitGitHubWarning(report, (message) => messages.push(message)), true);
  assert.match(messages[0], /^::warning title=Evaluation spend warning::/);
});

test("spend helper does not emit an annotation below its fallback threshold", () => {
  const report = summarizeSpend({ inputTokens: 1, outputTokens: 1, requestCount: 1, model: "unknown" });
  assert.equal(report.warning, false);
  assert.equal(emitGitHubWarning(report, () => assert.fail("should not warn")), false);
});

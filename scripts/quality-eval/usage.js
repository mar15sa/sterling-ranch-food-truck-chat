"use strict";
// Standard, non-batch rates checked 2026-09-14. Unknown models/usage remain unknown.
const RATES = Object.freeze({
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite5m: 1.25, cacheWrite1h: 2 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5, cacheRead: 0.1, cacheWrite5m: 1.25, cacheWrite1h: 2 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite5m: 2.5, cacheWrite1h: 4 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite5m: 6.25, cacheWrite1h: 10 }
});
function count(value) { return Number.isFinite(value) && value >= 0 ? value : null; }
function priceUsage(model, raw, rates = RATES) {
  const r = rates[model];
  if (!raw || !r) return { estimatedUsd: null, reason: !raw ? "missing-usage" : "unknown-rate" };
  const input = count(raw.input_tokens), output = count(raw.output_tokens);
  if (input === null || output === null) return { estimatedUsd: null, reason: "incomplete-usage" };
  const read = count(raw.cache_read_input_tokens ?? 0), write = count(raw.cache_creation_input_tokens ?? 0);
  if (read === null || write === null) return { estimatedUsd: null, reason: "invalid-cache-usage" };
  let cacheUsd = 0;
  if (read) {
    if (r.cacheRead === undefined) return { estimatedUsd: null, reason: "unknown-cache-rate" };
    cacheUsd += read * r.cacheRead;
  }
  if (write) {
    const five = count(raw.cache_creation?.ephemeral_5m_input_tokens ?? 0);
    const hour = count(raw.cache_creation?.ephemeral_1h_input_tokens ?? 0);
    if (five === null || hour === null || five + hour !== write || r.cacheWrite5m === undefined || r.cacheWrite1h === undefined)
      return { estimatedUsd: null, reason: "unknown-cache-write-breakdown-or-rate" };
    cacheUsd += five * r.cacheWrite5m + hour * r.cacheWrite1h;
  }
  return { estimatedUsd: (input * r.input + output * r.output + cacheUsd) / 1e6,
    inputTokens: input, outputTokens: output, cacheReadTokens: read, cacheWriteTokens: write, reason: null };
}
function summarize(rows) {
  const stages = {};
  for (const row of rows) {
    const key = row.stage || "unclassified";
    const stage = stages[key] ||= { calls: 0, measuredCostSubtotalUsd: 0, unknownCostCalls: 0, inputTokens: 0, outputTokens: 0 };
    stage.calls++;
    const p = priceUsage(row.model, row.usage);
    if (p.estimatedUsd === null) stage.unknownCostCalls++;
    else { stage.measuredCostSubtotalUsd += p.estimatedUsd; stage.inputTokens += p.inputTokens; stage.outputTokens += p.outputTokens; }
  }
  const unknownCostCalls = Object.values(stages).reduce((n,s) => n+s.unknownCostCalls,0);
  const measuredCostSubtotalUsd = Object.values(stages).reduce((n,s) => n+s.measuredCostSubtotalUsd,0);
  return { calls: rows.length, unknownCostCalls, measuredCostSubtotalUsd,
    estimatedTotalUsd: unknownCostCalls ? null : measuredCostSubtotalUsd, stages, billingEvidence: "Provider token counts priced at dated standard rates; not invoice data." };
}
function ensureAllowedModel(model) {
  if (/fable|astra/i.test(model)) throw new Error("Model excluded by owner");
  if (!Object.hasOwn(RATES, model)) throw new Error("Pilot model must have an explicit supported rate");
}
module.exports = { RATES, priceUsage, summarize, ensureAllowedModel };

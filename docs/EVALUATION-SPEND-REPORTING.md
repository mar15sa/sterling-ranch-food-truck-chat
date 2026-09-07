# Evaluation spend reporting

`scripts/report-eval-spend.js` is an optional helper for an evaluator to call after it has counted model input tokens, output tokens, and requests. It makes no provider calls, sends no messages, and never blocks an evaluation.

For `claude-haiku-4-5` and `claude-haiku-4-5-20251001`, the helper uses the confirmed $1 input / $5 output per million-token rates. Other model names are intentionally unpriced unless the caller supplies confirmed rates. The report always labels its dollar figure as an **estimate**, never as actual billing.

```text
node scripts/report-eval-spend.js --input-tokens 1200 --output-tokens 400 --request-count 12 \
  --input-usd-per-million <confirmed-rate> --output-usd-per-million <confirmed-rate> \
  --warning-usd 1.00
```

The same fields may be supplied as `EVAL_INPUT_TOKENS`, `EVAL_OUTPUT_TOKENS`, `EVAL_REQUEST_COUNT`, `EVAL_INPUT_USD_PER_MILLION`, `EVAL_OUTPUT_USD_PER_MILLION`, and `EVAL_SPEND_WARNING_USD`.

The default estimate warning is $0.25 per run; adjust it with `EVAL_SPEND_WARNING_USD`. If a rate is unknown, the helper does not invent a dollar estimate. It instead warns at 100,000 total tokens or 100 requests by default; adjust these with `EVAL_TOKEN_WARNING` and `EVAL_REQUEST_WARNING`. The exported `summarizeSpend` accepts either one `{ inputTokens, outputTokens, requestCount, model }` object or `{ runs }` / `{ responses }` where each item contains a response `usage` object. When a warning happens inside GitHub Actions, it emits a GitHub warning annotation and appends the report to `GITHUB_STEP_SUMMARY`. The helper is intentionally not wired into an evaluator or workflow yet.

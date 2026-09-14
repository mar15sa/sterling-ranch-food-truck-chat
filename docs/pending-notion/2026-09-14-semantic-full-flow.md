# Pending full-flow semantic comparison update

Status: local experiment implemented and completed; no runtime release. Pending because automatic approval review previously rejected the external Notion documentation write containing internal experiment/status information; owner confirmation to retry remains absent. Preserve that boundary.

Targets: [Decisions](https://www.notion.so/3dabf909186d8139ac52ebdbf77d8bea), answer-quality/model experiment section; [Documentation audit](https://www.notion.so/3dabf909186d81a2a090c2cb90183e96), dated diagnostic checkpoint. Fetch before any permitted edit and afterward to verify. No flow-diagram update required: resident runtime is unchanged by this experimental runner.

Exact proposed text:

> September 14, 2026, 22:27 UTC: the local full-flow semantic comparison completed 48 trials (eight authored document questions, two repetitions, three arms) using 66 model requests. The candidates use Haiku interpretation, local semantic-plus-keyword rule search and either Haiku or Sonnet writing. All eight candidate pergola trials retrieved and used the specific governing subsection missing from earlier keyword packets. Both writers still overstate some evidence, and both exceed the proposed 10-second p95 target. Neither is selected for release; independent human usefulness/excellence rates remain unknown.
>
> Captured answering costs per 1,000 questions were $1.01 for current-local, $11.92 for the Haiku candidate and $28.17 for the Sonnet candidate. Candidate p95 times were 14.40 and 14.05 seconds. These figures are small-sample token-priced estimates with shared local caches, not production invoices. Source maintenance, hosting and background grading are excluded and still unpriced. Total test cost was $0.657535, with no unknown usage; conservative reservation was $1.819969 of a new $3 test ceiling. No subscription or paid embedding call was introduced. Local model initialization took 1.146 seconds before trials; per-question search is included in answer latency.
>
> The next work is faithful evidence use, including exceptions and exact-form limitations, followed by live-adapter integration and representative human-calibrated validation. Eighteen focused integration/source tests and the comparison-summary test passed. Experimental revision f126d6ef91666f7dea095c8e3b16e14a9e19547c; not published or verified live.

Supporting report: `docs/COMMUNITY-SEMANTIC-FULL-FLOW-COMPARISON.md`. Captures: `artifacts/quality-eval/semantic-full-flow-20260914/manifest.json` and `comparison.json`. Do not publish resident records or infer production status from this local capture.

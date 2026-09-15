# Writer comparison: better presentation is not enough

Completed September 15, 2026 UTC / September 14 Denver. Experimental capture revision `9c2428604ddd118af6a77034211012c555fbd077`. All 96 planned calls completed; process 23951 exited 0. No model or resident release selected.

The presentation change helps with a specific problem: separating assistant context from source facts lets Sonnet label observation times correctly. It does not reliably prevent unsupported source claims or preserve rule qualifications. A faster or structurally valid answer is not sufficient evidence of usefulness.

## What was compared

Eight known authored cases, two repetitions, two eligible writers (Haiku 4.5 and Sonnet 5), and three arms. Control uses the original dynamic action schema. Stable changes only that schema. Combined adds separate evidence context, local observation times and corresponding instructions. Each case uses the same complete historical evidence, interpretation, actions and source clock in all arms. No evidence selection, retrieval refresh, acceptance model or repair call occurs. The randomized design and request hashes were frozen before calls.

These are development cases, not unseen resident acceptance or blind human calibration. Repetitions are not independent question families. The summarizer verifies balanced groups and request identity against the frozen design and saved calls. All failures remain in the denominator. `review-<case>.json` files expose model labels and are explicitly for development inspection.

## Cost and speed

All costs below price provider-reported tokens at the dated standard rates in `scripts/quality-eval/usage.js`. They are estimates of model usage, not invoices. Thinking was disabled; cache read/write tokens were zero.

| Writer / presentation | Calls | Input / output tokens | Cost for these calls | Per 1,000 writer calls | Median / sample p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Haiku / control | 16 | 150,500 / 3,985 | $0.170425 | $10.65 | 4.24 / 23.87 s |
| Haiku / stable | 16 | 144,336 / 3,801 | $0.163341 | $10.21 | 3.78 / 5.70 s |
| Haiku / combined | 16 | 148,694 / 3,959 | $0.168489 | $10.53 | 3.75 / 5.81 s |
| Sonnet / control | 16 | 202,220 / 6,292 | $0.467360 | $29.21 | 5.72 / 8.00 s |
| Sonnet / stable | 16 | 195,560 / 6,709 | $0.458210 | $28.64 | 5.99 / 10.47 s |
| Sonnet / combined | 16 | 201,786 / 6,708 | $0.470652 | $29.42 | 6.07 / 7.92 s |

Total: **96 calls, 1,043,096 input tokens, 31,454 output tokens, $1.898477**, zero unknown-usage calls. The separate $5 phase reserved $4.926744 before starting; reservation is not spending. It is now closed, with no further calls planned in this phase. The previous phase remains separately closed at $1.822022 known usage and $4.929376 reserved; do not double count its component experiments.

At 1,000 / 10,000 / 50,000 monthly writer calls with this same case mix, combined Haiku would be approximately **$10.53 / $105.31 / $526.53**, and combined Sonnet **$29.42 / $294.16 / $1,470.79**. This is only the writing component, not a proposed monthly commitment. Interpretation, selection, checking, repairs, source refresh and hosting still need a matched full-flow measurement. The control here is the existing experimental writer input, not the current production assistant. The earlier mixed full-flow baseline and its limitations remain in `COMMUNITY-MIXED-FLOW-EXPERIMENT.md`; the two tables cannot be compared as equivalent workloads.

With 16 samples per arm, the reported sample p95 is the maximum. Haiku's four first-seen control schemas had a median of 11.62 s; its 12 later control calls had a median of 3.89 s and maximum 5.32 s. Stable/combined share a schema. This supports investigating schema reuse, but does not prove the causal size of a cold-cache improvement: provider grammar-cache state is unobservable, and some schemas were used before this run. Schema caching is separate from billable prompt-cache tokens.

## Source-checked findings

These are specific development observations, not a complete usefulness score. Raw output and source text are retained in the capture directory.

| Family | Observation |
| --- | --- |
| Food/menu | All 12 answers name the captured scheduled truck correctly, but all make a broader claim that the official calendar/information does not contain menu details. The packet establishes only that this adapter did not establish a menu. Combined presentation does not eliminate this error. Control 060 and stable 081 explicitly attribute the adapter's limitation to the official listing. |
| Pool/hours | All 12 preserve closed status and regular hours. Both combined Sonnet answers (056, 062) correctly label the captured check as 5:33 PM MDT. Stable 002 states an off-season cause, and 067 contrasts it with a temporary outage, beyond the observed closed status. The combined versions qualify the relationship as consistent with the season. |
| Shed/form | Sonnet 008, 021, 048 and 063 change the source's exact 4:12 roof-pitch condition to “at least” 4:12. Haiku 003, 069 and 095 omit the restricted-lot exception while describing the height exception. Neither model consistently identifies the exact-form gap; a directory link alone does not identify which form applies. |
| Lighting process | Haiku 012, 058 and 091 omit required fixture cut sheets; all six Haiku answers omit the under-eave elevations/termination-point requirement despite discussing those systems. Sonnet includes more preparation detail. Stable 007 leaks tool markup and is rejected. Seasonal operation and permanent installation must remain distinct. |
| Recycling/storage | All 12 give the captured September 15 pickup date. Sonnet combined 027 supplies the correctly labeled local observation time and the 4 a.m. earliest-setout/approved-storage qualifications. Its repeat 042 adds enclosure construction details while omitting those qualifications. Haiku's location suggestions also need checking against the approval conditions; the same pickup-date success does not establish storage completeness. |
| Generic application | The approved directory is a relevant answer to the generic location question. Do not reject it merely because it is not an exact project-specific form. Haiku combined 068 and 087 oddly tell the resident to download the “completed” application; this is a wording defect, not evidence that the form is prefilled. |
| Pergola/form | All 12 answer approval and height. Only Sonnet 044 and 077 explicitly acknowledge that the exact form is not identified. Haiku 092 calls it the “pergola application form” without an approved exact-form source. |
| Hot tub/pergola | Both topics are covered in all 12. Sonnet control 055 adds that applications can typically be combined in one package, without that process fact in the packet. Stable 090 leaks tool markup and is rejected. General approval guidance is not property-specific permission. |

Source anchors: shed `e-7b2c9be32a0ab2e2a28c`; lighting `e-e78384f5b9789b5b35db`; bin-storage rule `e-21c6586da8972ac3504a`; food adapter `e-3cb6f8bbc738d0df351f`; hot-tub rule `e-01bb0cf3723caec7538f`. Compare each anchor in its own `<case>-input.json`, preserving the historical source version. These source observations do not approve new community facts or provide current resident advice.

Structural validation accepted 94/96: the two Sonnet stable markup failures were retained. Zero unknown action IDs occurred. Those figures are not accuracy or usefulness percentages. Action IDs can be valid while the prose overstates what a linked page establishes. Twenty-eight answers exceeded 180 whitespace-delimited words; length alone is not a grade.

## Decision and next work

Do not adopt either writer or claim a significant quality improvement from this test. Retain the optional presentation change as an experiment, with no default change. Separate stage selection remains appropriate: Haiku's lower cost is real in this sample, while Sonnet's extra detail is sometimes useful and sometimes wrong.

The next bounded implementation should make each requested outcome explicit before drafting: supported facts, necessary conditions, unresolved gaps and the actions actually established. Preserve source references and exact qualification text, then check the resulting prose against those obligations. Reuse the existing acceptance experiments instead of adding an unmeasured chain of calls. Evaluate this as a shared mechanism across rules, live status and processes; do not add canned answers for these eight questions. A vector database cannot fix a writer changing evidence it already received.

Next validation must include source failures, follow-ups, broader families, full-flow latency and cost, and owner calibration. Keep the eventual unseen acceptance set separate from these development examples. Consistent demo excellence remains unverified. No deployment, source approval, recurring service or new subscription occurred.

Documentation impact: experimental decision/audit results and the differentiation assessment. Exact Notion update is pending in `docs/pending-notion/2026-09-15-writer-comparison-results.md`; the prior external-write rejection remains unresolved. Resident flow and diagram are unchanged.

Reproduce offline: `node scripts/quality-eval/summarize-presentation.js artifacts/quality-eval/writer-presentation-comparison-20260915`. Primary evidence: `manifest.json`, `calls.jsonl`, `comparison.json`, and all per-trial and per-case files in that directory.

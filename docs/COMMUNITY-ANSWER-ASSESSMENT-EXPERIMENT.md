# Independent answer assessment experiment

Planned and run September 14, 2026. Experimental only; no resident route, log rating or model selection changes.

The current rating can accept answer metadata as evidence of success even when the answer changes the subject, supplies a neighboring action, misses a requested part or loses conversation context. The proposed shared request/evidence gate must examine the original question, resident-only context, actual answer and eligible evidence together. This experiment checks whether a small separate model detects those failures and distinguishes them from useful clarification or an unavailable optional extra.

Compare the current deterministic scorer with Haiku 4.5 and Sonnet 5 on paired synthetic diagnostic answers, twice per model. These examples contain invented fixture facts, not resident records or live community guidance. Keep expected failure labels and old ratings out of the model request. Capture full provider token usage, model, latency, prompt and raw output. Limit this pilot to a $1 conservative request reservation; stop on budget or provider errors. No subscription or deployment is part of the test.

The experimental assessment separates subject/outcome coverage and evidence correctness from readability, specificity, proactiveness and concision. Wrong-topic answers, unsupported material claims, wrong actions and missing core answers cannot be rescued by fluent writing. A current code-path confidence/completion flag is not evidence. A missing optional menu cannot erase a verified truck/date answer. Prior generated assistant answers are not source facts.

A structural validator checks the complete response contract, legal enum/score values, source references and consistency between an asserted complete outcome and uncovered needs. Failed, inconsistent or unavailable assessment is explicitly unassessed. It must not default to Resolved. No assessment is used to approve a source, promote a claim or certify itself.

This pilot can reject a poor candidate or demonstrate diagnostic promise. It cannot establish human agreement, independent calibration, useful/excellent rates, production latency or full-answer cost. If promising, compare on human-reviewed examples and test integration with all coordinator/fallback exits before choosing a model or changing historical/live ratings. Runtime adoption must preserve community/source authority and test labels and update the Notion answer-flow diagram; this experiment has no runtime-flow effect.

## Captured results

The first run used ten deliberately constructed examples, two repetitions per model. Six examples intentionally fail the request; four are supported answers or useful clarifications. The current deterministic scorer rated five of the six failures Good or Excellent, rated an exact requested form action Weak, and labeled both necessary and unnecessary clarifications Resolved. These counts diagnose specific rating defects; they are not an estimate of the resident failure rate.

| Initial v1 assessment | Haiku 4.5 | Sonnet 5 |
| --- | ---: | ---: |
| Calls | 20 | 20 |
| Structurally valid assessments | 20 | 17 |
| Deliberately bad answer trials rejected | 12 / 12 | 9 / 12 |
| Bad answer trials incorrectly allowed | 0 | 0 |
| Unassessed trials | 0 | 3 |
| Useful response trials incorrectly rejected | 2 / 8 | 0 / 8 |
| Median / p95 assessment duration | 5.12 / 5.87 seconds | 5.20 / 6.83 seconds |
| Provider input / output tokens | 36,582 / 9,413 | 44,956 / 9,920 |
| Token-priced run cost | $0.083647 | $0.189112 |

Haiku's two false rejections were the same necessary clarification. It correctly recognized the ambiguity but penalized the missing final fact. Sonnet returned two arrays encoded as strings and one invalid failure enum; all three remain explicitly unassessed. An eloquent explanation cannot replace a usable assessment contract.

Revision v2 clarified that the assessment describes the delivered answer, that a necessary clarification can be the right next step, and that extra guesses are not required for proactivity. It also enabled the provider's [strict tool schema](https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use), while retaining independent structural and consistency validation. Strict shape does not establish correct judgment.

The refinement reran only the three affected diagnostic cases (ambiguous question answered with a guessed subject, necessary clarification, and missing requested part), twice per model. All twelve outputs were valid. Each model rejected all four negative trials and accepted both necessary-clarification trials. This is a targeted repair check, not a full rerun, unseen holdout, human calibration or model selection.

| Targeted v2 assessment | Haiku 4.5 | Sonnet 5 |
| --- | ---: | ---: |
| Calls | 6 | 6 |
| Valid / diagnostic expectations met | 6 / 6 | 6 / 6 |
| Median / p95 duration | 4.40 / 14.56 seconds | 6.12 / 10.57 seconds |
| Provider input / output tokens | 11,562 / 2,349 | 14,324 / 3,050 |
| Token-priced run cost | $0.023307 | $0.059148 |

With only six calls per model, p95 here is the maximum observed call. A cold schema might affect latency, but this experiment did not isolate that cause. The detailed assessor is too slow to assume it belongs on every resident's answer path. The next experiment should compare a short correctness/coverage check, leaving detailed quality grading as a candidate background operation. No background architecture has yet been adopted.

## Incremental grading cost only

The current deterministic rating makes no extra model request, so its incremental assessment API cost is $0. These experimental model costs are additions to answering costs, not complete current-versus-proposed system estimates. Initial v1 was the broader ten-case sample; v2's three-case mix differs and cannot establish a price improvement.

| Initial pilot estimate | Current deterministic rating | Haiku 4.5 | Sonnet 5 |
| --- | ---: | ---: | ---: |
| One assessment | $0 extra API | $0.00418 | $0.00946 |
| 1,000 assessed answers / month | $0 extra API | $4.18 | $9.46 |
| 10,000 assessed answers / month | $0 extra API | $41.82 | $94.56 |
| 50,000 assessed answers / month | $0 extra API | $209.12 | $472.78 |

The targeted v2 estimates are $3.88 and $9.86 per 1,000 assessments respectively. Scenarios assume one assessment per answer, the measured fixture token mix and no retries. They exclude answer planning/composition, repairs, embedding/indexing, storage and hosting. All requests disabled thinking; captured usage is input/output, with no separate reasoning-token bill. Rates are dated September 14, 2026 and use the [provider pricing schedule](https://platform.claude.com/docs/en/about-claude/pricing): Haiku $1/$5 and Sonnet 5 $2/$10 per million input/output tokens. These are provider token counts priced at standard rates, not invoice reconciliation.

Across both completed runs: 52 calls, $0.355214 token-priced cost, zero unknown-usage calls. Combined conservative reservation was $0.874924, below the $1 experiment boundary. No new subscription, source approval, resident traffic, rating migration or release occurred.

## Reproduction and next work

Captured requests exclude expected labels, old ratings and response confidence/completion flags. The manifest records fixture, prompt and schema hashes; raw provider outputs and per-attempt usage are retained locally without credentials. Original results are preserved. Revalidation after strengthening the local source-reference checks changed none of the 52 recorded dispositions. Ten focused assessment/usage/budget tests pass. These are experiment-tool checks; the last runtime suite remains the separately recorded 846-test search-identity run.

Evidence directories: `artifacts/quality-eval/answer-assessment-pilot-20260914` (v1, 40 calls) and `artifacts/quality-eval/answer-assessment-refinement-20260914` (v2, 12 calls). Each has `manifest.json`, `comparison.json`, individual responses and a model-anonymous review file. The latter is prepared material, not evidence that a person reviewed it.

Outstanding: shorter pre-answer acceptance checks; all-fallback integration; complete answer cost/latency comparisons; representative unseen cases; independent human scoring and agreement; scoped form/action source review. Existing Notion approval-review rejection remains in force, so the precise documentation update is saved in `docs/pending-notion/2026-09-14-answer-assessment.md` pending owner confirmation. This experiment changes no resident runtime flow, so it requires no new runtime diagram.

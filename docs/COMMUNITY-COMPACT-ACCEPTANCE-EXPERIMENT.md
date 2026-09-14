# Short answer acceptance experiment

Proposed September 14, 2026, before implementation. Experimental only; no resident behavior or model selection changes.

Completed the same day: 60 diagnostic calls. The findings below do not establish demo readiness.

## Problem and root cause

The coordinator can accept a nearby answer despite a correct interpretation, and the current log scorer often trusts completion metadata. The detailed independent assessment detects several failures but adds roughly four to six seconds in the initial pilot, with a targeted trial over fourteen seconds. Resident answer acceptance needs to protect meaning and evidence without requiring a separate essay about writing quality on every request.

## Candidate and comparison

Compare a compact Haiku 4.5 versus Sonnet 5 acceptance contract on the same ten synthetic diagnostic answers, twice each, plus additional source/partial-answer controls. Retain need-by-need coverage, supporting source IDs, delivered outcome and critical failures; omit presentation scores and long explanations. Keep the original question and resident-only context. Exclude old confidence/rating/completion flags and expected labels. Require the provider's strict schema and local semantic-consistency validation. Invalid or unavailable checks remain unassessed.

This is a narrower function, not a drop-in quality grader. An honest partial answer must identify every remaining source gap; it cannot be called complete. A necessary clarification is useful but unresolved. Optional extras are not required. Do not substitute requested objects, roles, actions or subjects. An AI cannot approve a source: runtime adoption still requires deterministic community, source role, scope, version and freshness enforcement before and after selection. The experimental supplied-evidence fixtures do not replace those existing gates.

Use the existing provider account, no subscription, at most $1 conservative reservation for this comparison. Measure every call's input/output tokens and latency, including failed/truncated outputs. Preserve original detailed-pilot results rather than changing their labels. Synthetic expected outcomes are diagnostic, not independent human quality judgments. Do not select a model based on this small sample.

## Required controls and next boundary

Keep supported answers, useful clarification, optional missing extras, requested forms, compound requests, role substitution, prior context and hostile source instructions. Add honest missing-evidence and partial answers, stale/unapproved evidence and a plausible but unsupported linked action. Verify malformed output cannot authorize an answer, complete cannot have uncovered needs, unknown source IDs fail validation, and missing requested parts cannot be rescued by writing quality.

Runtime integration is a later measured change, covering all normal and fallback exits and two community profiles. Before adoption, measure full-answer quality, costs and p95 latency with bounded repair/timeout behavior. No full-flow cost or latency claim can be inferred by summing these independently run medians. This experiment alone changes no answer-flow diagram. Save the precise Notion checkpoint locally while the earlier external-update confirmation remains pending.

## Results

Fifteen synthetic examples: nine intentionally flawed answers, six useful answers/clarifications/disclosed source gaps. Two repetitions per model; 60 calls total. Expected labels were not sent to either model. They were authored for diagnosis, not independently judged by a person.

| Compact v1 | Haiku 4.5 | Sonnet 5 |
| --- | ---: | ---: |
| Calls | 30 | 30 |
| Valid assessments | 26 | 27 |
| Flawed trials explicitly rejected | 14 / 18 | 15 / 18 |
| Flawed trials left unassessed | 4 / 18 | 3 / 18 |
| Flawed trials incorrectly allowed | 0 | 0 |
| Useful trials incorrectly rejected | 4 / 12 | 0 / 12 |
| Median / p95 check duration | 1.95 / 3.07 seconds | 2.26 / 2.84 seconds |
| Provider input / output tokens | 48,592 / 3,182 | 60,560 / 4,241 |
| Token-priced run cost | $0.064502 | $0.163530 |

Haiku rejected both repetitions of the honest partial answer and both repetitions of the honest source gap. It identified the missing information but treated disclosure as failure despite the prompt's explicit exception. Sonnet accepted all twelve useful trials and supplied valid results on all twenty trials from the original ten-case set. This supports testing Sonnet for this specific stage, not selecting it for every part or claiming statistically established superiority.

Five outputs across the two models flagged stale/unapproved evidence but also called the answer complete. Two Haiku outputs called a need addressed without a supporting source ID. Local validation left all seven unassessed. They must not silently pass, become Resolved, or trigger an unchecked fallback. Runtime authority checks remain mandatory; these fixture labels and model judgments are not a source-approval mechanism.

On the same original ten cases, the compact check's median was 2.14 seconds for Haiku and 2.25 for Sonnet, compared with 5.12 and 5.20 for the detailed initial assessment. Corresponding compact stage estimates were $2.14 and $5.42 per 1,000 checks, versus $4.18 and $9.46 for detailed grading. These were separately run experiments, not an interleaved latency trial; the compact contract also omits writing-quality scores and therefore does less work.

## Incremental check cost only

| Monthly volume, one compact check per answer | Haiku 4.5 | Sonnet 5 |
| --- | ---: | ---: |
| 1,000 | $2.15 | $5.45 |
| 10,000 | $21.50 | $54.51 |
| 50,000 | $107.50 | $272.55 |

Current deterministic rating adds $0 in model API charges. The table prices only the compact check at the measured fifteen-case token mix. It excludes interpretation, retrieval, composition, repair, any separate detailed background grader, hosting and storage. It is not the full proposed implementation cost. If both detailed grading and compact checking are used, their charges add; no decision to do so has been made. Rates are the same September 14 [provider standard prices](https://platform.claude.com/docs/en/about-claude/pricing) documented in the detailed assessment experiment; thinking was disabled. No retry or paid cache assumption is included.

Total captured cost estimate: $0.228032, all 60 calls with returned usage; conservative reservation $0.736614 under the $1 bound. No subscription, source approval, deployment or live rating change. The earlier detailed assessment experiments are a separate $0.355214 for 52 calls; combined assessment/check experiments total 112 calls and $0.583246. Other earlier goal experiments are not included in that subtotal.

## Validation and next integration candidate

Twelve focused assessment/acceptance/usage tests pass. Post-capture validation added checks against unflagged wrong-topic outcomes, unrepresented clarifications and undisclosed partial gaps; rechecking all sixty original outputs changed zero dispositions. Original results remain unchanged. Evidence: `artifacts/quality-eval/compact-acceptance-20260914/{manifest.json,comparison.json,common-case-comparison.json,post-capture-validation.json}` plus individual requests/responses. Expected labels, model-anonymous review preparation and repeated calls are not proof of human calibration or blind outcome review.

Next, evaluate a complete candidate using stage-specific models, with Sonnet as one compact-check candidate and Haiku retained as a comparison. Carry the original needs through retrieval and composition. Apply existing deterministic source/community/version/role gates, then the same acceptance policy to every answer and fallback. A failed check must lead to a bounded, measured repair or a transparent unresolved answer, not another unverified response. Account for that extra branch's calls and latency. Preserve useful partial answers and keep detailed quality scoring separate from successful resolution.

The same end-to-end run must compare the current full flow and candidate using identical source snapshots, repeated cases, full per-attempt usage and per-family outcome review. It must include known-good specialist answers and source failures, not only these deliberately flawed fixtures. Until then there is no selected implementation, full-system cost commitment, calibrated quality percentage or verified-live result.

Documentation: exact addition appended to `docs/pending-notion/2026-09-14-answer-assessment.md`; not sent while the prior automatic approval-review rejection awaits owner confirmation. No runtime diagram change for this experiment.

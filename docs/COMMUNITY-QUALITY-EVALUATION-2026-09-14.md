# Community Assistant quality goal: first experimental checkpoint

September 14, 2026. Status: **goal active; diagnostic tools implemented locally and initial experiments complete. No resident-facing implementation or release.**

## What changed

Created an isolated checkout on branch `codex/community-quality-september30`, based on production revision `e5e533896f9553681193b453fa2492a60dadf7a5`. Existing local changes were preserved.

Added a 32-case diagnostic corpus, explicitly test-marked live capture, separate-model composition experiments, complete-section context experiments, provider-token accounting, bounded spending, and an observer that records model-stage usage including failures. The corpus is development material; it must not be treated as an unseen holdout benchmark.

Nine focused checks passed, covering test labeling, deployment drift, preservation of saved evidence, unknown costs, cache pricing, excluded models, spending bounds, credential exclusion from output, response preservation, and source/version isolation. No application runtime or UI changed. A full resident release gate is not claimed for these isolated tools.

## Current live baseline

Captured 32 successful API responses with `isTest: true`. The deployment revision matched before and after the run. Median response time was 2.95 seconds; sample p95 was 9.52 seconds. Neither measures correctness.

The previously observed trash, contractor, lighting-process, and application-follow-up problems persist. Additional clear meaning failures include:
- An unqualified cost question produces water rates without identifying the subject.
- An unaccompanied pool-guest question produces room-rental steps and prices.
- A pergola approval/form question produces lighting rules.
- A registration-process question returns event extracts instead of registration steps.

These are deliberately varied diagnostic cases, not a random resident sample. No traffic-wide success or abandonment rate is inferred.

## Model access and experiments

The existing staging Anthropic account lists Haiku 4.5, Sonnet 5, and Opus 5; successful generation calls confirmed access. No OpenAI or Gemini credential was configured there. Fable and Astra were excluded. Credentials were used through the standard existing environment and were never written to artifacts.

Experiment one: six question scenarios, three models, two repetitions, identical retrieved source text, and one shared new composition prompt. All 36 calls completed. Estimated token cost: **$0.62215**.

This compares models under a new prompt; it is not a pure model-only swap against the production prompt, and does not exercise production rendering/validation. Source-attached actions and URLs were included; top-level proposed response actions were not supplied as independent evidence. The model's own answeredNeeds/unresolvedNeeds fields are not quality scores.

Qualitative inspection with model IDs hidden found clearer wording and more explicit limits, but no model could recover the missing application or establish event-contractor eligibility. Several drafts introduced unsupported permission/scope assumptions. Sonnet returned one answer outside the required object contract.

## Proven context loss

The live fence source ends at the start of subsection (c)(1)(a). The next indexed chunk contains the two interior-fence options and their stain requirements. Both chunks have the same section, official URL, product ID, and publishing job ID.

The live lighting answer selected the last of three parts of the approved lighting document. Earlier parts contain approval and fixture-submission requirements. The selected text exactly matched the repository part; sibling parts share the same document parent and source-text hash.

Experiment two joined those matching-version siblings in a diagnostic packet. It did not change source approvals or production eligibility. The same prompt and three models ran twice on both questions: 12 calls, estimated **$0.286069**.

All six fence drafts now explicitly identify both interior-lot options. Lighting drafts recover cut-sheet requirements, although some assume an already-approved installation or overgeneralize operating rules. This is narrow evidence that preserving section context improves completeness even with Haiku. It does not certify all draft claims or establish a model winner.

## Measured cost comparison so far

Standard global Anthropic API token rates checked September 14: [official pricing](https://platform.claude.com/docs/en/about-claude/pricing). Actual provider input/output counts are used, including all reported output tokens; any internal reasoning included in that total is not charged a second time. Separate reasoning counts were not established by these artifacts.

**Writing stage only, first six-scenario pilot:**

| Model | Mean cost per draft | Per 1,000 drafts | Writing cost at 10,000 drafts/month | Median / sample p95 |
| --- | ---: | ---: | ---: | ---: |
| Haiku 4.5 | $0.00382 | $3.82 | $38.23 | 3.89 / 5.08 seconds |
| Sonnet 5 | $0.01290 | $12.90 | $128.96 | 7.39 / 10.66 seconds |
| Opus 5 | $0.03513 | $35.13 | $351.27 | 10.92 / 13.28 seconds |

Monthly columns are hypothetical writing volumes, not current traffic or a complete hosting bill. These versions use longer prompts and different output behavior than today's answer engine. They must not be presented as current-versus-proposed complete-system prices.

**Matched two-scenario context comparison, per 1,000 writing calls:**

| Model | Original fragments | Complete sibling context |
| --- | ---: | ---: |
| Haiku 4.5 | $3.98 | $5.11 |
| Sonnet 5 | $14.56 | $18.20 |
| Opus 5 | $38.30 | $48.21 |

Each cell has only four calls. This establishes the immediate token tradeoff, not expected customer-wide costs. Complete-context p95 writing times were 6.54 seconds for Haiku, 14.03 for Sonnet, and 14.81 for Opus. At these settings, using the larger models for every writing step would already challenge the proposed full-answer 10-second target.

The 48 composition calls together cost an estimated **$0.908219**. A separate isolated eight-document-question pipeline run recorded one Haiku understanding call costing **$0.003402**; seven cases made no model calls. This supports the diagnosis that many paths return without AI composition, but the repository's evidence snapshot differs from deployed refreshed data, so it is **not a production billing benchmark**. Current public metrics also omit rules-search tokens and can include unrelated concurrent traffic.

No new paid subscriptions, databases, indexing services, or hosting were added. The full commitment comparison remains open: current and candidate complete-flow costs, checks/retries, embeddings/indexing, storage/hosting increments, setup costs, and monthly scenarios grounded in the selected architecture and stated traffic.

## Why no model is selected yet

Six development scenarios and two repetitions do not establish statistically reliable superiority. Better evidence improved the cheaper model too. Some stronger-model drafts remained incorrect or unhelpfully long. The shared prompt needs tighter scope and output-contract handling. No useful/excellent percentages have been certified, and no blind human calibration or frozen unseen acceptance test has been completed.

Next work:
1. Fix shared evidence assembly with identity, scope, version, ordering, and token-budget controls; test complete sections versus true semantic retrieval.
2. Evaluate structured understanding and conversation context across the 32 families/examples, including under-specified and compound questions.
3. Use a constrained answer schema and evaluate relevant-action selection and a bounded semantic check/repair step.
4. Compare models independently per stage and report measured whole-flow quality, latency, and cost before selecting a paid implementation.
5. Establish owner-calibrated labels and a separate unseen benchmark; then perform required implementation, staging, release, and verified-live checks.

An attempted read-only download of the production source index failed because no local SSH key was registered. No keys were registered and no server files changed. Reproduction can continue using the existing source refresh process or a separately authorized snapshot route. This does not block the other work.

## Evidence and documentation

Local artifacts under `artifacts/quality-eval/`:
- `baseline-20260914/`: 32 explicitly marked test responses and stable-revision manifest.
- `composition-pilot-20260914/`: 36 drafts, provider usage, and initial qualitative review.
- `full-context-input-20260914/`: exact matching-version expansion proof.
- `full-context-pilot-20260914/`: 12 drafts, usage, and initial qualitative review.
- `document-pipeline-20260914/`: scoped call-by-call baseline instrumentation.
- `pilot-cost-comparison-20260914.json`: reproducible component cost calculations.

The Notion audit page records this checkpoint. Current-flow diagrams remain unchanged because resident behavior is unchanged. Future implementation must update the diagram and distinguish candidate, implemented, and verified-live states.

Previous goal turn classification: progress (goal and owner constraints recorded). This continuation: progress (isolated toolchain, tested accounting/identity controls, 32-question baseline, 48 model drafts, cost evidence, and confirmed context-loss mechanism). The goal remains active and its September 30 completion criteria are unchanged.

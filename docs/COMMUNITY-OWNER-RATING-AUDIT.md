# Owner rating audit — September 14, 2026

Status: diagnostic work only. No historical ratings, resident answers, source approvals, settings or live behavior changed.

## Implementation record

The failure affects all question families: the deterministic scorer can treat formatting, answer-mode metadata and the absence of predefined defects as evidence that the resident's request is resolved. It does not independently establish that the answer covers the requested outcome. More keyword exceptions would leave this mechanism intact.

Add a read-only audit command that queries all non-test questions currently marked Needs work and reports aggregate disagreement with saved automatic ratings. Before: an informal count is easy to confuse with overall accuracy. After: a reproducible report preserves the denominator, date range and missing-rating counts, and explicitly leaves unavailable accuracy measures unknown. This is measurement infrastructure, not a new rating algorithm.

Use the existing question-log mapping and pagination without schema migration. Restrict requests to Notion database reads and data-source queries. Do not write resident records or send them to a model. Output aggregate counts only. On incomplete pagination, unexpected records or request failure, fail rather than report a partial sample. The utility is independent of community-specific facts and source adapters. It cannot verify historical source authority or reconstruct missing evidence from today's documents. Test denominator integrity, test exclusion, unknown values and mutation rejection with synthetic records.

## Read-only findings

At 2026-09-14 22:15:34 UTC, the complete current marked subset contained **25 non-test submissions** dated September 1–14. Saved ratings: 11 Excellent, 6 Good and 8 Weak. Thus **17/25 (68%) of owner-flagged submissions had a positive automatic rating**. All 25 had the saved resident-effort label Resolved. These are historical records, not a replay of the current local implementation.

Observed failures include a status answer instead of requested hours, ordinary collection information instead of a holiday exception, unrelated policy text instead of an application process, and neighboring contractor rules instead of event-contractor eligibility. This supports checking the requested subject, outcome, conditions and next action together. It does not establish a precise factual-error count: the saved log does not contain the complete historical evidence packet or conversation.

This selected negative subset cannot establish overall accuracy, false rejection of good answers, abandonment, or the present failure rate. Repeated submissions are not distinct residents. Unchecked Needs work is not a positive human review. The owner's praise of Trash is useful direction, but does not mean every trash answer is excellent.

The aggregate-only command `node scripts/quality-eval/audit-owner-ratings.js`, run with the existing staging environment, independently reproduced these counts at 22:17:54 UTC. Four focused synthetic tests passed for denominator integrity, unknown ratings, empty samples, invalid records and blocked mutations/redirects. No model calls occurred. The last complete runtime suite remains the separately recorded 874-test run; this tool is not imported by resident routes.

## Rating replacement requirements

1. Judge whether the actual requested outcome is covered before scoring presentation. Wrong subject, unsupported material claims and wrong actions must prevent a positive rating.
2. Keep useful clarification and supported partial assistance distinct from a completed request. Honest evidence gaps may be handled well while the resident still has work remaining.
3. Assess direct resolution, useful specificity, relevant proactiveness, readability and concision separately. Extra steps or longer answers do not inherently improve a score.
4. Preserve unknown/unassessed states when context, evidence or assessment is unavailable. Do not turn missing checks into Resolved.
5. Calibrate against explicit human judgments including both good and bad examples, then use unseen examples for acceptance. The existing negative marks establish disagreement but cannot supply missing dimension scores or a positive review set.
6. Evaluate rating cost separately from answering cost. A background assessment is a candidate, not yet an adopted design; it must still pass owner agreement checks. The prior detailed assessor pilot measured roughly $4.18/1,000 Haiku assessments and $9.46/1,000 Sonnet assessments, incremental to answering. Its small synthetic sample does not justify production selection.

See [assessment experiment](COMMUNITY-ANSWER-ASSESSMENT-EXPERIMENT.md) for the existing dimension contract and diagnostic model results, and [full cost comparison](COMMUNITY-SIMPLE-FLOW-COMPARISON.md) for answering costs and unknowns. This audit incurs no model API calls or subscriptions. Neither model-backed ratings nor a winning answer flow has been selected.

Documentation impact: add this dated finding and calibration limits to the owner operations/audit guide. No runtime-flow diagram change is needed for this aggregate-only tool. Exact pending text is saved separately because the previous automatic approval review rejected the external Notion documentation write; authorization to retry has not arrived.

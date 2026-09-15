# Controlled planner comparison — September 14, 2026

Preimplementation plan. The complete mixed-flow comparison lost all four yoga follow-ups because Haiku omitted required request text. Changing the answer writer could not recover those plans. Compare Haiku and Sonnet on the exact captured interpretation requests before deciding which stage merits a stronger model. Do not fix the schema, prompt, context or output validator at the same time.

Replay the six authored mixed cases and both captured repetitions to each model: 24 new interpretation calls. Only model ID and its required temperature compatibility may differ; keep thinking disabled, the existing schema, instructions and date context unchanged. Reconstruct rows/profile from the exact completed capture, verify their identity against the payload, and retain complete raw provider tool output before validation. Compare structural validity, preserved intent/context, connector/date/filter binding and latency independently. A structurally valid plan is not proof of a useful final answer.

Use at most **$0.80 conservative reservation** from the existing mixed-comparison $5 phase, which has $2.236680 remaining after its $2.763320 reservation. Preflight all 24 exact request bodies before making any call. Never start if the entire design cannot fit. Keep earlier phase totals, incomplete/unknown usage and source-context dates explicit. This is interpretation-only: no live fetches, resident questions, writer calls, subscriptions or deployment.

The original provider output was not fully retained for rejected mixed-flow plans, so this replay saves the entire response object as well as the unmodified tool input and resolved plan. It does not fabricate missing historical output. Validate the replay builder offline for model-only changes, input identity, missing/duplicate repetitions, excluded models and preflight costs. Then record all outcomes, including invalid plans, without silently repairing or retrying them.

This is a local development diagnostic, not unseen or independent human calibration. Owner communication cards remain pending. Notion update stays in a precise local pending record under the prior automatic external-write rejection. Resident flow/UI and diagrams are unchanged.

## Model-only result and next contract experiment

The model-only replay completed all 24 calls on revision `cb2f778`. Haiku produced ten structurally valid plans out of twelve; both yoga follow-ups again omitted the required request text. Sonnet produced twelve structurally valid plans, including both yoga follow-ups, but three plans had rejected connector bindings: both menu needs selected a schedule-only food connector, and one recycling need emitted an unsupported `kind: schedule`. Thus neither model is selected from structural validity alone.

Haiku used 30,278 input / 4,175 output tokens, cost $0.051153, median 2,631 ms, sample p95 4,671 ms. Sonnet used 39,514 input / 4,905 output tokens, cost $0.128078, median 3,617.5 ms, sample p95 4,402 ms. Interpretation-only cost per 1,000 calls is $4.26 versus $10.67; full answer costs are not established by this replay. Total $0.179231, zero unknown usage; conservative reservation $0.542382. Combined mixed phase: $1.268988 known cost, $3.305702 reserved of $5, leaving $1.694298 reservation headroom.

Preimplementation plan for a separate contract revision: remove duplicate model-emitted `subject` and connector `kind`. Each need must instead supply its complete request text; software derives the internal short search hint from that same text and looks up the unique connector kind from its configured ID. The full request remains intact, with all existing validation of tasks, copied dates/filters, community and source roles. Missing request text is still rejected; it is never inferred from an incomplete answer. This changes the shared request contract for all question families, not the reported yoga wording.

Advertise only capabilities this candidate implements. In particular, the profile's general food adapter advertises menu/price facets while this candidate only projects schedules. The compact interface must expose schedule capability only. This resolves contradictory tool metadata without promoting new facts or widening source authority. Invalid connector IDs, wrong evidence kinds and copied-area/date failures remain explicit gaps. No resident module or profile changes.

Compare the compact contract on the same six saved questions, date/context and two repetitions using both models (24 calls), retaining all raw outputs. This is a bundled contract revision, so any gain applies to that revision; it does not isolate the contribution of each removed field. Reuse the original capture's requests as the base. Preflight the entire design against at most $0.80 of the remaining existing phase reservation before paid calls. Add synthetic multi-need, cross-profile, missing-field, unavailable-capability, date-correction and source-role checks before evaluating it. Do not activate it in resident answering or label source facts current from this historical interpretation test.

## Compact contract result

Completed all 24 calls at 23:57:20 UTC, September 14, on revision `9a31a62a8b03ad4fd44fdb984c3eaf3854da51b0`. Twenty focused tests passed before the run. Capture: `artifacts/quality-eval/compact-planner-replay-20260914`; raw requests/responses and token counts are retained. The compact contract remains an experimental diagnostic and is not integrated into the candidate full-answer runner or resident answering.

| Interpretation measure | Haiku 4.5 | Sonnet 5 |
| --- | ---: | ---: |
| Calls | 12 | 12 |
| Structurally valid | 12 | 12 |
| No rejected source binding | 8 | 12 |
| Input / output tokens | 29,498 / 3,811 | 38,602 / 4,627 |
| Measured token-priced cost | $0.048553 | $0.123474 |
| Interpretation only, per 1,000 calls | $4.05 | $10.29 |
| Median / sample p95 | 2,450 / 2,586 ms | 3,202.5 / 3,893 ms |

Total $0.172027, zero unknown-usage calls, conservative reservation $0.536010. Current mixed phase including the preceding model-only replay: $1.441015 known cost, $3.841712 reserved of $5, leaving $1.158288 reservation headroom. No additional service subscription, live source request, resident question, or deployment. Thinking was disabled; these prices cover interpretation only, not writing, checking, hosting or full-answer latency.

The format result improved, but it is not an answer-quality win. Manual inspection found:

- Haiku's two yoga plans now include request text, but classify a specific tomorrow occurrence as ordinary information while selecting a live calendar. The role check correctly rejects both bindings (planner-01 and planner-08).
- Both Haiku food plans supply an unsupported category filter to the schedule-only connector (planner-22 and planner-23). One also drops the menu subquestion from its needs, despite retaining it in the standalone question. Silently dropping that filter would not repair the lost request.
- Sonnet selects valid bindings in all twelve plans. However, planner-10 changes the lighting follow-up from remaining installed to remaining installed **and operating**, and assumes the lights already have approval. The prior message asks how to get approval, not whether approval exists. The other Sonnet repetition preserves the installation question. Haiku planner-18 also phrases approval as already granted. Such unsupported presuppositions require separate semantic review even when source bindings pass.

No model or contract is selected. This small, known-case comparison supports investigating shared instruction/schema consistency and meaning preservation; it does not establish statistical significance, representative useful/excellent rates, or demo readiness. Stronger models still change the requested meaning, and cheap models still omit needs. The software's existing role and copied-filter checks must remain intact. Next compare source relevance and full-answer costs only after preserving the complete request; evaluate gains on more than these development examples. Human communication judgments and an unseen acceptance set remain outstanding.

Documentation impact: local experimental planning and model-choice evidence only. No resident flow/UI or diagram changed. Exact Notion update is pending in `docs/pending-notion/2026-09-14-planner-comparisons.md` under the previously rejected external-write approval; do not label synchronization or deployment complete.

## September 15 integration into the experimental full flow

The complete candidate now accepts explicit `planningMode: 'compact'` with a community profile. Expanded planning remains the default. The same compact request builder and resolver used in the saved comparison now feed actual candidate retrieval and composition, retaining canonical request text, need IDs, current-question date corrections, resident-only context, community bindings and rejected-binding diagnostics. No extra model call or silent retry is introduced. This connects an existing alternative for end-to-end comparison; it does not select its model, correct semantic errors, or change resident answering.

Twenty focused tests pass, including full-flow propagation in two communities/timezones, rejection of missing request text, clarification without retrieval, and visible gaps for wrong-role or foreign-connector bindings. The complete flow still rejects invalid interpretations instead of inventing a missing request. An offline-review result remains explicitly unreviewed.

All 24 saved compact planner requests can be reconstructed byte-for-byte by hash using the current profile and their original clock. Replay them through the integrated candidate until the writer boundary, preserving each raw response and all known semantic errors. A matched boundary replay is not fresh inference, current source validation, a finished answer, or a quality score. Historical interpretation costs remain $4.05/1,000 Haiku or $10.29/1,000 Sonnet on their respective samples; no combined updated answer price is established. No additional paid calls or subscriptions are needed for this integration verification.

Boundary replay completed at revision 703e64fda75d0ab2715b26090c30d140165fc157: 24/24 reconstructed request hashes match; all normalized plans, need IDs, live bindings, diagnostics, original questions and resident context reach the writer unchanged. All four original rejected-binding records remain rejected. The replay intentionally stops before composing, fetches no sources and incurs zero paid calls; it generates zero answers. Evidence: artifacts/quality-eval/compact-flow-integration-20260915/{replay.js,comparison.json}. This verifies the connection needed for the next full-answer comparison, without claiming a quality improvement or a production change.

# Final-answer acceptance on captured model answers

Planned September 15 UTC / September 14 Denver after the optional preparation experiment failed to establish a quality/latency win. Current local revision before this experiment: 260a072. No running provider process remains from that experiment; both captures are terminal and their phase is closed.

Root question: can the existing final-answer acceptance stage catch actual writer defects while accepting supported answers? Test this before adding another model stage. No production scoring or resident behavior changes in this experiment.

Freeze fourteen unchanged captured answers: seven assistant-source-reviewed accept labels and seven reject labels, across eight known authored families. The exact trials, rationales and defect targets are in `scripts/quality-eval/captured-acceptance-labels.json`. Positive controls intentionally include both short and detailed generic application answers and repeated pool wording; negatives include numeric qualification changes, missing conditions/process steps, unsupported source-absence claims and unsupported form/process applicability. This is a diagnostic sample, not representative traffic. Multiple examples from a family are not independent families. Labels are not owner judgments, blind human calibration or excellence ratings.

Use the original packet, actions, question, prior resident context, interpretation and historical clock from the frozen writer capture. Source checks already documented in `COMMUNITY-WRITER-PRESENTATION-RESULTS.md` support the label rationales. Preserve the actual action inventory: do not trim an answer or alter actions to make a control pass. Confirm the original answer and request hashes before each comparison is prepared. No new source approval or live-current claim.

Compare Haiku 4.5 and Sonnet 5 as checkers independently, twice per answer: 56 calls. Use the existing `flowAcceptanceRequest` with its current 850-token output limit, plus the already-implemented separated evidence context and community-local time. Do not add an evidence brief, writer, retrieval, repair or new grading prompt. The request contains no expected labels, originating model, originating trial, rationale or prior assessment. Randomize and freeze all jobs and hashes before calling.

Record raw assessments, software consistency checks, delivered outcomes, failure details, selected-action reviews, tokens and duration. Separate a valid rejection from an invalid/incomplete assessment; an error is not correct detection. Report acceptance of the seven positive controls, rejection of the seven negative controls, repeat consistency and whether rejection reasons identify the predeclared defect. Human inspection of reasons remains necessary; matching a generic failure category alone is not adequate.

Use a new maximum $5 diagnostic phase, reserving the entire design before calls; preserve all usage and unknown charges. Stop on provider failure, incomplete output or unknown usage without retrying. Keep every attempted case in the denominator and do not rank models if the stopped design creates unequal case mixes. No subscription or deployment. Later full-flow measurement must include the accepted checker, repair rate and total latency; this stage alone cannot establish the monthly commitment or demo readiness.

Validation before calls: original capture identity, no expected-label leakage, unchanged answers/action selections, full source retention, live context/date handling, exact planned need IDs, cap enforcement and both checker models. Existing acceptance/full-flow checks remain required. Documentation impact is experimental audit/decision only; save precise pending Notion text under the prior unresolved external-write rejection. Resident flow and diagram remain unchanged.

## Completed result

Capture revision `d34ed8f`; all **56/56 calls completed**. Process 36341 exited 0, and the manifest independently records `captured`. The complete design reserved $2.966696 before execution. Actual provider token counts priced at dated standard rates total **$1.035041**, with zero unknown-usage calls. This $5 diagnostic phase is now closed. Earlier preparation-phase unknown usage remains separate and is not erased by this result.

| Checker | Supported-answer attempts accepted | Flawed-answer attempts accepted / rejected / invalid | Rejections identifying the predeclared defect | Median / sample p95 |
| --- | ---: | ---: | ---: | ---: |
| Haiku 4.5 | 14/14 | 8 / 4 / 2 | 0/14 | 3.58 / 13.09 s |
| Sonnet 5 | 14/14 | 13 / 1 / 0 | 1/14 | 7.06 / 20.23 s |

Each model saw seven supported and seven flawed answers twice. All supported answers were accepted as complete. The defect-specific column is an assistant review of the returned reasons against the predeclared targets and source packets, not a human quality score. A structural rejection is not correct detection. These are small development counts; do not generalize them to resident traffic or interpret repeated variants as independent questions.

Reason review:

- Haiku checks 011 and 012 reject menu answer 060 for failing to supply unavailable menu information. They do not identify its unsupported claim about the CAB website and explicitly treat the disclosed gap as correct. This would punish an honest partial answer; neither earns defect-detection credit.
- Haiku checks 031 and 040 reject lighting answer 058 using an incorrect interpretation that permanent under-eave lighting cannot switch to holiday operation. The governing policy expressly discusses hardwired systems in its seasonal section. The intended defect was missing cut sheets and elevations/termination points. Neither rejection identifies it.
- Haiku checks 002 and 036 duplicate the same action review for four needs and fail the existing one-review-per-action contract. They report no material defect. They remain invalid assessments, not correct rejections.
- Sonnet check 010 correctly identifies the unsupported combined-application-package claim in answer 055. Its repeat, check 032, accepts the same answer as complete. This is the only inconsistent acceptance pair; other pairs can be consistently wrong.
- Both models accept both repetitions of the changed numeric qualification in answers 048/021, the omitted qualification/form gap in 069, and the unsupported pergola-form claim in 092. Sonnet also accepts both menu and incomplete-lighting answers.

### Cost record

| Checker | Calls | Input / output tokens | Priced usage | Per 1,000 checker calls | At 10,000 such checks/month |
| --- | ---: | ---: | ---: | ---: | ---: |
| Haiku 4.5 | 28 | 237,122 / 8,269 | $0.278467 | $9.95 | $99.45 |
| Sonnet 5 | 28 | 327,302 / 10,197 | $0.756574 | $27.02 | $270.21 |

Totals are 564,424 input and 18,466 output tokens. All requests explicitly disable thinking. Sonnet reports zero thinking tokens for all 28 calls; Haiku does not return that separate breakdown. Do not label the missing breakdown as provider-measured zero. Total output usage is still available and priced for every call. These are estimates based on reported tokens, not reconciled invoices. No prompt-cache tokens were used.

The table covers checking only: no generation, interpretation, selection, retrieval, repair, refresh or hosting. The current heuristic automatic rating adds no separate model call; these experimental checkers would add a recurring component if adopted, but neither is adopted. The small balanced diagnostic mix is not the production question mix, and this is not a proposed whole-service monthly bill.

### Decision and next bounded comparison

**Reject both non-reasoning checker configurations as release gates.** They accept most known defects, and the cheaper model sometimes rejects for a false reason. Correct action IDs and plausible source references do not establish that the content follows the source. Replacing a heuristic score with this generic AI assessment would preserve the owner's underlying problem.

The next controlled factor should be bounded reasoning within the same Sonnet checker, before adding another stage or rewriting the system around this failed gate. [Anthropic's current thinking documentation](https://platform.claude.com/docs/en/build-with-claude/thinking) confirms that Sonnet 5 supports adaptive thinking and forced tool use, and that thinking tokens count toward the output limit. [Effort guidance](https://platform.claude.com/docs/en/build-with-claude/thinking-steering-and-cost) describes medium effort as a soft reasoning control; the hard cap remains `max_tokens`.

Proposed frozen subset for that next diagnostic: positives 009, 016, 018, 027, 061; negatives 060, 048, 058, 092, 055. This preserves all eight families while removing redundant application/shed variants. Compare the same source/answer payload and checker prompt at medium effort with `max_tokens: 4096` in both arms, changing only disabled versus adaptive thinking (display omitted). Two repetitions produce 40 calls. Offline preflight for this design is $4.275776, within a separate $5 ceiling. The same larger output cap in the control avoids confounding reasoning with extra response space. No calls for this follow-up have been made or scheduled by this report. Retain unknown usage, truncation, wrong-reason rejections, failure consistency and full elapsed time. No extra checker, preparer or repair in this comparison.

This result does not change resident behavior or establish demo readiness. Human communication calibration, representative unseen acceptance, source-gap work and matched full-flow costs remain outstanding. No code was deployed and no subscription was added.

Reproduce: `node scripts/quality-eval/summarize-captured-acceptance.js artifacts/quality-eval/captured-acceptance-20260915`. Inspect `manifest.json`, `predeclared-labels.json`, `calls.jsonl`, `comparison.json` and `reason-review.json`. Exact pending documentation is in `docs/pending-notion/2026-09-15-captured-acceptance.md`.

# What better answers could cost — September 15, 2026

There is no new spending commitment yet. We have useful cost measurements, but no candidate has demonstrated the required answer quality and speed. Buying a bigger model or adding a paid vector database is not justified by the results so far.

Latest matched full-flow diagnostic: on twelve current-source questions twice per arm, current local answering cost **$1.84 per 1,000 attempts** versus **$27.19** for compact Sonnet understanding/writing with community semantic and hybrid rule search. At 10,000 questions/month that is **$18.42 versus $271.88 in answering AI**, before hosting or later grading. Candidate p95 was **14.04 seconds**, versus **4.06 seconds** for the control. The candidate helps with caregiver access and pool information but retains material rule/meaning errors and three missing answers, so it is **not selected**. The complete experiment cost $0.696725, with no unknown charges or subscription. These are local development measurements, not exact deployed billing or human-reviewed quality rates. [Full matched results and stage costs](COMMUNITY-SEPTEMBER-PAIRED-FLOW.md).

The cost audit recomputed 442 recorded calls across six experiments and twenty configurations. Every subtotal and stage token count matches its saved report. Two timed-out calls have unknown charges and remain unknown. These are development samples, not the production invoice, and the different experiments must not be blended into one measured flow. See the [full cost evidence and stage tables](COMMUNITY-COST-EVIDENCE-2026-09-15.md).

## Current cost we can substantiate

The signed-in [Railway usage dashboard](https://railway.com/workspace/usage), checked September 15 UTC / September 14 Denver, identifies this project as natural-acceptance and its service as sterling-ranch-food-truck-chat. Its completed August 12–September 12 resource usage was **$2.64**: displayed memory $2.4537, CPU $0.0790, network $0.1101 and volume $0.0000. The displayed rounded component amounts need not sum to the rounded headline. For September 12–October 12, usage so far is **$0.3162**; the service row displays $0.3163. Neither is a monthly forecast. The view groups the project/service and does not separate production from staging.

The workspace is on Hobby, whose $5 monthly minimum includes resource usage. That is shared across projects, so it must not be added in full to every project. Current public rates are $10 per GB-month of RAM, $20 per vCPU-month, $0.15 per GB-month of volume storage and $0.05 per GB of outgoing traffic. [Railway pricing](https://docs.railway.com/pricing).

The older selective-AI flow cost **$1.01 per 1,000 attempted questions** in the completed document benchmark and **$1.56** in a different mixed/live benchmark. It often bypasses a writing model. Both samples contain quality failures, and neither measures the current deployed revision's exact cost. Application Anthropic charges remain separate from Railway. Domain renewal and allocations for other existing integrations are also outside these figures.

## Measured candidate costs

All amounts below are answering AI only, including failures and the calls actually made. The two-stage document candidates use Haiku 4.5 to understand the question, local semantic plus keyword rule retrieval, and the named writer. They have no separate AI checker or repair call. Each arm used sixteen attempts on eight known questions.

| Same semantic document experiment | AI per attempted question | AI per 1,000 | 10,000/month | 50,000/month | Sample p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Older local selective-AI control | $0.001006 | $1.01 | $10.06 | $50.29 | 5.90s |
| Haiku 4.5 understanding + Haiku 4.5 writer | $0.011925 | $11.92 | $119.25 | $596.23 | 14.40s |
| Haiku 4.5 understanding + Sonnet 5 writer | $0.028166 | $28.17 | $281.66 | $1,408.28 | 14.05s |

Both candidate arms produced sixteen drafts, but draft presence is not usefulness. Known evidence-use mistakes remain, no independent human quality score is established, and both miss the proposed ten-second p95. The production community library has also expanded since this capture, so these totals cannot be quoted as the price of the newest experimental retrieval packet.

Other experiments answer different questions about cost:

| Experiment | Measured AI per 1,000 attempted questions | What the result means |
| --- | ---: | --- |
| Haiku understanding + Haiku writer + Sonnet checker | $39.16 | Includes two repair attempts over sixteen questions; 14/16 answers delivered, with accepted-answer errors also found. |
| Haiku understanding + Sonnet writer + Sonnet checker | $57.00 | Same separate three-stage comparison; 14/16 delivered. More checking did not establish reliable answers. |
| Mixed/live: Haiku understanding + Sonnet writer | $27.53 | Ten drafts from twelve attempts; yoga interpretation failed twice. |
| Mixed/live: Haiku understanding + Opus writer | $61.73 | Ten drafts from twelve attempts; same interpretation failure. Higher writer cost did not fix the earlier failure. |

The latest writer-only comparison costs $10.21–$10.65 per 1,000 Haiku calls or $28.64–$29.42 per 1,000 Sonnet calls. Separately, the captured-answer checker costs $9.95 per 1,000 Haiku checks or $27.02 per 1,000 Sonnet checks. Those are **stage-only** numbers, not full-answer prices. Both tested non-reasoning checker configurations failed the negative examples and are rejected as release gates. Do not add these unmatched samples together and call the sum a measured proposed flow.

All calls in the 442-call audit requested thinking disabled for candidates. Older control calls left that option unspecified. Captured cache reads/writes are zero, so no prompt-cache savings are assumed. Missing reasoning-token detail is not measured zero; billed output tokens are priced once.

The separate reasoning-checker comparison has now completed after restored credit, retaining seven earlier successes and making 33 continuation calls under the original $5 ceiling. Disabled thinking caught 2/10 flawed trials; adaptive medium caught 0/10; both accepted 10/10 supported trials. Both settings are rejected. They cost $28.82 and $28.59 per 1,000 checks respectively, with sample p95 21.04 and 22.96 seconds for checking alone. Current heuristic grading adds no model call, so neither increase is justified. Forty successful calls cost $1.148088 in priced usage plus one original failed attempt with unknown cost; combined conservative reservation is $4.374320. All forty explicitly report zero thinking tokens, so this does not prove deeper reasoning is ineffective. No purchase or subscription was made. See [completed checker comparison](COMMUNITY-CHECKER-REASONING.md). This separate experiment is not silently included in the 442-call audit.

Standard input/output rates per million tokens remain Haiku 4.5 $1/$5, Sonnet 5 $2/$10 and Opus 5 $5/$25, rechecked September 15. Recorded usage includes provider tokenization differences; word counts are not substituted for tokens. [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing).

## Search, hosting and one-time work

The tested local search uses existing vector files, with no paid embedding API or vector database subscription. The rule vectors occupy 2,409,984 bytes and community vectors 148,992 bytes; model/runtime/source files are additional. A prior local rule build took roughly eight minutes, which is a measured desktop duration, not a hosting charge. Refreshing or rebuilding still consumes CPU. Several embedding/reranking experiments have already run, but their development expense is separate from ongoing resident answering costs.

Hosting cannot be priced from a brief desktop memory peak. As an explicitly hypothetical **incremental resource** example, another average 0.25 GB of RAM, 0.02 vCPU, 0.1 GB of volume and 1 GB of monthly outgoing traffic would cost about **$2.97/month in additional resource usage** at the current rates. At 0.75 GB RAM and 0.1 vCPU, with the same storage/network assumptions, it would be about **$9.57**. These are sensitivity examples, not measurements of the proposed service. Shared included usage may absorb some increase; deployments, replicas and staging can multiply it.

For a concrete planning example only: at 10,000 questions/month, the measured two-stage Haiku answering mix would be $119.25 in AI. Holding the completed $2.64 project usage constant and adding the hypothetical $2.97 resource increase gives **$124.85/month in project resource usage plus answering AI**, calculated before rounding the components. The analogous Sonnet example is **$287.26**. These assume the old question mix, no separate AI grading/checker/repairs, unchanged baseline hosting and that exact extra-resource scenario. They exclude domain and other integrations, are not guaranteed bills, and are not recommendations to purchase either flow.

The new optional evidence contract adds a median 3,160 request characters in the historical replay. Its actual billed tokens and answer benefit are unmeasured; it is not included in the candidate prices above. A final quote must measure it, any retries, ongoing indexing, live fetches, grading frequency and deployed CPU/RAM under realistic traffic together.

## Decisions supported now

- Keep Haiku and Sonnet as separate-stage candidates. Neither writer is selected; the test must demonstrate meaningful finished-answer improvement before paying more. Opus has not shown evidence here that earns its extra cost. Fable and Astra remain excluded. Other providers remain possible, but no configured application access or comparable measured result is available in this work.
- Continue evaluating local semantic plus keyword search because it recovered missing governing sections. A paid vector database would change storage/operation, and has not been shown to solve our relevance or writing failures. Do not subscribe based on source-presence scores alone.
- Reject the tested generic reranker as a final filter, exclusive source-role routing, and the tested non-reasoning checkers as release gates. Each has a demonstrated failure that affects useful answers.
- Keep the capability inventory optional. It preserves evidence and distinguishes navigation from factual text, but does not establish relevance or completeness. More prompt text must earn its token and latency cost.
- Treat the heuristic automatic rating as uncalibrated. Human judgments of actual usefulness, specificity and helpful next steps are still needed; passing a structural validator is not a quality rating.

The next model comparison requires working provider credit/access and the pending blind human calibration. Until then, do not keep spawning minor prompt variants and describe them as evidence of impressive answers. The remaining release proof is unchanged: representative blind repeated wins, the frozen unseen benchmark and per-family targets, failure/follow-up behavior, full latency and operating costs, required implementation checks, release authorization and verified-live rehearsal. No candidate is demo-ready, no new subscription is authorized by this report, and nothing was deployed.

## September 17 planner-only comparison and current recommendation

The owner-approved 30-question Haiku planner comparison completed under its $0.20 hard ceiling. It cost **$0.092486** total and used 54,801 input tokens plus 7,537 output tokens. The planner accepted 20/30 contracts, but the unchanged end-to-end flow met only **13/30** frozen strict expectations and produced 4 diagnostic Excellent results. Its measured planner-stage projection is **$3.08 per 1,000 questions** or **$30.83 per 10,000**, compared with the preserved historical mixed-flow estimate of about **$1.01 per 1,000** or **$10.09 per 10,000**. This experiment sent synthetic questions and the organization capability catalog, not resident-log questions or source-document contents.

The model result did not earn a model change. Shared, no-cost request/evidence/completion repairs raised the post-reveal development replay to **29/30 strict expectations** without another provider call. This replay is useful proof that the root fixes generalize across ten question families, but it is not a new blind or human-rated score. The remaining strict mismatch is wording-only: the answer uses the complete official screening language rather than the frozen shorthand.

The suggested implementation currently adds **$0 in per-question model cost** because the repaired deterministic path remains the accepted fallback and the Haiku interpreter is not enabled by default. No vector database, paid embedding service, reranker, writer, checker, subscription, or recurring service was added. Haiku interpretation remains a candidate only if a fresh staging and owner review shows a meaningful gain over the repaired fallback. Automatic ratings remain unpublished as **Not rated** until enough owner labels exist to measure agreement and error rates.

The September 17 staging review made no model calls and added **$0**. It found and repaired a deterministic payment-routing defect; the fixed staging answer now uses the approved Utility Hawk action rather than unrelated water rates. This does not change the cost recommendation. Staging remains held because five approved source records and five approved facts are expired pending exact-source review. Production remains unchanged.

## September 18 implementation cost decision

The locally verified need-first implementation at `b4319ad` does not add a model stage, hosted vector database, paid embedding service, reranker, checker, subscription, or new recurring service. Its incremental model/API cost is **$0 per question**. It changes how the application preserves each requested need and selects already approved evidence; it does not change provider pricing or authorize a new provider.

| Configuration | Evidence from this project | AI cost per 1,000 questions | AI cost at 10,000 questions | Decision |
| --- | --- | ---: | ---: | --- |
| Preserved historical selective-AI flow | Earlier measured diagnostic mix | about $1.01 | about $10.09 | Existing historical comparison; not a current invoice |
| September 18 need-first repair | 32/32 final holdout behaviors; 1,424/1,425 repository checks with only sandbox Atlas launch blocked | **$0 added** | **$0 added** | Selected for staging verification |
| Haiku planner-only addition | 13/30 unchanged frozen strict expectations; $0.092486 experiment total | $3.08 | $30.83 | Rejected for now; no meaningful end-to-end gain |
| Prior two-stage Haiku candidate | Known development questions; 14.40-second sample p95 | $11.92 | $119.25 | Rejected |
| Prior Haiku plus Sonnet candidate | Known development questions; 14.05-second sample p95 | $28.17 | $281.66 | Rejected |

“$0 added” means the repair adds no new model/API charge to the current configuration. It does not mean the existing application, Railway hosting, or every existing optional AI path costs zero. Hosting is unchanged by this local result and must be checked after an exact staging deployment before claiming a total monthly operating change.

The recommendation is to stage the need-first repair without enabling another model. Keep AI available inside the architecture for unfamiliar-language interpretation and human wording, but require a bounded, human-rated improvement before turning on an added paid stage. The automatic rating remains unpublished as **Not rated** until it is calibrated against owner judgments.

# What better answers could cost — September 15, 2026

There is no new spending commitment yet. We have useful cost measurements, but no candidate has demonstrated the required answer quality and speed. Buying a bigger model or adding a paid vector database is not justified by the results so far.

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

All audited candidate calls requested thinking disabled. Older control calls left that option unspecified. Captured cache reads/writes are zero, so no prompt-cache savings are assumed. Missing reasoning-token detail is not measured zero; billed output tokens are priced once. The later adaptive-reasoning experiment stopped after seven successful calls and one credit rejection, before it could establish a comparison. Its known $0.189478 plus one unknown charge is separate from this audit. No credit purchase or retry was made.

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

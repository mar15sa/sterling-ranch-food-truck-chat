# Local relevance scoring before the evidence limit

Planned September 15 UTC / September 14 Denver. Prior turn made progress: semantic rule search recovered pergola evidence, but source limits then removed the shed form. This tests learned ordering of an identical candidate set before applying the existing limit.

Candidate: Xenova/ms-marco-MiniLM-L-6-v2, immutable revision a09144355adeed5f58c8ed011d209bf8ee5a1fec, q8 CPU inference using the existing Transformers.js 4.2.0 runtime. Six public model/tokenizer files total 24,088,594 bytes; the ONNX file's SHA-256 matches repository LFS metadata. All local files have recorded SHA-256 digests. The synthetic application-versus-internet smoke test passed. This establishes execution only, not quality. Downloads completed with zero paid API calls or subscriptions. Use local files only during question scoring.

Primary usage sources: [model card](https://huggingface.co/Xenova/ms-marco-MiniLM-L-6-v2) and [cross-encoder usage](https://sbert.net/docs/cross_encoder/usage/usage.html), checked September 15 UTC. Pair logits are ordering signals, not calibrated probabilities. Local artifact use is experimental; production licensing/dependency and resource review remains required before adoption.

Replay the five frozen dual-semantic plans, preserving pure semantic rules/community retrieval. Observe candidates before budgeting through an isolated copy; verify the original selected source payload exactly matches the prior capture. Freeze the complete candidates before scoring. No target IDs, labels or desired answer enters the model input. Include previously omitted candidates. The prior negative controls are outside these five plans, so this is a positive-case diagnostic only; later negative/irrelevance calibration is required before rejecting sources by score.

For each candidate, score every full source representation in overlapping tokenizer-checked windows paired with each original need query. Use all windows, maximum 512 tokens per pair, no truncation and a 100-window/source bound. Approved facts stay unchanged; exact reviewed action navigation context can help ranking but is removed from all output sources. Rank by the maximum passage score per need. Compare current ordering, maximum relevance across needs, and a variant that first retains each need's highest-scoring source before filling by maximum relevance. The latter reserves coverage opportunities, not proof of complete coverage.

Two randomized repetitions of all five cases (ten scorer runs) evaluate all three deterministic selection rules on the same scores. Keep 12 sources / 30,000 characters, complete approved text and explicit omissions. No score threshold or rejection probability is tuned. Thus irrelevant neighbors may remain when fewer than 12 sources exist. Do not equate a better order with removal of every irrelevant source or final-answer quality. Record pair counts, elapsed scoring/windowing time, model loading, memory and file size; hosting and completed-answer cost remain unknown.

Test cloned observation, immutable selected evidence, malformed score matrices, duplicates, deterministic ties and compound need coverage under the limit. Keep prior captures unchanged. This remains offline experimental work with no source approval, resident log entry, writer/checker call, UI change or deployment. Human calibration and provider-credit blockers remain unchanged. Notion synchronization stays pending the prior automatic approval review rejection.

## Completed result and decision

Capture **dd2c0e545201a532e0a2e2bf25795723cd2b25da**, artifacts/quality-eval/packet-reranker-20260915. All ten scorer runs completed; process 66379 exited 0. Thirty focused tests passed. Candidate capture exactly reproduced the prior pure-semantic selected source payload before scoring. The captured candidates include every source previously omitted by the limit. All 15 case/selection-method pairs produced identical repeated selections; every returned source matches the original approved text/action projection with retrieval-only context removed.

| Ordering | Unique cases with all declared sources anywhere in packet | Same targets in first four |
| --- | ---: | ---: |
| Original semantic ordering | 4/5 | 2/5 |
| Maximum learned relevance | 5/5 | 3/5 |
| Reserve each need's best source, then maximum relevance | 5/5 | 3/5 |

Reranking recovers the shed form that was previously thirteenth and omitted, and moves the pergola/hot-tub rules to the first two places in the compound packet. However, the shed form is still only tenth. The lighting form moves from second to seventh (last), behind skylights, streetlight reporting and the monthly-fee chart. It remains present only because that packet has seven candidates and permits twelve sources. This is not consistently good source selection, despite the five-of-five packet-presence result. The balanced variant changes the compound rule order but does not improve these target counts or eliminate unrelated sources.

The recorded score audit shows why a score cutoff is not an adequate fix: for lighting, the useful form scores -10.326 while skylights score -2.951 and streetlight reporting -8.649. A single threshold retaining the form also retains those higher-scored unrelated sources. For shed, the actual architectural form scores -10.777 and sits below generic forms, patios and doghouses. Scores are raw logits and must not become confidence percentages. Do not tune a threshold against these known questions.

Maximum relevance removes internet support from the compound/pergola packets, but other unrelated sources remain: the pergola packet still includes caregiver access, artificial turf, skylights and plant-list information; the shed packet still includes pickleball and tree-lawn guidance. Lighting admits all seven sources, so ordering alone rejects nothing. Compound and pergola selected character counts increase to 20,353 and 20,077 respectively. Better ranking does not guarantee lower writer cost or eliminate misleading context.

**Decision: do not adopt this generic reranker as the final source filter.** Retain the reproducible experiment and useful ordering evidence. It does not meet the complete relevance/coverage requirement, and the positive-only test cannot establish safe handling of unanswerable questions. No final answers or human quality ratings were produced.

## Local resource and cost measurements

The new model/tokenizer artifacts total 24,088,594 bytes (about 23 MiB). Preparation verified the ONNX digest against repository metadata and recorded every file digest; question scoring then ran with network model access disabled. Paid API calls and new subscriptions are zero. No subscription or per-token model charge is added by this local inference experiment. Production CPU/RAM and hosting costs remain unknown.

| Question | Scored query/window pairs per run | Added windowing/scoring/selection time, median of two |
| --- | ---: | ---: |
| Generic application | 11 | 266.5 ms |
| Lighting process | 20 | 687.5 ms |
| Shed height and form | 40 | 1,210.5 ms |
| Hot tub and pergola | 144 | 4,614 ms |
| Pergola permission and form | 58 | 2,069.5 ms |

Total pairs across ten runs: 546. Added-stage median / sample p95: 1,210.5 / 4,637 ms. Reranker initialization in the comparison took 157 ms. Peak process memory was 616,796,160 bytes (about 588 MiB), including the earlier retrieval-model phase; it is not isolated reranker memory or a proposed production process. The added times exclude initial retrieval and answer-model calls. Do not sum independent sample p95 values or present them as whole-answer performance. No full-answer/monthly model-cost recommendation is supported yet.

## Next shared cause to test

The current experimental retriever queries both rules and community content for every non-live need, even an explicit form lookup or a rule specification. This produces competing irrelevant categories before any ranking model acts. Test purpose-based source routing as a separate controlled factor: explicit official-action needs search approved community actions; governing-rule needs search governing rules; process needs retain both routes; live needs retain their adapters. Keep the same source facts, query wording, ranking model, limits and frozen plans. This is based on the plan's declared evidence kind, not community/topic exceptions. Evaluate required forms/rules and useful proactiveness; do not assume removing an unrequested form from a permission-only plan improves the final experience. Later broader and negative tests remain necessary.

Reproduce: `node scripts/quality-eval/summarize-packet-reranker.js artifacts/quality-eval/packet-reranker-20260915`. Audit candidates.json, manifest.json, rerank records, score-audit.json and comparison.json. Model preparation is recorded in artifacts/quality-eval/reranker-runtime. Notion synchronization is pending locally; no release or production model selection occurred.

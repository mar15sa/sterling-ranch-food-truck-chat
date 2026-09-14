# Full-answer cost comparison and decision — September 14, 2026

**Decision: neither tested candidate is ready to recommend or release.** Both are more expensive and slower, and each failed to deliver an accepted answer on 2 of 16 attempts. Accepted answers also contain demonstrated relevance failures. The goal remains active.

Subsequent local runtime repair preserves a validated clarification for a still-context-dependent request before guessed retrieval. It reuses the existing conversation decision and makes no additional model call. Existing clarification-producing interpretation cost remains; avoided retrieval/composition savings have not been remeasured. The historical comparison below is unchanged and must not be relabeled as a benchmark of the newly repaired revision.

This is a completed, balanced diagnostic comparison: eight authored document-question scenarios, twice per arm, using the same exact source snapshot and recorded date. All questions are tests. It is not a frozen unseen benchmark, independent human review, or the production invoice. The local baseline includes the context, identity and expiry repairs already made in this worktree.

| Flow | AI calls / 16 questions | Answer present | Median / p95 time | AI cost / attempted question | AI cost / 1,000 questions |
| --- | ---: | ---: | ---: | ---: | ---: |
| Current local baseline | 6 | 16/16 | 0.63s / 4.92s | $0.00101 | $1.01 |
| Haiku writer + Sonnet checker | 50 | 14/16 | 13.51s / 22.91s | $0.03916 | $39.16 |
| Sonnet writer + Sonnet checker | 50 | 14/16 | 14.09s / 34.70s | $0.05700 | $57.00 |

Both candidates use Haiku 4.5 for interpretation and Sonnet 5 for acceptance. The writer is Haiku 4.5 or Sonnet 5 as labeled. Fable/Astra are excluded. Every interpretation, composition, acceptance, repair, and failed final answer is included in these per-attempted-question costs. No v7 provider request has unknown usage. All recorded cache-read and cache-write token counts are zero; thinking is disabled on the candidate calls. No separate unobserved reasoning-token charge is invented. Prices are dated standard token rates, not an invoice. With only 16 observations per arm, the reported nearest-rank p95 is the maximum observed duration and is not a stable population estimate.

The baseline marked all 16 responses complete. That is not a quality result: both unanchored “How much does it cost?” attempts returned water rates despite no identified subject. The two candidate arms correctly asked for clarification in those trials. The candidates nevertheless failed their own acceptance on 12.5% of attempts, so even assuming every delivered answer were useful, neither reaches 95% useful in this diagnostic sample.

## Calls and tokens by stage

| Flow / stage | Calls | Input tokens | Output tokens | Measured token-priced cost |
| --- | ---: | ---: | ---: | ---: |
| Current local baseline / composition | 1 | 896 | 172 | $0.001756 |
| Current local baseline / understanding | 3 | 6,283 | 774 | $0.010153 |
| Current local baseline / rules-search-planning | 1 | 259 | 106 | $0.000789 |
| Current local baseline / rules-rewrite | 1 | 2,719 | 145 | $0.003444 |
| Haiku writer + Sonnet checker / understanding | 16 | 24,316 | 3,856 | $0.043596 |
| Haiku writer + Sonnet checker / composition | 16 | 129,312 | 3,995 | $0.149287 |
| Haiku writer + Sonnet checker / answer-acceptance | 18 | 197,866 | 3,794 | $0.433672 |
| Sonnet writer + Sonnet checker / understanding | 16 | 24,316 | 3,855 | $0.043591 |
| Sonnet writer + Sonnet checker / composition | 16 | 178,894 | 7,093 | $0.428718 |
| Sonnet writer + Sonnet checker / answer-acceptance | 18 | 199,652 | 4,031 | $0.439614 |

The acceptance stage consumed $0.873286 of the run’s $1.554620 total (about 56%). Each candidate made two repair attempts. The current compact checker still accepted an unrelated landscaper-directory action on a lighting-application follow-up (`flow-028`). The accepted answer also mixed seasonal requirements with general lighting requirements. Supplying an approved destination does not establish its relevance. The checker’s generic failure labels did not identify specific offending claims for repair; this is another remaining integration gap.

## Monthly scenarios — answering AI only

These scenarios assume the same question mix and behavior as this small diagnostic. They are comparisons, not a proposed recurring bill.

| Questions / month | Current local baseline | Haiku writer + Sonnet checker | Sonnet writer + Sonnet checker |
| ---: | ---: | ---: | ---: |
| 1000 | $1.01 | $39.16 | $57.00 |
| 10000 | $10.09 | $391.60 | $569.95 |
| 50000 | $50.44 | $1957.98 | $2849.76 |

Current private heuristic grading adds no model API call. Optional separate AI quality grading is not included above: earlier synthetic detailed-grader tests measured approximately $4.18/1,000 Haiku assessments or $9.46/1,000 Sonnet assessments, before choosing/calibrating a grader. Those are separate-stage experiments, not a committed add-on.

No new subscription, vector database, storage service or release was created. Existing hosting/storage charges and any production CPU/RAM increase remain unmeasured and are not included as zero. Local semantic indexing used no paid API: its previously measured one-time build took about eight minutes, with 2.30 MiB of vectors, a roughly 34 MB model, and about 1 GiB peak experimental process memory. That desktop observation is not a hosting quote. The complete proposed operating commitment remains open until a useful implementation is selected and hosting plus any background grading are measured.

## What changes next

The separate offline semantic packet comparison completed seven captured interpretations with no paid API call. It recovered the specific gazebo/pergola governing section for the compound and multiple-form questions where keyword ranking omitted that section. It did not repair community action retrieval: lighting questions still received unrelated directory, venue and billing links. This is evidence to test improved retrieval, not proof that a vector database improves final answers.

Compare the complete approved community catalog before adding semantic selection for community actions: the verified snapshot has 25 eligible projections totaling 5,502 text characters. Semantic ranking remains a separate option for the larger rules corpus. Preserve full applicable rule context and give repair the specific unsupported claim or wrong action. Reuse existing source controls and live adapters. More AI calls must demonstrate their value. Human calibration, final holdout, live adapters, final-answer measurements, complete operating costs and release verification remain outstanding.

## Follow-up action checking: diagnostic gain, still unselected

Ten Sonnet checks (five examples, twice each) completed September 14 at 21:06 UTC. Both repeats caught the recorded lighting-to-landscaper mistake. All six positive controls retained correct forms, an honest fallback contact, or a supported next step. The two repeats containing a correct form plus an unrelated utility-payment action identified that action as irrelevant but returned an inconsistent failure code and empty repair details. Local validation rejected both; they are not successful checks. Result: 8/10 valid expected checks, 2/10 invalid, no tested flawed answer admitted. Four examples were synthetic and one was a known diagnostic failure, not unseen human calibration.

Checker-only latency was median 10.738 seconds and p95 18.720 seconds, already exceeding the proposed full-answer target. Ten calls used 52,250 input and 2,967 output tokens, costing $0.134170 at dated standard rates ($13.417 per 1,000 checks for this small mix). This is neither a complete answer estimate nor a commitment. The larger recorded policy example disproportionately affects this sample. Comparison against a different earlier sample is not a controlled model cost comparison.

The follow-up reserved $0.386548 of the remaining fresh-phase budget. Combined fresh-phase known cost is now $1.691728 plus the earlier rejected request's unknown charge; conservative reservation is $4.676218 of $5. No new budget, subscription, deployment, model selection or production source approval was made. Evidence: `artifacts/quality-eval/flow-action-checks-20260914`.

Offline catalog replay completed seven saved interpretations in three modes with no provider calls. Complete catalog retrieval found the approved directory; separately enabled staging navigation supplied both previously staging-approved form URLs. The lighting form follow-up used 5,502 source-text characters versus 16,253 for keyword retrieval. Other question packets grew, so this is not a general cost-saving claim. No final answers were generated in this replay. Evidence: `artifacts/quality-eval/complete-catalog-replay-v2-20260914`.

## Reproducibility and spending

v7 captured 48 questions and 106 provider attempts, all with usage: $1.554620 token-priced total; conservative reserved upper estimate $4.251689. The preceding v6 format failure added $0.002938 known cost and one rejected request with unknown usage, reserving $0.037981. Fresh-phase known subtotal is $1.557558, with that one unknown charge; combined reserved upper estimate is $4.289670, below the announced $5 limit. Earlier full-flow development remains separately recorded at $1.151095 known plus five timed-out requests and a possible interrupted in-flight request with unknown costs. Do not treat either known subtotal as the complete invoice.

The exact saved community snapshot passed its revalidation and the post-capture audit found zero expired records among ten static community records supplied to composers. The rules verification matched the base publication metadata and all twelve named supplement documents while retaining restricted owner-approved excerpts. Named-source verification does not prove no undiscovered amendment exists.

Supporting local evidence: `artifacts/quality-eval/full-document-flow-v7-20260914/{manifest,comparison,freshness-audit}.json`, its saved snapshots, code and request records; `current-rules-snapshot-20260914/attestation.json`; and `semantic-flow-packets-20260914`. Model/flow source revision was 4f1daa2 plus the saved empty-action-schema correction; the running capture was not altered by the subsequent semantic preparation. Nothing is verified live. Notion synchronization remains pending the earlier external-update confirmation.

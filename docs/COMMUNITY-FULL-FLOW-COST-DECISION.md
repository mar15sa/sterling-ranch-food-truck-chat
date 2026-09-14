# Full-answer cost comparison and decision — September 14, 2026

**Decision: neither tested candidate is ready to recommend or release.** Both are more expensive and slower, and each failed to deliver an accepted answer on 2 of 16 attempts. Accepted answers also contain demonstrated relevance failures. The goal remains active.

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

Continue with shared semantic selection of approved process/actions and explicit action relevance, preserve full applicable rule context, and give a repair the specific unsupported claim or wrong action. Reuse the existing source controls and live adapters. Compare a simpler, better-evidenced answer flow against the current three-stage candidate; more AI calls must demonstrate their value. Human calibration, the final holdout, live adapters, semantic final-answer measurements, complete operating costs and release verification remain outstanding.

## Reproducibility and spending

v7 captured 48 questions and 106 provider attempts, all with usage: $1.554620 token-priced total; conservative reserved upper estimate $4.251689. The preceding v6 format failure added $0.002938 known cost and one rejected request with unknown usage, reserving $0.037981. Fresh-phase known subtotal is $1.557558, with that one unknown charge; combined reserved upper estimate is $4.289670, below the announced $5 limit. Earlier full-flow development remains separately recorded at $1.151095 known plus five timed-out requests and a possible interrupted in-flight request with unknown costs. Do not treat either known subtotal as the complete invoice.

The exact saved community snapshot passed its revalidation and the post-capture audit found zero expired records among ten static community records supplied to composers. The rules verification matched the base publication metadata and all twelve named supplement documents while retaining restricted owner-approved excerpts. Named-source verification does not prove no undiscovered amendment exists.

Supporting local evidence: `artifacts/quality-eval/full-document-flow-v7-20260914/{manifest,comparison,freshness-audit}.json`, its saved snapshots, code and request records; `current-rules-snapshot-20260914/attestation.json`; and `semantic-flow-packets-20260914`. Model/flow source revision was 4f1daa2 plus the saved empty-action-schema correction; the running capture was not altered by the subsequent semantic preparation. Nothing is verified live. Notion synchronization remains pending the earlier external-update confirmation.

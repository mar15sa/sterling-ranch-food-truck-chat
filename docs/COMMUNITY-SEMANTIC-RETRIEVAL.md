# Current-library semantic retrieval diagnostic

Planned September 15 UTC / September 14 Denver, after the merged current baseline passed its full compatibility gate. The previous turn made progress: integrated current production sources, revalidated the approved snapshot, passed 1,219 tests and existing answer/retrieval gates, and reproduced wrong-topic/incomplete answers being rated Good.

Root problem: useful approved sources exist but keyword ranking can match incidental words, overlook synonymous project/form terms, and supply unrelated actions. The earlier complete-catalog approach no longer fits the current 88-projection library. Compare bounded keyword, local semantic and fused ranking before buying a vector service or widening the full-library prompt.

This experiment indexes title plus complete approved projection text only. No raw page body, unapproved action context, withheld claim, resident record or live operation is embedded. The existing current-source approval projection defines eligibility. Every query rebuilds that gate, excludes stale/changed/withdrawn/cross-community entries and rejoins results only to matching approved source identities. Vectors cannot approve facts or choose the subject of an ambiguous question. Full selected approved text is returned; matched windows are retrieval diagnostics, not excerpts that silently discard conditions. Core ranking contains no community-specific facts or topic wording.

Freeze 22 authored queries before execution: 20 positive retrieval cases across nine families, plus two negative controls. Each target group requires one of the listed source IDs among the first four results; lighting process requires two useful sources. Targets express useful community-source recall, not complete governing-rule coverage or final-answer accuracy. Preserve both negative controls and display their nearest neighbors without treating them as successful answers. No label or target enters the embedding or query.

Compare the existing keyword search, top cosine similarity from a local BGE embedding index and reciprocal-rank fusion. Preserve original model revision, q8/CLS settings, complete windows, source/version hashes and all raw ranks. Two randomized passes measure repeat stability and latency without tuning between passes. Measure initialization, indexing, query embedding, fresh eligibility, keyword ranking and vector scan separately. Report actual vector bytes and process peak memory. Paid API calls and new subscriptions are zero; production CPU/RAM and monthly hosting cost remain unmeasured.

Before execution, test approved-text-only indexing, exact version/scope/tenant matching, expiry and withdrawal at query time, fresh renewal without promoting changed evidence, bad vector/window rejection and identity-preserving fusion. Reuse the existing locally cached model; disable network model downloads. No resident UI, production rating, source approval or release change. If recall improves, the next step is integrating bounded community selection with the existing rules and live-source boundaries and testing resulting answers; it is not automatic adoption.

Documentation impact: experimental retrieval decision. Keep the Notion update pending locally under the existing unresolved external-write rejection. Historical captures remain unchanged. Further paid answer/model comparisons remain stopped for insufficient Anthropic credit.

## Completed result

Capture revision **da578db**, artifacts/quality-eval/community-semantic-20260915. All 44 query attempts completed; process 76648 exited 0, and manifest status is captured. The 22 cases and randomized two-pass design were saved before indexing/querying. The complete approved corpus and source snapshot hashes are retained. Six focused tests pass with zero failures, skips or cancellations. The default resident flow is unchanged.

| Method | All required source groups in top four | Unique positive questions covered | Repeated top-four changes |
| --- | ---: | ---: | ---: |
| Existing keyword | 24/40 | 12/20 | 0/22 |
| Local semantic | 32/40 | 16/20 | 0/22 |
| Equal-weight reciprocal-rank fusion | 28/40 | 14/20 | 0/22 |

Semantic ranking recovered useful sources for application-paperwork wording, lighting submission, landscape inspection and caregiver-pass wording. It retained all positive keyword hits in this diagnostic. These are four unique improvements, each repeated; they are not eight independent successful questions, a significance finding, or evidence of 80% useful final answers. Fusion lost the semantic improvements on general paperwork and caregiver access, showing that adding keyword votes can preserve bad rankings.

All methods still missed the specific form targets for pergola and shed, and both useful process sources for the general lighting question. Semantic ranking also missed the caregiver source for the nanny paraphrase. Better average recall is insufficient for the intended consistency. The result remains **experimental and unselected**.

The negative controls illustrate a separate boundary: keyword returned nothing for an unidentified price, while semantic and hybrid returned unrelated priced services. All methods returned some sources for the coffee-shop password request, but none establishes a password. Search must never choose an unresolved subject or turn a nearby source/link into evidence of a missing detail. Existing request clarification and answerability controls remain required; no negative control is counted as a successful answer.

The saved top-four results also contain irrelevant neighbors even when a target is present (for example, pool hours beside pickleball/water sources). The metric measures required-source recall, not precision or acceptable action selection. The report source contains multiple systems and dates; retrieving it does not authorize mixing them. Full approved projected text is retained, but final composition must preserve per-claim applicability.

### Local resource and cost measurements

The model was the existing locally cached Xenova/bge-small-en-v1.5, revision ea104dacec62c0de699686887e3f920caeb4f3e3, q8, CLS pooling, 384 dimensions, runtime 4.2.0. Network model downloads were disabled. Eighty-eight projections produced 95 windows.

- Initialization: 1.227 seconds; window planning: 88 ms; one-time indexing: 12.530 seconds.
- Vector file: 145,920 bytes (142.5 KiB). Peak experiment process memory: 494,374,912 bytes (about 471 MiB), including runtime/model/working data, not vector storage alone.
- Query embedding median / sample p95: 16 / 19 ms.
- Semantic embedding plus vector scan and fresh eligibility check: 57.5 / 77 ms.
- Existing keyword search and binding: 159.5 / 193 ms. A separately timed eligibility pass costs 40 / 53 ms; it is not included in that keyword figure.
- Current hybrid component sum: 258 / 295 ms, including both eligibility passes; small fusion and serialization overhead are excluded. This is not full-answer time.

**Paid API calls: 0. New subscriptions: 0.** This local index adds no embedding API charge per answer or per 1,000 queries. Production CPU/memory/storage cost is unknown, not zero. The unchanged existing model answer costs and previous rejected API attempt remain separately recorded; these retrieval timings and disk bytes cannot establish the proposed all-in monthly service cost. No hosted vector service or larger model is justified by this diagnostic alone.

### Next controlled factor

Source representation needs attention before another ranking weight adjustment. The approved general architectural projection exposes its form title, email and action label; the checked project categories occur in the approved action's existing evidence context and were deliberately not embedded in this run. A bounded follow-up can compare baseline projection text against **retrieval-only descriptors from exact approved action proof**, with proof/version checks and complete separation from answer facts. That must never expose withheld addresses, fees or requirements as approved facts. Raw pages and hand-written community-specific aliases remain excluded. Keep the same frozen queries and report results as development tuning; later unseen retrieval and answer tests must be separate.

The nanny paraphrase and unnecessary neighboring sources remain independent problems. An action-proof representation improvement cannot be assumed to fix them. Integrate a retrieval variant with the writer only after the selected source boundary is correct, then compare actual answers and complete costs when provider credit is restored. Human communication calibration and the final unseen demo benchmark remain outstanding.

Reproduce the saved report: node scripts/quality-eval/summarize-community-semantic.js artifacts/quality-eval/community-semantic-20260915. Audit manifest.json, cases.json, corpus.json, windows.json, vectors.f32, query records and comparison.json. Exact Notion update is pending locally.

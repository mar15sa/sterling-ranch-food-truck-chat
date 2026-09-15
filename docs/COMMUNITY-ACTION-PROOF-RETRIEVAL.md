# Reviewed action context: controlled retrieval comparison

Status: planned local development experiment, September 15 UTC / September 14 Denver. No runtime, source approval, resident UI or release change.

The preceding approved-text semantic experiment recovered 16 of 20 unique positive source targets versus keyword's 12, but missed specific project forms. Test one factor: embedding the existing reviewed action evidence context alongside approved projection text. This context describes navigation relevance; its addresses, fees and requirements are not approved answer facts. Do not add aliases, raw page bodies or inferred facts.

Freeze both representations before execution. Run the same 22 authored cases, twice each, using the same current approved snapshot and cached BGE model. Run a fresh approved-text control and action-proof variant with independently randomized order. These are development comparisons, not unseen tests; separate runs do not provide randomized between-arm latency evidence. Keep ranking, windowing, query instruction and top-four target rules unchanged. No target or label enters embeddings. Preserve old captures untouched.

Include action context only when its existing approved review metadata, source version and evidence/action URL bindings match. Query-time approval, tenant, lifecycle and freshness gates still apply. Hash the exact representation and original projections separately. A changed proof excludes the old indexed identity. Matched-window offsets refer to the retrieval representation, never to an approved fact quotation. Returned answer projections contain original approved text and action ID/label/URL/type only, excluding action evidence context and raw source fields. Both arms use this same output boundary. This is an experimental model-input boundary, not an integration claim.

Before running, test proof eligibility and mutations, output separation, expiry/withdrawal, tenant separation, malformed vectors/windows and unchanged baseline behavior. Existing local model downloads remain disabled; paid API calls and subscriptions are zero. Record indexing, vectors, memory and query timing. Production hosting and complete-answer costs remain unmeasured. More retrieval matches alone cannot justify adopting a model or vector service.

Report unique gains, regressions, remaining misses, negative controls and repeat stability. Do not tune the cases or ranking after seeing results. Any promising variant still needs irrelevant-source filtering, full answer tests and an independent unseen benchmark. Paid model comparisons remain paused after the recorded insufficient-credit rejection. Notion publication remains pending under the earlier automatic approval review rejection; preserve a precise local update.

## Completed development result

Frozen capture revision **6c33eb632cb0d56ba89e02328ea4e6b45b228749**. Both 44-query runs completed with exit 0 (control process 10660, variant 59242). Eleven focused tests passed, with zero failures/skips/cancellations. Exact corpus, source snapshot, cases, model, revision, pooling, dimensions, runtime and code identities match. Each method's top four remained identical across both repetitions in each run. Historical capture is untouched; the fresh control reproduced its coverage counts.

| Method | Approved text: unique positive questions with all target groups in top four | Action context: same metric |
| --- | ---: | ---: |
| Keyword | 12/20 | 12/20 |
| Semantic | 16/20 | 18/20 |
| Equal-weight fusion | 14/20 | 15/20 |

Semantic gained the specific pergola and shed forms, without losing a positive target. These are two unique gains, each repeated, not four independent improvements or a statistical significance finding. It also recovered the general architectural form for the lighting-process question, but still omitted its other required process source; that remains a miss. The nanny wording still missed the caregiver source. Fusion recovered only the pergola form and continues to dilute some semantic gains. No variant is selected for production.

Action context increases source groups found from 32/42 to 38/42 across 40 positive attempts. Complete target coverage improves from 32/40 to 36/40 attempts. These source-recall results do not establish 90% useful answers. Unrelated neighbors remain. Both negative controls still return semantic neighbors: unidentified price produces priced services, and the coffee password question produces coffee/internet sources without a password. Clarification, per-claim applicability and unsupported-detail handling remain essential.

This supports a shared cause: an approved form's short fact projection can omit the vocabulary needed to find that form. A general source-representation change recovered two different project types without new project-specific exceptions. It does not resolve composition, automatic scoring or the remaining retrieval failures.

## Costs and resources

| Measured local component | Approved-text control | Action context |
| --- | ---: | ---: |
| Approved source projections | 88 | 88 |
| Retrieval windows | 95 | 97 |
| Vector bytes | 145,920 | 148,992 |
| One-time indexing | 6.438 s | 6.932 s |
| Model initialization | 583 ms | 565 ms |
| Peak process memory, including model/runtime | 537,800,704 bytes | 517,967,872 bytes |
| Query embedding + scan + current eligibility, median / sample p95 | 27 / 35 ms | 25.5 / 34 ms |
| Paid API calls / new subscriptions | 0 / 0 | 0 / 0 |

The richer representation adds 3,072 vector bytes. Differences in timing and peak memory are desktop run variation, not evidence of a speed or memory advantage; the runs were sequential. No per-query embedding API charge was incurred. Production hosting, indexing schedule, concurrent memory usage and full-answer cost are unmeasured. Zero local API spending does not imply zero hosting cost or a complete monthly quote. The existing answer-model cost ledger is unchanged. No hosted vector database, model upgrade or subscription was purchased.

## Decision and next work

Retain this as the leading community-retrieval candidate for integration testing, without treating it as adopted. Next combine bounded community and governing-rule retrieval at the experimental evidence boundary, preserving approved-only answer projections and live-source routing. Inspect whole-question coverage and irrelevant neighbors before any additional paid writer comparison. Do not solve remaining wording misses with community-specific aliases or assume a generic similarity cutoff establishes answerability. The final judge/rating problem still requires independent resolution and human calibration.

Reproduce: `node scripts/quality-eval/summarize-action-proof.js artifacts/quality-eval/community-action-proof-control-20260915 artifacts/quality-eval/community-action-proof-20260915`. Each capture preserves manifests, projections, windows, vectors, code and all raw ranks; paired-comparison.json binds inputs and lists unique changes. Notion update is pending in docs/pending-notion/2026-09-15-action-proof-retrieval.md. No code was released or production configuration changed.

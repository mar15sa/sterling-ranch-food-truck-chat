# Semantic retrieval comparison

Planned September 14, 2026; experimental only. No resident route or paid database is being enabled.

Question: does learned semantic retrieval recover relevant evidence that current keyword retrieval misses, and does a keyword/semantic combination preserve both? This tests retrieval separately from the demonstrated coordinator problem where a correct clarification is ignored. No retrieval method may make a missing fact true or select unapproved evidence.

Use the already loaded, owner-projected rules snapshot with its original source/version identities. Limit the experiment to one configured community and current eligible documents. Apply the existing question-specific owner-withholding predicate equally to keyword and semantic candidates before ranking. Split embedding input into bounded overlapping windows while retaining exact source offsets and full original evidence; verify every window fits the model's token limit rather than silently dropping a section's tail. Preserve partial approvals and inherited metadata. Scope/version failures withhold evidence; semantic similarity never grants source approval.

Compare the existing keyword ranking, local pinned BGE embeddings, and reciprocal-rank fusion of the two under the same candidate corpus and question. Rank document identities using the strongest matching window; retain its exact excerpt. Recover bounded same-version context only through the shared section assembler after retrieval. A later relevance/completeness reranker may select among these candidates, but cannot use this experiment to bypass approval, source freshness or subject constraints.

Use the existing diagnostic questions. Current operational questions without appropriate live-connector evidence remain evidence gaps in this rules-only corpus, not failures that embeddings may fill from old policies. Follow-ups need the same explicit context in both retrieval variants. These development cases are not a frozen holdout and raw retrieval metrics cannot certify useful/excellent answer rates.

Record model/runtime revision, corpus and question hashes, token-window coverage, index time, index size, local query latency and ranked evidence. No per-embedding API fee is expected for local inference; actual hosting CPU/memory/storage impact is still an unmeasured commitment. Compare full-section context, hybrid retrieval and optional reranking before recommending any database subscription. Require scope-isolation and coverage tests before running the corpus comparison.

## Local execution checkpoint

The comparison uses Transformers.js 4.2.0 installed only under `artifacts/quality-eval/semantic-runtime`; no application dependency changed. Run `prepare-semantic.mjs` once to populate the pinned local model cache, then `compare-semantic.mjs` with a fresh output directory. The comparison explicitly loads the cached model and tokenizer from the revision directory with remote model access disabled. This avoids a runtime file-discovery issue when operating entirely offline.

Three initial attempts failed before embeddings were produced: local-cache configuration, missing tokenizer discovery, and explicit-component cache discovery. Their separate manifests retain failed status. The corrected `semantic-comparison-v4-20260914` run began with 955 loaded documents, 926 eligible documents and 1,569 bounded embedding windows. It is still running at this checkpoint; its manifest is the authority for progress and completion. Do not infer completion from this document. Use `analyze-semantic.js` only after the capture reports `captured`; it refuses incomplete runs and produces descriptive rankings and resource timings, not quality scores.

Three focused checks pass: community/lifecycle/owner withholding, complete source-window coverage within token budgets, and rank fusion preserving source versions. The normal test-runner subprocess was denied by the local sandbox, so the same test module was executed directly and all three tests passed. This is local tool validation, not a release gate.

Resident retrieval behavior remains unchanged; the only runtime-module edit exposes three existing source-eligibility helpers for the experiment. The shared request/evidence repair is planned separately in `COMMUNITY-REQUEST-EVIDENCE-CONTRACT-PROPOSAL.md`. No current-flow diagram update is needed for these experimental tools and proposal; runtime integration will require one.

## Completed capture and first review

The fourth run subsequently completed all 32 diagnostic cases and exited successfully. Its manifest reports `captured`, finishing September 14 at 16:59:53 UTC. `comparison.json` contains the descriptive rankings. The earlier running checkpoint above is history.

Local measurements: embedding 1,569 windows took 475.043 seconds; stored vectors occupy 2,409,984 bytes (about 2.30 MiB), in addition to the cached 34,014,426-byte quantized model and runtime dependencies. Peak memory for the entire capture process was 1,071,366,144 bytes (about 1 GiB); this includes experiment overhead and does not establish a production memory requirement. Query embedding plus the exhaustive vector scan had median 220 ms and sample p95 262 ms. Keyword retrieval had median 1,799 ms and sample p95 2,441 ms in this harness, which constructs a freshly filtered index per question while the model remains loaded. This is not a fair production cache benchmark or a demonstrated end-to-end speedup. Hybrid retrieval also pays keyword work. No paid API calls or new subscriptions occurred.

Initial evidence review, not blind scoring:

- Fence and updated lighting evidence already rank first with keyword search. Meaning-based search preserves the first hit but also introduces nearby topics. Full matching-section assembly remains necessary regardless of retrieval method.
- For the combined pergola approval/form question, keyword search's top ten contain no titled forms or pergola subsection. Semantic search returns the general architectural forms section at rank 2 and the pergola subsection at rank 5. Fusion retains them at ranks 5 and 10. This is a concrete candidate-recall improvement, not proof of a correct composed answer. The landscape forms section ranks even higher semantically and must not be substituted for the requested architectural form.
- For the direct design-review-application question, no method returns a titled forms section in its top ten. The same corpus demonstrably contains one. This shows that embeddings alone still miss available relevant evidence, and supports testing need-specific queries and reranking.
- For the unanchored cost question, all methods return fee-related documents. None has evidence identifying what the resident means. These results must be rejected at the request/evidence boundary; similarity cannot resolve a missing subject.
- The event-contractor question returns ordinary guest, membership and commercial-event rules. Those passages do not by themselves establish contractor eligibility. Changing their rank cannot supply the missing distinction.

No retrieval winner, useful/excellent rate, production hosting cost or demo readiness is established. Next compare retrieval per explicit need, candidate reranking and full answers with the shared acceptance gate. Preserve this original run rather than retroactively changing its query strategy or labels.

Notion synchronization is pending: automatic approval review rejected the external checkpoint update. The exact reviewable draft is retained in `docs/pending-notion/2026-09-14-semantic-retrieval-checkpoint.md`; the guide must not be described as synchronized.
